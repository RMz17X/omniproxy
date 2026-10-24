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
import { isModelUnavailable, parseRetryAfter } from "./upstream.ts";
import {
  classifyResponse,
  type KeyVerdict,
  type QuotaDetail,
  type TierEvidence,
} from "./verdict.ts";
import { isValidElevenLabsKey, probeElevenLabs } from "./tts.ts";
import { allProviders, baseUrlOf, detectProvider } from "./providers.ts";

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
  /** structured quota shape, present only when the answer was a 429 */
  quota?: QuotaDetail | null;
  /** plan evidence, present only when the answer was a 429 */
  tierEvidence?: TierEvidence | null;
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

/**
 * Ask the one endpoint that reports a revoked credential.
 *
 * generateContent answers a leaked key with exactly the 429 project shape a
 * live project without an allocation sends (`quota_limit_value: "0"`), so the
 * serving path can never tell the two apart. Measured on 2026-10-22 against
 * live upstream, `cachedContents` is the only paid-only surface that
 * discriminates: a healthy key answers 400 "Cached content is required to
 * have content.role set", a revoked one answers 403 "Your API key was
 * reported as leaked". `batches` and `veo` 404 for both classes, and
 * `tunedModels` 400s for both, so none of them carries a signal.
 *
 * The body deliberately OMITS `content.role`: that missing field is what makes
 * a live key fail validation inside the handler, so the request returns 400
 * and creates no cached content object. Adding a role would make every healthy
 * probe leave a real cache object behind.
 *
 * Only a 403 whose body names the leak is evidence. A 400 proves the key
 * authenticated but says nothing about revocation; a 404, a 429, a transport
 * failure or a timeout is inconclusive. None of them may retire a key.
 */
export async function probeLeak(rawKey: string, timeoutMs = TIMEOUT_MS): Promise<boolean> {
  const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/cachedContents`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": rawKey },
      body: JSON.stringify({
        model: `models/${cfg.defaultModel}`,
        contents: [{ parts: [{ text: "cache probe" }] }],
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // A transport failure says nothing about the credential.
    return false;
  }
  if (res.status !== 403) return false;
  const body = await res.text().catch(() => "");
  return /reported as leaked/i.test(body);
}

/**
 * Probe a credential through the registry.
 *
 * The provider is named by the caller (the console knows which pool the key
 * was added to) or sniffed from the key format. Each wire dialect gets its
 * own probe: ElevenLabs answers GET /v1/user, an OpenAI-compatible gateway
 * answers GET /models, and Google's generateContent chain is the default.
 * A key is only ever asked in its own dialect — a whatstoken credential
 * probed against Google would answer 403 and look revoked.
 */
export async function probeKey(
  rawKey: string,
  model?: string,
  provider?: string,
): Promise<ProbeResult> {
  const providers = await allProviders();
  const named = (provider ?? "").trim();
  const id = named || detectProvider(rawKey, providers) || "gemini";
  const entry = providers.find((p) => p.id === id) ?? null;
  if (id === "elevenlabs" || entry?.wire === "elevenlabs") {
    return probeElevenLabs(rawKey);
  }
  if (entry?.wire === "openai") {
    return probeOpenAICompatible(rawKey, baseUrlOf(entry));
  }
  const result = await probeModels(rawKey, model);
  if (result.status !== "zero_quota") return result;
  if (!(await probeLeak(rawKey))) return result;
  return {
    ...result,
    status: "invalid",
    message: "upstream reported the API key as leaked",
    quota: null,
    tierEvidence: null,
  };
}

/**
 * Probe an OpenAI-compatible credential via GET {base}/models.
 *
 * 200 = alive, and the model count is the evidence; 401/403 = the credential
 * itself was rejected (invalid); 429 = a window that resets (rate_limited);
 * 5xx and transport failures say nothing about the key.
 */
export async function probeOpenAICompatible(
  rawKey: string,
  baseUrl: string,
  timeoutMs: number = TIMEOUT_MS,
): Promise<ProbeResult> {
  const started = Date.now();
  const k = rawKey.trim();
  if (!baseUrl) {
    return {
      status: "unexpected",
      httpStatus: 0,
      latencyMs: 0,
      retryAfterMs: 0,
      message: "provider has no base URL configured",
    };
  }
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { authorization: `Bearer ${k}`, accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
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
  if (res.status === 429) {
    const body = await res.text().catch(() => "");
    return {
      status: "rate_limited",
      httpStatus: 429,
      latencyMs,
      retryAfterMs: parseRetryAfter(res, body) ?? cfg.cooldownMs,
      message: body.slice(0, 220) || "rate limited",
    };
  }
  if (res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => "");
    return {
      status: "invalid",
      httpStatus: res.status,
      latencyMs,
      retryAfterMs: 0,
      message: body.slice(0, 220) || `HTTP ${res.status}`,
    };
  }
  if (res.status >= 500) {
    return {
      status: "server_error",
      httpStatus: res.status,
      latencyMs,
      retryAfterMs: 0,
      message: `HTTP ${res.status}`,
    };
  }
  let count = 0;
  try {
    const payload = (await res.json()) as { data?: unknown[] };
    count = Array.isArray(payload.data) ? payload.data.length : 0;
  } catch {
    /* a 200 without a JSON body still proves the credential */
  }
  return {
    status: res.ok ? "ok" : "unexpected",
    httpStatus: res.status,
    latencyMs,
    retryAfterMs: 0,
    message: res.ok ? `serving (${count} models)` : `HTTP ${res.status}`,
  };
}

async function probeModels(rawKey: string, model?: string): Promise<ProbeResult> {
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

/** One probe call, classified by the single verdict taxonomy. */
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
  const classified = classifyResponse(res.status, body, Object.fromEntries(res.headers.entries()));
  const serving = res.status >= 200 && res.status < 300;

  return {
    status: PROBE_STATUS[classified.verdict],
    httpStatus: res.status,
    latencyMs,
    retryAfterMs: res.status === 429 ? (parseRetryAfter(res, body) ?? cfg.cooldownMs) : 0,
    message: serving ? "serving" : messageOf(body) || `HTTP ${res.status}`,
    quota: classified.quota,
    tierEvidence: classified.tierEvidence,
  };
}

/** Verdict -> probe status. `quota_exhausted` is the historical `zero_quota`. */
const PROBE_STATUS: Record<KeyVerdict, ProbeStatus> = {
  ok: "ok",
  rate_limited: "rate_limited",
  quota_exhausted: "zero_quota",
  invalid: "invalid",
  server_error: "server_error",
  network_error: "network_error",
  unexpected: "unexpected",
};

export type TierProbeResult = {
  verdict: KeyVerdict;
  tierEvidence: TierEvidence | null;
  quota: QuotaDetail | null;
  httpStatus: number;
  message: string;
};

/**
 * Ask upstream which plan the key is on, using models the serving path never
 * uses. Only a 429 body carries tier evidence, so a 2xx answers `ok` with a
 * null evidence and the caller must leave the stored plan untouched.
 *
 * The model list is walked only when the answer blames the model (404, or a
 * model-unavailable 400): that says nothing about the credential.
 */
export async function probeTier(rawKey: string, timeoutMs = TIMEOUT_MS): Promise<TierProbeResult> {
  const models = cfg.tierProbeModels.filter(Boolean);
  let last: TierProbeResult = {
    verdict: "unexpected",
    tierEvidence: null,
    quota: null,
    httpStatus: 0,
    message: "no tier probe model configured",
  };

  for (const model of models) {
    const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/models/${model}:generateContent`;
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
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      last = {
        verdict: "network_error",
        tierEvidence: null,
        quota: null,
        httpStatus: 0,
        message: err instanceof Error ? err.message : String(err),
      };
      continue;
    }

    const body = await res.text().catch(() => "");
    const classified = classifyResponse(res.status, body, Object.fromEntries(res.headers.entries()));
    last = {
      verdict: classified.verdict,
      tierEvidence: classified.tierEvidence,
      quota: classified.quota,
      httpStatus: res.status,
      message: messageOf(body) || `HTTP ${res.status}`,
    };
    if (res.status === 404 || isModelUnavailable(body)) continue;
    return last;
  }

  return last;
}