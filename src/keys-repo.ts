/**
 * Key identity repository.
 *
 * The pool keeps the hot state (cooldown, pacing, failure counting) in memory;
 * this module owns the durable half: which keys exist, their operator-assigned
 * plan, the last upstream-validated verdict, and the enable flag. Every write
 * is fire-and-forget and parameterised — no value is ever interpolated into SQL
 * text.
 *
 * With DATABASE_URL unset every function is a no-op: `loadKeys()` returns an
 * empty list and the caller falls back to `GEMINI_API_KEYS`.
 */

import { sql, dbEnabled } from "./db.ts";
import type { KeyStatus, KeyTier } from "./pool.ts";
import type { QuotaDetail, TierEvidence } from "./verdict.ts";

export type KeyIdentity = {
  id: string;
  /** Masked display form. The raw key is never persisted in this table. */
  masked: string;
  plan: KeyTier;
  enabled: boolean;
  label: string | null;
  owner: string | null;
  failCount: number;
  /** Epoch ms until which the key is parked; 0 when it is selectable. */
  cooldownUntil: number;
  status: KeyStatus;
  /** the stored plan came from an upstream answer, not an operator guess */
  planValidated: boolean;
  planEvidence: TierEvidence | null;
  quota: QuotaDetail | null;
  /** epoch ms of the last known quota/park deadline; 0 when none is known */
  retryAfterAt: number;
  lastCheckedAt: number;
  /**
   * model -> epoch ms until which the key has no allowance for it. Durable
   * because a free-tier daily window outlives the process: a cold start that
   * forgot the refusal would re-fire the same key at the same model.
   */
  modelRefusals: Record<string, number>;
};

type KeyRow = {
  id: string;
  masked: string;
  label: string | null;
  owner: string | null;
  plan: string;
  enabled: boolean;
  fail_count: number | string;
  cooldown_until: string | Date | null;
  status: string | null;
  plan_evidence: unknown;
  quota_state: unknown;
  retry_after_at: string | Date | null;
  plan_validated_at: string | Date | null;
  last_checked_at: string | Date | null;
  model_refusals: unknown;
};

const isTier = (v: string): v is KeyTier => v === "free" || v === "paid" || v === "pro";

const STATUSES: KeyStatus[] = [
  "unknown",
  "ready",
  "cooling",
  "quota_exhausted",
  "dead",
  "unverified",
];

const isStatus = (v: string): v is KeyStatus => (STATUSES as string[]).includes(v);

/** Drivers disagree on timestamptz: some hand back Date, some an ISO string. */
const toEpoch = (v: string | Date | null): number => {
  if (!v) return 0;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : 0;
};

/** jsonb arrives as an object from some drivers and as text from others. */
function toJson<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  if (typeof v === "object") return v as T;
  return null;
}

const toIdentity = (r: KeyRow): KeyIdentity => ({
  id: r.id,
  masked: r.masked,
  plan: isTier(r.plan) ? r.plan : "unknown",
  enabled: r.enabled,
  label: r.label,
  owner: r.owner,
  failCount: Number(r.fail_count) || 0,
  cooldownUntil: toEpoch(r.cooldown_until),
  status: r.status !== null && isStatus(r.status) ? r.status : "unknown",
  planValidated: toEpoch(r.plan_validated_at) > 0,
  planEvidence: toJson<TierEvidence>(r.plan_evidence),
  quota: toJson<QuotaDetail>(r.quota_state),
  retryAfterAt: toEpoch(r.retry_after_at),
  lastCheckedAt: toEpoch(r.last_checked_at),
  modelRefusals: toJson<Record<string, number>>(r.model_refusals) ?? {},
});

/** Rows ordered by id. Empty when the database is disabled. */
export async function loadKeys(): Promise<KeyIdentity[]> {
  if (!dbEnabled()) return [];
  const res = await sql<KeyRow>(
    `select id, masked, label, owner, plan, enabled, fail_count, cooldown_until,
            status, plan_evidence, quota_state, retry_after_at,
            plan_validated_at, last_checked_at, model_refusals
       from keys
      order by id`,
  );
  return res.ok ? res.rows.map(toIdentity) : [];
}

/** `at <= now` clears the column: no deadline is better than a stale one. */
const deadline = (at: number): string | null =>
  at > Date.now() ? new Date(at).toISOString() : null;

/**
 * Persist a cooldown deadline so a serverless cold start does not forget that
 * the key is parked. `until <= now` clears the column: the key is selectable.
 */
export async function setCooldown(id: string, until: number): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`update keys set cooldown_until = $2 where id = $1`, [id, deadline(until)]);
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

/** Operator override. Does not mark the plan validated. */
export async function setPlan(id: string, plan: KeyTier): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`update keys set plan = $2 where id = $1`, [id, plan]);
}

export async function setStatus(id: string, status: KeyStatus): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`update keys set status = $2 where id = $1`, [id, status]);
}

/** Store or clear the structured quota shape behind the last 429. */
export async function setQuotaState(id: string, quota: QuotaDetail | null): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`update keys set quota_state = $2::jsonb where id = $1`, [
    id,
    quota === null ? null : JSON.stringify(quota),
  ]);
}

/**
 * Persist the per-model refusal deadlines. Written on every quota verdict so a
 * cold start cannot re-fire a key at a model whose daily window is spent.
 */
export async function setModelRefusals(
  id: string,
  refusals: Record<string, number>,
): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`update keys set model_refusals = $2::jsonb where id = $1`, [
    id,
    JSON.stringify(refusals),
  ]);
}

export async function setRetryAfter(id: string, at: number): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`update keys set retry_after_at = $2 where id = $1`, [id, deadline(at)]);
}

export async function setLastCheckedAt(id: string, at: number): Promise<void> {
  if (!dbEnabled()) return;
  const stamp = at > 0 ? new Date(at).toISOString() : null;
  await sql(`update keys set last_checked_at = $2 where id = $1`, [id, stamp]);
}

/** Record an upstream-validated plan, its evidence, and the observation time. */
export async function setValidatedPlan(
  id: string,
  plan: KeyTier,
  evidence: TierEvidence,
): Promise<void> {
  if (!dbEnabled()) return;
  await sql(
    `update keys
        set plan = $2,
            plan_evidence = $3::jsonb,
            plan_validated_at = now()
      where id = $1`,
    [id, plan, JSON.stringify(evidence)],
  );
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