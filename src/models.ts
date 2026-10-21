/**
 * Live model discovery + pricing merge for the /models console.
 *
 * The model LIST is real: one GET against the Generative Language API using a
 * key from the live pool, cached for a few minutes. Pricing and free-tier
 * availability are joined from the static catalog (Google exposes no API for
 * commercial metadata).
 */

import { cfg } from "./config.ts";
import { pick, rawKeyById, type KeyTier } from "./pool.ts";
import { CATALOG, PRICING_AS_OF, catalogFor, type CatalogEntry, type ModelKind } from "./models-catalog.ts";
import { isZeroQuota } from "./upstream.ts";
import { log } from "./log.ts";

const CACHE_MS = Number(process.env.MODELS_CACHE_MS ?? 300_000);
const TIMEOUT_MS = Number(process.env.MODELS_TIMEOUT_MS ?? 10_000);

export type LiveModel = {
  /** bare id, no models/ prefix */
  id: string;
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

/** A key that can answer model discovery: any non-invalid key will do. */
async function candidateKeys(limit = 6): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < limit; i++) {
    const st = await pick(seen);
    if (!st) break;
    seen.add(st.key);
    out.push(st.key);
  }
  return out;
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

  const keys = await candidateKeys();
  if (!keys.length) {
    const err = new Error("Pool has no selectable key, cannot query the model list.");
    (err as Error & { code?: string }).code = "empty_pool";
    throw err;
  }

  let lastErr = "";
  for (const key of keys) {
    let res: Response;
    try {
      res = await fetchWithKey(key);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      continue;
    }
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      lastErr = `HTTP ${res.status}: ${upstreamMessage(body, res.status)}`;
      log("warn", "models.list_key_failed", { status: res.status, zeroQuota: isZeroQuota(body) });
      continue;
    }

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
  throw new Error(lastErr || "Could not list models with any pooled key.");
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
    const st = await pick();
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
