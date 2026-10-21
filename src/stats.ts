/**
 * Console statistics: 1h/24h computed from the in-memory ledger ring, 7d/30d
 * computed from `usage_daily` (the rollup table).
 *
 * Design notes:
 *   - A stats request never mutates anything and never grows the ring: it
 *     filters a copy of the tail.
 *   - An empty range is a normal state: zeros and empty arrays, never an error.
 *   - A database FAILURE (timeout/rejection, not "DATABASE_URL unset") is
 *     reported as `ok:false` with the reason — never a silent zero.
 *   - Hour granularity only exists in `usage_events`, so the heatmap for the
 *     7d/30d ranges is aggregated from that table; for 1h/24h it comes from
 *     the ring. All hour/weekday math is WIB (UTC+7), matching the rollup.
 */

import { allRows, sumRows, type UsageRow, type UsageTotals } from "./ledger.ts";
import { sql, dbEnabled } from "./db.ts";
import { wibDayOf } from "./rollup.ts";

export const STATS_RANGES = ["1h", "24h", "7d", "30d"] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export const isStatsRange = (v: string | null | undefined): v is StatsRange =>
  v !== null && v !== undefined && (STATS_RANGES as readonly string[]).includes(v);

const RANGE_MS: Record<StatsRange, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export type StatsBucket = {
  key: string;
  requests: number;
  errors: number;
  rotated: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  avgLatencyMs: number;
};

export type StatusBucket = { key: string; requests: number };

/** One heatmap cell; weekday 0 = Sunday, WIB wall clock. */
export type HeatCell = { weekday: number; hour: number; requests: number };

export type StatsTotals = {
  requests: number;
  errors: number;
  rotated: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  p50Ms: number;
  p95Ms: number;
};

export type StatsSnapshot = {
  ok: boolean;
  range: StatsRange;
  /** Which store fed the numbers; "none" when there is nothing to read. */
  source: "ring" | "usage_daily";
  /** Epoch ms bounds of the selected range. */
  since: number;
  until: number;
  totals: StatsTotals;
  byModel: StatsBucket[];
  byKey: StatsBucket[];
  byRoute: StatsBucket[];
  /** Full status codes for ring ranges; an ok/error pair for daily ranges. */
  byStatus: StatusBucket[];
  /** Hour x weekday grid, WIB. Empty when no hourly data exists. */
  heatmap: HeatCell[];
  /** Observed daily cost mean x 30. */
  projectedMonthlyUsd: number;
  /** Plain-language caveat (empty range, coarse status, disabled storage…). */
  note?: string;
  /** Failure reason when ok is false. */
  error?: string;
};

/** Linear-interpolated percentile of a sorted ascending number list. */
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const emptyTotals = (): StatsTotals => ({
  requests: 0,
  errors: 0,
  rotated: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  p50Ms: 0,
  p95Ms: 0,
});

/** Mirror of ledger's internal bucketBy, on the StatsBucket shape. */
function bucketRows(list: UsageRow[], keyOf: (r: UsageRow) => string): StatsBucket[] {
  const map = new Map<string, StatsBucket>();
  for (const r of list) {
    const k = keyOf(r) || "unknown";
    let acc = map.get(k);
    if (!acc) {
      acc = { key: k, requests: 0, errors: 0, rotated: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, avgLatencyMs: 0 };
      map.set(k, acc);
    }
    acc.requests++;
    if (!r.ok) acc.errors++;
    if (r.rotated) acc.rotated++;
    acc.promptTokens += r.promptTokens;
    acc.completionTokens += r.completionTokens;
    acc.totalTokens += r.totalTokens;
    acc.costUsd += r.costUsd ?? 0;
    acc.avgLatencyMs += r.latencyMs;
  }
  const out = [...map.values()];
  for (const b of out) b.avgLatencyMs = b.requests ? Math.round(b.avgLatencyMs / b.requests) : 0;
  return out.sort((a, b) => b.requests - a.requests || b.totalTokens - a.totalTokens);
}

/** WIB wall-clock hour and weekday (0 = Sunday) of an instant. */
function wibHourWeekday(ts: number): { hour: number; weekday: number } {
  const d = new Date(ts + WIB_OFFSET_MS);
  return { hour: d.getUTCHours(), weekday: d.getUTCDay() };
}

function heatmapFromRing(rows: UsageRow[]): HeatCell[] {
  const grid = new Map<number, number>();
  for (const r of rows) {
    const { hour, weekday } = wibHourWeekday(r.ts);
    const idx = weekday * 24 + hour;
    grid.set(idx, (grid.get(idx) ?? 0) + 1);
  }
  return [...grid.entries()]
    .map(([idx, requests]) => ({ weekday: Math.floor(idx / 24), hour: idx % 24, requests }))
    .sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);
}

/** 1h / 24h: entirely from the in-memory ring. */
function statsFromRing(range: StatsRange, now: number): StatsSnapshot {
  const since = now - RANGE_MS[range];
  const rows = allRows().filter((r) => r.ts >= since);
  const totals = sumRows(rows);
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);

  const statusMap = new Map<string, number>();
  for (const r of rows) statusMap.set(String(r.status), (statusMap.get(String(r.status)) ?? 0) + 1);

  const costUsd = totals.costUsd ?? 0;
  const observedDays = RANGE_MS[range] / (24 * 60 * 60 * 1000);
  const projected = observedDays > 0 ? (costUsd / observedDays) * 30 : 0;

  return {
    ok: true,
    range,
    source: "ring",
    since,
    until: now,
    totals: {
      requests: totals.requests,
      errors: totals.errors,
      rotated: totals.rotated,
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      totalTokens: totals.totalTokens,
      costUsd,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
    },
    byModel: bucketRows(rows, (r) => r.model),
    byKey: bucketRows(rows, (r) => r.keyId || r.keyMasked),
    byRoute: bucketRows(rows, (r) => r.route),
    byStatus: [...statusMap.entries()]
      .map(([key, requests]) => ({ key, requests }))
      .sort((a, b) => b.requests - a.requests),
    heatmap: heatmapFromRing(rows),
    projectedMonthlyUsd: Number(projected.toFixed(6)),
    ...(rows.length ? {} : { note: "No traffic in this range." }),
  };
}

type DailyRow = {
  day: string;
  route: string;
  model: string;
  key_id: string;
  requests: number | string;
  errors: number | string;
  rotated: number | string;
  prompt_tokens: number | string;
  completion_tokens: number | string;
  cost_usd: number | string;
  p50_ms: number | string | null;
  p95_ms: number | string | null;
};

type HeatRow = { hour: number; weekday: number; requests: number | string };

const num = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function dailyBucket(rows: DailyRow[], keyOf: (r: DailyRow) => string): StatsBucket[] {
  const map = new Map<string, StatsBucket>();
  for (const r of rows) {
    const k = keyOf(r) || "unknown";
    let acc = map.get(k);
    if (!acc) {
      acc = { key: k, requests: 0, errors: 0, rotated: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, avgLatencyMs: 0 };
      map.set(k, acc);
    }
    const requests = num(r.requests);
    acc.requests += requests;
    acc.errors += num(r.errors);
    acc.rotated += num(r.rotated);
    acc.promptTokens += num(r.prompt_tokens);
    acc.completionTokens += num(r.completion_tokens);
    acc.totalTokens += num(r.prompt_tokens) + num(r.completion_tokens);
    acc.costUsd += num(r.cost_usd);
    // Requests-weighted mean of the per-bucket percentiles; an approximation
    // by construction, surfaced as such in the UI.
    acc.avgLatencyMs += requests * num(r.p50_ms);
  }
  const out = [...map.values()];
  for (const b of out) b.avgLatencyMs = b.requests ? Math.round(b.avgLatencyMs / b.requests) : 0;
  for (const b of out) b.costUsd = Number(b.costUsd.toFixed(6));
  return out.sort((a, b) => b.requests - a.requests);
}

/** 7d / 30d: totals from usage_daily, heatmap aggregated from usage_events. */
async function statsFromDaily(range: StatsRange, now: number): Promise<StatsSnapshot> {
  const since = now - RANGE_MS[range];
  const base: Omit<StatsSnapshot, "totals" | "byModel" | "byKey" | "byRoute"> = {
    ok: true,
    range,
    source: "usage_daily",
    since,
    until: now,
    byStatus: [],
    heatmap: [],
    projectedMonthlyUsd: 0,
  };

  const sinceDay = wibDayOf(since);
  const daily = await sql<DailyRow>(
    `select day::text as day, route, model, key_id,
            requests, errors, rotated,
            prompt_tokens, completion_tokens, cost_usd, p50_ms, p95_ms
       from usage_daily
      where day >= $1::date
      order by day`,
    [sinceDay],
  );
  if (!daily.ok) {
    if (daily.reason === "disabled") {
      return {
        ...base,
        totals: emptyTotals(),
        byModel: [],
        byKey: [],
        byRoute: [],
        note: "Daily history needs Postgres; DATABASE_URL is not set.",
      };
    }
    return { ...base, ok: false, totals: emptyTotals(), byModel: [], byKey: [], byRoute: [], error: daily.message };
  }

  const rows = daily.rows;
  const requests = rows.reduce((s, r) => s + num(r.requests), 0);
  const errors = rows.reduce((s, r) => s + num(r.errors), 0);
  const rotated = rows.reduce((s, r) => s + num(r.rotated), 0);
  const promptTokens = rows.reduce((s, r) => s + num(r.prompt_tokens), 0);
  const completionTokens = rows.reduce((s, r) => s + num(r.completion_tokens), 0);
  const costUsd = Number(rows.reduce((s, r) => s + num(r.cost_usd), 0).toFixed(6));

  // Requests-weighted mean of bucket percentiles (usage_daily has no raw
  // latencies once events are rolled up).
  let p50Num = 0;
  let p95Num = 0;
  for (const r of rows) {
    const w = num(r.requests);
    p50Num += w * num(r.p50_ms);
    p95Num += w * num(r.p95_ms);
  }
  const p50Ms = requests ? Math.round(p50Num / requests) : 0;
  const p95Ms = requests ? Math.round(p95Num / requests) : 0;

  const observedDays = RANGE_MS[range] / (24 * 60 * 60 * 1000);
  const projectedMonthlyUsd = Number((((costUsd / observedDays) * 30)).toFixed(6));

  // Hour granularity is gone after a rollup; re-derive the heatmap from the
  // raw events that retention still holds (30 days by default).
  const heat = await sql<HeatRow>(
    `select extract(hour from ts at time zone 'Asia/Jakarta')::int as hour,
            extract(dow from ts at time zone 'Asia/Jakarta')::int as weekday,
            count(*)::int as requests
       from usage_events
      where ts >= $1
      group by 1, 2`,
    [new Date(since).toISOString()],
  );
  if (!heat.ok) {
    return { ...base, ok: false, totals: emptyTotals(), byModel: [], byKey: [], byRoute: [], error: heat.message };
  }

  const note = rows.length
    ? "Status codes are aggregated to ok/error for this range; p50/p95 are requests-weighted bucket means."
    : `No usage_daily rows for this range (rollup runs daily via /internal/rollup).`;

  return {
    ...base,
    totals: { requests, errors, rotated, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, costUsd, p50Ms, p95Ms },
    byModel: dailyBucket(rows, (r) => r.model),
    byKey: dailyBucket(rows, (r) => r.key_id),
    byRoute: dailyBucket(rows, (r) => r.route),
    byStatus: [
      { key: "ok", requests: Math.max(0, requests - errors) },
      { key: "error", requests: errors },
    ].filter((b) => b.requests > 0),
    heatmap: heat.rows
      .map((r) => ({ weekday: num(r.weekday), hour: num(r.hour), requests: num(r.requests) }))
      .sort((a, b) => a.weekday - b.weekday || a.hour - b.hour),
    projectedMonthlyUsd,
    note,
  };
}

/** Compute the stats snapshot for one range. Never throws. */
export async function statsSnapshot(range: StatsRange, now = Date.now()): Promise<StatsSnapshot> {
  if (range === "1h" || range === "24h") return statsFromRing(range, now);
  if (!dbEnabled()) {
    return {
      ok: true,
      range,
      source: "usage_daily",
      since: now - RANGE_MS[range],
      until: now,
      totals: emptyTotals(),
      byModel: [],
      byKey: [],
      byRoute: [],
      byStatus: [],
      heatmap: [],
      projectedMonthlyUsd: 0,
      note: "Daily history needs Postgres; DATABASE_URL is not set.",
    };
  }
  return statsFromDaily(range, now);
}

/** Convenience for the page: UsageTotals re-export keeps imports minimal. */
export type { UsageTotals };
