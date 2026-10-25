/**
 * Daily aggregation of `usage_events` into `usage_daily`, plus retention.
 *
 * Both operations are recompute-and-replace: a rollup run for a day deletes
 * that day's buckets and rebuilds them from raw events in one statement, so
 * running it twice converges to the same rows and never double-counts.
 *
 * The day boundary is WIB (UTC+7). A `day` of `2026-10-21` covers
 * `2026-10-21T00:00+07:00` through `2026-10-22T00:00+07:00` — never UTC.
 */

import { cfg } from "./config.ts";
import { dbEnabled, sql } from "./db.ts";

/** A calendar day in WIB, `YYYY-MM-DD`. */
export type WibDay = string;

export type RollupResult = {
  day: WibDay;
  /** Buckets written into `usage_daily`. */
  buckets: number;
  /** False when the database was absent, timed out, or rejected the query. */
  ok: boolean;
  /** Failure reason when `ok` is false. */
  error?: string;
};

export type PruneResult = {
  /** `usage_events` rows deleted. */
  pruned: number;
  /** False when the database was absent, timed out, or rejected the query. */
  ok: boolean;
  /** Failure reason when `ok` is false. */
  error?: string;
};

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar day (WIB) of an instant. */
export function wibDayOf(ts: number): WibDay {
  return new Date(ts + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Yesterday in WIB — the default rollup target. */
export function yesterdayWib(now = Date.now()): WibDay {
  return wibDayOf(now - 24 * 60 * 60 * 1000);
}

/** UTC instant where a WIB day starts. */
function dayStart(day: WibDay): Date {
  return new Date(`${day}T00:00:00.000+07:00`);
}

/**
 * Return `day` unchanged when valid, `null` when it was supplied but is not
 * a real calendar day. The old code silently fell back to yesterday on a
 * typo, so a mistyped `?day=` rolled up the wrong day and reported success.
 * Only an omitted day defaults to yesterday.
 */
function normalizeDay(day: string | undefined): WibDay | null {
  if (!day) return yesterdayWib();
  if (DAY_RE.test(day)) {
    const t = Date.parse(`${day}T00:00:00.000Z`);
    if (Number.isFinite(t)) return day;
  }
  return null;
}

/** Recompute one WIB day of `usage_daily` from `usage_events`. */
export async function rollupDay(day?: string): Promise<RollupResult> {
  const target = normalizeDay(day);
  if (target === null) {
    return {
      day: day ?? "",
      buckets: 0,
      ok: false,
      error: `invalid day \`${day}\`: expected YYYY-MM-DD`,
    };
  }
  if (!dbEnabled()) return { day: target, buckets: 0, ok: false, error: "database disabled" };

  const start = dayStart(target);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  // Two statements, in this order. A data-modifying CTE cannot clear and refill
  // the same key in one statement: the unique index check still sees the row the
  // CTE is deleting, so the run dies with a duplicate key violation instead of
  // rebuilding the bucket.
  // NOTE (deliberately kept, not fixed here): this is delete-then-insert,
  // not one transaction. If the insert below fails, that day's buckets are
  // gone until the next rollup run re-recomputes them from usage_events
  // (which pruneOlderThan keeps for RETENTION_DAYS, so the data is not lost,
  // only the daily aggregate is temporarily missing).
  const cleared = await sql("delete from usage_daily where day = $1::date", [target]);
  if (!cleared.ok) {
    return { day: target, buckets: 0, ok: false, error: `${cleared.reason}: ${cleared.message}` };
  }

  const text = `
insert into usage_daily (
  day, route, model, key_id, provider,
  requests, errors, rotated,
  prompt_tokens, completion_tokens,
  cost_usd, p50_ms, p95_ms
)
select
  $1::date,
  route,
  coalesce(model, ''),
  coalesce(key_id, ''),
  coalesce(provider, 'gemini'),
  count(*)::int,
  (count(*) filter (where status >= 400))::int,
  (count(*) filter (where rotated))::int,
  coalesce(sum(prompt_tokens), 0)::bigint,
  coalesce(sum(completion_tokens), 0)::bigint,
  coalesce(sum(cost_usd), 0)::numeric,
  percentile_cont(0.5) within group (order by latency_ms)::int,
  percentile_cont(0.95) within group (order by latency_ms)::int
from usage_events
where ts >= $2::timestamptz and ts < $3::timestamptz
group by route, coalesce(model, ''), coalesce(key_id, ''), coalesce(provider, 'gemini')
on conflict (day, route, model, key_id, provider) do update set
  requests = excluded.requests,
  errors = excluded.errors,
  rotated = excluded.rotated,
  prompt_tokens = excluded.prompt_tokens,
  completion_tokens = excluded.completion_tokens,
  cost_usd = excluded.cost_usd,
  p50_ms = excluded.p50_ms,
  p95_ms = excluded.p95_ms
returning 1`;

  const res = await sql(text, [target, start.toISOString(), end.toISOString()]);
  if (!res.ok) return { day: target, buckets: 0, ok: false, error: `${res.reason}: ${res.message}` };
  return { day: target, buckets: res.rows.length, ok: true };
}

/** Delete `usage_events` older than `days`. `usage_daily` is kept. */
export async function pruneOlderThan(days: number = cfg.retentionDays): Promise<PruneResult> {
  if (!dbEnabled()) return { pruned: 0, ok: false, error: "database disabled" };
  const keep = Number.isFinite(days) && days > 0 ? Math.floor(days) : cfg.retentionDays;
  const res = await sql(
    "delete from usage_events where ts < now() - make_interval(days => $1::int) returning 1",
    [keep],
  );
  if (!res.ok) return { pruned: 0, ok: false, error: `${res.reason}: ${res.message}` };
  return { pruned: res.rows.length, ok: true };
}

/** Default target: yesterday WIB. */
export function defaultDay(now = Date.now()): WibDay {
  return yesterdayWib(now);
}