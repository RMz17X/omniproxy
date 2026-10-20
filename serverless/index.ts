import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import app from "../src/app.ts";
import { hydrate, storageMode } from "../src/pool.ts";

/**
 * Serverless cold-start hydration.
 *
 * Vercel instances are ephemeral, so the pool is rebuilt from
 * GEMINI_API_KEYS on every fresh instance, with the durable key identity
 * overlaid from Postgres when DATABASE_URL is configured. Hydration is
 * idempotent and awaited before the listener is handed out, so no request
 * can observe a half-filled pool.
 */
let hydrated: Promise<number> | null = null;

function ensureHydrated(): Promise<number> {
  if (!hydrated) {
    hydrated = hydrate().then((n) => {
      console.log(`[geminesx] cold-start hydrated ${n} keys storage=${storageMode}`);
      return n;
    });
  }
  return hydrated;
}

const listener = getRequestListener(app.fetch);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ensureHydrated();
  return listener(req, res);
}