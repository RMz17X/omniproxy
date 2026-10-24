/**
 * Durable key material.
 *
 * `keys` carries the masked identity of a key; this module owns the other half
 * — the raw value itself — so a key pushed by an external hunter survives a
 * cold start.
 *
 * STORAGE DECISION: plaintext, deliberately. An encryption key would live in
 * the same environment as `DATABASE_URL`, so it would add a class of failure
 * (rotate the secret, every row becomes unreadable) without protecting against
 * anyone who can already read the environment. Anyone who can read
 * `key_material` can read every live API key. See docs/F6.md.
 *
 * Every write is fire-and-forget (`sqlLater`), the same contract as
 * `persistIdentity`: never on the request critical path. With DATABASE_URL
 * unset `materialEnabled()` is false and nothing here touches the network.
 */

import { sql, sqlLater, dbEnabled } from "./db.ts";
import { log } from "./log.ts";

export type MaterialRow = { id: string; raw_key: string | null; provider?: string | null };

/** True when there is somewhere durable to write. Delegates, no env of its own. */
export function materialEnabled(): boolean {
  return dbEnabled();
}

/**
 * Every stored key, `id -> raw`. Never throws: a disabled database, an open
 * breaker, a timeout or a missing table all yield an empty map plus one warn
 * line. The caller keeps whatever the environment already seeded.
 */
export async function loadMaterial(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!dbEnabled()) return out;

  const res = await sql<MaterialRow>(`select id, raw_key from key_material`);
  if (!res.ok) {
    log("warn", "key_material.load_failed", { reason: res.reason });
    return out;
  }

  for (const row of res.rows) {
    const raw = typeof row.raw_key === "string" ? row.raw_key.trim() : "";
    if (!raw) continue;
    out.set(row.id, raw);
  }
  return out;
}

/**
 * Every stored key with its provider, `id -> { raw, provider }`.
 *
 * `loadMaterial()` drops the provider because most callers only need the raw
 * value; hydrate() is the exception — it rebuilds the pool and must seed each
 * key under the provider that owns it, or a whatstoken key comes back as
 * gemini on the next cold start.
 */
export async function loadMaterialEntries(): Promise<Map<string, { raw: string; provider: string }>> {
  const out = new Map<string, { raw: string; provider: string }>();
  if (!dbEnabled()) return out;

  const res = await sql<MaterialRow>(`select id, raw_key, provider from key_material`);
  if (!res.ok) {
    log("warn", "key_material.load_failed", { reason: res.reason });
    return out;
  }

  for (const row of res.rows) {
    const raw = typeof row.raw_key === "string" ? row.raw_key.trim() : "";
    if (!raw) continue;
    const provider = typeof row.provider === "string" && row.provider.trim() ? row.provider.trim() : "gemini";
    out.set(row.id, { raw, provider });
  }
  return out;
}

/**
 * Insert or replace one key's raw value. Fire and forget: the pool has already
 * accepted the key in memory by the time this runs. The raw value is a bind
 * parameter and is never logged.
 */
export function saveMaterial(id: string, raw: string, provider = "gemini"): void {
  if (!dbEnabled()) return;
  sqlLater(
    `insert into key_material (id, raw_key, provider) values ($1, $2, $3)
     on conflict (id) do update
       set raw_key = excluded.raw_key, provider = excluded.provider, updated_at = now()`,
    [id, raw, provider],
  );
}

/**
 * The same write, awaited.
 *
 * `saveMaterial` is fire-and-forget so the request path never waits on
 * Postgres. On a serverless runtime that is a durability hole: the instance
 * can be frozen or recycled the moment the response is returned, and the
 * in-flight insert is dropped — a key the console reports as durable
 * (`durable: true`) never reaches `key_material`, so the next cold start
 * rebuilds a pool without it. Callers that promise durability (the key-sync
 * endpoint) must use this variant and await it before answering.
 */
export async function saveMaterialNow(id: string, raw: string, provider = "gemini"): Promise<void> {
  if (!dbEnabled()) return;
  await sql(
    `insert into key_material (id, raw_key, provider) values ($1, $2, $3)
     on conflict (id) do update
       set raw_key = excluded.raw_key, provider = excluded.provider, updated_at = now()`,
    [id, raw, provider],
  );
}

/** Drop the raw value alongside the identity row. Fire and forget. */
export function deleteMaterial(id: string): void {
  if (!dbEnabled()) return;
  sqlLater(`delete from key_material where id = $1`, [id]);
}