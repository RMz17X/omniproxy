/**
 * Request / token ledger — IN-MEMORY ONLY, no Redis, no Upstash.
 *
 * Why memory: the ledger is operator telemetry, not durable state. It is
 * deliberately lost on redeploy / cold start. Keeping it out of Upstash means
 * the pool's command budget is untouched by the dashboard, which is what
 * matters on a free tier.
 *
 * PRIVACY RULE (enforced by construction):
 *   - A row carries ONLY metadata: ids, hashes, counts, timings, status.
 *   - The raw API key is NEVER stored. It is reduced immediately to `keyId`
 *     (sha256 prefix) and `keyMasked` (display form) inside `noteUsage`.
 *   - Request bodies, prompt text, response text, headers and query strings
 *     are NEVER stored. Only the path, token COUNTS and the model id.
 *
 * Costing: `costFor()` prices prompt/completion tokens from `models-catalog.ts`
 * (USD per 1M tokens). A model missing from the catalogue yields `null`, never
 * a fabricated number.
 */

import { createHash } from "node:crypto";
import { catalogFor } from "./models-catalog.ts";
import { maskKey } from "./pool.ts";

/**
 * Ledger-scoped key id. `execute()` only hands back the MASKED credential, and
 * the pool's own id hashes the raw value, so the ledger derives its own stable
 * id from the masked form: the same key always maps to the same id. This is
 * NOT `pool.keyId()` and must not be treated as interchangeable with it.
 */
function ledgerKeyId(masked: string): string {
  return createHash("sha256").update(`masked:${masked}`).digest("hex").slice(0, 12);
}

/** Anything that looks like a Google API key or OAuth token. */
const KEY_SHAPED = /AIza[0-9A-Za-z_-]{10,}|ya29\.[0-9A-Za-z._-]{10,}/;

export type UsageRoute =
  | "chat.completions"
  | "audio.speech"
  | "gemini.passthrough"
  | "models.list"
  | "embeddings"
  | "other";

export type UsageRow = {
  id: string;
  ts: number;
  route: UsageRoute;
  path: string;
  method: string;
  model: string;
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

export type UsageBucket = UsageTotals & { key: string };

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

/* ---------- ring ---------- */

const capacity = (() => {
  const n = Number(process.env.USAGE_ROWS ?? 1000);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1000;
})();

/** Newest first. Bounded: unshift + truncate. */
const rows: UsageRow[] = [];

type Collector = {
  startedAt: number;
  path: string;
  method: string;
  route: UsageRoute;
  model: string;
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
  if (path === "/v1/chat/completions") return "chat.completions";
  if (path === "/v1/audio/speech") return "audio.speech";
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

  rows.unshift(row);
  if (rows.length > capacity) rows.length = capacity;
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
  for (const r of list) {
    const k = keyOf(r) || "unknown";
    let acc = map.get(k);
    if (!acc) {
      acc = emptyTotals();
      map.set(k, acc);
    }
    addInto(acc, r);
  }
  return [...map.entries()]
    .map(([key, acc]) => ({ key, ...finish(acc) }))
    .sort((a, b) => b.requests - a.requests || b.totalTokens - a.totalTokens);
}

export const dayOf = (ts: number): string => new Date(ts).toISOString().slice(0, 10);

export type RowFilter = {
  day?: string;
  model?: string;
  key?: string;
  status?: string;
  route?: string;
};

export function filterRows(list: UsageRow[], f: RowFilter): UsageRow[] {
  return list.filter((r) => {
    if (f.day && dayOf(r.ts) !== f.day) return false;
    if (f.model && r.model !== f.model) return false;
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
  const filtered = filterRows(rows, filter);
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
    since: rows.length ? rows[rows.length - 1].ts : null,
  };
}

export function allRows(): UsageRow[] {
  return rows.slice();
}

export function toCsv(list: UsageRow[]): string {
  const cols: (keyof UsageRow)[] = [
    "id",
    "ts",
    "route",
    "path",
    "method",
    "model",
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