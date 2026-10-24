/**
 * Rollup and retention against a fake executor: the SQL shape is asserted
 * exactly, and the day maths is checked in WIB, not UTC.
 */
import { expect, test } from "bun:test";

import "./env.ts";

import { setSqlRunner, type SqlRunner } from "../src/db.ts";
import { pruneOlderThan, rollupDay, wibDayOf, yesterdayWib } from "../src/rollup.ts";

type Call = { text: string; params: unknown[] };

function fakeDb(rows: unknown[] = []): Call[] {
  const calls: Call[] = [];
  setSqlRunner((async (text: string, params: unknown[]) => {
    calls.push({ text, params });
    return { ok: true, rows };
  }) as SqlRunner);
  return calls;
}

test("a WIB day is the UTC day shifted by seven hours", () => {
  expect(wibDayOf(Date.parse("2026-10-20T17:00:00.000Z"))).toBe("2026-10-21");
  expect(wibDayOf(Date.parse("2026-10-20T16:59:59.000Z"))).toBe("2026-10-20");
});

test("the default target is yesterday in WIB", () => {
  const now = Date.parse("2026-10-21T03:00:00.000Z");
  expect(yesterdayWib(now)).toBe("2026-10-20");
});

test("rollup deletes the day's buckets and rebuilds them from raw events", async () => {
  const calls = fakeDb([{ "?column?": 1 }, { "?column?": 1 }]);
  try {
    const res = await rollupDay("2026-10-21");
    expect(res).toEqual({ day: "2026-10-21", buckets: 2, ok: true });

    // Recompute-and-replace in two statements: clearing first is what makes a
    // rerun converge instead of failing on the primary key.
    expect(calls.length).toBe(2);
    expect(calls[0].text).toContain("delete from usage_daily where day = $1::date");
    expect(calls[0].params).toEqual(["2026-10-21"]);
    const text = calls[1].text;
    expect(text).toContain("insert into usage_daily");
    // The bucket key gained the provider column: the same model name can be
    // served by different gateways, so the four old columns no longer
    // identify one bucket.
    expect(text).toContain("on conflict (day, route, model, key_id, provider) do update");
    expect(text).toContain("percentile_cont(0.5)");
    expect(text).toContain("percentile_cont(0.95)");
    expect(text).toContain("count(*) filter (where status >= 400)");
    // usage_daily stores prompt and completion tokens only. Naming a column the
    // table does not have makes the whole statement fail with 42703, and the
    // failure is invisible unless ok:false is surfaced.
    const insert = text.slice(text.indexOf("insert into usage_daily"));
    expect(insert).not.toContain("total_tokens");
    expect(insert).toContain("prompt_tokens, completion_tokens");
    expect(calls[1].params).toEqual([
      "2026-10-21",
      "2026-10-20T17:00:00.000Z",
      "2026-10-21T17:00:00.000Z",
    ]);
  } finally {
    setSqlRunner(null);
  }
});

test("running the same day twice issues the same statement", async () => {
  const calls = fakeDb();
  try {
    await rollupDay("2026-10-21");
    await rollupDay("2026-10-21");
    expect(calls.length).toBe(4);
    expect(calls[0].text).toBe(calls[2].text);
    expect(calls[1].text).toBe(calls[3].text);
    expect(calls[0].params).toEqual(calls[2].params);
    expect(calls[1].params).toEqual(calls[3].params);
  } finally {
    setSqlRunner(null);
  }
});

test("an invalid day falls back to yesterday instead of failing", async () => {
  const calls = fakeDb();
  try {
    const res = await rollupDay("not-a-day");
    expect(res.day).toBe(yesterdayWib());
    expect(calls[0].params[0]).toBe(yesterdayWib());
  } finally {
    setSqlRunner(null);
  }
});

test("retention deletes old events and keeps the daily table", async () => {
  const calls = fakeDb([{}, {}, {}]);
  try {
    expect(await pruneOlderThan(30)).toEqual({ pruned: 3, ok: true });
    expect(calls[0].text).toContain("delete from usage_events");
    expect(calls[0].text).not.toContain("usage_daily");
    expect(calls[0].params).toEqual([30]);
  } finally {
    setSqlRunner(null);
  }
});

test("no database configured is a zero, not a throw", async () => {
  setSqlRunner(null);
  expect(await rollupDay("2026-10-21")).toEqual({
    day: "2026-10-21",
    buckets: 0,
    ok: false,
    error: "database disabled",
  });
  expect(await pruneOlderThan(30)).toEqual({ pruned: 0, ok: false, error: "database disabled" });
});

test("a rejected query reports ok:false with its reason instead of a zero", async () => {
  setSqlRunner((async () => ({
    ok: false,
    reason: "error",
    message: 'column "total_tokens" does not exist',
  })) as SqlRunner);
  try {
    const res = await rollupDay("2026-10-21");
    expect(res.ok).toBe(false);
    expect(res.buckets).toBe(0);
    expect(res.error).toContain("total_tokens");
  } finally {
    setSqlRunner(null);
  }
});
