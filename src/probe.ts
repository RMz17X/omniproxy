/**
 * Active key probe: one real generateContent call against Google, no rotation.
 *
 * The pool learns a key's health only as a side effect of serving traffic, so
 * a key that is parked or freshly added stays untested until a client request
 * happens to pick it. This module gives the admin console a direct question:
 * "is this key serving right now", answered with the same classification the
 * rotator itself uses, so the console can park or revive the key accordingly.
 */

import { cfg } from "./config.ts";
import { isInvalidKeyText, isZeroQuota, parseRetryAfter } from "./upstream.ts";

export type ProbeStatus =
  | "ok"
  | "rate_limited"
  | "zero_quota"
  | "invalid"
  | "server_error"
  | "network_error"
  | "unexpected";

export type ProbeResult = {
  status: ProbeStatus;
  httpStatus: number;
  latencyMs: number;
  /** upstream-requested wait, 0 when the response carried no hint */
  retryAfterMs: number;
  message: string;
};

const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 8000);
/** Large enough for models with thinking tokens to complete a probe ping. */
const MAX_TOKENS = 64;

/** Pull a human-readable line out of a Google error envelope. */
function messageOf(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } };
    const msg = parsed.error?.message ?? parsed.error?.status ?? "";
    if (msg) return msg.slice(0, 220);
  } catch {
    /* not JSON */
  }
  return body.replace(/\s+/g, " ").trim().slice(0, 220);
}

/**
 * Models Google may accept when the configured default is refused for a key.
 * Newly created projects are denied retired models ("no longer available to
 * new users"), and that verdict is a property of the model, not of the key, so
 * the probe retries down this list before reporting anything to the pool.
 */
const FALLBACK_MODELS = (process.env.PROBE_FALLBACK_MODELS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .concat(["gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"]);

/** True when the body says the *model* is unavailable, not the key. */
function isModelUnavailable(body: string): boolean {
  return /no longer available to new users|is not found for API version|not supported for generateContent|does not support generateContent|MODEL_NOT_FOUND|is not supported/i.test(
    body,
  );
}

export async function probeKey(rawKey: string, model?: string): Promise<ProbeResult> {
  const chain = [model ?? cfg.defaultModel, ...FALLBACK_MODELS].filter(
    (m, i, all) => Boolean(m) && all.indexOf(m) === i,
  );

  let last: ProbeResult | null = null;
  for (const candidate of chain) {
    const res = await probeOnce(rawKey, candidate);
    if (res.status !== "unexpected" || res.httpStatus !== 404) return res;
    if (!isModelUnavailable(res.message)) return res;
    // The model was refused; try the next one. Keep the message for the end.
    last = res;
  }
  return (
    last ?? {
      status: "unexpected",
      httpStatus: 0,
      latencyMs: 0,
      retryAfterMs: 0,
      message: "no probe model was accepted",
    }
  );
}

async function probeOnce(rawKey: string, model: string): Promise<ProbeResult> {
  const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/models/${model}:generateContent`;
  const started = Date.now();
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": rawKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0 },
      }),
      redirect: "manual",
      signal,
    });
  } catch (err) {
    return {
      status: "network_error",
      httpStatus: 0,
      latencyMs: Date.now() - started,
      retryAfterMs: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const latencyMs = Date.now() - started;
  const body = await res.text().catch(() => "");
  const status = res.status;

  if (status >= 200 && status < 300) {
    return { status: "ok", httpStatus: status, latencyMs, retryAfterMs: 0, message: "serving" };
  }

  if (status === 429) {
    // A zero-quota project never resets: park it forever instead of cooling.
    if (isZeroQuota(body)) {
      return {
        status: "zero_quota",
        httpStatus: status,
        latencyMs,
        retryAfterMs: 0,
        message: messageOf(body) || "project quota is 0",
      };
    }
    return {
      status: "rate_limited",
      httpStatus: status,
      latencyMs,
      retryAfterMs: parseRetryAfter(res, body) ?? cfg.cooldownMs,
      message: messageOf(body) || "rate limited",
    };
  }

  if (status === 401 || status === 403 || status === 400) {
    if (isInvalidKeyText(body) || /reported as leaked/i.test(body) || status === 401) {
      return {
        status: "invalid",
        httpStatus: status,
        latencyMs,
        retryAfterMs: 0,
        message: messageOf(body) || "key rejected",
      };
    }
    if (isZeroQuota(body)) {
      return {
        status: "zero_quota",
        httpStatus: status,
        latencyMs,
        retryAfterMs: 0,
        message: messageOf(body) || "project quota is 0",
      };
    }
    if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(body)) {
      return {
        status: "invalid",
        httpStatus: status,
        latencyMs,
        retryAfterMs: 0,
        message: messageOf(body),
      };
    }
    return {
      status: "unexpected",
      httpStatus: status,
      latencyMs,
      retryAfterMs: 0,
      message: messageOf(body) || `HTTP ${status}`,
    };
  }

  if (status >= 500) {
    return {
      status: "server_error",
      httpStatus: status,
      latencyMs,
      retryAfterMs: 0,
      message: messageOf(body) || `HTTP ${status}`,
    };
  }

  return {
    status: "unexpected",
    httpStatus: status,
    latencyMs,
    retryAfterMs: 0,
    message: messageOf(body) || `HTTP ${status}`,
  };
}