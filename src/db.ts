/**
 * Postgres access via the Neon HTTP driver.
 *
 * DATABASE_URL is OPTIONAL. Unset or empty disables the whole persistence
 * layer: `db()` returns null, `dbEnabled()` returns false, and every caller
 * treats that as a normal state, not an error.
 *
 * One query == one fetch. No pool, no PgBouncer, no connection ceiling.
 *
 * Failure policy:
 *   - per-query timeout (DB_QUERY_TIMEOUT_MS, default 3000)
 *   - a failed query returns a typed failure; it never throws at the caller
 *   - 5 consecutive failures open a 60s breaker; the next call after it is a
 *     single probe, success closes the breaker, failure re-opens it
 *
 * Log lines never carry the connection string or query parameters.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { cfg } from "./config.ts";
import { log } from "./log.ts";

/** Concrete client type; named here so consumers never spell out `ReturnType`. */
export type DbClient = NeonQueryFunction<false, false>;

/** Consecutive failures that open the breaker. */
const TRIP_AT = 5;
/** How long the breaker stays open before one probe is allowed. */
const OPEN_MS = 60_000;

/** Anything that looks like a connection URI; stripped before logging. */
const DSN_SHAPED = /postgres(?:ql)?:\/\/\S+/gi;

const client: DbClient | null = cfg.databaseUrl ? neon(cfg.databaseUrl) : null;

/**
 * Stand-in executor. Tests and the ledger/rollup fixtures install one to
 * exercise SQL without a live database; production never sets it.
 */
export type SqlRunner = <T>(query: string, params: unknown[]) => Promise<SqlResult<T>>;

let runner: SqlRunner | null = null;

/** Install (or clear, with `null`) the fake executor. */
export function setSqlRunner(next: SqlRunner | null): void {
  runner = next;
}

/** True when a database is configured. Cheap, no I/O. */
export function dbEnabled(): boolean {
  return client !== null || runner !== null;
}

/** Raw client for callers that need the tagged-template form. */
export function db(): DbClient | null {
  return client;
}

export type SqlFailureReason = "disabled" | "timeout" | "error" | "breaker";

export type SqlFailure = {
  ok: false;
  /** "disabled" is expected, not an error; the rest are upstream conditions */
  reason: SqlFailureReason;
  message: string;
};

export type SqlResult<T> = { ok: true; rows: T[] } | SqlFailure;

let failStreak = 0;
let openUntil = 0;
/** True while the single half-open probe is in flight. */
let probing = false;

export function breakerOpen(): boolean {
  return openUntil > Date.now();
}

function onSuccess(): void {
  if (failStreak > 0 || openUntil > 0) log("info", "db.recovered", {});
  failStreak = 0;
  openUntil = 0;
  probing = false;
}

function onFailure(reason: "timeout" | "error", message: string): void {
  failStreak += 1;
  probing = false;
  if (failStreak >= TRIP_AT && openUntil <= Date.now()) {
    openUntil = Date.now() + OPEN_MS;
    log("warn", "db.degraded", { breakerMs: OPEN_MS, reason });
  }
  log("warn", "db.query_failed", { reason, failures: failStreak, message });
}

/**
 * Run one parameterised statement. Never throws.
 *
 * `query` must use $1..$n placeholders; parameters are passed separately so
 * no value is ever interpolated into SQL text.
 */
export async function sql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
  opts: { timeoutMs?: number } = {},
): Promise<SqlResult<T>> {
  if (runner) return runner<T>(query, params);
  if (!client) return { ok: false, reason: "disabled", message: "DATABASE_URL not set" };

  const open = openUntil > Date.now();
  if (open && probing) return { ok: false, reason: "breaker", message: "breaker open" };
  if (open) probing = true;

  const timeoutMs = opts.timeoutMs ?? cfg.dbQueryTimeoutMs;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const rows = (await client.query(query, params, {
      fetchOptions: { signal: ctrl.signal },
    })) as T[];
    onSuccess();
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (err) {
    const aborted = ctrl.signal.aborted;
    // Strip any DSN the driver may have echoed; never log the connection string.
    const raw = err instanceof Error ? err.message : String(err);
    const message = raw.replace(DSN_SHAPED, "[redacted]");
    onFailure(aborted ? "timeout" : "error", aborted ? `timeout after ${timeoutMs}ms` : message);
    return { ok: false, reason: aborted ? "timeout" : "error", message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire-and-forget wrapper: runs on a detached task, swallows every failure.
 * Use it only off the request critical path.
 *
 * Gated on `dbEnabled()`, not `client`, so a runner installed by a test or
 * fixture observes the same writes production would send.
 */
export function sqlLater(query: string, params: unknown[] = []): void {
  if (!dbEnabled()) return;
  void sql(query, params);
}