/**
 * Durable usage ledger — request collector, console ring, batched writer.
 *
 * Absorbs the former `usage.ts`. Three layers, each with one job:
 *   1. `record()` — synchronous append to the ring and the pending batch. It
 *      never awaits the database and never throws into the request path.
 *   2. `flush()` — one multi-row INSERT into `usage_events`. Triggered by batch
 *      size (`LEDGER_MAX_ROWS`) or age (`LEDGER_FLUSH_MS`).
 *   3. Failure policy — the database is optional. A failed flush puts the batch
 *      back, capped at twice the batch size; the excess is dropped oldest-first
 *      and counted in `droppedCount()`.
 *
 * PRIVACY (enforced by construction): a row carries identifiers, counts,
 * timings and status only. No field can hold a prompt or a completion. The raw
 * credential is reduced on arrival to `keyId` (sha256 prefix) plus `keyMasked`;
 * it is never retained, logged or persisted.
 */

import { createHash } from "node:crypto";
import { cfg } from "./config.ts";
import { dbEnabled, sql } from "./db.ts";
import { log } from "./log.ts";
import { catalogFor } from "./models-catalog.ts";
import { maskKey } from "./pool.ts";

/** Anything that looks like a Google API key or OAuth token. */
const KEY_SHAPED = /AIza[0-9A-Za-z_-]{10,}|ya29\.[0-9A-Za-z._-]{10,}/;

/**
 * Ledger-scoped key id. `execute()` only hands back the MASKED credential, and
 * the pool's own id hashes the raw value, so the ledger derives its own stable
 * id from the masked form: the same key always maps to the same id. This is
 * NOT `pool.keyId()` and must not be treated as interchangeable with it.
 */
export function ledgerKeyId(masked: string): string {
  return createHash("sha256").update(`masked:${masked}`).digest("hex").slice(0, 12);
}

export type UsageRoute =
  | "chat.completions"
  | "audio.speech"
  | "images.generations"
  | "gemini.passthrough"
  | "models.list"
  | "embeddings"
  | "other";

/** One console row: superset of the persisted event. */
export type UsageRow = {
  id: string;
  ts: number;
  route: UsageRoute;
  path: string;
  method: string;
  model: string;
  /** which pool served the row; recorded at commit time, never guessed */
  provider?: string;
  keyId: string;
  keyMasked: string;
  status: number;
  ok: boolean;
  errorCode: string | null;
  attempts: number;
  rotated: boolean;
  stream: boolean;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number | null;
};

/** Exactly the columns of `usage_events`. */
export type LedgerEvent = {
  ts: number;
  reqId: string | null;
  route: string;
  model: string | null;
  provider: string;
  keyId: string | null;
  status: number;
  attempts: number;
  rotated: boolean;
  stream: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number | null;
  latencyMs: number | null;
  errorCode: string | null;
};

/* ---------- ring (live console tail) ---------- */

/** Newest first, bounded by `LEDGER_TAIL_ROWS`. */
const tail: UsageRow[] = [];

/** Newest-first snapshot of the in-process tail. */
export function tailEvents(limit = cfg.ledgerTailRows): UsageRow[] {
  const n = Math.max(0, Math.min(limit, tail.length));
  return tail.slice(0, n);
}

/* ---------- pending batch ---------- */

let pending: LedgerEvent[] = [];
/** Epoch ms of the oldest pending event; 0 when the batch is empty. */
let oldestPending = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let dropped = 0;

/** Rows discarded by the overflow policy. Read by metrics. */
export function droppedCount(): number {
  return dropped;
}

/** Rows waiting to be written. */
export function pendingCount(): number {
  return pending.length;
}

/** Batch size and the overflow ceiling derived from it. */
const batchCap = Math.max(1, cfg.ledgerMaxRows);
const overflowCap = batchCap * 2;

function scheduleFlush(): void {
  if (timer !== null || !dbEnabled() || pending.length === 0) return;
  const wait = Math.max(0, oldestPending + cfg.ledgerFlushMs - Date.now());
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, wait);
  // Never hold the process open for a telemetry flush.
  if (typeof timer === "object" && timer !== null && "unref" in timer) timer.unref();
}

/** Project a console row onto the persisted column set. */
function toEvent(row: UsageRow): LedgerEvent {
  return {
    ts: row.ts,
    reqId: row.id,
    route: row.route,
    model: row.model,
    provider: row.provider ?? "gemini",
    keyId: row.keyId,
    status: row.status,
    attempts: row.attempts,
    rotated: row.rotated,
    stream: row.stream,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    costUsd: row.costUsd,
    latencyMs: row.latencyMs,
    errorCode: row.errorCode,
  };
}

/**
 * Append one row to the ring and the pending batch. Synchronous by contract:
 * the caller is on the response path and must not pay for a round trip.
 */
export function record(row: UsageRow): void {
  try {
    tail.unshift(row);
    if (tail.length > cfg.ledgerTailRows) tail.length = cfg.ledgerTailRows;

    if (!dbEnabled()) return;

    if (pending.length === 0) oldestPending = row.ts;
    pending.push(toEvent(row));

    if (pending.length > overflowCap) {
      const excess = pending.length - overflowCap;
      pending.splice(0, excess);
      dropped += excess;
      oldestPending = pending.length ? pending[0].ts : 0;
      log("warn", "ledger.overflow_drop", { dropped: excess, totalDropped: dropped });
    }

    if (pending.length >= batchCap) void flush();
    else scheduleFlush();
  } catch (err) {
    // Telemetry must never break the request.
    log("warn", "ledger.record_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const CHUNK = 100;

function insertStatement(rows: LedgerEvent[]): { text: string; params: unknown[] } {
  const cols = 16;
  const tuples: string[] = [];
  const params: unknown[] = [];
  rows.forEach((e, i) => {
    const base = i * cols;
    tuples.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16})`);
    params.push(
      new Date(e.ts).toISOString(),
      e.reqId,
      e.route,
      e.model,
      e.provider,
      e.keyId,
      e.status,
      e.attempts,
      e.rotated,
      e.stream,
      e.promptTokens,
      e.completionTokens,
      e.totalTokens,
      e.costUsd,
      e.latencyMs,
      e.errorCode,
    );
  });
  const text =
    "insert into usage_events (ts, req_id, route, model, provider, key_id, status, attempts, rotated, stream, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, error_code) values " +
    tuples.join(",");
  return { text, params };
}

/**
 * Write the pending batch. Safe to call at any time; a concurrent call is a
 * no-op. Never throws, never rejects.
 */
export async function flush(): Promise<void> {
  if (flushing || pending.length === 0) return;
  if (!dbEnabled()) {
    pending = [];
    oldestPending = 0;
    return;
  }

  flushing = true;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }

  const batch = pending;
  pending = [];
  oldestPending = 0;

  try {
    for (let i = 0; i < batch.length; i += CHUNK) {
      const { text, params } = insertStatement(batch.slice(i, i + CHUNK));
      const res = await sql(text, params);
      if (!res.ok) {
        requeue(batch.slice(i));
        log("warn", "ledger.flush_failed", { reason: res.reason, rows: batch.length - i });
        return;
      }
    }
  } finally {
    flushing = false;
    if (pending.length) scheduleFlush();
  }
}

/**
 * Put a failed batch back in front of the queue, bounded by the overflow cap.
 * The ring is untouched: the live console keeps showing what it had.
 */
function requeue(rows: LedgerEvent[]): void {
  const merged = rows.concat(pending);
  const cap = overflowCap;
  if (merged.length > cap) {
    dropped += merged.length - cap;
    merged.splice(0, merged.length - cap);
  }
  pending = merged;
  oldestPending = pending.length ? pending[0].ts : 0;
  if (pending.length >= batchCap) void flush();
  else scheduleFlush();
}

/* ---------- request collector ---------- */

export type Collector = {
  startedAt: number;
  path: string;
  method: string;
  route: UsageRoute;
  model: string;
  provider: string;
  keyId: string;
  keyMasked: string;
  attempts: number;
  rotated: boolean;
  stream: boolean;
  errorCode: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  committed: boolean;
};

const collectors = new WeakMap<Request, Collector>();

export function costFor(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const entry = catalogFor(model);
  if (!entry || entry.inUsd === null || entry.outUsd === null) return null;
  const cost = (promptTokens / 1_000_000) * entry.inUsd + (completionTokens / 1_000_000) * entry.outUsd;
  return Number.isFinite(cost) ? cost : null;
}

/** Map an inbound path to a ledger route; null means "not gateway traffic". */
export function routeOf(path: string): UsageRoute | null {
  if (path.startsWith("/pengatur") || path.startsWith("/admin")) return null;
  if (path === "/" || path === "/health" || path === "/metrics" || path === "/favicon.ico") return null;
  if (path === "/internal/rollup") return null;
  if (path === "/v1/chat/completions") return "chat.completions";
  if (path === "/v1/audio/speech") return "audio.speech";
  if (path === "/v1/images/generations") return "images.generations";
  if (path === "/v1/embeddings") return "embeddings";
  if (path === "/v1/models") return "models.list";
  if (path.startsWith("/v1beta/models")) return "gemini.passthrough";
  if (path.startsWith("/v1")) return "other";
  return null;
}

export function beginUsage(req: Request, path: string, route: UsageRoute): Collector {
  const c: Collector = {
    startedAt: Date.now(),
    path,
    method: req.method,
    route,
    model: "",
    provider: "",
    keyId: "",
    keyMasked: "",
    attempts: 0,
    rotated: false,
    stream: false,
    errorCode: null,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    committed: false,
  };
  collectors.set(req, c);
  return c;
}

export type UsagePatch = {
  model?: string;
  /** which pool served the request; set by the route that resolved it */
  provider?: string;
  /** Raw credential from `execute()`. Reduced here, never retained. */
  keyRaw?: string;
  keyId?: string;
  keyMasked?: string;
  attempts?: number;
  rotated?: boolean;
  stream?: boolean;
  errorCode?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
};

/** Publish what a handler learned about its upstream call. */
export function noteUsage(req: Request, patch: UsagePatch): void {
  const c = collectors.get(req);
  if (!c || c.committed) return;
  if (patch.provider) c.provider = patch.provider;
  if (patch.keyRaw) {
    c.keyMasked = maskKey(patch.keyRaw);
    c.keyId = ledgerKeyId(c.keyMasked);
  }
  if (patch.keyMasked) {
    c.keyMasked = patch.keyMasked;
    if (!patch.keyId) c.keyId = ledgerKeyId(patch.keyMasked);
  }
  if (patch.keyId) c.keyId = patch.keyId;
  if (patch.model) c.model = patch.model;
  if (typeof patch.attempts === "number") c.attempts = patch.attempts;
  if (typeof patch.rotated === "boolean") c.rotated = patch.rotated;
  if (typeof patch.stream === "boolean") c.stream = patch.stream;
  if (patch.errorCode !== undefined) c.errorCode = patch.errorCode;
  if (typeof patch.promptTokens === "number") c.promptTokens = patch.promptTokens;
  if (typeof patch.completionTokens === "number") c.completionTokens = patch.completionTokens;
  if (typeof patch.totalTokens === "number") c.totalTokens = patch.totalTokens;
  if (typeof patch.cachedTokens === "number") c.cachedTokens = patch.cachedTokens;
}

/**
 * Commit the row. Idempotent — the middleware and a stream's `finally` both
 * call it and only the first one wins.
 *
 * A row flagged `stream` is NOT committed here: the response body is still
 * being written and its token counts are not final. The streaming handler
 * calls `finalizeStream()` when the last byte leaves.
 */
export function commitUsage(req: Request, status: number): UsageRow | null {
  const c = collectors.get(req);
  if (!c || c.committed) return null;
  if (c.stream) return null;

  c.committed = true;

  // Defence in depth: a caller that hands us a raw credential (instead of
  // `keyRaw`) must not be able to write it into the ring. Anything shaped like
  // a Google key is reduced to its masked form before it can reach a row.
  let masked = c.keyMasked;
  if (KEY_SHAPED.test(masked)) {
    masked = maskKey(masked);
    c.keyMasked = masked;
    c.keyId = ledgerKeyId(masked);
  }
  KEY_SHAPED.lastIndex = 0;

  const promptTokens = c.promptTokens;
  const completionTokens = c.completionTokens;
  const totalTokens = c.totalTokens || promptTokens + completionTokens;
  const row: UsageRow = {
    id: crypto.randomUUID(),
    ts: c.startedAt,
    route: c.route,
    path: c.path,
    method: c.method,
    model: c.model || "unknown",
    provider: c.provider || "gemini",
    keyId: c.keyId,
    keyMasked: c.keyMasked,
    status,
    ok: status >= 200 && status < 400,
    errorCode: c.errorCode,
    attempts: c.attempts,
    rotated: c.rotated,
    stream: false,
    latencyMs: Date.now() - c.startedAt,
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens: c.cachedTokens,
    costUsd: costFor(c.model, promptTokens, completionTokens),
  };

  record(row);
  return row;
}

/** Called by a streaming handler once the stream is done (or torn down). */
export function finalizeStream(req: Request, status = 200, errorCode?: string): void {
  const c = collectors.get(req);
  if (!c || c.committed) return;
  if (errorCode) c.errorCode = errorCode;
  c.stream = false;
  commitUsage(req, status);
}

/* ---------- read side ---------- */

export type UsageTotals = {
  requests: number;
  ok: number;
  errors: number;
  rotated: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number | null;
  avgLatencyMs: number;
};

export type UsageBucket = UsageTotals & { key: string; provider: string };

export type UsageSnapshot = {
  mode: "memory";
  capacity: number;
  rows: UsageRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totals: UsageTotals;
  byModel: UsageBucket[];
  byKey: UsageBucket[];
  byDay: UsageBucket[];
  byRoute: UsageBucket[];
  since: number | null;
};

/** Console capacity, `USAGE_ROWS` for compatibility with the old ring knob. */
const capacity = (() => {
  const n = Number(process.env.USAGE_ROWS ?? 1000);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1000;
})();

const emptyTotals = (): UsageTotals => ({
  requests: 0,
  ok: 0,
  errors: 0,
  rotated: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedTokens: 0,
  costUsd: 0,
  avgLatencyMs: 0,
});

function addInto(acc: UsageTotals, row: UsageRow): void {
  acc.requests += 1;
  if (row.ok) acc.ok += 1;
  else acc.errors += 1;
  if (row.rotated) acc.rotated += 1;
  acc.promptTokens += row.promptTokens;
  acc.completionTokens += row.completionTokens;
  acc.totalTokens += row.totalTokens;
  acc.cachedTokens += row.cachedTokens;
  if (row.costUsd !== null) acc.costUsd = (acc.costUsd ?? 0) + row.costUsd;
  acc.avgLatencyMs += row.latencyMs;
}

function finish(acc: UsageTotals): UsageTotals {
  acc.avgLatencyMs = acc.requests ? Math.round(acc.avgLatencyMs / acc.requests) : 0;
  if (acc.costUsd !== null) acc.costUsd = Number(acc.costUsd.toFixed(6));
  return acc;
}

export function sumRows(list: UsageRow[]): UsageTotals {
  const acc = emptyTotals();
  for (const r of list) addInto(acc, r);
  return finish(acc);
}

function bucketBy(list: UsageRow[], keyOf: (r: UsageRow) => string): UsageBucket[] {
  const map = new Map<string, UsageTotals>();
  const prov = new Map<string, Map<string, number>>();
  for (const r of list) {
    const k = keyOf(r) || "unknown";
    let acc = map.get(k);
    if (!acc) {
      acc = emptyTotals();
      map.set(k, acc);
      prov.set(k, new Map());
    }
    addInto(acc, r);
    if (r.provider) {
      const counts = prov.get(k);
      if (counts) counts.set(r.provider, (counts.get(r.provider) || 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([key, acc]) => {
      let provider = "";
      let best = 0;
      const counts = prov.get(key);
      if (counts) counts.forEach((n, p) => { if (n > best) { best = n; provider = p; } });
      return { key, provider, ...finish(acc) };
    })
    .sort((a, b) => b.requests - a.requests || b.totalTokens - a.totalTokens);
}

export const dayOf = (ts: number): string => new Date(ts).toISOString().slice(0, 10);

export type RowFilter = {
  day?: string;
  model?: string;
  provider?: string;
  key?: string;
  status?: string;
  route?: string;
};

export function filterRows(list: UsageRow[], f: RowFilter): UsageRow[] {
  return list.filter((r) => {
    if (f.day && dayOf(r.ts) !== f.day) return false;
    if (f.model && r.model !== f.model) return false;
    if (f.provider && r.provider !== f.provider) return false;
    if (f.key && r.keyId !== f.key && r.keyMasked !== f.key) return false;
    if (f.route && r.route !== f.route) return false;
    if (f.status === "ok" && !r.ok) return false;
    if (f.status === "error" && r.ok) return false;
    if (f.status === "rotated" && !r.rotated) return false;
    return true;
  });
}

export function pageOf<T>(items: T[], page: number, pageSize: number): T[] {
  const p = Math.max(1, Math.floor(page) || 1);
  const n = Math.min(Math.max(1, Math.floor(pageSize) || 25), 200);
  return items.slice((p - 1) * n, p * n);
}

export function usageOverview(page = 1, pageSize = 25, filter: RowFilter = {}): UsageSnapshot {
  const filtered = filterRows(tail, filter);
  return {
    mode: "memory",
    capacity,
    rows: pageOf(filtered, page, pageSize),
    page: Math.max(1, Math.floor(page) || 1),
    pageSize: Math.min(Math.max(1, Math.floor(pageSize) || 25), 200),
    totalRows: filtered.length,
    totals: sumRows(filtered),
    byModel: bucketBy(filtered, (r) => r.model),
    byKey: bucketBy(filtered, (r) => r.keyMasked || r.keyId),
    byDay: bucketBy(filtered, (r) => dayOf(r.ts)),
    byRoute: bucketBy(filtered, (r) => r.route),
    since: tail.length ? tail[tail.length - 1].ts : null,
  };
}

export function allRows(): UsageRow[] {
  return tail.slice();
}

export function toCsv(list: UsageRow[]): string {
  const cols: (keyof UsageRow)[] = [
    "id",
    "ts",
    "route",
    "path",
    "method",
    "model",
    "provider",
    "keyId",
    "keyMasked",
    "status",
    "ok",
    "errorCode",
    "attempts",
    "rotated",
    "stream",
    "latencyMs",
    "promptTokens",
    "completionTokens",
    "totalTokens",
    "cachedTokens",
    "costUsd",
  ];
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of list) lines.push(cols.map((c) => esc(r[c])).join(","));
  return lines.join("\n") + "\n";
}