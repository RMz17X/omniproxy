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
import { isInvalidKeyText, isModelUnavailable, isZeroQuota, parseRetryAfter } from "./upstream.ts";

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
 * Probe chain: the requested model (or the default) leads, then the
 * configurable `PROBE_MODELS` list. A model Google has retired or a model
 * that is overloaded says nothing about the key, so neither may decide a
 * key verdict — the probe walks down this chain before reporting anything.
 */
function probeChain(model?: string): string[] {
  return [model ?? cfg.defaultModel, ...cfg.probeModels].filter(
    (m, i, all) => Boolean(m) && all.indexOf(m) === i,
  );
}

/**
 * True when the answer blames the *model* rather than the credential: a
 * retired model (404 "no longer available to new users"), a model that does
 * not implement generateContent, or a model the upstream says is overloaded
 * (503 "experiencing high demand"). Marking a key cooling for any of these
 * punishes a healthy credential for the model's condition.
 */
function isModelLevelFailure(res: ProbeResult): boolean {
  if (res.httpStatus !== 400 && res.httpStatus !== 404 && res.httpStatus !== 503) return false;
  return isModelUnavailable(res.message);
}

/**
 * The next model to try after a model-level failure, or null when the chain
 * is exhausted.
 */
function nextCandidate(chain: string[], current: string): string | null {
  const at = chain.indexOf(current);
  if (at < 0) return null;
  return chain[at + 1] ?? null;
}

/**
 * The verdict to report when the models disagree.
 *
 * A key must never be retired on the strength of one model alone: a project
 * can be out of quota for `gemini-3.5-flash` and still serve
 * `gemini-3-flash-preview`. So the two verdicts that retire a key
 * (`invalid`, `zero_quota`) are cross-checked against one more model, and the
 * recoverable verdicts win when the models disagree:
 *
 *   - any model served        -> `ok` (the credential works)
 *   - any model rejected      -> `invalid` (a revoked key is revoked everywhere)
 *   - any model rate limited  -> `rate_limited` (a window that resets)
 *   - only then                -> `zero_quota` (out of quota on every model)
 *
 * A 429 that is only per-minute is reported as `rate_limited` and cools the
 * key; that is recoverable, so it outranks a permanent-looking `zero_quota`
 * seen on a different model.
 */
function reconcile(first: ProbeResult, second: ProbeResult): ProbeResult {
  if (second.status === "ok") return second;
  if (first.status === "invalid" || second.status === "invalid") {
    return first.status === "invalid" ? first : second;
  }
  if (first.status === "rate_limited" || second.status === "rate_limited") {
    return first.status === "rate_limited" ? first : second;
  }
  if (first.status === "zero_quota" || second.status === "zero_quota") {
    return first.status === "zero_quota" ? first : second;
  }
  return first;
}

export async function probeKey(rawKey: string, model?: string): Promise<ProbeResult> {
  const chain = probeChain(model);
  let candidate: string | null = chain[0] ?? null;
  let refused: ProbeResult | null = null;

  while (candidate) {
    const res = await probeOnce(rawKey, candidate);

    // The model served: the key is healthy, nothing else to ask.
    if (res.status === "ok") return res;

    // The model is the problem. Try the next one; the key is untouched.
    if (isModelLevelFailure(res)) {
      refused = res;
      candidate = nextCandidate(chain, candidate);
      continue;
    }

    // A per-minute 429 is recoverable, so it is reported without spending
    // another call: cooling a key for a window that resets is the correct
    // and cheap answer.
    if (res.status === "rate_limited" || res.status === "server_error" || res.status === "network_error") {
      return res;
    }

    // `invalid` and `zero_quota` retire the key, so they are cross-checked
    // against one more model before the pool acts on them.
    const next = nextCandidate(chain, candidate);
    if (!next) return res;
    const other = await probeOnce(rawKey, next);
    if (other.status === "ok") return other;
    if (isModelLevelFailure(other)) return res;
    return reconcile(res, other);
  }

  return (
    refused ?? {
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