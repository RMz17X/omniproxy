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
};

export type PruneResult = {
  /** `usage_events` rows deleted. */
  pruned: number;
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

/** Return `day` unchanged when valid, otherwise the WIB day it would parse to. */
function normalizeDay(day: string | undefined): WibDay {
  if (day && DAY_RE.test(day)) {
    const t = Date.parse(`${day}T00:00:00.000Z`);
    if (Number.isFinite(t)) return day;
  }
  return yesterdayWib();
}

/** Recompute one WIB day of `usage_daily` from `usage_events`. */
export async function rollupDay(day?: string): Promise<RollupResult> {
  const target = normalizeDay(day);
  if (!dbEnabled()) return { day: target, buckets: 0 };

  const start = dayStart(target);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const text = `
with cleared as (
  delete from usage_daily where day = $1::date returning 1
)
insert into usage_daily (
  day, route, model, key_id,
  requests, errors, rotated,
  prompt_tokens, completion_tokens, total_tokens,
  cost_usd, p50_ms, p95_ms
)
select
  $1::date,
  route,
  coalesce(model, ''),
  coalesce(key_id, ''),
  count(*)::int,
  (count(*) filter (where status >= 400))::int,
  (count(*) filter (where rotated))::int,
  coalesce(sum(prompt_tokens), 0)::bigint,
  coalesce(sum(completion_tokens), 0)::bigint,
  coalesce(sum(total_tokens), 0)::bigint,
  coalesce(sum(cost_usd), 0)::numeric,
  percentile_cont(0.5) within group (order by latency_ms)::int,
  percentile_cont(0.95) within group (order by latency_ms)::int
from usage_events
where ts >= $2::timestamptz and ts < $3::timestamptz
group by route, coalesce(model, ''), coalesce(key_id, '')
returning 1`;

  const res = await sql(text, [target, start.toISOString(), end.toISOString()]);
  if (!res.ok) return { day: target, buckets: 0 };
  return { day: target, buckets: res.rows.length };
}

/** Delete `usage_events` older than `days`. `usage_daily` is kept. */
export async function pruneOlderThan(days: number = cfg.retentionDays): Promise<PruneResult> {
  if (!dbEnabled()) return { pruned: 0 };
  const keep = Number.isFinite(days) && days > 0 ? Math.floor(days) : cfg.retentionDays;
  const res = await sql(
    "delete from usage_events where ts < now() - make_interval(days => $1::int) returning 1",
    [keep],
  );
  if (!res.ok) return { pruned: 0 };
  return { pruned: res.rows.length };
}

/** Default target: yesterday WIB. */
export function defaultDay(now = Date.now()): WibDay {
  return yesterdayWib(now);
}