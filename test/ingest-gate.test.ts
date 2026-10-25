/**
 * Ingest gate: a key enters the pool only when the upstream confirms it is
 * alive and holds quota. Driven through `app.request()` against the mock
 * upstream, which answers per key: "dead" → 400 invalid, "zeroquota" → 429
 * with a zero limit, "leaked" → zero-quota on serve plus 403 on the leak
 * endpoint, "429" → a transient throttle with retry-after, clean → 200.
 */
import { beforeEach, expect, test } from "bun:test";

import "./env.ts";

import app from "../src/app.ts";
import { setPool } from "./harness.ts";

const TOKEN = "test-admin-token";

const ingest = (keys: string[]) =>
  app.request("/pengatur/keys", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ keys }),
  });

type IngestBody = {
  added: number;
  parked: number;
  rejected: { id: string; provider: string; reason: string }[];
  probed: { ok: number; rateLimited: number; inconclusive: number; refused: number };
};

beforeEach(async () => {
  await setPool([]);
});

test("a dead key is refused at the door", async () => {
  const res = await ingest(["AIzaTESTDEAD0000000000000001"]);
  expect(res.status).toBe(200);
  const body = (await res.json()) as IngestBody;
  expect(body.added).toBe(0);
  expect(body.probed.refused).toBe(1);
  expect(body.rejected[0]?.reason.startsWith("invalid:")).toBe(true);
});

test("a zero-quota key is refused: no quota means no admission", async () => {
  const res = await ingest(["AIzaTESTZEROQUOTA00000000001"]);
  const body = (await res.json()) as IngestBody;
  expect(body.added).toBe(0);
  expect(body.rejected[0]?.reason.startsWith("zero_quota:")).toBe(true);
});

test("a leaked key is refused by the leak probe", async () => {
  const res = await ingest(["AIzaTESTLEAKED00000000000001"]);
  const body = (await res.json()) as IngestBody;
  expect(body.added).toBe(0);
  expect(body.rejected[0]?.reason.startsWith("invalid:")).toBe(true);
});

test("a throttled key with quota left is admitted, parked until its window", async () => {
  const res = await ingest(["AIzaTEST429X000000000000001"]);
  const body = (await res.json()) as IngestBody;
  expect(body.added).toBe(1);
  expect(body.parked).toBe(1);
  expect(body.probed.rateLimited).toBe(1);
});

test("a live key is admitted ready", async () => {
  const res = await ingest(["AIzaTESTOK000000000000000001"]);
  const body = (await res.json()) as IngestBody;
  expect(body.added).toBe(1);
  expect(body.parked).toBe(0);
  expect(body.probed.ok).toBe(1);
});

test("a malformed key never reaches the probe", async () => {
  const res = await ingest(["AIzaSHORT"]);
  const body = (await res.json()) as IngestBody;
  expect(body.added).toBe(0);
  expect(body.rejected[0]?.reason).toContain("key format");
  expect(body.probed.refused).toBe(0);
});
