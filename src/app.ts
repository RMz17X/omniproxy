/**
 * geminesx — Hono gateway for a pool of Gemini API keys.
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
import { addKey, KEY_TIERS, keyId, listKeys, mark429, markHealthy, markInvalid, rawKeyById, removeKey, removeKeyById, setTierById, snapshot, storageMode, tierCounts, type KeyTier } from "./pool.ts";
import { ADMIN_HTML } from "./admin-ui.ts";
import { buildFaviconIco, FAVICON_SVG } from "./favicon.ts";
import { MODELS_HTML } from "./models-ui.ts";
import { listLiveModels, pricingMeta, testModel } from "./models.ts";
import { probeKey } from "./probe.ts";
import { deflateSync } from "node:zlib";
import { geminiPassthrough, speech } from "./gemini.ts";
import { chatCompletions, embeddings, models } from "./openai.ts";
import {
  beginUsage,
  commitUsage,
  noteUsage,
  routeOf,
  toCsv,
  usageOverview,
  type RowFilter,
} from "./usage.ts";
import { USAGE_HTML } from "./usage-ui.ts";

const app = new Hono();

app.use("*", cors());

/* ---------- usage ledger (in-memory, no Redis) ---------- */

/**
 * One row per gateway request. Deliberately process-local: the ledger is
 * operator telemetry, so it dies with the instance and never consumes a single
 * Upstash command. Non-stream responses are committed here; streaming handlers
 * call `finalizeStream()` themselves because their token counts are only final
 * once the last byte leaves.
 */
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const route = routeOf(path);
  if (!route) return next();

  beginUsage(c.req.raw, path, route);
  await next();
  commitUsage(c.req.raw, c.res.status);
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

app.use("/pengatur/*", async (c, next) => {
  // The console shells carry no data and must load before a token exists;
  // /pengatur and /pengatur/models are the only admin paths reachable
  // without credentials.
  const adminPath = new URL(c.req.url).pathname;
  if (adminPath === "/pengatur" || adminPath === "/pengatur/models" || adminPath === "/pengatur/usage") return next();
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

app.get("/", async (c) => {
  const snap = await snapshot();
  return c.json({
    ok: true,
    service: "geminesx",
    storage: storageMode,
    pool: snap,
    defaults: {
      model: cfg.defaultModel,
      tts: cfg.defaultTtsModel,
      voice: cfg.defaultVoice,
      search: cfg.searchModel,
    },
  });
});

app.get("/health", async (c) => {
  const snap = await snapshot();
  return c.json({ ok: snap.ready > 0, pool: snap }, snap.ready > 0 ? 200 : 503);
});

/* ---------- OpenAI-compatible ---------- */

app.post("/v1/chat/completions", (c) => chatCompletions(c.req.raw));
app.post("/v1/audio/speech", (c) => speech(c.req.raw));
app.post("/v1/embeddings", (c) => embeddings(c.req.raw));
app.get("/v1/models", () => models());

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

/** Model inventory console. The shell is public; its data endpoints are not. */
app.get("/pengatur/models", (c) => c.html(MODELS_HTML));

/**
 * Live model list. Queried from the Generative Language API with a pooled key
 * and cached briefly; pricing/free-tier columns come from the static catalog.
 */
app.get("/pengatur/models/list", async (c) => {
  const force = new URL(c.req.url).searchParams.get("refresh") === "1";
  try {
    const { models, source, cached } = await listLiveModels(force);
    return c.json({
      ok: true,
      count: models.length,
      models,
      source,
      cached,
      pricing: pricingMeta(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as Error & { code?: string }).code === "empty_pool" ? 503 : 502;
    return c.json({ error: { message } }, status);
  }
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

app.get("/pengatur/keys", async (c) => {
  const [keys, snap] = await Promise.all([listKeys(), snapshot()]);
  return c.json({ pool: snap, keys, tiers: tierCounts(keys), knownTiers: KEY_TIERS });
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
  const keys = await listKeys();
  return c.json({ ok: true, tier, updated, tiers: tierCounts(keys), pool: await snapshot() });
});

app.post("/pengatur/keys", async (c) => {
  let body: { keys?: string[] | string; key?: string };
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

  const ids: string[] = [];
  let added = 0;
  for (const k of clean) {
    if (await addKey(k)) {
      added++;
      ids.push(keyId(k));
    }
  }
  return c.json({ ok: true, received: clean.length, added, ids, pool: await snapshot() });
});

app.delete("/pengatur/keys", async (c) => {
  let body: { key?: string; id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  // `id` is the handle the console holds (sha256 prefix); `key` stays for curl.
  if (typeof body.id === "string" && body.id) {
    const removed = await removeKeyById(body.id);
    if (!removed) return c.json({ error: { message: "No key with that id." } }, 404);
    return c.json({ ok: true, pool: await snapshot() });
  }
  if (typeof body.key !== "string" || !body.key) {
    return c.json({ error: { message: "`id` or `key` is required." } }, 400);
  }
  await removeKey(body.key);
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
  let body: { id?: string; key?: string; model?: string };
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

  const model = typeof body.model === "string" && body.model ? body.model : undefined;
  const result = await probeKey(raw, model);

  // Fold the verdict into pool state only for keys the pool actually holds.
  const held = id ? Boolean(await rawKeyById(id)) : false;
  let applied = "none";
  if (held) {
    if (result.status === "ok") {
      await markHealthy(raw);
      applied = "revived";
    } else if (result.status === "rate_limited") {
      await mark429(raw, Math.max(cfg.cooldownMs, result.retryAfterMs));
      applied = "cooling";
    } else if (result.status === "zero_quota" || result.status === "invalid") {
      await markInvalid(raw);
      applied = "retired";
    } else if (result.status === "server_error") {
      await mark429(raw, cfg.serverErrCooldownMs);
      applied = "cooling";
    }
  }

  return c.json({ ok: true, id, applied, probe: result, pool: await snapshot() });
});

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
      let applied = "none";
      if (probe.status === "ok") {
        await markHealthy(raw);
        applied = "revived";
      } else if (probe.status === "rate_limited") {
        await mark429(raw, Math.max(cfg.cooldownMs, probe.retryAfterMs));
        applied = "cooling";
      } else if (probe.status === "zero_quota" || probe.status === "invalid") {
        await markInvalid(raw);
        applied = "retired";
      } else if (probe.status === "server_error") {
        await mark429(raw, cfg.serverErrCooldownMs);
        applied = "cooling";
      }
      results.push({ id: k.id, key: k.key, probe, applied });
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, target.length) }, worker));
  return c.json({ ok: true, tested: results.length, results, pool: await snapshot() });
});

app.notFound((c) =>
  c.json({ error: { message: `No route for ${c.req.method} ${new URL(c.req.url).pathname}` } }, 404),
);

app.onError((e, c) => {
  console.error("[geminesx] unhandled:", e);
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
      "content-disposition": `attachment; filename="geminesx-usage-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

export default app;
