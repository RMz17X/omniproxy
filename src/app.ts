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

import { Hono } from "hono";
import { cors } from "hono/cors";
import { cfg } from "./config.ts";
import { addKey, backfillMaterial, KEY_TIERS, keyId, keyMaterialDurable, listKeys, mark429, markHealthy, markInvalid, markQuotaExhausted, markSoftError, markUnverified, markValidatedPlan, pick, rawKeyById, removeKey, removeKeyById, forgetDead, setTierById, snapshot, tierCounts, type KeyTier, type KeyView } from "./pool.ts";
import { ADMIN_HTML } from "./admin-ui.ts";
import { buildFaviconIco, FAVICON_SVG } from "./favicon.ts";
import { MODELS_HTML } from "./models-ui.ts";
import { listLiveModels, catalogModels, discoveryDebug, pricingMeta, testModel } from "./models.ts";
import { probeKey, probeTier, type ProbeResult } from "./probe.ts";
import { deflateSync } from "node:zlib";
import { geminiPassthrough, speech } from "./gemini.ts";
import { listElevenLabsInventory, serveElevenLabs } from "./tts.ts";
import { chatCompletions, embeddings, models } from "./openai.ts";
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
import { loadKeys, purgeDead } from "./keys-repo.ts";
import { SETTINGS_HTML } from "./settings-ui.ts";
import { settingsView } from "./settings.ts";
import { AUDIT_HTML } from "./audit-ui.ts";
import { LOGIN_HTML } from "./ui.ts";
import { dbEnabled, sql } from "./db.ts";

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

app.use("/v1/*", async (c, next) => {
  if (!cfg.clientToken) return next();
  const presented = bearer(c.req.header("authorization")) || c.req.header("x-api-key") || "";
  if (presented !== cfg.clientToken) {
    return c.json({ error: { type: "auth_error", message: "Invalid API key." } }, 401);
  }
  return next();
});

/** Shells carry no data; their client scripts fetch `/data` with the token. */
const SHELL_PATHS = [
  "/pengatur",
  "/pengatur/login",
  "/pengatur/models",
  "/pengatur/usage",
  "/pengatur/stats",
  "/pengatur/keys",
  "/pengatur/settings",
  "/pengatur/audit",
  "/pengatur/logs",
];

/** The key detail shell. `/data` carries a suffix and so stays gated. */
const KEY_PAGE = /^\/pengatur\/keys\/[0-9a-f]{12}$/;

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
  return c.json({
    ok: true,
    service: "omniproxy",
    storage: snap.storage,
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

/**
 * Model names that belong to ElevenLabs rather than Gemini.
 *
 * An OpenAI-compatible client names the model it wants, so the model is the
 * only honest signal for which provider should serve the request. Routing on
 * the pool's next available key instead would hand an ElevenLabs TTS request
 * to a Gemini credential most of the time — the pool is overwhelmingly
 * Gemini — and the caller would get a Gemini voice it never asked for.
 */
const ELEVENLABS_MODEL_RE = /^(eleven[_-]|elevenlabs|tts-1|eleven_)/i;

/** Peek the OpenAI-compatible body without consuming the downstream handler's stream. */
async function peekModel(req: Request): Promise<string> {
  try {
    const parsed = JSON.parse(await req.clone().text()) as { model?: unknown };
    return typeof parsed.model === "string" ? parsed.model : "";
  } catch {
    return "";
  }
}

app.post("/v1/chat/completions", async (c) => {
  // Provider-filtered: this endpoint only speaks Gemini, so a leaked or
  // foreign credential must never be handed to it.
  const st = await pick(new Set(), undefined, "gemini");
  if (!st) {
    return c.json({ error: { message: "No available Gemini API keys in pool." } }, 503);
  }
  return chatCompletions(c.req.raw);
});

app.post("/v1/audio/speech", async (c) => {
  const model = await peekModel(c.req.raw);
  if (ELEVENLABS_MODEL_RE.test(model)) {
    const st = await pick(new Set(), undefined, "elevenlabs");
    if (!st) {
      return c.json(
        { error: { message: "No available ElevenLabs API keys in pool." } },
        503,
      );
    }
    return serveElevenLabs(c.req.raw, st.key);
  }
  const st = await pick(new Set(), undefined, "gemini");
  if (!st) {
    return c.json({ error: { message: "No available Gemini API keys in pool." } }, 503);
  }
  return speech(c.req.raw);
});

app.post("/v1/embeddings", async (c) => {
  const st = await pick(new Set(), undefined, "gemini");
  if (!st) {
    return c.json({ error: { message: "No available Gemini API keys in pool." } }, 503);
  }
  return embeddings(c.req.raw);
});

app.get("/v1/models", async (c) => {
  const st = await pick(new Set(), undefined, "gemini");
  if (!st) {
    return c.json({ error: { message: "No available Gemini API keys in pool." } }, 503);
  }
  return models();
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

  const models = [...gemini.models, ...eleven, ...voices];
  return c.json({
    ok: true,
    count: models.length,
    models,
    source: gemini.source,
    cached: gemini.cached,
    degraded: gemini.degraded,
    degradedReason: gemini.degradedReason,
    providers: {
      gemini: gemini.models.length,
      elevenlabs: eleven.length + voices.length,
      voice: voices.length,
    },
    pricing: pricingMeta(),
  });
});

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

/**
 * Pool state plus one row per key. Moved off /pengatur/keys so the shell can
 * live there; `enabled`/`label` are merged in from the durable identities.
 */
app.get("/pengatur/keys/list", async (c) => {
  const providerFilter = c.req.query("provider");
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
  /* The console shows every key in full, so it used to call GET /raw once per
     row - 25 requests per render, each writing its own `keys.raw` audit row.
     Measured on the live ledger: 1,320 `keys.raw` rows out of 2,077 total, 63%
     of the trail, all of it page-view noise. `reveal=1` returns the whole page
     in one response and writes ONE audit row for the reveal. */
  if (c.req.query("reveal") === "1") {
    const rawById: Record<string, string> = {};
    for (const k of merged) {
      const raw = await rawKeyById(k.id);
      if (raw) rawById[k.id] = raw;
    }
    await auditRecordNow("keys.reveal", {
      actor: actorFrom(c.req.header("user-agent")),
      target: "pool",
      detail: { action: "reveal-page", revealed: Object.keys(rawById).length, requested: merged.length },
    });
    return c.json({ pool: snap, keys: merged, tiers: tierCounts(keys), knownTiers: KEY_TIERS, raw: rawById });
  }
  return c.json({ pool: snap, keys: merged, tiers: tierCounts(keys), knownTiers: KEY_TIERS });
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
  let body: { keys?: string[] | string; key?: string; provider?: string };
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

  const provider =
    typeof body.provider === "string" && body.provider.trim()
      ? body.provider.trim()
      : "gemini";

  const ids: string[] = [];
  let added = 0;
  for (const k of clean) {
    if (await addKey(k, provider)) {
      added++;
      ids.push(keyId(k));
    }
  }
  await auditRecordNow("keys.add", {
    actor: actorFrom(c.req.header("user-agent")),
    target: ids.join(","),
    detail: { received: clean.length, added, provider },
  });
  const durable = keyMaterialDurable();
  const warning = durable
    ? {}
    : { warning: "KEY_MATERIAL is not durable: keys added now survive until the next cold start only." };
  return c.json({ ok: true, received: clean.length, added, ids, durable, ...warning, pool: await snapshot() });
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
      const probe = await probeKey(raw);
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

/**
 * Reveal one raw key. Listings never carry raw material; this route exists so
 * an operator can copy a key they own. The path does not match any public
 * shell, so the `/pengatur/*` gate demands the admin token for it.
 */
app.get("/pengatur/keys/:id/raw", async (c) => {
  const id = c.req.param("id");
  const raw = await rawKeyById(id);
  if (!raw) return c.json({ error: { message: "No key with that id." } }, 404);
  await auditRecordNow("keys.raw", {
    actor: actorFrom(c.req.header("user-agent")),
    target: id,
    detail: { action: "reveal" },
  });
  return c.json({ ok: true, id, raw });
});

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
app.get("/pengatur/usage", (c) => c.html(USAGE_HTML));

/**
 * Ledger snapshot. Paged and filtered server-side so the browser never
 * downloads the whole ring.
 */
app.get("/pengatur/usage/data", (c) => {
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
});

/** Same filters as the console, one CSV file. */
app.get("/pengatur/usage/export.csv", (c) => {
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
});

/** Request-log console also answers on /pengatur/logs; same shell, same data. */
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
