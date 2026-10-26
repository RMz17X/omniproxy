/**
 * omniproxy — Hono gateway for a pool of Gemini API keys.
 *
 * Routes
 *   GET  /                      health + pool snapshot
 *   ANY  /v1beta/models/*       native Gemini passthrough
 *   POST /v1/chat/completions   OpenAI-compatible chat (stream + tools/search)
 *   POST /v1/audio/speech       OpenAI-compatible TTS -> WAV
 *   GET  /v1/models             OpenAI-compatible model list
 *   GET  /pengatur/keys            list pooled keys (masked)
 *   POST /pengatur/keys            add keys  { keys: ["AIza..."] }
 *   DELETE /pengatur/keys          remove key { key: "AIza..." }
 */

import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { cfg } from "./config.ts";
import { addKey, backfillMaterial, dropLocal, KEY_TIERS, keyId, keyMaterialDurable, listKeys, mark429, markHealthy, markInvalid, markQuotaExhausted, markSoftError, markUnverified, markValidatedPlan, pick, rawKeyById, removeKey, removeKeyById, forgetDead, setTierById, snapshot, tierCounts, hydrate, type KeyTier, type KeyView } from "./pool.ts";
import { ADMIN_HTML } from "./admin-ui.ts";
import { buildFaviconIco, FAVICON_SVG } from "./favicon.ts";
import { MODELS_HTML } from "./models-ui.ts";
import { catalogModels, discoveryDebug, listLiveModels, pricingMeta, testModel } from "./models.ts";
import { probeKey, probeTier, type ProbeResult } from "./probe.ts";
import { deflateSync } from "node:zlib";
import { geminiPassthrough, speech } from "./gemini.ts";
import { listElevenLabsInventory, serveElevenLabs } from "./tts.ts";
import { chatCompletions, embeddings, geminiModelRows } from "./openai.ts";
import { openaiModelList, openaiWire } from "./passthrough.ts";
import {
  allProviders,
  CAPABILITIES,
  CAPABILITY_LABEL,
  detectProvider,
  getProvider,
  keyShapeError,
  providerViews,
  providersWith,
  registerProvider,
  removeProvider,
  resolveModelRoute,
  updateProvider,
  type Capability,
  type Provider,
} from "./providers.ts";
import {
  beginUsage,
  commitUsage,
  flush as flushLedger,
  routeOf,
  toCsv,
  usageOverview,
  allRows,
  ledgerKeyId,
  type RowFilter,
} from "./ledger.ts";
import { defaultDay, pruneOlderThan, rollupDay } from "./rollup.ts";
import { actorFrom, list as listAudit, recordNow as auditRecordNow } from "./audit.ts";
import { log } from "./log.ts";
import { STATS_HTML } from "./stats-ui.ts";
import { isStatsRange, statsSnapshot } from "./stats.ts";
import { USAGE_HTML } from "./usage-ui.ts";
import { KEYS_HTML, KEY_DETAIL_HTML } from "./keys-ui.ts";
import { PROVIDERS_HTML } from "./providers-ui.ts";
import { loadKeys, purgedIds, purgeDead, restoreKeys } from "./keys-repo.ts";
import { SETTINGS_HTML } from "./settings-ui.ts";
import { settingsView } from "./settings.ts";
import { AUDIT_HTML } from "./audit-ui.ts";
import { LOGIN_HTML } from "./ui.ts";
import { breakerOpen, dbEnabled, sql } from "./db.ts";

const app = new Hono();

app.use("*", cors());

/* ---------- usage ledger ---------- */

/**
 * One row per gateway request. The collector lives on the Request object; the
 * row is committed after the handler returns, and the batch is flushed off the
 * response path so no client ever waits on Postgres.
 */
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const route = routeOf(path);
  if (!route) return next();

  beginUsage(c.req.raw, path, route);
  await next();
  commitUsage(c.req.raw, c.res.status);
  // The flush is detached: `void` keeps it off the critical path, and
  // `waitUntil` (when the platform provides it) keeps the instance alive
  // long enough for the batch to land. Reading `executionCtx` THROWS on a
  // runtime that has none (plain Bun, `app.fetch` in tests), so it is probed.
  const flushed = flushLedger().catch(() => {});
  try {
    c.executionCtx.waitUntil(flushed);
  } catch {
    // No platform context: the detached promise is all we get.
  }
});

/* ---------- auth ---------- */

const bearer = (h: string | undefined): string => {
  if (!h) return "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : h.trim();
};

/**
 * Client-token gate, shared by every public upstream surface. It used to be
 * registered only on `/v1/*`, which left the native Gemini passthrough
 * (`/v1beta/models/*`) ungated even when CLIENT_TOKEN was set: the two
 * prefixes are different Hono segments, so one middleware never covered the
 * other. Both prefixes are gated here, with identical semantics — unset
 * token means open, exactly like `/v1/*` before.
 */
const clientGate = async (c: Context, next: Next) => {
  if (!cfg.clientToken) return next();
  const presented = bearer(c.req.header("authorization")) || c.req.header("x-api-key") || "";
  if (presented !== cfg.clientToken) {
    return c.json({ error: { type: "auth_error", message: "Invalid API key." } }, 401);
  }
  return next();
};

app.use("/v1/*", clientGate);
app.use("/v1beta/*", clientGate);

/** Shells carry no data; their client scripts fetch `/data` with the token. */
const SHELL_PATHS = [
  "/pengatur",
  "/pengatur/login",
  "/pengatur/models",
  "/pengatur/usage", // redirects to /pengatur/logs; kept public so the redirect works pre-auth
  "/pengatur/stats",
  "/pengatur/keys",
  "/pengatur/providers",
  "/pengatur/settings",
  "/pengatur/audit",
  "/pengatur/logs",
];

/** The key detail shell. `/data` carries a suffix and so stays gated. */
const KEY_PAGE = /^\/pengatur\/keys\/[0-9a-f]{12}$/;

/* ---------- admin rate limit ---------- */

/**
 * Per-instance token bucket for the admin surface.
 *
 * The console polls a few endpoints on a timer and an operator may hold several
 * tabs open, so reads get a generous budget; mutations are the ones worth
 * bounding (purge-dead, delete, test-all all cost real work). The counter lives
 * in process memory: a serverless fleet multiplies the effective limit by the
 * instance count, which is the right trade for a console — the point is to stop
 * a runaway loop or a brute-force attempt, not to meter an operator.
 */
const ADMIN_RATE_READS = Math.max(10, Number(process.env.ADMIN_RATE_READS_PER_MIN ?? 300));
const ADMIN_RATE_WRITES = Math.max(5, Number(process.env.ADMIN_RATE_WRITES_PER_MIN ?? 60));
const adminHits = new Map<string, number[]>();

function adminRetryAfter(ip: string, kind: "read" | "write"): number {
  const limit = kind === "read" ? ADMIN_RATE_READS : ADMIN_RATE_WRITES;
  const key = `${ip}:${kind}`;
  const now = Date.now();
  const hits = (adminHits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= limit) {
    adminHits.set(key, hits);
    return Math.max(1, Math.ceil((60_000 - (now - hits[0]!)) / 1000));
  }
  hits.push(now);
  adminHits.set(key, hits);
  if (adminHits.size > 4096) {
    for (const [k, v] of adminHits) if (v.every((t) => now - t >= 60_000)) adminHits.delete(k);
  }
  return 0;
}

app.use("/pengatur/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  const kind = method === "GET" || method === "HEAD" || method === "OPTIONS" ? "read" : "write";
  const forwarded = c.req.header("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";
  const retry = adminRetryAfter(ip, kind);
  if (retry > 0) {
    c.header("Retry-After", String(retry));
    return c.json({ error: { message: `Too many requests. Retry in ${retry}s.` } }, 429);
  }
  return next();
});

app.use("/pengatur/*", async (c, next) => {
  // The console shells carry no data and must load before a token exists.
  // Only read verbs are public: a POST/DELETE to a shell path is a mutating
  // admin call and must present the token.
  const adminPath = new URL(c.req.url).pathname;
  const method = c.req.method.toUpperCase();
  const readOnly = method === "GET" || method === "HEAD" || method === "OPTIONS";
  if (readOnly && (SHELL_PATHS.includes(adminPath) || KEY_PAGE.test(adminPath))) return next();
  if (!cfg.adminToken) {
    return c.json({ error: { message: "Admin disabled: ADMIN_TOKEN is not set." } }, 403);
  }
  const presented = bearer(c.req.header("authorization")) || c.req.header("x-admin-token") || "";
  /* A scoped token that may only add keys. The ingest path is the one a
     long-running scraper holds, so leaking it must not hand over DELETE or
     purge-dead. Unset by default: behaviour is unchanged until configured. */
  if (
    presented &&
    cfg.ingestToken &&
    presented === cfg.ingestToken &&
    method === "POST" &&
    adminPath === "/pengatur/keys"
  ) {
    return next();
  }
  if (presented !== cfg.adminToken) {
    return c.json({ error: { message: "Unauthorized." } }, 401);
  }
  return next();
});

/* ---------- health ---------- */

/**
 * Anonymous liveness only. The pool snapshot, the storage backend and the
 * configured defaults describe the whole key inventory, so an unauthenticated
 * caller gets one boolean and nothing else; the full view lives behind the
 * admin token at `/pengatur/status`.
 */
async function liveness(): Promise<{ ok: boolean; status: 200 | 503 }> {
  const snap = await snapshot();
  return snap.ready > 0 ? { ok: true, status: 200 } : { ok: false, status: 503 };
}

app.get("/", async (c) => {
  const { ok, status } = await liveness();
  return c.json({ ok, service: "omniproxy" }, status);
});

app.get("/health", async (c) => {
  const { ok, status } = await liveness();
  return c.json({ ok }, status);
});

/**
 * The full operator view of the router: the pool snapshot, the storage
 * backend and the configured defaults. Admin-gated, because it describes the
 * whole key inventory and the anonymous liveness routes deliberately do not.
 */
app.get("/pengatur/status", async (c) => {
  const snap = await snapshot();
  const rows = await loadKeys();
  /* Operational view: the pool tells you what can serve, this tells you whether
     the durable half is reachable and when a key was last judged. Without it
     "pool went up on its own" is only visible by reading container logs. */
  const lastCheckedAt = rows.reduce((m, k) => Math.max(m, k.lastCheckedAt || 0), 0);
  return c.json({
    ok: true,
    service: "omniproxy",
    storage: snap.storage,
    db: { enabled: dbEnabled(), breakerOpen: breakerOpen() },
    material: { durable: keyMaterialDurable() },
    identities: { rows: rows.length, lastCheckedAt: lastCheckedAt || null },
    uptimeSeconds: Math.round(process.uptime()),
    pool: snap,
    defaults: {
      model: cfg.defaultModel,
      tts: cfg.defaultTtsModel,
      embed: cfg.defaultEmbedModel,
      voice: cfg.defaultVoice,
      search: cfg.searchModel,
      modelFallback: cfg.modelFallback,
      probeModels: cfg.probeModels,
      retiredModels: cfg.retiredModels,
    },
  });
});

/* ---------- OpenAI-compatible ---------- */

/** Peek the OpenAI-compatible body without consuming the downstream handler's stream. */
async function peekModel(req: Request): Promise<string> {
  try {
    const parsed = JSON.parse(await req.clone().text()) as { model?: unknown };
    return typeof parsed.model === "string" ? parsed.model : "";
  } catch {
    return "";
  }
}

type RoutePick =
  | { ok: true; provider: Provider; model: string }
  | { ok: false; status: 400 | 409 | 503; message: string };

/**
 * Resolve a model name to the provider that serves it and check that the
 * provider is allowed to serve this route.
 *
 * Capability gating lives here, once, instead of per handler: a provider
 * declared as tts-only is refused on /v1/chat/completions with an answer that
 * names the providers that DO speak the route, so the client can retry with a
 * model from the right pool.
 */
async function resolveRoute(model: string, cap: Capability): Promise<RoutePick> {
  const route = await resolveModelRoute(model);
  const provider = await getProvider(route.provider);
  const withCap = (await providersWith(cap)).map((p) => p.id);
  if (!provider) {
    return {
      ok: false,
      status: 400,
      message:
        `Unknown provider \`${route.provider}\`.` +
        (withCap.length ? ` Providers that serve ${cap}: ${withCap.join(", ")}.` : ""),
    };
  }
  if (!provider.enabled) {
    return { ok: false, status: 400, message: `Provider \`${provider.id}\` is disabled.` };
  }
  if (!provider.capabilities.includes(cap)) {
    return {
      ok: false,
      status: 400,
      message:
        `Provider \`${provider.id}\` does not support ${cap}.` +
        (withCap.length ? ` Providers that do: ${withCap.join(", ")}.` : ""),
    };
  }
  return { ok: true, provider, model: route.model };
}

/** 503 when the resolved provider's pool holds no selectable key. */
async function poolReady(provider: Provider): Promise<boolean> {
  return Boolean(await pick(new Set(), undefined, provider.id));
}

app.post("/v1/chat/completions", async (c) => {
  const resolved = await resolveRoute(await peekModel(c.req.raw), "llm");
  if (!resolved.ok) return c.json({ error: { message: resolved.message } }, resolved.status);
  // Provider-filtered: a leaked or foreign credential must never be handed to
  // a route the provider does not own.
  if (!(await poolReady(resolved.provider))) {
    return c.json(
      { error: { message: `No available ${resolved.provider.label} API keys in pool.` } },
      503,
    );
  }
  if (resolved.provider.wire === "openai") {
    return openaiWire(c.req.raw, resolved.provider, "chat", resolved.model, c.req.raw.signal);
  }
  // Pass the resolved model through: the handler must not re-derive it from
  // the raw body (that turned `gemini/foo` into an invalid upstream URL and
  // silently replaced non-Gemini models with the default).
  return chatCompletions(c.req.raw, resolved.model);
});

app.post("/v1/audio/speech", async (c) => {
  const resolved = await resolveRoute(await peekModel(c.req.raw), "tts");
  if (!resolved.ok) return c.json({ error: { message: resolved.message } }, resolved.status);
  if (!(await poolReady(resolved.provider))) {
    return c.json(
      { error: { message: `No available ${resolved.provider.label} API keys in pool.` } },
      503,
    );
  }
  if (resolved.provider.wire === "openai") {
    return openaiWire(c.req.raw, resolved.provider, "audio", resolved.model, c.req.raw.signal);
  }
  if (resolved.provider.wire === "elevenlabs") {
    const st = await pick(new Set(), undefined, "elevenlabs");
    return serveElevenLabs(c.req.raw, st?.key);
  }
  return speech(c.req.raw, resolved.model);
});

app.post("/v1/embeddings", async (c) => {
  const resolved = await resolveRoute(await peekModel(c.req.raw), "embeddings");
  if (!resolved.ok) return c.json({ error: { message: resolved.message } }, resolved.status);
  if (!(await poolReady(resolved.provider))) {
    return c.json(
      { error: { message: `No available ${resolved.provider.label} API keys in pool.` } },
      503,
    );
  }
  if (resolved.provider.wire === "openai") {
    return openaiWire(c.req.raw, resolved.provider, "embeddings", resolved.model, c.req.raw.signal);
  }
  return embeddings(c.req.raw, resolved.model);
});

/**
 * OpenAI-compatible image generation. Only OpenAI-wire providers serve it:
 * Google's image models are reached through /v1/chat/completions, and the
 * capability gate above already refused a provider without `image`.
 */
app.post("/v1/images/generations", async (c) => {
  const resolved = await resolveRoute(await peekModel(c.req.raw), "image");
  if (!resolved.ok) return c.json({ error: { message: resolved.message } }, resolved.status);
  if (resolved.provider.wire !== "openai") {
    return c.json(
      {
        error: {
          message: `Provider \`${resolved.provider.id}\` serves image models through POST /v1/chat/completions, not /v1/images/generations.`,
        },
      },
      400,
    );
  }
  if (!(await poolReady(resolved.provider))) {
    return c.json(
      { error: { message: `No available ${resolved.provider.label} API keys in pool.` } },
      503,
    );
  }
  return openaiWire(c.req.raw, resolved.provider, "images", resolved.model, c.req.raw.signal);
});

/**
 * Union model list: every provider that holds a key contributes its own
 * catalog, each row owned by the provider that serves it. A client picks a
 * model by bare id and the router resolves the pool — or names the provider
 * explicitly as `provider/model`.
 */
app.get("/v1/models", async (c) => {
  const rows: Record<string, unknown>[] = [];
  const census: Record<string, number> = {};

  try {
    const gemini = await geminiModelRows();
    rows.push(...gemini.rows);
    census.gemini = gemini.rows.length;
  } catch {
    census.gemini = 0;
  }

  for (const provider of await allProviders()) {
    if (!provider.enabled || provider.wire !== "openai") continue;
    const st = await pick(new Set(), undefined, provider.id);
    if (!st) {
      census[provider.id] = 0;
      continue;
    }
    const raw = (await rawKeyById(st.key)) || st.key;
    const live = await openaiModelList(provider, raw);
    // A curated model list narrows the public catalog: whatstoken fronts
    // DeepSeek only, so its other hundred upstream models are not advertised
    // as servable. No list means the whole upstream catalog is the offering.
    const declared = provider.models;
    const list = declared.length
      ? live.length
        ? live.filter((m) => declared.includes(m.id))
        : declared.map((id) => ({ id, ownedBy: provider.id }))
      : live;
    census[provider.id] = list.length;
    rows.push(
      ...list.map((m) => ({
        // Prefixed so every row routes deterministically: two gateways can
        // both list `gpt-4o-mini`, and a bare id would resolve by registry
        // order instead of by the row the client actually picked.
        id: `${provider.id}/${m.id}`,
        object: "model",
        created: 1700000000,
        owned_by: provider.id,
        upstream_owned_by: m.ownedBy,
      })),
    );
  }

  if (rows.length === 0) {
    return c.json({ error: { message: "No provider can list models right now." } }, 503);
  }
  return c.json({ object: "list", data: rows, omniproxy: { providers: census } });
});

/* ---------- native Gemini passthrough ---------- */

app.all("/v1beta/models/*", (c) => geminiPassthrough(c.req.raw, new URL(c.req.url).pathname));

/* ---------- admin ---------- */

/* ---------- legacy paths ---------- */
// Deliberately absent: /admin and /models used to 308-redirect to the console
// paths. A redirect tells an unauthenticated stranger exactly where the console
// lives, so both prefixes now fall through to the normal 404.

/* ---------- favicon ---------- */

// The consoles are reached without a build step, so the icon is generated once
// per process instead of shipping binaries in the repo. `cache-control` is long
// and immutable: the bytes only change when the accent colour does.
let icoCache: Uint8Array | null = null;

app.get("/favicon.svg", (c) => {
  c.header("content-type", "image/svg+xml; charset=utf-8");
  c.header("cache-control", "public, max-age=604800");
  return c.body(FAVICON_SVG);
});

app.get("/favicon.ico", (c) => {
  if (!icoCache) icoCache = buildFaviconIco((raw) => deflateSync(raw));
  c.header("content-type", "image/x-icon");
  c.header("cache-control", "public, max-age=604800");
  return c.body(icoCache as unknown as ArrayBuffer);
});

/* ---------- console shells ---------- */

// Both shells are public by design: they hold no data and ask for the admin
// token themselves. Everything they render comes from /pengatur/* endpoints.
app.get("/pengatur", (c) => c.html(ADMIN_HTML));

/** Sign-in page. Public; the only console route without a section rail. */
app.get("/pengatur/login", (c) => c.html(LOGIN_HTML));

/** Model inventory console. The shell is public; its data endpoints are not. */
app.get("/pengatur/models", (c) => c.html(MODELS_HTML));

/** Statistics console shell. Public like the others; its data endpoint is not. */
app.get("/pengatur/stats", (c) => c.html(STATS_HTML));

/**
 * Range statistics. 1h/24h come from the in-memory ring, 7d/30d from
 * usage_daily. An empty range answers zeros; a database failure answers
 * ok:false rather than a silent zero.
 */
app.get("/pengatur/stats/data", async (c) => {
  const range = new URL(c.req.url).searchParams.get("range") ?? "24h";
  if (!isStatsRange(range)) {
    return c.json({ error: { message: "`range` must be one of: 1h, 24h, 7d, 30d" } }, 400);
  }
  const stats = await statsSnapshot(range);
  if (!stats.ok) {
    return c.json({ ok: false, error: { message: stats.error ?? "Statistics unavailable." } }, 500);
  }
  return c.json(stats);
});

/**
 * Live model list. Queried from the Generative Language API with a pooled key
 * and cached briefly; pricing/free-tier columns come from the static catalog.
 */
app.get("/pengatur/models/list", async (c) => {
  const force = new URL(c.req.url).searchParams.get("refresh") === "1";
  // Gemini fallback + ElevenLabs are independent: a leaked-blocked Gemini pool
  // must not hide a healthy ElevenLabs inventory, and vice versa. The catalog
  // is unified and carries a `provider` field on every row.
  let gemini: { models: unknown[]; source: string; cached: boolean; degraded?: boolean; degradedReason?: string };
  try {
    const live = await listLiveModels(force);
    gemini = live;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as Error & { code?: string }).code === "empty_pool" ? 503 : 502;
    log("warn", "models.list_fallback_catalog", { reason: message });
    gemini = {
      models: catalogModels(),
      source: "catalog",
      cached: false,
      degraded: true,
      degradedReason: message,
    };
  }
  const inv = await listElevenLabsInventory();
  const eleven = inv
    ? inv.models.map((m) => ({
        id: `elevenlabs:${m.model_id}`,
        provider: "elevenlabs",
        name: m.model_id,
        displayName: m.name || m.model_id,
        description: m.description || "",
        version: "",
        methods: m.can_do_text_to_speech ? ["generateSpeech"] : [],
        inputTokenLimit: null,
        outputTokenLimit: null,
        kind: "tts" as const,
        free: true,
        freeLabel: "per-character quota",
        inUsd: null,
        outUsd: null,
        inRaw: "",
        outRaw: "",
      }))
    : [];
  const voices = inv
    ? inv.voices.map((v) => ({
        id: `voice:${v.voice_id}`,
        provider: "elevenlabs",
        name: v.voice_id,
        displayName: v.name,
        description: typeof v.labels === "object" ? JSON.stringify(v.labels) : "",
        version: "",
        methods: [],
        inputTokenLimit: null,
        outputTokenLimit: null,
        kind: "voice" as const,
        free: v.category === "premade",
        freeLabel: v.category === "premade" ? "premade (free tier)" : `professional (${v.category}) — paid plan required`,
        inUsd: null,
        outUsd: null,
        inRaw: "",
        outRaw: "",
        voiceCategory: v.category ?? "",
      }))
    : [];

  // Every OpenAI-wire provider contributes its own catalog, so the console
  // shows custom gateways next to gemini and elevenlabs.
  const wire = await openaiWireRows(new URL(c.req.url).searchParams.get("refresh") === "1");

  const models = [...gemini.models, ...eleven, ...voices, ...wire.rows];
  const census: Record<string, number> = {
    gemini: gemini.models.length,
    elevenlabs: eleven.length + voices.length,
    voice: voices.length,
    ...wire.census,
  };
  return c.json({
    ok: true,
    count: models.length,
    models,
    source: gemini.source,
    cached: gemini.cached,
    degraded: gemini.degraded,
    degradedReason: gemini.degradedReason,
    providers: census,
    pricing: pricingMeta(),
  });
});

/**
 * Live catalogs of every enabled OpenAI-wire provider, cached 10 minutes.
 * Rows are shaped like the Gemini/ElevenLabs rows so the console renders one
 * table; `kind` is derived from the model id because a gateway publishes no
 * generation methods.
 */
const OPENAI_WIRE_CACHE_MS = 600_000;
let openaiWireCache: { at: number; rows: Record<string, unknown>[]; census: Record<string, number> } | null = null;

function kindOfWireModel(id: string): string {
  const m = id.toLowerCase();
  if (/embed/.test(m)) return "embedding";
  if (/tts|speech|audio/.test(m)) return "tts";
  if (/image|flux|dall|midjourney|draw|paint|banana/.test(m)) return "image";
  if (/veo|vidu|seedance|kling|sora|hailuo|runway|video/.test(m)) return "video";
  return "text";
}

async function openaiWireRows(force: boolean): Promise<{
  rows: Record<string, unknown>[];
  census: Record<string, number>;
}> {
  if (!force && openaiWireCache && Date.now() - openaiWireCache.at < OPENAI_WIRE_CACHE_MS) {
    return { rows: openaiWireCache.rows, census: openaiWireCache.census };
  }
  const rows: Record<string, unknown>[] = [];
  const census: Record<string, number> = {};
  for (const provider of await allProviders()) {
    if (!provider.enabled || provider.wire !== "openai") continue;
    const st = await pick(new Set(), undefined, provider.id);
    if (!st) {
      census[provider.id] = 0;
      continue;
    }
    const raw = (await rawKeyById(st.key)) || st.key;
    const live = await openaiModelList(provider, raw);
    // Same curation rule as the public /v1/models union: a declared list
    // narrows the console to what this deployment actually serves.
    const declared = provider.models;
    const list = declared.length
      ? live.length
        ? live.filter((m) => declared.includes(m.id))
        : declared.map((id) => ({ id, ownedBy: provider.id }))
      : live;
    census[provider.id] = list.length;
    rows.push(
      ...list.map((m) => ({
        id: m.id,
        provider: provider.id,
        name: m.id,
        displayName: m.id,
        description: m.ownedBy && m.ownedBy !== provider.id ? `upstream: ${m.ownedBy}` : "",
        version: "",
        methods: [],
        inputTokenLimit: null,
        outputTokenLimit: null,
        kind: kindOfWireModel(m.id),
        free: null,
        freeLabel: "gateway pricing",
        inUsd: null,
        outUsd: null,
        inRaw: "",
        outRaw: "",
      })),
    );
  }
  openaiWireCache = { at: Date.now(), rows, census };
  return { rows, census };
}

/**
 * Live ElevenLabs inventory: voices and TTS models.
 *
 * OmniProxy fronts more than one provider, so the console has to show both.
 * Unlike Gemini there is no leak gate here — every alive ElevenLabs key answers
 * these endpoints — so the only failure worth reporting is an empty provider
 * pool, which the console renders as a section with no rows.
 */
const ELEVENLABS_CACHE_MS = 600_000;
let elevenLabsCache: { at: number; voices: unknown[]; models: unknown[] } | null = null;

app.get("/pengatur/elevenlabs/list", async (c) => {
  const force = new URL(c.req.url).searchParams.get("refresh") === "1";
  if (!force && elevenLabsCache && Date.now() - elevenLabsCache.at < ELEVENLABS_CACHE_MS) {
    return c.json({
      ok: true,
      cached: true,
      voices: elevenLabsCache.voices,
      models: elevenLabsCache.models,
    });
  }
  const inv = await listElevenLabsInventory();
  if (!inv) {
    return c.json(
      { ok: false, error: "No available ElevenLabs API keys in pool.", voices: [], models: [] },
      503,
    );
  }
  elevenLabsCache = { at: Date.now(), voices: inv.voices, models: inv.models };
  return c.json({
    ok: true,
    cached: false,
    voices: inv.voices,
    models: inv.models,
  });
});

/** Real per-model probe: one generateContent call against the named model. */
app.post("/pengatur/models/test", async (c) => {
  let body: { model?: string; key?: string; tier?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) return c.json({ error: { message: "`model` is required." } }, 400);

  const tier = (typeof body.tier === "string" ? body.tier : "") as KeyTier;
  const result = await testModel(
    model,
    typeof body.key === "string" ? body.key : undefined,
    KEY_TIERS.includes(tier) ? tier : "unknown",
  );
  return c.json({ ok: true, model, result });
});

/** Keys console shell. Public like the other shells; its data routes are not. */
app.get("/pengatur/keys", (c) => c.html(KEYS_HTML));

/** Provider registry console shell. Public like the other shells. */
app.get("/pengatur/providers", (c) => c.html(PROVIDERS_HTML));

/**
 * Pool state plus one row per key. Moved off /pengatur/keys so the shell can
 * live there; `enabled`/`label` are merged in from the durable identities.
 */
app.get("/pengatur/keys/list", async (c) => {
  const providerFilter = c.req.query("provider");
  /* A purge only clears the instance that served it. Other warm instances keep
     the tombstoned key in memory and would keep listing it, so the database's
     tombstone list is applied here before the snapshot is taken. */
  dropLocal(await purgedIds());
  const [keys, snap, identities] = await Promise.all([listKeys(providerFilter), snapshot(), loadKeys()]);
  const byId = new Map(identities.map((k) => [k.id, k]));
  const merged = keys.map((k) => {
    const identity = byId.get(k.id);
    return {
      ...k,
      provider: k.provider || identity?.provider || "gemini",
      enabled: identity ? identity.enabled : true,
      label: identity?.label ?? null,
    };
  });
  /* Raw keys are never sent to the browser: the former `?reveal=1` branch
     returned every pooled key in one response, which was the same leak as
     the deleted /raw route, just batched. The list endpoint returns masked
     keys only; the UI redesign owns removing the reveal caller. */
  return c.json({
    pool: snap,
    keys: merged,
    tiers: tierCounts(keys),
    knownTiers: KEY_TIERS,
    providers: await providerViews(),
  });
});

/** Keys detail shell. Public like the list shell; its /data sibling is gated. */
app.get("/pengatur/keys/:id", async (c) => {
  const id = c.req.param("id");
  const keys = await listKeys();
  if (!keys.some((k) => k.id === id)) return c.text("not found", 404);
  return c.html(KEY_DETAIL_HTML);
});

/**
 * Everything the detail page shows about one key: pool state, the daily
 * rollup chart, the requests still in the ring, and the cooldown timeline.
 * The ledger hashes the masked form rather than the raw key, so the history
 * lookup goes through `ledgerKeyId` instead of the pool id.
 */
app.get("/pengatur/keys/:id/data", async (c) => {
  const id = c.req.param("id");
  const key = (await listKeys()).find((k) => k.id === id);
  if (!key) return c.json({ error: { message: "No key with that id." } }, 404);

  const ledgerId = ledgerKeyId(key.key);
  const daily: { day: string; requests: number; errors: number; costUsd: number | null }[] = [];
  let dailyNote = "";
  if (!dbEnabled()) {
    dailyNote = "Database disabled: no daily history.";
  } else {
    const res = await sql<{
      day: string;
      requests: number | string;
      errors: number | string;
      cost_usd: number | string | null;
    }>(
      `select day::text as day,
              sum(requests)::int as requests,
              sum(errors)::int as errors,
              sum(cost_usd)::numeric as cost_usd
         from usage_daily
        where key_id = $1 and day >= current_date - 30
        group by day
        order by day`,
      [ledgerId],
    );
    if (!res.ok) {
      return c.json({ ok: false, error: { message: res.message ?? "Daily history unavailable." } }, 500);
    }
    for (const row of res.rows) {
      daily.push({
        day: row.day,
        requests: Number(row.requests) || 0,
        errors: Number(row.errors) || 0,
        costUsd: row.cost_usd == null ? null : Number(row.cost_usd),
      });
    }
  }

  const recent = allRows()
    .filter((r) => r.keyId === ledgerId)
    .slice(0, 100);
  const events = recent
    .filter((r) => !r.ok || r.rotated)
    .slice(0, 50)
    .map((r) => ({ ts: r.ts, status: r.status, ok: r.ok, errorCode: r.errorCode, rotated: r.rotated }));

  const identity = (await loadKeys()).find((k) => k.id === id);
  return c.json({
    ok: true,
    key: {
      id: key.id,
      masked: key.key,
      provider: key.provider || identity?.provider || "gemini",
      plan: key.tier,
      status: key.status,
      enabled: identity ? identity.enabled : true,
      label: identity?.label ?? null,
      failures: key.failures,
      invalidations: key.invalidations,
      invalid: key.invalid,
      lastUsed: key.lastUsed,
      cooldownUntil: key.cooldownUntil,
      cooldownLeftMs: key.cooldownLeftMs,
    },
    daily,
    dailyNote,
    recent,
    events,
    cooldown: { status: key.status, until: key.cooldownUntil, leftMs: key.cooldownLeftMs },
  });
});

/**
 * Declare the billing plan for a pooled key. Google does not expose the plan
 * over the API, so the console asks the operator and stores the answer here;
 * /pengatur/models then prices a test run against the declared plan.
 *
 * Body: { id, tier } | { tier, ids: [] } | { tier, all: true }
 */
app.post("/pengatur/keys/tier", async (c) => {
  let body: { id?: string; ids?: string[]; tier?: string; all?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  const tier = String(body.tier ?? "") as KeyTier;
  if (!KEY_TIERS.includes(tier)) {
    return c.json({ error: { message: `\`tier\` must be one of: ${KEY_TIERS.join(", ")}` } }, 400);
  }

  let ids: string[] = [];
  if (body.all) ids = (await listKeys()).map((k) => k.id);
  else if (Array.isArray(body.ids)) ids = body.ids.filter((x) => typeof x === "string" && x);
  else if (typeof body.id === "string" && body.id) ids = [body.id];
  if (!ids.length) return c.json({ error: { message: "`id`, `ids` or `all` is required." } }, 400);

  let updated = 0;
  for (const id of ids) if (await setTierById(id, tier)) updated++;
  await auditRecordNow("keys.tier", {
    actor: actorFrom(c.req.header("user-agent")),
    target: ids.join(","),
    detail: { tier, updated },
  });
  const keys = await listKeys();
  return c.json({ ok: true, tier, updated, tiers: tierCounts(keys), pool: await snapshot() });
});

app.post("/pengatur/keys", async (c) => {
  let body: {
    keys?: string[] | string;
    key?: string;
    provider?: string;
    /** key -> epoch ms or ISO date the sender knows the key is parked until */
    cooldowns?: Record<string, number | string>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  const incoming: string[] = [];
  if (typeof body.key === "string") incoming.push(body.key);
  if (typeof body.keys === "string") incoming.push(...body.keys.split(/[\s,]+/));
  if (Array.isArray(body.keys)) incoming.push(...body.keys);
  const clean = [...new Set(incoming.map((k) => String(k).trim()).filter(Boolean))];
  if (clean.length === 0) return c.json({ error: { message: "No keys supplied." } }, 400);

  /* A harvester that just probed the key sends its reset deadline here. Keys
     without one are admitted exactly as before, so older senders keep working. */
  const cooldownInput = body.cooldowns && typeof body.cooldowns === "object" ? body.cooldowns : {};
  const cooldownFor = (key: string): number => {
    const raw = (cooldownInput as Record<string, unknown>)[key];
    const at = typeof raw === "number" ? raw : typeof raw === "string" ? Date.parse(raw) : 0;
    return Number.isFinite(at) ? at : 0;
  };

  const named = typeof body.provider === "string" ? body.provider.trim() : "";
  const namedProvider = named ? await getProvider(named) : null;
  if (named && !namedProvider) {
    return c.json({ error: { message: `Unknown provider \`${named}\`.` } }, 400);
  }
  /* No provider named: each key is matched to a provider by its format
     (`sk-…` gateways, `sk_<hex>` ElevenLabs, `AIza…`/`AQ.…` Google). A format
     nothing recognises keeps the historical gemini default. */
  const registry = await allProviders();
  const perKey = clean.map((k) => named || detectProvider(k, registry) || "gemini");
  const byId = new Map(registry.map((p) => [p.id, p]));
  if (namedProvider) byId.set(namedProvider.id, namedProvider);

  /* Shape is checked before admission: a key of the wrong length can never
     serve, so accepting it would only create a pool row that dies on its first
     probe. Rejected keys are reported, not fatal — a 4xx here makes the sender
     retry the whole batch forever. */
  const rejected: { id: string; provider: string; reason: string }[] = [];
  const accepted: { key: string; provider: string }[] = [];
  for (let i = 0; i < clean.length; i++) {
    const provider = perKey[i];
    const p = byId.get(provider);
    const why = p ? keyShapeError(clean[i], p) : null;
    if (why) rejected.push({ id: keyId(clean[i]), provider, reason: why });
    else accepted.push({ key: clean[i], provider });
  }

  const ids: string[] = [];
  const addedByProvider: Record<string, number> = {};
  let added = 0;
  let parked = 0;
  for (const { key, provider } of accepted) {
    const until = cooldownFor(key);
    if (await addKey(key, provider, until)) {
      added++;
      if (until > Date.now()) parked++;
      ids.push(keyId(key));
      addedByProvider[provider] = (addedByProvider[provider] ?? 0) + 1;
    }
  }
  await auditRecordNow("keys.add", {
    actor: actorFrom(c.req.header("user-agent")),
    target: ids.join(","),
    detail: {
      received: clean.length,
      added,
      parked,
      provider: named || "auto",
      providers: addedByProvider,
      rejected: rejected.length,
      rejectedIds: rejected.map((r) => r.id),
    },
  });
  const durable = keyMaterialDurable();
  const warning = durable
    ? {}
    : { warning: "KEY_MATERIAL is not durable: keys added now survive until the next cold start only." };
  return c.json({
    ok: true,
    received: clean.length,
    added,
    parked,
    rejected,
    ids,
    durable,
    providers: addedByProvider,
    ...warning,
    pool: await snapshot(),
  });
});

/* ---------- provider registry console ---------- */

/**
 * The registry as the console sees it: every provider with its capabilities,
 * its key counts and whether it is builtin. Drives the add-key provider
 * select, the models filter and the providers page.
 *
 * Lives at /list, not at the shell path: two GET handlers on one path means
 * the first registration wins and the data route would be dead code.
 */
app.get("/pengatur/providers/list", async (c) => {
  return c.json({
    ok: true,
    providers: await providerViews(),
    capabilities: CAPABILITIES,
    capabilityLabels: CAPABILITY_LABEL,
  });
});

/**
 * Register a custom provider. Body:
 *   { id, label, baseUrl, capabilities, keyPattern?, models?, note?, keys? }
 *
 * `keys` is accepted in the same call so the console's add-provider dialog
 * can create the provider AND seed its first credential in one step — a
 * provider with no keys is a row that serves nothing.
 */
app.post("/pengatur/providers", async (c) => {
  let body: {
    id?: string;
    label?: string;
    baseUrl?: string;
    capabilities?: Capability[];
    keyPattern?: string;
    models?: string[];
    note?: string;
    keys?: string[] | string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  let provider: Provider;
  try {
    provider = await registerProvider({
      id: String(body.id ?? ""),
      label: String(body.label ?? ""),
      baseUrl: String(body.baseUrl ?? ""),
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
      keyPattern: typeof body.keyPattern === "string" ? body.keyPattern : undefined,
      models: Array.isArray(body.models) ? body.models.map((m) => String(m)) : [],
      note: typeof body.note === "string" ? body.note : "",
    });
  } catch (err) {
    return c.json({ error: { message: err instanceof Error ? err.message : String(err) } }, 400);
  }

  const incoming: string[] = [];
  if (typeof body.keys === "string") incoming.push(...body.keys.split(/[\s,]+/));
  if (Array.isArray(body.keys)) incoming.push(...body.keys);
  const clean = [...new Set(incoming.map((k) => String(k).trim()).filter(Boolean))];
  let added = 0;
  for (const k of clean) if (await addKey(k, provider.id)) added++;

  await auditRecordNow("providers.add", {
    actor: actorFrom(c.req.header("user-agent")),
    target: provider.id,
    detail: {
      label: provider.label,
      baseUrl: provider.baseUrl,
      capabilities: provider.capabilities,
      models: provider.models.length,
      keysAdded: added,
    },
  });
  return c.json({ ok: true, provider, added, pool: await snapshot() });
});

/** Update a provider. Builtins accept only `enabled` and `models`. */
app.patch("/pengatur/providers/:id", async (c) => {
  const id = c.req.param("id");
  let body: {
    label?: string;
    baseUrl?: string;
    capabilities?: Capability[];
    keyPattern?: string | null;
    models?: string[];
    note?: string;
    enabled?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  try {
    const provider = await updateProvider(id, {
      label: typeof body.label === "string" ? body.label : undefined,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : undefined,
      keyPattern: body.keyPattern === undefined ? undefined : body.keyPattern,
      models: Array.isArray(body.models) ? body.models.map((m) => String(m)) : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });
    if (!provider) return c.json({ error: { message: "No provider with that id." } }, 404);
    await auditRecordNow("providers.update", {
      actor: actorFrom(c.req.header("user-agent")),
      target: id,
      detail: { enabled: provider.enabled, models: provider.models.length, capabilities: provider.capabilities },
    });
    return c.json({ ok: true, provider, pool: await snapshot() });
  } catch (err) {
    return c.json({ error: { message: err instanceof Error ? err.message : String(err) } }, 400);
  }
});

/** Remove a custom provider. Refused while pooled keys still point at it. */
app.delete("/pengatur/providers/:id", async (c) => {
  const id = c.req.param("id");
  const result = await removeProvider(id);
  if (!result.ok) {
    const status = /No provider/.test(result.error ?? "") ? 404 : 409;
    return c.json({ error: { message: result.error } }, status);
  }
  await auditRecordNow("providers.remove", {
    actor: actorFrom(c.req.header("user-agent")),
    target: id,
    detail: {},
  });
  return c.json({ ok: true, pool: await snapshot() });
});

/**
 * Import a provider's model list from its own /v1/models, for the console's
 * "import" action. Read-only preview: the operator reviews the ids and saves
 * the ones they want onto the provider (PATCH), or types models by hand for
 * gateways that expose no catalog.
 */
app.get("/pengatur/providers/:id/models", async (c) => {
  const id = c.req.param("id");
  const provider = await getProvider(id);
  if (!provider) return c.json({ error: { message: "No provider with that id." } }, 404);
  if (provider.wire !== "openai") {
    return c.json(
      { error: { message: `Provider \`${id}\` does not expose an OpenAI-compatible /v1/models.` } },
      400,
    );
  }
  const st = await pick(new Set(), undefined, id);
  if (!st) {
    return c.json({ error: { message: `No available ${provider.label} API keys in pool.` } }, 503);
  }
  const raw = (await rawKeyById(st.key)) || st.key;
  const list = await openaiModelList(provider, raw);
  await auditRecordNow("providers.import_models", {
    actor: actorFrom(c.req.header("user-agent")),
    target: id,
    detail: { count: list.length },
  });
  return c.json({ ok: true, provider: id, count: list.length, models: list });
});

app.post("/pengatur/keys/backfill-material", async (c) => {
  const written = await backfillMaterial();
  await auditRecordNow("keys.backfill_material", {
    actor: actorFrom(c.req.header("user-agent")),
    detail: { written },
  });
  return c.json({ ok: true, written });
});

app.delete("/pengatur/keys", async (c) => {
  let body: { key?: string; id?: string; ids?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  // `ids` removes a selection in one request. The console used to send one
  // request per key, which turned a bulk removal into a queue of round trips.
  if (Array.isArray(body.ids) && body.ids.length) {
    const ids = body.ids.filter((x): x is string => typeof x === "string" && x.length > 0);
    const removed: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      const ok = await removeKeyById(id);
      if (ok) removed.push(id);
      else failed.push(id);
    }
    await auditRecordNow("keys.delete", {
      actor: actorFrom(c.req.header("user-agent")),
      target: removed.join(","),
      detail: { by: "id", bulk: true, removed: removed.length, failed: failed.length },
    });
    return c.json({ ok: failed.length === 0, removed, failed, pool: await snapshot() });
  }
  // `id` is the handle the console holds (sha256 prefix); `key` stays for curl.
  if (typeof body.id === "string" && body.id) {
    const removed = await removeKeyById(body.id);
    if (!removed) return c.json({ error: { message: "No key with that id." } }, 404);
    await auditRecordNow("keys.delete", {
      actor: actorFrom(c.req.header("user-agent")),
      target: body.id,
      detail: { by: "id" },
    });
    return c.json({ ok: true, pool: await snapshot() });
  }
  if (typeof body.key !== "string" || !body.key) {
    return c.json({ error: { message: "`id` or `key` is required." } }, 400);
  }
  await removeKey(body.key);
  await auditRecordNow("keys.delete", {
    actor: actorFrom(c.req.header("user-agent")),
    target: keyId(body.key),
    detail: { by: "raw-key" },
  });
  return c.json({ ok: true, pool: await snapshot() });
});

/**
 * Probe one key against Google and fold the verdict back into the pool.
 *
 * The console asks for an id (it never holds raw keys); curl may pass a raw
 * key to vet it before adding. A probe is the only path that revives a parked
 * key, so a recovering key does not have to wait out a stale cooldown.
 */
app.post("/pengatur/keys/test", async (c) => {
  let body: { id?: string; key?: string; model?: string; provider?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }

  let raw = "";
  let id = typeof body.id === "string" ? body.id : "";
  if (id) {
    const resolved = await rawKeyById(id);
    if (!resolved) return c.json({ error: { message: "No key with that id." } }, 404);
    raw = resolved;
  } else if (typeof body.key === "string" && body.key.trim()) {
    raw = body.key.trim();
    id = keyId(raw);
  } else {
    return c.json({ error: { message: "`id` or `key` is required." } }, 400);
  }

  const allKeys = await listKeys();
  const matched = allKeys.find((k) => k.id === id);
  const provider =
    matched?.provider ??
    (typeof body.provider === "string" && body.provider.trim() ? body.provider.trim() : undefined);

  const model = typeof body.model === "string" && body.model ? body.model : undefined;
  const result = await probeKey(raw, model, provider);

  // Fold the verdict into pool state only for keys the pool actually holds.
  const held = Boolean(await rawKeyById(id));
  const applied = held ? await applyProbe(raw, result) : "none";
  // Plan evidence rides on the 429 body only; a 2xx proves the credential but
  // says nothing about the plan, so the stored tier is left alone.
  if (held && result.tierEvidence) await markValidatedPlan(raw, result.tierEvidence);

  const view = held ? (await listKeys()).find((k) => k.id === id) : undefined;

  await auditRecordNow("keys.test", {
    actor: actorFrom(c.req.header("user-agent")),
    target: id,
    detail: {
      provider: provider ?? view?.provider ?? "gemini",
      model: model ?? "default",
      verdict: result.status,
      tier: result.tierEvidence?.tier ?? "unknown",
      applied,
    },
  });

  return c.json({
    ok: true,
    id,
    applied,
    probe: { status: result.status, httpStatus: result.httpStatus, retryAfterMs: result.retryAfterMs },
    verdict: result.status,
    httpStatus: result.httpStatus,
    message: result.message,
    quota: result.quota ?? null,
    tierEvidence: result.tierEvidence ?? null,
    planValidated: view?.planValidated ?? false,
    plan: view?.plan ?? "unspecified",
    nextAccessAt: view?.nextAccessAt ?? 0,
    pool: await snapshot(),
  });
});

/**
 * Fold a probe verdict back into pool state.
 *
 * Only `ok` revives; only `invalid` retires. A quota verdict parks the key
 * without disabling it — the allowance is the project owner's to change, so
 * the key stays enrolled and becomes selectable again at `retryAfterAt`.
 * Returns the label the admin routes report as `applied`.
 */
async function applyProbe(raw: string, probe: ProbeResult): Promise<string> {
  switch (probe.status) {
    case "ok":
      await markHealthy(raw);
      return "revived";
    case "rate_limited":
      await mark429(raw, Math.max(cfg.cooldownMs, probe.retryAfterMs), probe.quota ?? null);
      return "cooling";
    case "zero_quota":
      /* A project with no allocation is not a temporary state: Google answers
         quota_limit_value 0 with no reset time, and it never advertises one.
         Treating it as `quota_exhausted` left 221 rows parked in the pool that
         no recheck could ever clear, so they are dead now. The credential
         itself stays valid, and a later 200 still revives the row. */
      await markInvalid(raw, Date.now(), "zero_quota");
      return "retired";
    case "invalid":
      await markInvalid(raw);
      return "retired";
    case "server_error":
    case "network_error":
      await markSoftError(raw, cfg.serverErrCooldownMs);
      return "cooling";
    default:
      await markUnverified(raw);
      return "unverified";
  }
}

/** Bounded-concurrency probe of the whole pool; the console's "test all". */
app.post("/pengatur/keys/test-all", async (c) => {
  const keys = await listKeys();
  const target = keys.filter((k) => k.status !== "dead");
  const limit = 4;
  const results: { id: string; key: string; probe: unknown; applied: string }[] = [];
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= target.length) return;
      const k = target[i];
      const raw = await rawKeyById(k.id);
      if (!raw) continue;
      // The pool knows which provider owns the key; naming it keeps the
      // probe in that provider's dialect even when the format is ambiguous.
      const probe = await probeKey(raw, undefined, k.provider);
      const applied = await applyProbe(raw, probe);
      results.push({ id: k.id, key: k.key, probe, applied });
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, target.length) }, worker));
  /* Every credential the sweep just retired is dead forever, so it is removed
     in the same pass. Keeping it only inflates the pool snapshot and the
     keys list; quota_exhausted rows are left alone because a 200 revives them. */
  const purged = await purgeDead();
  const dropped = forgetDead();
  await auditRecordNow("keys.test-all", {
    actor: actorFrom(c.req.header("user-agent")),
    detail: { tested: results.length, purged: purged.removed, droppedFromPool: dropped, purgedBy: purged.byReason },
  });
  return c.json({ ok: true, tested: results.length, results, purged, droppedFromPool: dropped, pool: await snapshot() });
});

/**
 * Remove every retired credential. A row whose verdict was `invalid` or
 * `leaked` can never serve traffic again, so it is deleted along with its raw
 * key material; `quota_exhausted` and `cooling` are live and stay.
 */
app.post("/pengatur/keys/purge-dead", async (c) => {
  const purged = await purgeDead();
  /* The rows are gone from the database; the in-memory pool must forget them
     too, or the next snapshot still counts credentials that no longer exist. */
  const dropped = forgetDead();
  await auditRecordNow("keys.purge-dead", {
    actor: actorFrom(c.req.header("user-agent")),
    target: purged.ids.join(","),
    detail: { removed: purged.removed, droppedFromPool: dropped, byReason: purged.byReason },
  });
  return c.json({ ok: true, ...purged, droppedFromPool: dropped, pool: await snapshot() });
});

/**
 * Declare the plan from upstream evidence rather than from the operator.
 *
 * Body: { ids?: string[] } | { all: true }
 *
 * A 200 validates nothing: only a 429 body names the quota that refused the
 * key, so a key whose tier models serve keeps its stored plan and stays
 * `planValidated: false`.
 */

/**
 * Undo a purge. `purge-dead` tombstones instead of deleting, so the row and its
 * raw value are still there; clearing the tombstone and re-hydrating puts the
 * key back in this instance's pool.
 */
app.post("/pengatur/keys/restore", async (c) => {
  let body: { ids?: string[]; id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0)
    : typeof body.id === "string" && body.id
      ? [body.id]
      : [];
  if (ids.length === 0) return c.json({ error: { message: "`id` or `ids` is required." } }, 400);
  const restored = await restoreKeys(ids);
  await hydrate();
  await auditRecordNow("keys.restore", {
    actor: actorFrom(c.req.header("user-agent")),
    target: ids.join(","),
    detail: { requested: ids.length, restored },
  });
  return c.json({ ok: true, restored, pool: await snapshot() });
});
app.post("/pengatur/keys/validate-plan", async (c) => {
  let body: { ids?: string[]; all?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }

  let ids: string[] = [];
  if (body.all) ids = (await listKeys()).map((k) => k.id);
  else if (Array.isArray(body.ids)) ids = body.ids.filter((x) => typeof x === "string" && x);
  if (!ids.length) return c.json({ error: { message: "`ids` or `all` is required." } }, 400);

  const results: {
    id: string;
    tier: string;
    planValidated: boolean;
    verdict?: string;
    httpStatus?: number;
    error: string | null;
  }[] = new Array(ids.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= ids.length) return;
      const id = ids[i];
      const raw = await rawKeyById(id);
      if (!raw) {
        results[i] = { id, tier: "unknown", planValidated: false, error: "No key with that id." };
        continue;
      }
      const t = await probeTier(raw);
      const evidence = t.tierEvidence && t.tierEvidence.tier !== "unknown" ? t.tierEvidence : null;
      if (evidence) await markValidatedPlan(raw, evidence);
      results[i] = {
        id,
        tier: evidence?.tier ?? "unknown",
        planValidated: Boolean(evidence),
        verdict: t.verdict,
        httpStatus: t.httpStatus,
        error: evidence ? null : t.message,
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));

  const validated = results.filter((r) => r.planValidated).length;
  await auditRecordNow("keys.validate-plan", {
    actor: actorFrom(c.req.header("user-agent")),
    target: ids.join(","),
    detail: { requested: ids.length, validated },
  });
  return c.json({ ok: true, validated, results, pool: await snapshot() });
});

/* Raw keys are never sent to the browser: the former
 * GET /pengatur/keys/:id/raw route was deleted (it contradicted the console
 * contract and gave any admin-token holder, and any XSS in the console, every
 * live credential). Operators copy keys from their own source, not from this
 * gateway. */

/* ---------- cron ---------- */

/**
 * Daily rollup entry point. Vercel cron calls this with no body; the day
 * defaults to yesterday in WIB. Auth is a shared bearer token, and an unset
 * `ROLLUP_TOKEN` disables the route entirely rather than leaving it open.
 */
app.all("/internal/rollup", async (c) => {
  // Vercel cron issues GET with `Authorization: Bearer $CRON_SECRET`; a manual
  // operator run uses POST with either header. Both credentials are accepted,
  // and an empty allowlist disables the route instead of leaving it open.
  const presented =
    (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() ||
    c.req.header("x-rollup-token") ||
    "";
  const accepted = [cfg.rollupToken, cfg.cronSecret].filter((t) => t.length > 0);
  if (accepted.length === 0) {
    return c.json(
      { error: { message: "Rollup disabled: neither ROLLUP_TOKEN nor CRON_SECRET is set." } },
      403,
    );
  }
  if (!accepted.includes(presented)) {
    return c.json({ error: { message: "Unauthorized." } }, 401);
  }

  let bodyDay: string | undefined;
  try {
    const body = (await c.req.json()) as { day?: string } | null;
    bodyDay = body?.day;
  } catch {
    // No body is the normal cron case; fall through to query/default.
  }
  const requested = bodyDay ?? new URL(c.req.url).searchParams.get("day") ?? undefined;

  // Neither call throws; a failed query returns ok:false with its reason, so a
  // broken aggregation surfaces as 500 instead of a silent zero-bucket success.
  const rolled = await rollupDay(requested ?? defaultDay());
  if (!rolled.ok) {
    return c.json({ error: { message: `Rollup failed: ${rolled.error}` } }, 500);
  }
  const pruned = await pruneOlderThan();
  if (!pruned.ok) {
    return c.json(
      { day: rolled.day, buckets: rolled.buckets, error: { message: `Prune failed: ${pruned.error}` } },
      500,
    );
  }
  return c.json({ day: rolled.day, buckets: rolled.buckets, pruned: pruned.pruned });
});

/**
 * Re-examine keys that have come due: a reset that has passed, a key admitted
 * without proof, or a key whose plan was never validated.
 *
 * Cadence is external on purpose: the Vercel Hobby plan allows only the daily
 * rollup cron, so an operator or an out-of-band scheduler drives this route.
 */
/**
 * Probe every due key once, outside of any HTTP request.
 *
 * A `cooling` key whose window has passed and a `quota_exhausted` key whose
 * reset time is known and elapsed are both re-probed; a 200 flips them back
 * to ready. `dead` is skipped except for the invalid-recheck floor, because a
 * 200 on a parked credential revives it.
 *
 * Returns the same census the HTTP route reports.
 */
export async function recheckDueKeys(): Promise<{
  due: number; checked: number; revived: number; stillQuota: number;
  retired: number; failed: number; plansValidated: number;
}> {
  const at = Date.now();
  const floor = cfg.invalidRecheckFloorMinutes * 60_000;
  const quotaFloor = cfg.quotaRecheckFloorMinutes * 60_000;
  const due = (k: KeyView): boolean => {
    if (k.status === "dead") return k.lastCheckedAt === 0 || at - k.lastCheckedAt >= floor;
    if (k.status === "quota_exhausted") {
      // A key whose upstream named a reset is due once that reset has passed.
      // A project that holds no allocation never reports one, so re-probing it
      // on every tick would waste the upstream AND starve the rest of the
      // pool: it stays due forever and would take every slot in the batch, so
      // the dead backlog behind it would never be reached.
      if (k.nextAccessAt > 0) return k.nextAccessAt <= at;
      return k.lastCheckedAt === 0 || at - k.lastCheckedAt >= quotaFloor;
    }
    if (k.status === "cooling") return k.nextAccessAt <= at;
    if (k.status === "unverified") return true;
    if (!k.planValidated) return k.lastCheckedAt === 0 || at - k.lastCheckedAt >= floor;
    return false;
  };
  const candidates = (await listKeys()).filter(due).slice(0, cfg.recheckBatchSize);

  let checked = 0;
  let revived = 0;
  let stillQuota = 0;
  let failed = 0;
  let retired = 0;
  let plansValidated = 0;
  for (const k of candidates) {
    const raw = await rawKeyById(k.id);
    if (!raw) continue;
    checked++;
    const result = await probeKey(raw);
    const applied = await applyProbe(raw, result);
    if (applied === "revived") revived++;
    else if (applied === "quota_exhausted") stillQuota++;
    else if (applied === "retired") retired++;
    else if (applied !== "cooling") failed++;
    if (result.tierEvidence) await markValidatedPlan(raw, result.tierEvidence);
    // A key whose plan was never validated needs the tier probe: a healthy
    // key answers 200, and a 200 carries no tier marker at all. The tier
    // probe asks a quota-gated model on purpose, so its verdict is about the
    // plan and never about the credential.
    if (!k.planValidated) {
      const tier = await probeTier(raw);
      if (tier.tierEvidence && tier.tierEvidence.tier !== "unknown") {
        await markValidatedPlan(raw, tier.tierEvidence);
        plansValidated++;
      }
    }
  }
  return { due: candidates.length, checked, revived, stillQuota, retired, failed, plansValidated };
}

app.post("/internal/keys/recheck", async (c) => {
  const presented =
    (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() ||
    c.req.header("x-rollup-token") ||
    "";
  const accepted = [cfg.adminToken, cfg.rollupToken, cfg.cronSecret].filter((t) => t.length > 0);
  if (accepted.length === 0) {
    return c.json(
      { error: { message: "Recheck disabled: no internal token is configured." } },
      403,
    );
  }
  if (!accepted.includes(presented)) {
    return c.json({ error: { message: "Unauthorized." } }, 401);
  }

  const result = await recheckDueKeys();

  await auditRecordNow("keys.recheck", {
    actor: actorFrom(c.req.header("user-agent")),
    target: "pool",
    detail: result,
  });
  return c.json({
    ok: true,
    ...result,
    pool: await snapshot(),
  });
});

/**
 * Auto-recheck timer: every 19 minutes, probe what is due so a key that hit a
 * per-minute rate limit comes back into rotation the moment its window resets
 * instead of waiting for an external cron that may never fire.
 *
 * The interval is configurable with RECHECK_INTERVAL_MINUTES; 0 disables.
 */
const RECHECK_INTERVAL_MS = cfg.recheckIntervalMinutes * 60_000;
let recheckTimer: ReturnType<typeof setInterval> | null = null;
let recheckRunning = false;

function startRecheckLoop(): void {
  if (recheckTimer || RECHECK_INTERVAL_MS <= 0) return;
  recheckTimer = setInterval(async () => {
    if (recheckRunning) return;
    recheckRunning = true;
    try {
      const r = await recheckDueKeys();
      if (r.checked > 0) {
        await auditRecordNow("keys.recheck", {
          actor: "scheduler",
          target: "pool",
          detail: { ...r, trigger: "timer" },
        });
        log("info", "recheck.tick", r);
      }
    } catch (e) {
      log("warn", "recheck.tick_failed", { reason: (e as Error).message });
    } finally {
      recheckRunning = false;
    }
  }, RECHECK_INTERVAL_MS);
  log("info", "recheck.scheduler_started", { intervalMs: RECHECK_INTERVAL_MS });
}
startRecheckLoop();

app.notFound((c) =>
  c.json({ error: { message: `No route for ${c.req.method} ${new URL(c.req.url).pathname}` } }, 404),
);

app.onError((e, c) => {
  console.error("[omniproxy] unhandled:", e);
  return c.json({ error: { message: e.message } }, 500);
});

/** Usage console shell. Public like the other two; its data endpoints are not. */
app.get("/pengatur/usage", (c) => {
  const url = new URL(c.req.url);
  return c.redirect("/pengatur/logs" + (url.search || ""), 302);
});

/**
 * Ledger snapshot. Paged and filtered server-side so the browser never
 * downloads the whole ring.
 */
const usageDataHandler = (c: Context) => {
  const q = new URL(c.req.url).searchParams;
  const filter: RowFilter = {
    day: q.get("day") ?? undefined,
    model: q.get("model") ?? undefined,
    key: q.get("key") ?? undefined,
    status: q.get("status") ?? undefined,
    route: q.get("route") ?? undefined,
  };
  const page = Number(q.get("page") ?? 1) || 1;
  const pageSize = Number(q.get("pageSize") ?? 25) || 25;
  return c.json(usageOverview(page, pageSize, filter));
};
app.get("/pengatur/logs/data", usageDataHandler);
app.get("/pengatur/usage/data", usageDataHandler);

/** Same filters as the console, one CSV file. */
const usageExportHandler = (c: Context) => {
  const q = new URL(c.req.url).searchParams;
  const filter: RowFilter = {
    day: q.get("day") ?? undefined,
    model: q.get("model") ?? undefined,
    key: q.get("key") ?? undefined,
    status: q.get("status") ?? undefined,
    route: q.get("route") ?? undefined,
  };
  const snapshot = usageOverview(1, 200, filter);
  const csv = toCsv(snapshot.rows);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="omniproxy-usage-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
};
app.get("/pengatur/logs/export.csv", usageExportHandler);
app.get("/pengatur/usage/export.csv", usageExportHandler);

/** Request-log console. The old /pengatur/usage shell redirects here; its data/export paths stay as aliases. */
app.get("/pengatur/logs", (c) => c.html(USAGE_HTML));

/** Settings console shell. Public like the other shells; its data routes are not. */
app.get("/pengatur/settings", (c) => c.html(SETTINGS_HTML));

/**
 * Effective configuration. Built from an explicit allowlist inside
 * `settingsView`, so a newly added secret can never leak by accident.
 */
app.get("/pengatur/settings/data", (c) => c.json(settingsView()));

/** The same object as a file. Zero secrets by construction; recorded in audit. */
app.get("/pengatur/settings/export", async (c) => {
  const view = settingsView();
  await auditRecordNow("settings.export", {
    actor: actorFrom(c.req.header("user-agent")),
    detail: { envFlags: view.env.length },
  });
  return new Response(JSON.stringify(view, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="omniproxy-config-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});

/** Audit console shell. Public like the others; its data route is gated. */
app.get("/pengatur/audit", (c) => c.html(AUDIT_HTML));

/**
 * Admin action trail, newest first. Filters are passed straight through; the
 * module clamps the limit to 1..500 and treats an empty result as a normal
 * state, so a fresh deployment renders the empty-state line rather than an
 * error.
 */
app.get("/pengatur/audit/data", async (c) => {
  const q = c.req.query();
  const res = await listAudit({
    action: q.action?.trim() || undefined,
    since: q.since?.trim() || undefined,
    limit: q.limit ? Number(q.limit) : undefined,
  });
  if (!res.ok) return c.json({ ok: false, error: { message: res.error ?? "audit query failed" } }, 500);
  return c.json(res);
});
export default app;
