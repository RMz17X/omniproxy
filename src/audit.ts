/**
 * Admin action audit trail, persisted to `admin_audit`.
 *
 * Every mutating admin route records one row: what changed, which target, who
 * did it (truncated user agent, or "api" for curl), and a JSON detail that is
 * scrubbed of anything key-shaped. Same policy as the ledger: writes are
 * fire-and-forget — never awaited on the request path, never throwing. A
 * database failure must not fail the admin action it is recording.
 */

import { sql, dbEnabled } from "./db.ts";

/** Anything that looks like a Google API key or OAuth token. */
const KEY_SHAPED = /AIza[0-9A-Za-z_-]{10,}|ya29\.[0-9A-Za-z._-]{10,}/g;

/** Hard ceiling on one stored detail blob. */
const DETAIL_MAX = 2000;
/** Actor labels are display text, not identities. */
const ACTOR_MAX = 120;

export type AuditRow = {
  id: number;
  ts: string;
  actor: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
};

/** Detail recorded for the `keys.add` audit action. */
export type KeysAddDetail = {
  received: number;
  added: number;
  provider: string;
};

export type AuditFilter = {
  /** Prefix match, e.g. "keys." matches keys.add and keys.delete. */
  action?: string;
  /** ISO timestamp; only rows at or after it are returned. */
  since?: string;
  /** 1–500, default 100. */
  limit?: number;
};

export type AuditList = {
  ok: boolean;
  rows: AuditRow[];
  /** Present when the database failed; "disabled" is never reported. */
  error?: string;
};

/** Truncated user agent for the actor column; "api" when absent. */
export function actorFrom(ua: string | undefined): string {
  const s = (ua ?? "").trim();
  return (s || "api").slice(0, ACTOR_MAX);
}

/**
 * Serialise the detail through JSON, scrub key-shaped material from the
 * serialized text (covers nesting at any depth), and cap the size.
 */
function safeDetail(detail: Record<string, unknown> | undefined): string | null {
  if (!detail) return null;
  const json = JSON.stringify(detail).replace(KEY_SHAPED, "[redacted]");
  // Truncation must keep the value valid JSON or the ::jsonb cast rejects it.
  if (json.length > DETAIL_MAX) {
    return JSON.stringify({ truncated: true, chars: json.length, head: json.slice(0, DETAIL_MAX) });
  }
  return json;
}

/**
 * Record one admin action. Synchronous by contract (the caller must not wait),
 * detached underneath: the insert runs on its own promise and swallows failure.
 */
export function record(
  action: string,
  input: { target?: string; detail?: Record<string, unknown>; actor?: string } = {},
): void {
  if (!dbEnabled()) return;
  void sql(
    `insert into admin_audit (actor, action, target, detail)
     values ($1, $2, $3, $4::jsonb)`,
    [
      (input.actor ?? "api").slice(0, ACTOR_MAX),
      action,
      input.target ? input.target.slice(0, 200) : null,
      safeDetail(input.detail),
    ],
  );
}

/**
 * Awaited variant of `record`, for mutating routes.
 *
 * `record` is fire-and-forget by design (the ledger must never block a
 * request), but on a serverless runtime a detached promise can be frozen the
 * instant the response is written — which silently drops the audit row. Admin
 * mutations are rare, so one extra round trip is the right price for a row
 * that is guaranteed to land. A failed insert still never fails the action.
 */
export async function recordNow(
  action: string,
  input: { target?: string; detail?: Record<string, unknown>; actor?: string } = {},
): Promise<void> {
  if (!dbEnabled()) return;
  try {
    await sql(
      `insert into admin_audit (actor, action, target, detail)
       values ($1, $2, $3, $4::jsonb)`,
      [
        (input.actor ?? "api").slice(0, ACTOR_MAX),
        action,
        input.target ? input.target.slice(0, 200) : null,
        safeDetail(input.detail),
      ],
    );
  } catch {
    // Swallowed on purpose: the audit trail must never break the action.
  }
}

type AuditDbRow = {
  id: string | number;
  ts: string;
  actor: string;
  action: string;
  target: string | null;
  detail: unknown;
};

/**
 * Recent rows, newest first. Bounded (default 100, max 500) with an action
 * prefix filter and a `since` timestamp filter. An empty result is a normal
 * state; only a database failure reports `ok:false`.
 */
export async function list(filter: AuditFilter = {}): Promise<AuditList> {
  if (!dbEnabled()) return { ok: true, rows: [] };

  const params: unknown[] = [];
  const where: string[] = [];
  if (filter.action) {
    params.push(`${filter.action}%`);
    where.push(`action like $${params.length}`);
  }
  if (filter.since) {
    params.push(filter.since);
    where.push(`ts >= $${params.length}::timestamptz`);
  }
  const limit = Math.min(Math.max(1, Math.floor(filter.limit ?? 100) || 100), 500);
  params.push(limit);

  const res = await sql<AuditDbRow>(
    `select id, ts, actor, action, target, detail
       from admin_audit
       ${where.length ? `where ${where.join(" and ")}` : ""}
       order by ts desc, id desc
       limit $${params.length}`,
    params,
  );
  if (!res.ok) {
    if (res.reason === "disabled") return { ok: true, rows: [] };
    return { ok: false, rows: [], error: res.message };
  }

  return {
    ok: true,
    rows: res.rows.map((r) => ({
      id: Number(r.id),
      ts: new Date(r.ts).toISOString(),
      actor: r.actor,
      action: r.action,
      target: r.target,
      detail:
        r.detail && typeof r.detail === "object"
          ? (r.detail as Record<string, unknown>)
          : null,
    })),
  };
}
