/**
 * Request execution with rotation, retry and cooldown.
 *
 * Strategy per attempt:
 *   1. pick the healthiest ready key (excludes already-tried keys)
 *   2. forward the request verbatim, swapping only the credential
 *   3. classify the response and either return it, rotate, or park the key
 *
 * A request is only ever retried when the previous attempt failed for a
 * reason attributable to the key (429/403/quota, 5xx, invalid key). Any
 * other status is a legitimate upstream answer and is passed through
 * untouched — including streaming bodies.
 */

import { cfg } from "./config.ts";
import {
  mark429,
  markInvalid,
  markSoftError,
  markUsed,
  pick,
  snapshot,
} from "./pool.ts";

export type ExecResult = {
  response: Response;
  key: string;
  attempts: number;
  rotated: boolean;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Parse Retry-After header or a "reset after 30s" style message. */
function parseRetryAfter(res: Response, body: string): number | null {
  const h = res.headers.get("retry-after");
  if (h) {
    const secs = Number(h);
    if (Number.isFinite(secs) && secs > 0) return secs * 1000;
    const date = Date.parse(h);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  const m = /(?:retry|reset|try again)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds)/i.exec(body);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return m[2] === "ms" ? n : n * 1000;
  }
  return null;
}

function isQuotaText(body: string): boolean {
  return /RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded/i.test(body);
}

function isInvalidKeyText(body: string): boolean {
  return /API_KEY_INVALID|API key not valid|API key expired|invalid.?api.?key/i.test(body);
}

/**
 * Build the upstream headers. The inbound credential headers are stripped and
 * replaced by the one bound to the selected key, so callers can send a dummy
 * Authorization (needed by OpenAI-compatible SDKs) without leaking it.
 */
function headersFor(src: Headers, key: string): Headers {
  const h = new Headers();
  for (const [name, value] of src.entries()) {
    const n = name.toLowerCase();
    if (n === "host" || n === "content-length" || n === "connection") continue;
    if (n === "x-goog-api-key" || n === "authorization") continue;
    if (n === "accept-encoding") continue;
    h.set(name, value);
  }
  if (key.startsWith("ya29.") || key.startsWith("Bearer ")) {
    h.set("authorization", key.startsWith("Bearer ") ? key : `Bearer ${key}`);
  } else {
    h.set("x-goog-api-key", key);
  }
  return h;
}

/** Strip the inbound key from a URL query so only the selected key is used. */
function urlWithoutKey(raw: string): string {
  const u = new URL(raw);
  u.searchParams.delete("key");
  return u.toString();
}

export async function execute(
  url: string,
  init: RequestInit & { method: string },
  path: string,
): Promise<ExecResult> {
  const tried = new Set<string>();
  const deadline = Date.now() + cfg.maxWaitMs;
  let attempts = 0;
  let rotated = false;

  for (;;) {
    let st = await pick(tried);

    // Pool exhausted for this instant — wait for the soonest cooldown to lapse.
    while (!st) {
      const snap = await snapshot();
      if (snap.total === 0) {
        return {
          response: jsonError(503, "no_api_keys", "The key pool is empty."),
          key: "",
          attempts,
          rotated,
        };
      }
      const wait = Math.max(120, Math.min(snap.soonestReadyMs || 500, 2_000));
      if (Date.now() + wait > deadline) {
        return {
          response: jsonError(
            429,
            "pool_exhausted",
            `All ${snap.total} key${snap.total === 1 ? "" : "s"} are rate limited. Retry in ${Math.ceil(snap.soonestReadyMs / 1000)}s.`,
          ),
          key: "",
          attempts,
          rotated,
        };
      }
      await sleep(wait);
      st = await pick(tried);
    }

    if (attempts > 0) rotated = true;
    if (attempts >= cfg.maxAttempts) {
      return {
        response: jsonError(429, "max_attempts", "Every key attempt failed."),
        key: st.key,
        attempts,
        rotated,
      };
    }
    attempts++;
    tried.add(st.key);

    const headers = headersFor(new Headers(init.headers), st.key);
    const target = urlWithoutKey(url);

    let res: Response;
    try {
      res = await fetch(target, {
        method: init.method,
        headers,
        body: init.body,
        // Never follow redirects into a different credential scope.
        redirect: "manual",
      });
    } catch (err) {
      await markSoftError(st.key, cfg.serverErrCooldownMs);
      if (attempts >= cfg.maxAttempts) throw err;
      continue;
    }

    await markUsed(st.key);

    const status = res.status;

    if (status === 429) {
      const body = await safeText(res);
      const cd = parseRetryAfter(res, body) ?? cfg.cooldownMs;
      await mark429(st.key, Math.max(cfg.cooldownMs, cd));
      if (attempts >= cfg.maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }

    if (status === 401 || status === 403) {
      const body = await safeText(res);
      if (isInvalidKeyText(body) || status === 401) {
        await markInvalid(st.key);
      } else if (isQuotaText(body)) {
        const cd = parseRetryAfter(res, body) ?? cfg.cooldownMs;
        await mark429(st.key, Math.max(cfg.cooldownMs, cd));
      } else {
        // Genuine authorisation failure for the caller, not a key problem.
        return { response: rebuild(res, body), key: st.key, attempts, rotated };
      }
      if (attempts >= cfg.maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }

    if (status === 400) {
      const body = await safeText(res);
      if (isInvalidKeyText(body)) {
        await markInvalid(st.key);
        if (attempts >= cfg.maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
        continue;
      }
      // Bad request from the client — no amount of rotation fixes it.
      return { response: rebuild(res, body), key: st.key, attempts, rotated };
    }

    if (status >= 500) {
      const body = await safeText(res);
      await markSoftError(st.key, cfg.serverErrCooldownMs);
      if (attempts >= cfg.maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }

    // 2xx / 3xx / anything else — legitimate answer, stream it straight back.
    return { response: res, key: st.key, attempts, rotated };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function rebuild(res: Response, body: string): Response {
  const h = new Headers(res.headers);
  h.delete("content-encoding");
  h.delete("content-length");
  h.delete("transfer-encoding");
  return new Response(body, { status: res.status, headers: h });
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
