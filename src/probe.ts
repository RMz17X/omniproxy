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
/** Cheap enough to run on every click; large enough to prove the key serves. */
const MAX_TOKENS = 8;

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

export async function probeKey(rawKey: string, model = cfg.defaultModel): Promise<ProbeResult> {
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