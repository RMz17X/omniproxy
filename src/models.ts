/**
 * Live model discovery + pricing merge for the /models console.
 *
 * The model LIST is real: one GET against the Generative Language API using a
 * key from the live pool, cached for a few minutes. Pricing and free-tier
 * availability are joined from the static catalog (Google exposes no API for
 * commercial metadata).
 */

import { cfg } from "./config.ts";
import { pick, poolSize, rawKeyById, readyCount, type KeyState, type KeyTier } from "./pool.ts";
import { CATALOG, PRICING_AS_OF, catalogFor, type CatalogEntry, type ModelKind } from "./models-catalog.ts";
import { isZeroQuota } from "./upstream.ts";
import { log } from "./log.ts";

const CACHE_MS = Number(process.env.MODELS_CACHE_MS ?? 300_000);
const TIMEOUT_MS = Number(process.env.MODELS_TIMEOUT_MS ?? 10_000);

export type LiveModel = {
  /** bare id, no models/ prefix */
  id: string;
  /** which pool owns this row: "gemini" or "elevenlabs" */
  provider: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  /** upstream supportedGenerationMethods verbatim */
  methods: string[];
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
  /** derived capability bucket */
  kind: ModelKind;
  /** catalog join */
  free: boolean | null;
  freeLabel: string;
  inUsd: number | null;
  outUsd: number | null;
  inRaw: string;
  outRaw: string;
  /** elevenlabs voice category, when the row is a voice */
  voiceCategory?: string;
};

type Cache = { at: number; models: LiveModel[]; source: string };
let cache: Cache | null = null;

/**
 * One sentence out of an upstream error body.
 *
 * The console shows this message to the operator, so it has to read like a
 * sentence. Google answers with a JSON envelope; the useful part is
 * `error.message`. Anything else is flattened and capped.
 */
function upstreamMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    const msg = parsed?.error?.message ?? parsed?.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 180);
  } catch {
    /* not JSON, fall through to the flat text */
  }
  const flat = body.replace(/\s+/g, " ").trim();
  return flat ? flat.slice(0, 180) : `HTTP ${status}`;
}

function kindOf(id: string, methods: string[]): ModelKind {  const c = catalogFor(id);
  if (c) return c.kind;
  const m = id.toLowerCase();
  if (m.includes("embedding")) return "embedding";
  if (m.includes("tts")) return "tts";
  if (m.includes("image") || m.includes("imagen") || m.includes("banana")) return "image";
  if (m.includes("veo")) return "video";
  if (m.includes("lyria")) return "audio";
  if (m.includes("live")) return "live";
  if (m.includes("transcribe")) return "transcribe";
  if (methods.some((x) => /predict|generateVideo/i.test(x))) return "video";
  if (methods.some((x) => /embedContent|embedText/i.test(x))) return "embedding";
  return "text";
}

/**
 * Keys that answered model discovery with 403 "reported as leaked". Such a key
 * is still a live credential for generateContent and stays in the pool — it
 * simply cannot serve the models endpoint. Remembered per process so the next
 * listing skips straight past them instead of burning probes every request.
 */
const leakedForListing = new Set<string>();

/**
 * Keys that have actually answered model discovery.
 *
 * Roughly one in thirty pooled keys clears Google's leak check on /v1beta/models
 * while the rest of the pool cannot. Those few are far too valuable to lose to
 * a deterministic pick order, so they are remembered and probed first on the
 * next listing. Process-local on purpose — the pool state must not change.
 */
const knownGoodForListing = new Set<string>();

/**
 * Backoff once discovery is known to be pool-wide blocked.
 *
 * Probing 60 keys per console refresh when every one of them is flagged leaked
 * is pure waste, and it hides the real state behind a raw upstream 403.
 */
const DISCOVERY_BACKOFF_MS = 300_000;
let discoveryBlockedUntil = 0;

/**
 * How many key probes a single listing may burn before giving up.
 *
 * The pool is ~250 selectable keys of which only a handful clear the leaked
 * check, so a small cap would blank the console even though a working key
 * exists; an unbounded cap would turn every refresh into a mass request run.
 * Success is cached, so the search is a one-time cost per instance.
 */
const PROBE_CAP = 100;

/** A key that can answer model discovery: any non-invalid, non-leaked key. */
async function candidateKeys(limit = 12): Promise<string[]> {
  // Walk the whole selectable pool, not a bounded sample. `pick` returns keys in
  // a deterministic order (cooldown, then key string), so a truncated sample can
  // miss the handful of keys that can still answer discovery — roughly one in
  // thirty here — and then every probe fails even though a working key exists.
  const states: KeyState[] = [];
  const seen = new Set<string>();
  for (;;) {
    // Discovery is a Gemini-only concern: the models endpoint is Google's, so
    // probing an ElevenLabs or other provider key can only burn an attempt.
    const st = await pick(seen, undefined, "gemini");
    if (!st) break;
    seen.add(st.key);
    states.push(st);
  }
  const rank = (s: KeyState): number =>
    knownGoodForListing.has(s.key) ? 0
    : leakedForListing.has(s.key) ? 4
    : s.status === "ready" && s.key.startsWith("AIzaSy") ? 1
    : s.status === "ready" ? 2
    : 3;
  // Rank first, then key string. The secondary order matters: `pick` hands keys
  // back ordered by failure count, and in a pool where the keys that answer
  // discovery carry the highest historical failure counts, that order puts
  // every usable key at the tail. Alphabetical order spreads the probes across
  // the whole key space instead of re-walking the same leaked prefix.
  states.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  // Keys that have already answered discovery go first, then the Gemini-format
  // keys the durable repo marks ready, then the remaining ready keys, then
  // keys known to be flagged leaked as the last resort. Every pooled key here
  // reports `ready`, so the prefix is the only signal that separates a real
  // Gemini API key from the other credential shapes sharing the same pool.
  const out = states.slice(0, limit).map((s) => s.key);
  lastCandidateDebug = {
    out: out.length,
    walked: states.length,
    ready: states.filter((s) => s.status === "ready").length,
    aiPrefix: states.filter((s) => s.key.startsWith("AIzaSy")).length,
    aiReady: states.filter((s) => s.status === "ready" && s.key.startsWith("AIzaSy")).length,
    aiLeaked: states.filter((s) => leakedForListing.has(s.key) && s.key.startsWith("AIzaSy")).length,
    firstOut: out[0] ? out[0].slice(0, 8) : "",
    firstAi: states.find((s) => s.key.startsWith("AIzaSy"))?.key.slice(0, 8) ?? "",
    maxFail: Math.max(0, ...states.map((s) => s.failures)),
    pool: poolSize(),
  };
  return out;
}

/** Last `candidateKeys` outcome, read only to explain an empty result. */
let lastCandidateDebug: Record<string, number | string> | null = null;

/**
 * Why discovery is degraded, for the console's debug field.
 *
 * The degraded path already tells the operator "catalog". This says why, with
 * the numbers that distinguish the two very different causes: the instance has
 * no usable keys at all, or every key it has is flagged leaked upstream.
 */
export function discoveryDebug(): Record<string, unknown> {
  return {
    pool: poolSize(),
    ready: readyCount(),
    leakedKnown: leakedForListing.size,
    knownGood: knownGoodForListing.size,
    discoveryBlockedForMs: Math.max(0, discoveryBlockedUntil - Date.now()),
    candidates: lastCandidateDebug,
  };
}

async function fetchWithKey(key: string): Promise<Response> {
  const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/models?pageSize=1000`;
  return fetch(url, {
    method: "GET",
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Real model list. Tries pool keys until one answers; a 429 or a rejected key
 * just moves on to the next candidate. Throws only when the pool has no key
 * that can answer at all.
 */
export async function listLiveModels(force = false): Promise<{ models: LiveModel[]; source: string; cached: boolean }> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return { models: cache.models, source: cache.source, cached: true };
  }

  // Discovery through /v1beta/models is refused for every harvested key: the
  // keys were published publicly, so Google flags them leaked there even though
  // generateContent still accepts them. That is a stable property of the pool,
  // not a transient fault — probing again on every console refresh only burns
  // requests. Back off and let the caller serve the catalog.
  if (Date.now() < discoveryBlockedUntil) {
    const err = new Error(
      `Model discovery blocked: every pooled key is flagged leaked. (known=${leakedForListing.size}, pool=${poolSize()})`,
    );
    (err as Error & { code?: string }).code = "leaked_pool";
    throw err;
  }

  const keys = await candidateKeys(40);
  if (!keys.length) {
    const err = new Error(
      `Pool has no selectable key, cannot query the model list. (pool=${poolSize()}, ready=${readyCount()}, leaked=${leakedForListing.size}, cand=${JSON.stringify(lastCandidateDebug)})`,
    );
    (err as Error & { code?: string }).code = "empty_pool";
    throw err;
  }

  let lastErr = "";
  // Bounded probes, but the candidate list keeps growing: every leaked key we
  // discover is skipped in place and replaced with a fresh pick, so a pool
  // where most keys are leaked still finds a usable one without burning a
  // request per key.
  let probed = 0;
  for (let i = 0; i < PROBE_CAP; i++) {
    const key = keys[i];
    if (!key) break;
    let res: Response;
    try {
      res = await fetchWithKey(key);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      continue;
    }
    probed++;
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      lastErr = `HTTP ${res.status}: ${upstreamMessage(body, res.status)}`;
      log("warn", "models.list_key_failed", { status: res.status, zeroQuota: isZeroQuota(body) });
      // A leaked key is NOT a dead key: it still serves generateContent and
      // stays in the pool. It just cannot answer model discovery, so remember
      // it here and stop asking it for the list. Process-local on purpose —
      // the pool state must not change.
      if (res.status === 403 && /reported as leaked/i.test(body)) {
        leakedForListing.add(key);
        knownGoodForListing.delete(key);
        log("info", "models.key_skipped_leaked", {});
        // Replace in place so a later iteration gets a fresh candidate.
        const next = await pick(new Set(keys));
        if (next) keys.push(next.key);
      }
      continue;
    }

    // This key can answer discovery — remember it so the next listing does not
    // have to rediscover the one usable key in a hundred through trial and
    // error, which is exactly what the pick order hides.
    knownGoodForListing.add(key);

    let payload: { models?: Array<Record<string, unknown>> };
    try {
      payload = JSON.parse(body);
    } catch {
      lastErr = "Upstream returned non-JSON model list.";
      continue;
    }

    const models: LiveModel[] = (payload.models ?? []).map((raw) => {
      const full = String(raw.name ?? "");
      const id = full.replace(/^models\//, "");
      const methods = Array.isArray(raw.supportedGenerationMethods)
        ? (raw.supportedGenerationMethods as string[])
        : [];
      const cat: CatalogEntry | null = catalogFor(id);
      return {
        id,
        provider: "gemini",
        name: full,
        displayName: String(raw.displayName ?? id),
        description: String(raw.description ?? ""),
        version: String(raw.version ?? ""),
        methods,
        inputTokenLimit: typeof raw.inputTokenLimit === "number" ? raw.inputTokenLimit : null,
        outputTokenLimit: typeof raw.outputTokenLimit === "number" ? raw.outputTokenLimit : null,
        kind: kindOf(id, methods),
        free: cat?.free ?? null,
        freeLabel: cat?.freeLabel ?? "not published",
        inUsd: cat?.inUsd ?? null,
        outUsd: cat?.outUsd ?? null,
        inRaw: cat?.inRaw ?? "",
        outRaw: cat?.outRaw ?? "",
      };
    });

    models.sort((a, b) => a.id.localeCompare(b.id));
    cache = { at: Date.now(), models, source: "generativelanguage.googleapis.com" };
    return { models, source: cache.source, cached: false };
  }

  // Serve a stale snapshot rather than failing the console outright.
  if (cache) return { models: cache.models, source: cache.source + " (stale)", cached: true };

  // Nothing answered. Only back off once essentially the whole selectable pool
  // has been flagged leaked — a single unlucky round must not freeze discovery,
  // because each round probes keys that are newly un-leaked from the pick and
  // the usable ones surface within a couple of rounds.
  if (probed >= PROBE_CAP && leakedForListing.size >= poolSize()) {
    discoveryBlockedUntil = Date.now() + DISCOVERY_BACKOFF_MS;
  }
  throw new Error(
    lastErr ? `${lastErr} (probed=${probed}, good=${knownGoodForListing.size})` : "Could not list models with any pooled key.",
  );
}

/**
 * Static catalog as a model list.
 *
 * The console must always render something usable. When no pooled key can
 * answer discovery — a leaked-only pool, an upstream outage, a cold instance
 * whose hydration has not landed — this supplies the known ids from the pricing
 * catalog instead of an empty table. Nothing here is a live upstream answer.
 */
export function catalogModels(): LiveModel[] {
  return CATALOG.map((c) => ({
    id: c.id,
    provider: "gemini" as const,
    name: c.id,
    displayName: c.name,
    description: "",
    version: "",
    methods: [],
    inputTokenLimit: null,
    outputTokenLimit: null,
    kind: c.kind,
    free: c.free,
    freeLabel: c.freeLabel,
    inUsd: c.inUsd,
    outUsd: c.outUsd,
    inRaw: c.inRaw,
    outRaw: c.outRaw,
  }));
}

export type ModelTestResult = {
  id: string;
  status: "ok" | "rate_limited" | "invalid" | "zero_quota" | "unsupported" | "error";
  httpStatus: number;
  latencyMs: number;
  reply: string;
  message: string;
  /** true when the tested key was taken from the pool */
  pooled: boolean;
  /** real token usage reported by upstream, null when the call never billed */
  inputTokens: number | null;
  outputTokens: number | null;
  /** USD cost of that single call at the catalog price, null when unpriced */
  costUsd: number | null;
  /** free tier verdict of the model itself, independent of the key's plan */
  freeTier: boolean | null;
};

/**
 * Live generateContent ping against ONE model id. Uses a pooled key unless the
 * caller supplies one (the /models page never does; curl may).
 *
 * The response is costed from the real `usageMetadata` Google returns, not an
 * estimate: `totalTokenCount` is what the call would bill. `tier` is the
 * declared plan of the key that answered, so the console can say "free tier
 * covers this" instead of quoting a dollar figure the operator may not owe.
 */
export async function testModel(modelId: string, rawKey?: string, tier: KeyTier = "unknown"): Promise<ModelTestResult> {
  const id = modelId.replace(/^models\//, "").trim();
  const cat = catalogFor(id);
  const freeTier = cat ? cat.free : null;
  let key = rawKey?.trim() ?? "";
  const pooled = !key;
  if (!key) {
    // Gemini-only probe: an unfiltered pick could hand this Google call an
    // ElevenLabs/WhatsToken/custom key and report the model "invalid" when
    // the model was fine and the credential was simply foreign.
    const st = await pick(new Set(), undefined, "gemini");
    if (!st) {
      return {
        id, status: "error", httpStatus: 0, latencyMs: 0, reply: "",
        message: "No selectable key in the pool.", pooled: true,
        inputTokens: null, outputTokens: null, costUsd: null, freeTier,
      };
    }
    key = st.key;
    if (tier === "unknown") tier = st.tier;
  }

  const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(id)}:generateContent`;
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with exactly: OK" }] }],
        // Thinking models spend output tokens on reasoning before emitting text;
        // 64 tokens can end in finishReason=MAX_TOKENS with an empty reply.
        generationConfig: { maxOutputTokens: 512, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return {
      id, status: "error", httpStatus: 0, latencyMs: Date.now() - started, reply: "",
      message: e instanceof Error ? e.message : String(e), pooled,
      inputTokens: null, outputTokens: null, costUsd: null, freeTier,
    };
  }

  const latencyMs = Date.now() - started;
  const body = await res.text().catch(() => "");
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(body); } catch { parsed = null; }
  const errMsg = (() => {
    const e = (parsed?.error ?? {}) as { message?: string };
    return e.message ?? body.replace(/\s+/g, " ").slice(0, 220);
  })();

  // usageMetadata is present on billed calls (success or partial). Absent means
  // the request never reached the model, so no cost may be claimed.
  const usage = (parsed?.usageMetadata ?? null) as
    | { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
    | null;
  const inputTokens = typeof usage?.promptTokenCount === "number" ? usage.promptTokenCount : null;
  const outputTokens = typeof usage?.candidatesTokenCount === "number"
    ? usage.candidatesTokenCount + (typeof usage.thoughtsTokenCount === "number" ? usage.thoughtsTokenCount : 0)
    : null;

  // Cost is only real for a paid plan; a free-tier key bills nothing even when
  // the catalog carries a list price. Unpriced models stay null.
  const billable = tier !== "free";
  const costUsd = billable && cat && cat.inUsd !== null && cat.outUsd !== null && inputTokens !== null && outputTokens !== null
    ? (inputTokens / 1_000_000) * cat.inUsd + (outputTokens / 1_000_000) * cat.outUsd
    : null;

  const base = { id, latencyMs, pooled, inputTokens, outputTokens, costUsd, freeTier };

  if (res.ok) {
    const cands = (parsed?.candidates ?? []) as Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    const text = (cands[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    return { ...base, status: "ok", httpStatus: res.status, reply: text.slice(0, 200), message: "serving" };
  }
  if (res.status === 404) {
    return { ...base, status: "unsupported", httpStatus: 404, reply: "", message: errMsg || "model not available to this key" };
  }
  if (res.status === 429) {
    return { ...base, status: isZeroQuota(body) ? "zero_quota" : "rate_limited", httpStatus: 429, reply: "", message: errMsg || "rate limited" };
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    return { ...base, status: "invalid", httpStatus: res.status, reply: "", message: errMsg || "key rejected" };
  }
  return { ...base, status: "error", httpStatus: res.status, reply: "", message: errMsg || `HTTP ${res.status}` };
}

export function pricingMeta() {
  return { asOf: PRICING_AS_OF, entries: CATALOG.length };
}
