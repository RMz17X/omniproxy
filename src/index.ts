/**
 * gemini-key-rotator — Hono gateway for a pool of Gemini API keys.
 *
 * Routes
 *   GET  /                      health + pool snapshot
 *   ANY  /v1beta/models/*       native Gemini passthrough
 *   POST /v1/chat/completions   OpenAI-compatible chat (stream + tools/search)
 *   POST /v1/audio/speech       OpenAI-compatible TTS -> WAV
 *   GET  /v1/models             OpenAI-compatible model list
 *   GET  /admin/keys            list pooled keys (masked)
 *   POST /admin/keys            add keys  { keys: ["AIza..."] }
 *   DELETE /admin/keys          remove key { key: "AIza..." }
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { cfg } from "./config.ts";
import { addKey, listKeys, removeKey, snapshot, storageMode } from "./pool.ts";
import { geminiPassthrough, speech } from "./gemini.ts";
import { chatCompletions, models } from "./openai.ts";

const app = new Hono();

app.use("*", cors());

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

app.use("/admin/*", async (c, next) => {
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
    service: "gemini-key-rotator",
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
app.get("/v1/models", () => models());

/* ---------- native Gemini passthrough ---------- */

app.all("/v1beta/models/*", (c) => geminiPassthrough(c.req.raw, new URL(c.req.url).pathname));

/* ---------- admin ---------- */

app.get("/admin/keys", async (c) => {
  const [keys, snap] = await Promise.all([listKeys(), snapshot()]);
  return c.json({ pool: snap, keys });
});

app.post("/admin/keys", async (c) => {
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

  let added = 0;
  for (const k of clean) {
    if (await addKey(k)) added++;
  }
  return c.json({ ok: true, received: clean.length, added, pool: await snapshot() });
});

app.delete("/admin/keys", async (c) => {
  let body: { key?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  if (!body.key) return c.json({ error: { message: "`key` is required." } }, 400);
  await removeKey(body.key);
  return c.json({ ok: true, pool: await snapshot() });
});

app.notFound((c) =>
  c.json({ error: { message: `No route for ${c.req.method} ${new URL(c.req.url).pathname}` } }, 404),
);

app.onError((e, c) => {
  console.error("[gkr] unhandled:", e);
  return c.json({ error: { message: e.message } }, 500);
});

/* ---------- bootstrap ---------- */

const seed = (process.env.GEMINI_API_KEYS ?? "")
  .split(/[\s,]+/)
  .map((s) => s.trim())
  .filter(Boolean);

for (const k of seed) await addKey(k);

const port = Number(process.env.PORT ?? 3000);

console.log(
  `[gkr] up on :${port} storage=${storageMode} seed=${seed.length} admin=${cfg.adminToken ? "on" : "off"}`,
);

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 255,
};
