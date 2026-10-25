/**
 * Operator-tunable gateway settings.
 *
 * Env vars stay the default; a row in `gateway_settings` overrides one at
 * runtime, so the console can change a value without a redeploy (env changes
 * on Vercel need one, and the operator asked for the rotation cap to be
 * settable from the web UI).
 *
 * Values are cached in process for a few seconds. Serverless instances scale
 * to zero, so a round trip per request would tax every call, and a stale cap
 * for the few seconds a save takes to propagate is harmless.
 */

import { cfg } from "./config.ts";
import { dbEnabled, sql } from "./db.ts";

const CACHE_TTL_MS = 10_000;

let cache: { at: number; values: Map<string, string> } = { at: 0, values: new Map() };

async function load(): Promise<Map<string, string>> {
  if (Date.now() - cache.at < CACHE_TTL_MS) return cache.values;
  const values = new Map<string, string>();
  if (dbEnabled()) {
    const res = await sql<{ key: string; value: string }>("select key, value from gateway_settings", []);
    if (res.ok) for (const row of res.rows) values.set(row.key, row.value);
  }
  cache = { at: Date.now(), values };
  return values;
}

/** The stored override for `key`, or null when the env default stands. */
export async function getSetting(key: string): Promise<string | null> {
  return (await load()).get(key) ?? null;
}

/** Persist an override. Throws when storage is disabled or the write fails. */
export async function setSetting(key: string, value: string): Promise<void> {
  if (!dbEnabled()) throw new Error("storage disabled: no DATABASE_URL");
  const res = await sql(
    "insert into gateway_settings (key, value, updated_at) values ($1, $2, now())" +
      " on conflict (key) do update set value = excluded.value, updated_at = now()",
    [key, value],
  );
  if (!res.ok) throw new Error(res.message ?? "write failed");
  cache.values.set(key, value);
  cache.at = Date.now();
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The setting key holding the rotation cap. */
export const MAX_ATTEMPTS_KEY = "max_key_attempts";

/** Bounds the console enforces, so a typo cannot stall every request. */
export const MAX_ATTEMPTS_RANGE = { min: 1, max: 50 } as const;

/**
 * How many keys one request may rotate through before the pool gives up.
 *
 * 10 per operator policy (a 429 must rotate to another still-valid key), the
 * env var remains the fallback for a memory-mode deployment with no database,
 * and the console value wins over both.
 */
export async function rotationCap(): Promise<number> {
  const raw = await getSetting(MAX_ATTEMPTS_KEY);
  const n = raw === null ? cfg.maxAttempts : Number(raw);
  return Number.isFinite(n) ? clamp(Math.round(n), MAX_ATTEMPTS_RANGE.min, MAX_ATTEMPTS_RANGE.max) : cfg.maxAttempts;
}

/** The effective cap plus where it came from, for the settings page. */
export async function rotationSetting(): Promise<{
  maxKeyAttempts: number;
  envDefault: number;
  stored: boolean;
  min: number;
  max: number;
}> {
  const stored = (await getSetting(MAX_ATTEMPTS_KEY)) !== null;
  return {
    maxKeyAttempts: await rotationCap(),
    envDefault: cfg.maxAttempts,
    stored,
    min: MAX_ATTEMPTS_RANGE.min,
    max: MAX_ATTEMPTS_RANGE.max,
  };
}
