/**
 * Retirement ordering.
 *
 * A retirement (`403 reported as leaked`) and a liveness verdict (quota
 * refusal, successful probe) are both evidence about the same credential, and
 * they arrive from independent request paths. Whoever writes last must not
 * win: the verdict observed LAST wins. Two defects follow from getting that
 * wrong, and both are pinned here:
 *
 *   - a quota answer observed before a leak verdict cleared the retirement and
 *     re-enabled a revoked key;
 *   - a retirement observed before a quota answer was never cleared, so a live
 *     credential stayed `enabled=false` and `hydrate()` read it back as dead.
 *
 * The clock is the observation instant carried by each verdict, not the moment
 * the write lands. The durable half is a single guarded statement per
 * transition, exercised below against a row that keeps its own state.
 */
import { afterEach, expect, test } from "bun:test";

import "./env.ts";

import { setSqlRunner, type SqlResult } from "../src/db.ts";

import {
  addKey,
  keyId,
  listKeys,
  markHealthy,
  markInvalid,
  markQuotaExhausted,
  removeKey,
  type KeyView,
} from "../src/pool.ts";
import { parseQuotaDetail } from "../src/verdict.ts";

const T0 = 1_700_000_000_000;

/** The project shape: a limit value of 0 means the project holds nothing. */
function project429(limitValue: string): string {
  return JSON.stringify({
    error: {
      code: 429,
      message: "Quota exceeded for quota metric 'Generate Content API requests per minute'.",
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "RATE_LIMIT_EXCEEDED",
          domain: "googleapis.com",
          metadata: {
            quota_limit_value: limitValue,
            consumer: "projects/160256998078",
            quota_metric: "generativelanguage.googleapis.com/generate_content_requests",
          },
        },
      ],
    },
  });
}

async function held(key: string): Promise<KeyView | undefined> {
  return (await listKeys()).find((k) => k.key.endsWith(key.slice(-4)));
}

/**
 * Reset one key to a blank slate.
 *
 * Pool state is global to the test process, so each case removes its key
 * first: `addKey` refuses a key that is already live and invalid.
 */
async function fresh(key: string): Promise<void> {
  await removeKey(key);
  await addKey(key);
}

/**
 * Drain the microtask queue: `later()` schedules each write with
 * `queueMicrotask`, so every statement has run once this settles. No wall
 * clock is involved — the guard decision comes from the row, not elapsed time.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

afterEach(() => setSqlRunner(null));

/* ---------- in-process ordering ---------- */

test("a quota verdict observed before the leak verdict cannot revive the key", async () => {
  const key = "AIzaRACEQUOTA1";
  await fresh(key);

  // The leak verdict is the newer observation even though the quota answer is
  // applied first: a revoked credential answers generateContent exactly like an
  // out-of-quota one, so only the clock can tell them apart.
  await markQuotaExhausted(key, parseQuotaDetail(project429("15")), T0);
  await markInvalid(key, T0 + 5_000, "leaked");

  const view = await held(key);
  expect(view?.status).toBe("dead");
  expect(view?.invalid).toBe(true);

  await removeKey(key);
});

test("a quota verdict observed after the retirement revives the key", async () => {
  const key = "AIzaRACEQUOTA2";
  await fresh(key);

  // The legacy shape: a key retired by the old 429 handling, then proven alive
  // by a quota answer that arrived later.
  await markInvalid(key, T0, "zero_quota");
  expect((await held(key))?.invalid).toBe(true);

  await markQuotaExhausted(key, parseQuotaDetail(project429("0")), T0 + 60_000);

  const view = await held(key);
  expect(view?.status).toBe("quota_exhausted");
  expect(view?.invalid).toBe(false);

  await removeKey(key);
});

test("a healthy probe clears only a retirement it observed after", async () => {
  const key = "AIzaRACEHEALTH1";
  await fresh(key);

  await markInvalid(key, T0, "leaked");
  await markHealthy(key, T0 - 1_000);

  // The success predates the revocation: a revoked key cannot be revived by an
  // answer that was already in flight when it was killed.
  expect((await held(key))?.status).toBe("dead");
  expect((await held(key))?.invalid).toBe(true);

  await markHealthy(key, T0 + 1_000);
  const revived = await held(key);
  expect(revived?.status).toBe("ready");
  expect(revived?.invalid).toBe(false);

  await removeKey(key);
});

/* ---------- durable guard ---------- */

type Row = {
  id: string;
  enabled: boolean;
  status: string;
  retired_at: number | null;
  retired_reason: string | null;
};

let rows: Row[] = [];
let statements: string[] = [];

/**
 * Fake executor that keeps one row and enforces the guards in the SQL.
 *
 * The statements are matched by shape, not exact text, but the decision is
 * made from the parameters and the row exactly as Postgres would: a write is
 * dropped when the recorded retirement is newer than the observing verdict.
 * That is the property under test — a bare `update keys set enabled = true`
 * would pass the revive cases and fail the ordering ones.
 */
function install(seed: Row | null): void {
  rows = seed ? [seed] : [];
  statements = [];
  setSqlRunner(async <T,>(query: string, params: unknown[]): Promise<SqlResult<T>> => {
    statements.push(query);
    const q = query.replace(/\s+/g, " ").toLowerCase();
    const row = rows.find((r) => r.id === params[0]);
    if (row) {
      if (q.includes("retired_at = case")) {
        const at = Date.parse(String(params[1]));
        if (row.retired_at === null || row.retired_at <= at) {
          row.retired_at = at;
          row.retired_reason = String(params[2]);
        }
        row.enabled = false;
        row.status = "dead";
      } else if (q.includes("retired_at = null")) {
        const at = Date.parse(String(params[1]));
        if (row.retired_at === null || row.retired_at <= at) {
          row.enabled = true;
          row.status = String(params[2]);
          row.retired_at = null;
          row.retired_reason = null;
        }
      } else if (q.includes("set status = $2")) {
        const at = Date.parse(String(params[2]));
        if (row.retired_at === null || row.retired_at <= at) row.status = String(params[1]);
      }
    }
    return { ok: true, rows: [] };
  });
}

test("the durable revival is refused by a retirement newer than the verdict", async () => {
  const key = "AIzaRACEDURABLE1";
  const id = keyId(key);
  install({
    id,
    enabled: false,
    status: "dead",
    retired_at: T0 + 10_000,
    retired_reason: "leaked",
  });

  // In memory this verdict is new, so the pool does issue a revival; the row
  // is the arbiter because another instance retired the key at T0+10s.
  await markQuotaExhausted(key, parseQuotaDetail(project429("15")), T0 + 1_000);
  await settle();

  expect(statements.some((s) => /retired_at = null/i.test(s))).toBe(true);
  expect(rows[0].enabled).toBe(false);
  expect(rows[0].status).toBe("dead");
  expect(rows[0].retired_reason).toBe("leaked");
  expect(rows[0].retired_at).toBe(T0 + 10_000);
});

test("the durable revival clears a retirement older than the verdict", async () => {
  const key = "AIzaRACEDURABLE2";
  const id = keyId(key);
  install({
    id,
    enabled: false,
    status: "dead",
    retired_at: T0 - 10_000,
    retired_reason: "zero_quota",
  });

  await markQuotaExhausted(key, parseQuotaDetail(project429("0")), T0);
  await settle();

  expect(rows[0].enabled).toBe(true);
  expect(rows[0].status).toBe("quota_exhausted");
  expect(rows[0].retired_at).toBeNull();
  expect(rows[0].retired_reason).toBeNull();
});

test("a legacy row with no retirement clock is revivable, and retirement never shortens", async () => {
  const key = "AIzaRACEDURABLE3";
  const id = keyId(key);
  install({ id, enabled: false, status: "dead", retired_at: null, retired_reason: null });

  // Rows retired before `retired_at` existed carry NULL, meaning "infinitely
  // old": a live verdict may still revive them.
  await markHealthy(key, T0);
  await settle();
  expect(rows[0].enabled).toBe(true);
  expect(rows[0].status).toBe("ready");
  expect(rows[0].retired_at).toBeNull();

  // A later retirement stamps the clock; an older one must not roll it back.
  await markInvalid(key, T0 + 5_000, "leaked");
  await settle();
  expect(rows[0].retired_at).toBe(T0 + 5_000);
  expect(rows[0].retired_reason).toBe("leaked");
  expect(rows[0].enabled).toBe(false);
});