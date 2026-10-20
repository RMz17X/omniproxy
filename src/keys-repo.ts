/**
 * Key identity repository.
 *
 * The pool keeps the hot state (cooldown, pacing, failure counting) in memory;
 * this module owns the durable half: which keys exist, their operator-assigned
 * plan, and the enable flag. Every write is fire-and-forget and parameterised —
 * no value is ever interpolated into SQL text.
 *
 * With DATABASE_URL unset every function is a no-op: `loadKeys()` returns an
 * empty list and the caller falls back to `GEMINI_API_KEYS`.
 */

import { sql, dbEnabled } from "./db.ts";
import type { KeyTier } from "./pool.ts";

export type KeyIdentity = {
  id: string;
  /** Masked display form. The raw key is never persisted in this table. */
  masked: string;
  plan: KeyTier;
  enabled: boolean;
  label: string | null;
  owner: string | null;
  failCount: number;
};

type KeyRow = {
  id: string;
  masked: string;
  label: string | null;
  owner: string | null;
  plan: string;
  enabled: boolean;
  fail_count: number | string;
};

const isTier = (v: string): v is KeyTier => v === "free" || v === "paid" || v === "pro";

const toIdentity = (r: KeyRow): KeyIdentity => ({
  id: r.id,
  masked: r.masked,
  plan: isTier(r.plan) ? r.plan : "unknown",
  enabled: r.enabled,
  label: r.label,
  owner: r.owner,
  failCount: Number(r.fail_count) || 0,
});

/** Rows ordered by id. Empty when the database is disabled. */
export async function loadKeys(): Promise<KeyIdentity[]> {
  if (!dbEnabled()) return [];
  const res = await sql<KeyRow>(
    `select id, masked, label, owner, plan, enabled, fail_count
       from keys
      order by id`,
  );
  return res.ok ? res.rows.map(toIdentity) : [];
}

/** Insert or refresh the durable identity of one key. Never throws. */
export async function upsertKey(identity: {
  id: string;
  masked: string;
  plan?: KeyTier;
  label?: string | null;
  owner?: string | null;
}): Promise<void> {
  if (!dbEnabled()) return;
  await sql(
    `insert into keys (id, masked, plan, label, owner)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update
        set masked = excluded.masked,
            plan   = excluded.plan`,
    [
      identity.id,
      identity.masked,
      identity.plan ?? "unknown",
      identity.label ?? null,
      identity.owner ?? null,
    ],
  );
}

export async function setEnabled(id: string, enabled: boolean): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`update keys set enabled = $2 where id = $1`, [id, enabled]);
}

export async function setPlan(id: string, plan: KeyTier): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`update keys set plan = $2 where id = $1`, [id, plan]);
}

export async function touchLastSeen(id: string): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`update keys set last_seen_at = now() where id = $1`, [id]);
}

export async function bumpFailCount(id: string): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`update keys set fail_count = fail_count + 1 where id = $1`, [id]);
}

export async function deleteKey(id: string): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`delete from keys where id = $1`, [id]);
}