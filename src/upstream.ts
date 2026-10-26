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
import { log } from "./log.ts";
import { counters } from "./metrics.ts";
import { rotationCap } from "./settings-store.ts";
import {
  mark429,
  markInvalid,
  markModelRefused,
  markSoftError,
  markUsed,
  maskKey,
  modelBlock,
  pick,
  snapshot,
} from "./pool.ts";
import { isInvalidKeyBody, isModelScopedQuota, parseQuotaDetail, retryDelayMs } from "./verdict.ts";

export type ExecResult = {
  response: Response;
  /** masked key, safe to log */
  key: string;
  attempts: number;
  rotated: boolean;
  /**
   * The upstream refused the *model*, not the key (404 retired model, 503
   * high demand). No key verdict was applied, so the caller may retry the
   * same request against the next model in the chain.
   */
  modelRefused?: boolean;
  /**
   * The upstream says this credential has no quota for this model.
   *
   * A project can hold quota for one model and none for another, so this is a
   * verdict about the *pair*, not about the credential. The caller decides
   * what it means: with a model chain it tries the next model first and only
   * retires the key when every model agrees; without one it retires at once.
   */
  quotaRefused?: boolean;
  /** the keys that answered zero-quota on this model */
  quotaRefusedKeys?: string[];
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Retry-After header, `google.rpc.RetryInfo.retryDelay`, or a "reset after 30s"
 * style message — most specific first. A Google 429 normally carries the
 * structured Duration and no header at all.
 */
export function parseRetryAfter(res: Response, body: string): number | null {
  const structured = retryDelayMs(body);
  if (structured !== null) return structured;
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

export function isInvalidKeyText(body: string): boolean {
  // One predicate, shared with classifyResponse. The serving path and the
  // probe disagreeing about "dead credential" is how OAuth tokens stayed in
  // the pool forever: the probe called them unclassifiable and the serving
  // path soft-parked them, so they cycled instead of retiring.
  return isInvalidKeyBody(body);
}

/**
 * A 429 whose `quota_limit_value` is 0 means the consumer project has no
 * quota at all — the limit will never reset. Recycling such a key every
 * cooldown window burns attempts and stalls every request behind a dead
 * project, so it is retired permanently instead.
 *
 * The two 429 shapes Google emits are distinguished by the metadata, not by
 * the prose:
 *
 *   - transient: `quota_limit_value` is a positive number (the per-minute
 *     allowance) and the message says the quota was exceeded. It resets.
 *   - permanent: `quota_limit_value` is 0 — the project holds no allocation
 *     for that metric in that region, so the per-minute window is irrelevant.
 *     Only the project's owner can change it.
 *
 * Both carry a "requests per minute" phrase in the limit name, so that
 * phrase cannot be used to tell them apart; the limit *value* can. An
 * exhausted-but-valid key reports the real allowance, not 0.
 */
export function isZeroQuota(body: string): boolean {
  const value = /"quota_limit_value"\s*:\s*"?(\d+)"?/.exec(body);
  if (!value) {
    // No limit metadata at all: fall back to the prose, which only mentions a
    // permanent zero quota when the consumer project is the problem.
    return /quota_limit_value[:=]\s*0\b/.test(body);
  }
  return value[1] === "0";
}

/**
 * True when the body blames the model rather than the credential: a retired
 * model ("no longer available to new users"), a model that does not implement
 * generateContent, or a model the upstream says is under too much load.
 *
 * Both verdicts are properties of the model: no amount of key rotation can
 * fix them, and parking the key would punish a healthy credential.
 */
export function isModelUnavailable(body: string): boolean {
  return /no longer available to new users|is not found for API version|not supported for generateContent|does not support generateContent|MODEL_NOT_FOUND|is not supported|experiencing high demand|currently unavailable/i.test(
    body,
  );
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
  } else if (key.startsWith("sk-") || key.startsWith("sk_")) {
    // OpenAI-style gateways (whatstoken and custom providers) authenticate
    // with a bearer token, never with Google's x-goog-api-key header.
    h.set("authorization", `Bearer ${key}`);
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

/**
 * Combine the caller's abort signal with the per-attempt timeout so either one
 * tears the upstream fetch down. A client disconnect must not hold a key.
 */
function attemptSignal(client: AbortSignal | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = client ? AbortSignal.any([client, timeout]) : timeout;
  return { signal, timeout };
}

export async function execute(
  url: string,
  init: RequestInit & { method: string },
  path: string,
  signal?: AbortSignal,
  opts?: { timeoutMs?: number; deferQuotaRetire?: boolean; model?: string; provider?: string },
): Promise<ExecResult> {
  const tried = new Set<string>();
  const deadline = Date.now() + cfg.maxWaitMs;
  // Read once per request: the operator can change the cap from the console
  // while requests are in flight, and a single rotation run must not switch
  // limits halfway through.
  const maxAttempts = await rotationCap();
  /** keys that answered zero-quota on this model (project-shaped refusal) */
  const quotaRefused = new Set<string>();
  /** keys that answered "no allowance for this model", scoped to the model */
  const modelRefusedKeys = new Set<string>();
  let attempts = 0;
  let rotated = false;

  // A caller that has already hung up gets no key at all.
  if (signal?.aborted) return aborted();

  for (;;) {
    // `provider` restricts selection to one pool: a request routed to
    // whatstoken must never be handed a Gemini credential (and vice versa).
    let st = await pick(tried, opts?.model, opts?.provider);

    // A live per-model refusal has no bounded reset to wait for (the deadline
    // is that model's next daily reset), so report a model verdict and let the
    // chain advance instead of sleeping out `maxWaitMs` on every request.
    // Project-quota parks deliberately fall through to the wait below: their
    // refusal must reach the caller's per-model tally so a key is retired only
    // once the whole chain agrees.
    if (!st && opts?.model) {
      const block = modelBlock(tried, opts.model, opts?.provider);
      if (block.kind === "model_refusal") {
        counters.poolExhausted++;
        log("warn", "model.quota_refused_all", {
          path,
          keys: block.keys.map(maskKey),
          model: opts.model,
        });
        return {
          response: jsonError(
            429,
            "model_zero_quota",
            "This model has no quota left on any key in the pool.",
          ),
          key: "",
          attempts,
          rotated,
          modelRefused: true,
        };
      }
    }
    // Pool exhausted for this instant — wait for the soonest cooldown to lapse.
    while (!st) {
      const snap = await snapshot();
      if (snap.total === 0) {
        counters.poolExhausted++;
        return {
          response: jsonError(503, "no_api_keys", "The key pool is empty."),
          key: "",
          attempts,
          rotated,
        };
      }
      const wait = Math.max(120, Math.min(snap.soonestReadyMs || 500, 2_000));
      if (Date.now() + wait > deadline || signal?.aborted) {
        counters.poolExhausted++;
        // Every key in the pool answered zero-quota for THIS model. That is a
        // verdict about the model, not about the keys, so it is reported as
        // such: the caller can move to the next model instead of telling the
        // client the pool is exhausted.
        if (modelRefusedKeys.size > 0) {
          log("warn", "model.quota_refused_all", { path, keys: [...modelRefusedKeys].map(maskKey), model: opts?.model ?? "" });
          return {
            response: jsonError(
              429,
              "model_zero_quota",
              "This model has no quota left on any key in the pool.",
            ),
            key: "",
            attempts,
            rotated,
            modelRefused: true,
          };
        }
        if (quotaRefused.size > 0) {
          return {
            response: jsonError(
              429,
              "model_zero_quota",
              "This model has no quota left on any key in the pool.",
            ),
            key: "",
            attempts,
            rotated,
            quotaRefused: true,
            quotaRefusedKeys: [...quotaRefused],
          };
        }
        log("warn", "pool.exhausted", {
          path,
          total: snap.total,
          cooling: snap.cooling,
          dead: snap.dead,
          soonestReadyMs: snap.soonestReadyMs,
        });
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
      st = await pick(tried, opts?.model, opts?.provider);
    }

    if (attempts > 0) {
      rotated = true;
      counters.rotations++;
    }
    if (attempts >= maxAttempts) {
      counters.poolExhausted++;
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
    const { signal: attempt, timeout } = attemptSignal(signal, opts?.timeoutMs ?? cfg.upstreamTimeoutMs);

    let res: Response;
    counters.upstreamRequests++;
    try {
      res = await fetch(target, {
        // Carry the caller's body (and `duplex` for streamed bodies) through
        // unchanged; only the credential headers are swapped.
        ...init,
        headers,
        // Never follow redirects into a different credential scope.
        redirect: "manual",
        signal: attempt,
      });
    } catch (err) {
      if (signal?.aborted) {
        counters.clientAborts++;
        log("warn", "client.aborted", { path, attempt: attempts, key: maskKey(st.key) });
        return aborted();
      }
      // A timeout that is not the client's disconnect is a property of the
      // *model* (a congested one stalls for tens of seconds before answering),
      // not of the credential. Rotating keys would burn a healthy key per
      // attempt and still end in the same stall, so the chain moves on to the
      // next model instead.
      if (timeout.aborted) {
        counters.networkErrors++;
        log("warn", "model.timeout", {
          path,
          key: maskKey(st.key),
          attempt: attempts,
          timeoutMs: opts?.timeoutMs ?? cfg.upstreamTimeoutMs,
        });
        return {
          response: jsonError(
            504,
            "model_timeout",
            `The upstream did not answer within ${opts?.timeoutMs ?? cfg.upstreamTimeoutMs}ms.`,
          ),
          key: st.key,
          attempts,
          rotated,
          modelRefused: true,
        };
      }
      counters.networkErrors++;
      await markSoftError(st.key, cfg.serverErrCooldownMs);
      log("warn", "upstream.network_error", {
        path,
        key: maskKey(st.key),
        attempt: attempts,
        error: err instanceof Error ? err.message : String(err),
      });
      // Never throw to the generic 500 handler: a network failure is a
      // gateway answer (the key was already parked above), so return it in
      // the same jsonError shape as every other rotation outcome.
      if (attempts >= maxAttempts) {
        return {
          response: jsonError(
            502,
            "upstream_error",
            `Upstream did not answer after ${attempts} attempt${attempts === 1 ? "" : "s"}.`,
          ),
          key: st.key,
          attempts,
          rotated,
        };
      }
      continue;
    }

    await markUsed(st.key);

    const status = res.status;

    if (status === 429) {
      counters.upstream429++;
      const body = await safeText(res);
      const quota = parseQuotaDetail(body, Object.fromEntries(res.headers));
      const scopeModel = opts?.model ?? quota?.model ?? "";
      // A per-model allowance refusal says nothing about the credential: the
      // key is still good for every other model, so no cooldown, no failure
      // count, no retirement. The chain moves to the next model and this key
      // stays in rotation for it.
      if (quota !== null && scopeModel !== "" && isModelScopedQuota(quota)) {
        await markModelRefused(st.key, scopeModel, quota);
        modelRefusedKeys.add(st.key);
        log("warn", "model.quota_refused", {
          path,
          key: maskKey(st.key),
          model: scopeModel,
          retryAfterMs: quota.retryAfterMs,
        });
        if (attempts >= maxAttempts) {
          return {
            response: rebuild(res, body),
            key: st.key,
            attempts,
            rotated,
            modelRefused: true,
          };
        }
        continue;
      }
      if (isZeroQuota(body)) {
        quotaRefused.add(st.key);
        // With a model chain, "no quota for this model" is not yet a verdict
        // about the key: the chain may serve it through another model. The
        // retirement is deferred to the chain, which retires only when every
        // model agrees. Without a chain there is nothing to defer to, so the
        // key is retired here as before.
        if (!opts?.deferQuotaRetire) {
          const claimed = await markInvalid(st.key);
          log("warn", "key.zero_quota", { path, key: maskKey(st.key), first: claimed });
        } else {
          log("warn", "model.zero_quota", { path, key: maskKey(st.key) });
        }
        if (attempts >= maxAttempts) {
          return {
            response: rebuild(res, body),
            key: st.key,
            attempts,
            rotated,
            quotaRefused: true,
            quotaRefusedKeys: [...quotaRefused],
          };
        }
        continue;
      }
      const cd = parseRetryAfter(res, body) ?? cfg.cooldownMs;
      await mark429(st.key, Math.max(cfg.cooldownMs, cd));
      log("info", "key.cooldown", { path, key: maskKey(st.key), status, cooldownMs: Math.max(cfg.cooldownMs, cd) });
      if (attempts >= maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }

    if (status === 401 || status === 403) {
      const body = await safeText(res);
      if (isInvalidKeyText(body)) {
        const claimed = await markInvalid(st.key);
        log("warn", "key.invalid", { path, key: maskKey(st.key), status, first: claimed });
      } else if (status === 401) {
        // A bare 401 is NOT proof the credential is dead: it can be a
        // project/model-access refusal for a live key. Retiring on it burned
        // healthy keys. Park the key briefly and rotate instead; only
        // invalid-key text retires (the branch above).
        await markSoftError(st.key, cfg.serverErrCooldownMs);
        log("warn", "key.auth_cooldown", { path, key: maskKey(st.key), status });
        if (attempts >= maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
        continue;
      } else if (isQuotaText(body)) {
        const quota = parseQuotaDetail(body, Object.fromEntries(res.headers));
        const scopeModel = opts?.model ?? quota?.model ?? "";
        // Same split as the 429 branch: a per-model allowance refusal leaves
        // the credential untouched, so only the model is parked.
        if (quota !== null && scopeModel !== "" && isModelScopedQuota(quota)) {
          await markModelRefused(st.key, scopeModel, quota);
          modelRefusedKeys.add(st.key);
          log("warn", "model.quota_refused", {
            path,
            key: maskKey(st.key),
            model: scopeModel,
            retryAfterMs: quota.retryAfterMs,
          });
          if (attempts >= maxAttempts) {
            return {
              response: rebuild(res, body),
              key: st.key,
              attempts,
              rotated,
              modelRefused: true,
            };
          }
          continue;
        }
        if (isZeroQuota(body)) {
          quotaRefused.add(st.key);
          if (!opts?.deferQuotaRetire) {
            const claimed = await markInvalid(st.key);
            log("warn", "key.zero_quota", { path, key: maskKey(st.key), first: claimed });
          } else {
            log("warn", "model.zero_quota", { path, key: maskKey(st.key) });
          }
          if (attempts >= maxAttempts) {
            return {
              response: rebuild(res, body),
              key: st.key,
              attempts,
              rotated,
              quotaRefused: true,
              quotaRefusedKeys: [...quotaRefused],
            };
          }
          continue;
        }
        const cd = parseRetryAfter(res, body) ?? cfg.cooldownMs;
        await mark429(st.key, Math.max(cfg.cooldownMs, cd));
        log("info", "key.cooldown", { path, key: maskKey(st.key), status, cooldownMs: Math.max(cfg.cooldownMs, cd) });
      } else {
        // Genuine authorisation failure for the caller, not a key problem.
        return { response: rebuild(res, body), key: st.key, attempts, rotated };
      }
      if (attempts >= maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }

    if (status === 400 || status === 404) {
      const body = await safeText(res);
      if (isInvalidKeyText(body)) {
        const claimed = await markInvalid(st.key);
        log("warn", "key.invalid", { path, key: maskKey(st.key), status, first: claimed });
        if (attempts >= maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
        continue;
      }
      if (isModelUnavailable(body)) {
        log("warn", "model.unavailable", { path, key: maskKey(st.key), status });
        return { response: rebuild(res, body), key: st.key, attempts, rotated, modelRefused: true };
      }
      // Bad request / Not found from the client — no amount of rotation fixes it.
      return { response: rebuild(res, body), key: st.key, attempts, rotated };
    }

    if (status >= 500) {
      counters.upstream5xx++;
      const body = await safeText(res);
      // 503 UNAVAILABLE "high demand" is the model being overloaded, not the
      // key; parking the key would burn a healthy credential per attempt.
      if (isModelUnavailable(body)) {
        log("warn", "model.unavailable", { path, key: maskKey(st.key), status });
        return { response: rebuild(res, body), key: st.key, attempts, rotated, modelRefused: true };
      }
      await markSoftError(st.key, cfg.serverErrCooldownMs);
      log("warn", "key.soft_error", { path, key: maskKey(st.key), status, attempt: attempts });
      if (attempts >= maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }

    // 2xx / 3xx / anything else — legitimate answer, stream it straight back.
    return { response: res, key: st.key, attempts, rotated };
  }
}

function aborted(): ExecResult {
  return {
    response: new Response(null, { status: 499 }),
    key: "",
    attempts: 0,
    rotated: false,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Normalise a Google error envelope into the OpenAI error shape so a client
 * that only speaks OpenAI sees `error.type` instead of a bare Google status.
 * The original payload is preserved under `error.upstream` — nothing is lost,
 * but nothing Google-specific leaks into `error.message` either.
 */
function rebuild(res: Response, body: string): Response {
  const h = new Headers(res.headers);
  h.delete("content-encoding");
  h.delete("content-length");
  h.delete("transfer-encoding");

  if (res.status < 400) return new Response(body, { status: res.status, headers: h });

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const g = (parsed as { error?: { message?: string; status?: string; code?: number } } | null)?.error;
  const message = g?.message ?? (body.slice(0, 400) || `Upstream returned HTTP ${res.status}.`);
  const type =
    res.status === 429
      ? "rate_limit_error"
      : res.status === 404
        ? "not_found_error"
        : res.status === 401 || res.status === 403
          ? "auth_error"
          : res.status >= 500
            ? "upstream_error"
            : "invalid_request_error";

  h.set("content-type", "application/json");
  return new Response(
    JSON.stringify({
      error: {
        type,
        code: g?.status ?? `http_${res.status}`,
        message,
        status: res.status,
        upstream: parsed ?? body.slice(0, 2000),
      },
    }),
    { status: res.status, headers: h },
  );
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export type ModelAttempt = {
  url: string;
  init: RequestInit & { method: string };
  path: string;
};

/**
 * Ordered models to try for a request: the requested one first, then the
 * configured fallback chain, de-duplicated. `MODEL_FALLBACK_MODELS` wins over
 * the code default, mirroring `PROBE_FALLBACK_MODELS` on the probe path.
 */
export function modelChain(primary: string): string[] {
  return [primary, ...cfg.modelFallback].filter((m, i, all) => Boolean(m) && all.indexOf(m) === i);
}

/**
 * Run one logical request down a model chain. Each model gets the full key
 * rotation; a model-level refusal moves to the next model with the key state
 * exactly as it was (no invalidation, no cooldown, no fail counter).
 *
 * The first model in the chain is the one the client asked for, so it gets the
 * full upstream timeout. A fallback model is tried *because* the previous one
 * was congested, and a congested model typically stalls for tens of seconds
 * before answering 503; waiting the full timeout on each fallback would turn
 * one bad request into a minute of silence. Fallbacks therefore get
 * `cfg.fallbackTimeoutMs`, and the whole chain is bounded by
 * `cfg.modelChainBudgetMs` so the client is answered rather than left waiting.
 */
export async function executeWithFallback(
  models: string[],
  build: (model: string) => ModelAttempt,
  signal?: AbortSignal,
): Promise<ExecResult & { model: string }> {
  const chain = models.length ? models : [cfg.defaultModel];
  const chainDeadline = Date.now() + cfg.modelChainBudgetMs;
  let last: ExecResult | null = null;
  let lastModel = chain[0];
  /**
   * key -> the models that said "no quota for this model". A key is retired
   * only when every model in the chain refused it, so a project that is out
   * of quota for one model but healthy on another keeps serving.
   */
  const quotaRefusedBy = new Map<string, Set<string>>();
  let chainQuotaRefused = false;

  for (const [index, model] of chain.entries()) {
    if (index > 0) {
      const left = chainDeadline - Date.now();
      if (left <= 0) break;
    }
    const timeoutMs =
      index === 0
        ? cfg.upstreamTimeoutMs
        : Math.max(1_000, Math.min(cfg.fallbackTimeoutMs, chainDeadline - Date.now()));
    const { url, init, path } = build(model);
    const result = await execute(url, init, path, signal, { timeoutMs, deferQuotaRetire: true, model });
    last = result;
    lastModel = model;

    if (result.quotaRefused) {
      chainQuotaRefused = true;
      for (const key of result.quotaRefusedKeys ?? []) {
        const seen = quotaRefusedBy.get(key) ?? new Set<string>();
        seen.add(model);
        quotaRefusedBy.set(key, seen);
      }
    }

    if (!result.modelRefused && !result.quotaRefused) return { ...result, model };
    if (result.modelRefused) {
      log("warn", "model.fallback", { path, model, status: result.response.status });
    } else {
      log("warn", "model.quota_fallback", { path, model, status: result.response.status });
    }
  }

  // Every model agreed: the key has no quota anywhere in the chain, so it is
  // dead for this gateway and is retired now.
  if (chainQuotaRefused) {
    for (const [key, seen] of quotaRefusedBy) {
      if (seen.size >= chain.length) {
        const claimed = await markInvalid(key);
        log("warn", "key.zero_quota", { key: maskKey(key), models: [...seen], first: claimed });
      }
    }
  }

  return { ...(last as ExecResult), model: lastModel };
}
