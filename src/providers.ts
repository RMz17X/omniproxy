/**
 * Provider registry — the pluggable-provider core of OmniProxy.
 *
 * A provider is an upstream the gateway can serve traffic for: where its API
 * lives, which capabilities it offers (llm / tts / image / video /
 * embeddings), which wire dialect it speaks, and how to recognise its keys.
 *
 * Two kinds of entry live in one registry:
 *
 *   builtin  gemini, elevenlabs — shipped in code, never deleted,
 *            only toggled or given a model list by the operator.
 *   custom   added through the console (POST /pengatur/providers) or, without a
 *            database, held in process memory. An id, a base URL, a capability
 *            set and a key format are all an operator needs to plug a new
 *            OpenAI-compatible upstream in.
 *
 * The registry is the single place that answers three questions the rest of
 * the gateway used to hardcode:
 *
 *   1. which provider owns a model name        -> resolveModel()
 *   2. may this provider serve this route      -> capabilities
 *   3. which key format belongs to it          -> detectProvider()
 */

import { cfg } from "./config.ts";
import { dbEnabled, sql } from "./db.ts";
import { log } from "./log.ts";

/** What a provider can be asked to do. A gateway route requires exactly one. */
export type Capability = "llm" | "tts" | "image" | "video" | "embeddings";

export const CAPABILITIES: Capability[] = ["llm", "tts", "image", "video", "embeddings"];

export const CAPABILITY_LABEL: Record<Capability, string> = {
  llm: "LLM",
  tts: "TTS",
  image: "Image",
  video: "Video",
  embeddings: "Embeddings",
};

/**
 * The dialect a provider speaks on the wire.
 *
 *   openai      OpenAI-compatible: the request body crosses verbatim and the
 *               response is already in the client's shape (whatstoken and
 *               every custom gateway).
 *   gemini      Google Generative Language, v1beta native shapes.
 *   elevenlabs  ElevenLabs native TTS shapes.
 */
export type Wire = "openai" | "gemini" | "elevenlabs";

export type Provider = {
  id: string;
  label: string;
  /**
   * Absolute base URL, no trailing slash. Empty for the builtins whose base
   * is resolved per call (gemini reads GEMINI_BASE_URL so the test harness can
   * point it at a mock; elevenlabs is a constant).
   */
  baseUrl: string;
  capabilities: Capability[];
  wire: Wire;
  /**
   * Regex source (not a RegExp: it round-trips through the database) that
   * recognises this provider's key format. Undefined means "cannot auto-detect".
   * Detection order is longest-pattern-first; see detectProvider().
   */
  keyPattern?: string;
  /**
   * Model ids this provider serves, typed by the operator or imported from the
   * provider's own /v1/models. Consulted when a client names a bare model id
   * with no provider prefix, alongside the live catalog cache.
   */
  models: string[];
  builtin: boolean;
  enabled: boolean;
  note: string;
};

/* ---------- builtins ---------- */

/**
 * ElevenLabs issues exactly 51 characters: `sk_` plus 48 hex. A looser bound
 * accepted truncated keys harvested from repositories (`sk_` + 40 hex), which
 * then only failed on their first upstream probe — one wasted request per
 * malformed key, and a dead row in the pool.
 */
const ELEVENLABS_KEY_SOURCE = "^sk_[a-fA-F0-9]{48}$";

/**
 * Builtin entries. `baseUrl: ""` means "resolve dynamically" — see
 * baseUrlOf(). A former builtin, WhatsToken, is deliberately NOT here:
 * it is an ordinary OpenAI-compatible gateway, so operators add it through
 * the console like any other upstream and may delete it again.
 */
const BUILTIN: Provider[] = [
  {
    id: "gemini",
    label: "Gemini",
    baseUrl: "",
    capabilities: ["llm", "tts", "image", "embeddings"],
    wire: "gemini",
    /* Two live formats: the classic `AIza…` key and the newer `AQ.…` key AI
       Studio issues today (53 chars). Both answer generateContent; a pattern
       that only knew the first left 62 working keys undetectable. */
    keyPattern: "^(?:AIza[0-9A-Za-z_-]{20,}|AQ\\.[0-9A-Za-z_-]{20,})$",
    models: [],
    builtin: true,
    enabled: true,
    note: "Google Generative Language. Chat, TTS, image and embeddings.",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    baseUrl: "",
    capabilities: ["tts"],
    wire: "elevenlabs",
    keyPattern: ELEVENLABS_KEY_SOURCE,
    models: [],
    builtin: true,
    enabled: true,
    note: "Text to speech and voices, routed by model name on /v1/audio/speech.",
  },
];

/** The builtin registry, in display order. No database needed. */
export function builtinProviders(): Provider[] {
  return BUILTIN.map((p) => ({ ...p, capabilities: [...p.capabilities], models: [...p.models] }));
}

/** Resolve a provider's upstream base, no trailing slash. */
export function baseUrlOf(p: Provider): string {
  if (p.baseUrl) return p.baseUrl.replace(/\/+$/, "");
  if (p.id === "gemini") return cfg.upstream.replace(/\/+$/, "");
  if (p.id === "elevenlabs") return "https://api.elevenlabs.io";
  return "";
}

/** Env var that seeds a provider's keys at hydrate(): WHATSTOKEN_API_KEYS. */
export function envKeyVar(id: string): string {
  return `${id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEYS`;
}

/* ---------- storage ---------- */

type ProviderRow = {
  id: string;
  label: string;
  base_url: string;
  capabilities: unknown;
  wire: string | null;
  key_pattern: string | null;
  models: unknown;
  enabled: boolean;
  builtin: boolean;
  note: string | null;
};

const isCapability = (v: string): v is Capability => (CAPABILITIES as string[]).includes(v);
const isWire = (v: string): v is Wire => v === "openai" || v === "gemini" || v === "elevenlabs";

const toStringArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") {
    try {
      const parsed: unknown = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
    } catch {
      /* not JSON */
    }
  }
  return [];
};

const toProvider = (r: ProviderRow): Provider => ({
  id: r.id,
  label: r.label || r.id,
  baseUrl: r.base_url ?? "",
  capabilities: toStringArray(r.capabilities).filter(isCapability),
  wire: r.wire && isWire(r.wire) ? r.wire : "openai",
  keyPattern: typeof r.key_pattern === "string" && r.key_pattern ? r.key_pattern : undefined,
  models: toStringArray(r.models),
  builtin: Boolean(r.builtin),
  enabled: r.enabled !== false,
  note: r.note ?? "",
});

/**
 * Process-local registry. With DATABASE_URL set it is a short-lived cache over
 * the `providers` table (writes invalidate); without one it IS the store, so a
 * custom provider lives until the next cold start — the same trade the pool
 * makes for key material.
 */
let registry: Provider[] = builtinProviders();
let registryLoadedAt = 0;
const REGISTRY_TTL_MS = 15_000;

/**
 * Runtime-registered custom providers. With DATABASE_URL set the `providers`
 * table is the source of truth and this map only backs a failed reload; without
 * one it IS the store — otherwise a provider added through the console would
 * silently vanish from routing 15 seconds later when the cache reloads.
 */
const customStore = new Map<string, Provider>();

/** Merge durable rows over the builtins. Never throws. */
async function loadRegistry(): Promise<Provider[]> {
  const builtin = builtinProviders();
  const byId = new Map(builtin.map((p) => [p.id, p]));
  if (!dbEnabled()) {
    for (const [id, p] of customStore) byId.set(id, p);
    return [...byId.values()];
  }
  const res = await sql<ProviderRow>(
    `select id, label, base_url, capabilities, wire, key_pattern, models, enabled, builtin, note
       from providers
      order by builtin desc, id`,
  );
  if (!res.ok) {
    for (const [id, p] of customStore) byId.set(id, p);
    return [...byId.values()];
  }
  for (const row of res.rows) {
    const p = toProvider(row);
    const hit = byId.get(p.id);
    if (hit) {
      // A builtin row only carries operator state: enabled flag and the
      // model list. Label, base URL and capabilities stay code-owned so a
      // stale row can never redefine a builtin's dialect.
      hit.enabled = p.enabled;
      hit.models = p.models;
      continue;
    }
    byId.set(p.id, p);
  }
  return [...byId.values()];
}

/** Every provider: builtins plus customs. Cached briefly, invalidated on write. */
export async function allProviders(force = false): Promise<Provider[]> {
  const fresh = Date.now() - registryLoadedAt < REGISTRY_TTL_MS;
  if (!force && fresh) return registry;
  try {
    registry = await loadRegistry();
    registryLoadedAt = Date.now();
  } catch (err) {
    log("warn", "providers.load_failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return registry;
}

/** One provider by id, or null. */
export async function getProvider(id: string): Promise<Provider | null> {
  return (await allProviders()).find((p) => p.id === id) ?? null;
}

/** Enabled providers that carry a capability, in registry order. */
export async function providersWith(cap: Capability): Promise<Provider[]> {
  return (await allProviders()).filter((p) => p.enabled && p.capabilities.includes(cap));
}

/* ---------- validation ---------- */

const ID_RE = /^[a-z][a-z0-9-]{1,40}$/;

export type ProviderInput = {
  id: string;
  label: string;
  baseUrl: string;
  capabilities: Capability[];
  keyPattern?: string;
  models?: string[];
  note?: string;
};

/** Why an input was rejected, as an operator-readable sentence. */
function validateInput(input: ProviderInput): string | null {
  const id = (input.id ?? "").trim();
  if (!ID_RE.test(id)) {
    return "`id` must be 2-41 chars: lowercase letters, digits and dashes, starting with a letter.";
  }
  if (!(input.label ?? "").trim()) return "`label` is required.";
  const base = (input.baseUrl ?? "").trim();
  if (!/^https?:\/\/[^\s]+$/.test(base)) return "`baseUrl` must be an http(s) URL.";
  const caps = input.capabilities ?? [];
  if (!Array.isArray(caps) || caps.length === 0) return "Pick at least one capability.";
  if (!caps.every(isCapability)) return `Unknown capability. Valid: ${CAPABILITIES.join(", ")}.`;
  if (input.keyPattern) {
    try {
      new RegExp(input.keyPattern);
    } catch {
      return "`keyPattern` is not a valid regular expression.";
    }
  }
  return null;
}

/* ---------- CRUD ---------- */

/**
 * Register a custom provider. Builtin ids are rejected: their dialect is
 * code-owned and redefining one through the API would desynchronise the
 * registry from the adapters that serve it.
 */
export async function registerProvider(input: ProviderInput): Promise<Provider> {
  const problem = validateInput(input);
  if (problem) throw new Error(problem);
  const id = input.id.trim();
  if (builtinProviders().some((p) => p.id === id)) {
    throw new Error(`\`${id}\` is a builtin provider and cannot be redefined.`);
  }
  const provider: Provider = {
    id,
    label: input.label.trim(),
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    capabilities: [...new Set(input.capabilities)],
    wire: "openai",
    keyPattern: input.keyPattern?.trim() || undefined,
    models: [...new Set((input.models ?? []).map((m) => m.trim()).filter(Boolean))],
    builtin: false,
    enabled: true,
    note: (input.note ?? "").trim(),
  };
  if (dbEnabled()) {
    const res = await sql(
      `insert into providers (id, label, base_url, capabilities, wire, key_pattern, models, enabled, builtin, note)
       values ($1, $2, $3, $4::text[], $5, $6, $7::text[], true, false, $8)
       on conflict (id) do update
          set label = excluded.label,
              base_url = excluded.base_url,
              capabilities = excluded.capabilities,
              wire = excluded.wire,
              key_pattern = excluded.key_pattern,
              models = excluded.models,
              note = excluded.note`,
      [
        provider.id,
        provider.label,
        provider.baseUrl,
        provider.capabilities,
        provider.wire,
        provider.keyPattern ?? null,
        provider.models,
        provider.note,
      ],
    );
    if (!res.ok) throw new Error(res.message || "Could not persist the provider.");
  }
  registry = [...registry.filter((p) => p.id !== id), provider];
  customStore.set(id, provider);
  registryLoadedAt = Date.now();
  log("info", "providers.registered", { id: provider.id, capabilities: provider.capabilities });
  return provider;
}

/**
 * Update a provider. Custom entries accept every field; builtins accept only
 * the operator-owned ones (enabled flag, model list) — the rest stays
 * code-owned so a console edit cannot break the dialect.
 */
export async function updateProvider(
  id: string,
  patch: {
    label?: string;
    baseUrl?: string;
    capabilities?: Capability[];
    keyPattern?: string | null;
    models?: string[];
    note?: string;
    enabled?: boolean;
  },
): Promise<Provider | null> {
  const current = (await allProviders()).find((p) => p.id === id);
  if (!current) return null;
  const next: Provider = { ...current, capabilities: [...current.capabilities], models: [...current.models] };
  if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled);
  if (patch.models !== undefined) {
    next.models = [...new Set(patch.models.map((m) => m.trim()).filter(Boolean))];
  }
  if (!current.builtin) {
    if (patch.label !== undefined && patch.label.trim()) next.label = patch.label.trim();
    if (patch.baseUrl !== undefined) {
      if (!/^https?:\/\/[^\s]+$/.test(patch.baseUrl.trim())) {
        throw new Error("`baseUrl` must be an http(s) URL.");
      }
      next.baseUrl = patch.baseUrl.trim().replace(/\/+$/, "");
    }
    if (patch.capabilities !== undefined) {
      if (!patch.capabilities.length || !patch.capabilities.every(isCapability)) {
        throw new Error(`Pick at least one valid capability (${CAPABILITIES.join(", ")}).`);
      }
      next.capabilities = [...new Set(patch.capabilities)];
    }
    if (patch.keyPattern !== undefined) {
      const src = (patch.keyPattern ?? "").trim();
      if (src) {
        try {
          new RegExp(src);
        } catch {
          throw new Error("`keyPattern` is not a valid regular expression.");
        }
      }
      next.keyPattern = src || undefined;
    }
    if (patch.note !== undefined) next.note = patch.note.trim();
  }
  if (dbEnabled()) {
    const res = await sql(
      `update providers
          set label = $2, base_url = $3, capabilities = $4::text[], wire = $5,
              key_pattern = $6, models = $7::text[], enabled = $8, builtin = $9, note = $10
        where id = $1`,
      [
        next.id,
        next.label,
        next.baseUrl,
        next.capabilities,
        next.wire,
        next.keyPattern ?? null,
        next.models,
        next.enabled,
        next.builtin,
        next.note,
      ],
    );
    if (!res.ok) throw new Error(res.message || "Could not update the provider.");
  }
  registry = registry.map((p) => (p.id === id ? next : p));
  if (!next.builtin) customStore.set(id, next);
  registryLoadedAt = Date.now();
  log("info", "providers.updated", { id, enabled: next.enabled, models: next.models.length });
  return next;
}

/**
 * Remove a custom provider. Refused while pooled keys still point at it: the
 * keys would dangle with no adapter to serve them.
 */
export async function removeProvider(id: string): Promise<{ ok: boolean; error?: string }> {
  const current = (await allProviders()).find((p) => p.id === id);
  if (!current) return { ok: false, error: "No provider with that id." };
  if (current.builtin) return { ok: false, error: "Builtin providers cannot be removed." };
  // Counted through the pool, not the keys table: in memory mode there is no
  // table, and the dangling-key hazard is identical either way.
  const { listKeys } = await import("./pool.ts");
  const attached = (await listKeys(id)).length;
  if (attached > 0) {
    return { ok: false, error: `${attached} pooled key(s) still belong to this provider. Remove them first.` };
  }
  if (dbEnabled()) {
    const res = await sql(`delete from providers where id = $1`, [id]);
    if (!res.ok) return { ok: false, error: res.message || "Delete failed." };
  }
  registry = registry.filter((p) => p.id !== id);
  customStore.delete(id);
  registryLoadedAt = Date.now();
  log("info", "providers.removed", { id });
  return { ok: true };
}

/* ---------- key recognition ---------- */

/**
 * Which provider a raw key belongs to, by format. Longest/most-specific
 * pattern first: `sk_<hex>` is ElevenLabs while `sk-<…>` is the OpenAI-style
 * gateways, so the shared `sk` prefix must not decide.
 */
export function detectProvider(key: string, providers: Provider[]): string | null {
  const k = (key ?? "").trim();
  if (!k) return null;
  const ranked = providers
    .filter((p) => p.keyPattern)
    .map((p) => ({ p, re: new RegExp(p.keyPattern as string) }))
    .sort((a, b) => (b.p.keyPattern as string).length - (a.p.keyPattern as string).length);
  for (const { p, re } of ranked) {
    if (re.test(k)) return p.id;
  }
  return null;
}

/**
 * Why `key` cannot belong to `provider`, or null when its shape fits.
 *
 * The ingest endpoint admits keys before any upstream probe, so a malformed
 * credential used to become a pool row and only died on its first request —
 * the sender saw `added: 1`, the pool gained a key that never worked. Providers
 * without a pattern (operator-defined gateways) are never judged here: their
 * format is not ours to know.
 */
export function keyShapeError(key: string, provider: Provider): string | null {
  if (!provider.keyPattern) return null;
  const k = (key ?? "").trim();
  if (!k) return "is empty";
  try {
    if (new RegExp(provider.keyPattern).test(k)) return null;
  } catch {
    // A pattern the registry cannot compile must not block ingest.
    return null;
  }
  return `does not match the \`${provider.id}\` key format`;
}

/* ---------- model routing ---------- */

/**
 * Model names that belong to ElevenLabs rather than any other provider. An
 * OpenAI-compatible client names the model it wants, so the model is the only
 * honest signal for which provider should serve the request.
 */
export const ELEVENLABS_MODEL_RE = /^(eleven[_-]|elevenlabs|tts-1|eleven_)/i;

export type ModelRoute = {
  provider: string;
  /** the model name with any `provider/` prefix stripped */
  model: string;
  /** true when the client named the provider explicitly */
  explicit: boolean;
};

/**
 * Live model-id cache per provider, warmed by refreshCatalog(). Consulted
 * synchronously by resolveModel so a bare id (`deepseek-v4.1-flash-1017`)
 * routes to the provider whose catalog actually lists it.
 */
const catalogCache = new Map<string, { at: number; ids: Set<string> }>();
const CATALOG_TTL_MS = 600_000;

/** Fetch an OpenAI-wire provider's /v1/models and cache the ids. */
export async function refreshCatalog(provider: Provider, rawKey?: string): Promise<string[]> {
  if (provider.wire !== "openai") return [];
  const base = baseUrlOf(provider);
  if (!base) return [];
  let key = rawKey ?? "";
  if (!key) {
    const { pick, rawKeyById } = await import("./pool.ts");
    const st = await pick(new Set(), undefined, provider.id);
    if (!st) return [];
    key = (await rawKeyById(st.key)) || st.key;
  }
  try {
    const res = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (payload.data ?? [])
      .map((m) => String(m.id ?? "").trim())
      .filter(Boolean);
    catalogCache.set(provider.id, { at: Date.now(), ids: new Set(ids) });
    return ids;
  } catch {
    return [];
  }
}

/** Model ids a provider is known to serve: declared list plus live catalog. */
function knownModels(p: Provider): Set<string> {
  const set = new Set(p.models);
  const live = catalogCache.get(p.id);
  if (live && Date.now() - live.at < CATALOG_TTL_MS) {
    for (const id of live.ids) set.add(id);
  }
  return set;
}

/**
 * Which provider serves a model name, synchronously over the current
 * registry + catalog cache. Order:
 *
 *   1. `provider/model` prefix      — explicit, always wins
 *   2. ElevenLabs model regex       — the TTS pool's naming convention
 *   3. `gemini*` prefix             — Google's own naming
 *   4. a provider that lists the id — declared models, then live catalog
 *   5. gemini                       — the historical default
 */
export function resolveModel(model: string, providers: Provider[]): ModelRoute {
  const raw = (model ?? "").trim();
  const slash = raw.indexOf("/");
  if (slash > 0) {
    const head = raw.slice(0, slash);
    // An explicit prefix names its provider even when that provider is
    // disabled: falling through to another provider silently served a
    // request the operator explicitly routed elsewhere. The caller
    // (app.resolveRoute) already errors on a disabled provider, so
    // returning it here turns the misroute into that error.
    const hit = providers.find((p) => p.id === head);
    if (hit) return { provider: hit.id, model: raw.slice(slash + 1), explicit: true };
  }
  if (ELEVENLABS_MODEL_RE.test(raw)) return { provider: "elevenlabs", model: raw, explicit: false };
  if (/^gemini/i.test(raw)) return { provider: "gemini", model: raw, explicit: false };
  for (const p of providers) {
    if (!p.enabled || p.id === "gemini") continue;
    if (knownModels(p).has(raw)) return { provider: p.id, model: raw, explicit: false };
  }
  return { provider: "gemini", model: raw, explicit: false };
}

/**
 * Warm the catalog cache for every enabled OpenAI-wire provider that has at
 * least one pooled key, then resolve. Called by the serving routes when the
 * model name carries no provider signal: one cached fetch per provider per
 * 10 minutes keeps a bare id routable without the operator importing models
 * by hand.
 */
export async function resolveModelRoute(model: string): Promise<ModelRoute> {
  const providers = await allProviders();
  const direct = resolveModel(model, providers);
  const needsLookup =
    !direct.explicit &&
    direct.provider === "gemini" &&
    !/^gemini/i.test(model ?? "") &&
    !ELEVENLABS_MODEL_RE.test(model ?? "");
  if (needsLookup) {
    await Promise.all(
      providers
        .filter((p) => p.enabled && p.wire === "openai" && p.id !== "gemini")
        .map((p) => refreshCatalog(p)),
    );
    return resolveModel(model, providers);
  }
  return direct;
}

/** Console projection: registry rows plus how many keys each one holds. */
export type ProviderView = Provider & { keys: number; ready: number };

export async function providerViews(): Promise<ProviderView[]> {
  const providers = await allProviders();
  let counts = new Map<string, { keys: number; ready: number }>();
  try {
    const { listKeys } = await import("./pool.ts");
    for (const k of await listKeys()) {
      const acc = counts.get(k.provider) ?? { keys: 0, ready: 0 };
      acc.keys++;
      if (k.status === "ready") acc.ready++;
      counts.set(k.provider, acc);
    }
  } catch {
    /* pool unavailable: counts stay zero */
  }
  return providers.map((p) => ({ ...p, ...counts.get(p.id) ?? { keys: 0, ready: 0 } }));
}
