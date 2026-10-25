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
import type { KeyStatus, KeyTier, RetirementReason } from "./pool.ts";
import type { QuotaDetail, TierEvidence } from "./verdict.ts";

export type KeyIdentity = {
  id: string;
  /** Masked display form. The raw key is never persisted in this table. */
  masked: string;
  provider: string;
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
   * epoch ms of the last time this key served a request. Durable because
   * `pick()` orders candidates by it: a field nothing writes is erased on
   * every cold start, and serverless scales to zero, so the LRU that spreads
   * load across the pool would reset and the first keys in the map would be
   * re-fired until their in-memory stamp caught up.
   */
  lastUsed: number;
  /**
   * model -> epoch ms until which the key has no allowance for it. Durable
   * because a free-tier daily window outlives the process: a cold start that
   * forgot the refusal would re-fire the same key at the same model.
   */
  modelRefusals: Record<string, number>;
  /**
   * Observation instant (epoch ms) of the retirement on record; 0 when the
   * credential is not retired. Compared against a verdict's own `observedAt`
   * so the strongest evidence wins instead of the last writer.
   */
  retiredAt: number;
  /** verdict that put the credential out: `invalid`, `leaked`, `zero_quota` */
  retiredReason: string | null;
};

type KeyRow = {
  id: string;
  masked: string;
  provider?: string | null;
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
  last_used: string | Date | null;
  model_refusals: unknown;
  retired_at: string | Date | null;
  retired_reason: string | null;
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
  provider: (typeof r.provider === "string" && r.provider.trim()) ? r.provider.trim() : "gemini",
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
  lastUsed: toEpoch(r.last_used),
  modelRefusals: toJson<Record<string, number>>(r.model_refusals) ?? {},
  retiredAt: toEpoch(r.retired_at),
  retiredReason: r.retired_reason,
});

/** Rows ordered by id. Empty when the database is disabled. */
export async function loadKeys(): Promise<KeyIdentity[]> {
  if (!dbEnabled()) return [];
  const res = await sql<KeyRow>(
    `select id, masked, provider, label, owner, plan, enabled, fail_count, cooldown_until,
            status, plan_evidence, quota_state, retry_after_at,
            plan_validated_at, last_checked_at, last_used, model_refusals,
            retired_at, retired_reason
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
  provider?: string;
  plan?: KeyTier;
  label?: string | null;
  owner?: string | null;
  /**
   * Park deadline handed over by the sender. Written in the same statement as
   * the row so a cold start restores the park; `setCooldown` would race the
   * fire-and-forget insert and silently update zero rows.
   */
  cooldownUntil?: number;
}): Promise<void> {
  if (!dbEnabled()) return;
  await sql(
    `insert into keys (id, masked, provider, plan, label, owner, cooldown_until)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (id) do update
        set masked   = excluded.masked,
            provider = excluded.provider,
            plan     = excluded.plan,
            cooldown_until = greatest(keys.cooldown_until, excluded.cooldown_until)`,
    [
      identity.id,
      identity.masked,
      identity.provider ?? "gemini",
      identity.plan ?? "unknown",
      identity.label ?? null,
      identity.owner ?? null,
      deadline(identity.cooldownUntil ?? 0),
    ],
  );
}

export async function setEnabled(id: string, enabled: boolean): Promise<void> {
  if (!dbEnabled()) return;
  await sql(`update keys set enabled = $2 where id = $1`, [id, enabled]);
}

/** Operator override. Does not mark the plan validated — and clears any
 * previous validation, so an overridden plan never still presents as
 * upstream-validated with stale evidence. */
export async function setPlan(id: string, plan: KeyTier): Promise<void> {
  if (!dbEnabled()) return;
  await sql(
    `update keys set plan = $2, plan_validated_at = null, plan_evidence = null where id = $1`,
    [id, plan],
  );
}

/**
 * Durable retirement. The verdict that killed the credential is the source of
 * truth, so the write carries its observation instant instead of the wall
 * clock: a slower statement can never shorten a newer retirement. Only a
 * STRICTLY newer retirement replaces the one on record: with `<=`, two
 * verdicts landing in the same millisecond could overwrite each other, and
 * the in-memory pool's `outranked` guard already uses strict ordering.
 */
export async function retire(
  id: string,
  observedAt: number,
  reason: RetirementReason,
): Promise<void> {
  if (!dbEnabled()) return;
  const at = new Date(observedAt).toISOString();
  await sql(
    `update keys
        set enabled = false,
            status = 'dead',
            retired_at = case when retired_at is null or retired_at < $2::timestamptz
                              then $2::timestamptz else retired_at end,
            retired_reason = case when retired_at is null or retired_at < $2::timestamptz
                                  then $3 else retired_reason end
      where id = $1`,
    [id, at, reason],
  );
}

/**
 * Physically delete every row whose verdict was `invalid` or `leaked`.
 *
 * A retired credential is a dead row that can never serve traffic again and
 * only inflates the pool snapshot, so it is removed rather than kept as a
 * tombstone. `zero_quota` rows are NOT touched, even though they also carry
 * status `dead`: a zero-quota project can regain allocation, and deleting
 * its material made revival impossible. `quota_exhausted` and `cooling` are
 * likewise untouched. Rows with no recorded reason are left alone too —
 * purging an unclassified row would delete a credential nobody classified.
 *
 * All three statements use the SAME filter (status + reason), so a key that
 * becomes dead between the id-select and the deletes cannot end up deleted
 * from `keys` while its material survives, or vice versa: the deletes only
 * ever touch the ids selected under that filter.
 *
 * The audit row keeps the census (how many, which reason) so the removal is
 * still traceable without keeping 800 dead keys in the hot table.
 */
export async function purgeDead(): Promise<{ removed: number; byReason: Record<string, number> }> {
  if (!dbEnabled()) return { removed: 0, byReason: {} };
  const FILTER = `status = 'dead' and retired_reason in ('invalid', 'leaked')`;
  const census = await sql<{ retired_reason: string | null; n: number }>(
    `select retired_reason, count(*)::int as n
       from keys
      where ${FILTER}
      group by 1`,
  );
  const byReason: Record<string, number> = {};
  if (census.ok) for (const row of census.rows) byReason[row.retired_reason ?? "unset"] = row.n;
  const ids = await sql<{ id: string }>(`select id from keys where ${FILTER}`);
  if (!ids.ok || ids.rows.length === 0) return { removed: 0, byReason };
  const doomed = ids.rows.map((r) => r.id);
  /* key_material holds the raw credential; delete it in the same pass or the
     secret outlives the row that owned it. Same id set, same filter. */
  await sql(`delete from key_material where id = any($1::text[])`, [doomed]);
  await sql(`delete from keys where id = any($1::text[])`, [doomed]);
  /* The driver reports no row count for a bare DELETE, so the census is the
     number removed. */
  return { removed: doomed.length, byReason };
}

/**
 * Clear a retirement and set the observed status, but only when the verdict
 * carrying it is strictly newer than the retirement on record. A row retired
 * before `retired_at` existed carries NULL and counts as infinitely old, so
 * the legacy 429 rows are still revivable.
 */
export async function revive(
  id: string,
  observedAt: number,
  status: KeyStatus,
): Promise<void> {
  if (!dbEnabled()) return;
  await sql(
    `update keys
        set enabled = true,
            status = $3,
            retired_at = null,
            retired_reason = null
      where id = $1
        and (retired_at is null or retired_at < $2::timestamptz)`,
    [id, new Date(observedAt).toISOString(), status],
  );
}

/** Status write guarded the same way: never overwrite a newer retirement. */
export async function setStatus(
  id: string,
  status: KeyStatus,
  observedAt: number,
): Promise<void> {
  if (!dbEnabled()) return;
  await sql(
    `update keys set status = $2
      where id = $1
        and (retired_at is null or retired_at < $3::timestamptz)`,
    [id, status, new Date(observedAt).toISOString()],
  );
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

export async function setLastUsed(id: string, at: number): Promise<void> {
  if (!dbEnabled()) return;
  const stamp = at > 0 ? new Date(at).toISOString() : null;
  await sql(`update keys set last_used = $2 where id = $1`, [id, stamp]);
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
  // Direct callers used to leave a live raw key behind: deleteKey alone
  // removed the identity row but not key_material. Pair them here so the
  // material cannot outlive the row that owned it.
  await sql(`delete from key_material where id = $1`, [id]);
}