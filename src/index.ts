import app from "./app.ts";
import { hydrate, storageMode } from "./pool.ts";
import { cfg } from "./config.ts";

/* ---------- bootstrap ---------- */

// One cold-start read. The pool is memory-first; Postgres only supplies the
// durable identity overlay when DATABASE_URL is configured.
const seeded = await hydrate();

const port = Number(process.env.PORT ?? 3000);

console.log(
  `[geminesx] up on :${port} storage=${storageMode} seed=${seeded} admin=${cfg.adminToken ? "on" : "off"}`,
);

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 255,
};