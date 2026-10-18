import app from "./app.ts";
import { addKey, storageMode } from "./pool.ts";
import { cfg } from "./config.ts";

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
