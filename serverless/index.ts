import { getRequestListener } from "@hono/node-server";
import app from "../src/app.ts";
import { addKey, storageMode } from "../src/pool.ts";

/**
 * Serverless cold-start seeding.
 *
 * Vercel instances are ephemeral, so the pool is hydrated from
 * GEMINI_API_KEYS on every fresh instance. Seeding is idempotent and
 * awaited before the listener is handed out, so no request can observe
 * a half-filled pool.
 */
const seed = (process.env.GEMINI_API_KEYS ?? "")
  .split(/[\s,]+/)
  .map((s) => s.trim())
  .filter(Boolean);

let hydrated: Promise<void> | null = null;

function hydrate(): Promise<void> {
  if (!hydrated) {
    hydrated = (async () => {
      for (const k of seed) await addKey(k);
      console.log(`[gkr] cold-start seeded ${seed.length} keys storage=${storageMode}`);
    })();
  }
  return hydrated;
}

const listener = getRequestListener(app.fetch);

export default async function handler(req: any, res: any) {
  await hydrate();
  return listener(req, res);
}
