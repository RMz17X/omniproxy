/**
 * Usage ledger: row shape, token capture, cost maths and the read-side
 * aggregation the console renders.
 *
 * The ledger is process-local by design (no Redis), so every test here works
 * against the same in-process ring the gateway uses in production.
 */
import { expect, test } from "bun:test";

import "./env.ts";

import {
  beginUsage,
  commitUsage,
  costFor,
  finalizeStream,
  noteUsage,
  routeOf,
  toCsv,
  usageOverview,
} from "../src/usage.ts";

/** Current ring size, read through the public overview. */
function ringSize(): number {
  return usageOverview(1, 1).totalRows;
}

const mkReq = (path: string, method = "POST") =>
  new Request(`http://localhost${path}`, {
    method,
    body: method === "GET" ? undefined : "{}",
  });

test("routeOf maps gateway paths and ignores console/health traffic", () => {
  expect(routeOf("/v1/chat/completions")).toBe("chat.completions");
  expect(routeOf("/v1/audio/speech")).toBe("audio.speech");
  expect(routeOf("/v1/embeddings")).toBe("embeddings");
  expect(routeOf("/v1/models")).toBe("models.list");
  expect(routeOf("/v1beta/models/gemini-3.8-flash:generateContent")).toBe("gemini.passthrough");
  expect(routeOf("/pengatur/usage")).toBe(null);
  expect(routeOf("/pengatur/usage/data")).toBe(null);
  expect(routeOf("/health")).toBe(null);
  expect(routeOf("/")).toBe(null);
});

test("costFor prices a catalogued model and refuses to invent a price", () => {
  // gemini-3.8-flash: $0.75 / 1M in, $3.75 / 1M out.
  const cost = costFor("gemini-3.8-flash", 1_000_000, 1_000_000);
  expect(cost).not.toBe(null);
  expect(cost!).toBeCloseTo(4.5, 6);

  // Unknown id -> null, never 0 and never a guess.
  expect(costFor("totally-made-up-model", 1000, 1000)).toBe(null);
});

test("a committed row carries tokens, cost, status and the masked key", () => {
  const before = ringSize();
  const req = mkReq("/v1/chat/completions");

  beginUsage(req, "/v1/chat/completions", "chat.completions");
  noteUsage(req, {
    model: "gemini-3.8-flash",
    keyMasked: "AIzaOA…ST1",
    attempts: 1,
    rotated: false,
    promptTokens: 7,
    completionTokens: 3,
    totalTokens: 10,
  });
  const row = commitUsage(req, 200);

  expect(row).not.toBe(null);
  expect(row!.ok).toBe(true);
  expect(row!.promptTokens).toBe(7);
  expect(row!.completionTokens).toBe(3);
  expect(row!.totalTokens).toBe(10);
  expect(row!.costUsd).not.toBe(null);
  expect(row!.costUsd!).toBeGreaterThan(0);
  expect(row!.keyMasked).toBe("AIzaOA…ST1");
  // keyId is derived from the masked form, never from a raw credential.
  expect(row!.keyId).toHaveLength(12);
  expect(ringSize()).toBe(before + 1);
});

test("commit is idempotent: a second call does not duplicate the row", () => {
  const before = ringSize();
  const req = mkReq("/v1/embeddings");

  beginUsage(req, "/v1/embeddings", "embeddings");
  noteUsage(req, { model: "text-embedding-004", promptTokens: 12, totalTokens: 12 });
  expect(commitUsage(req, 200)).not.toBe(null);
  expect(commitUsage(req, 200)).toBe(null);

  expect(ringSize()).toBe(before + 1);
});

test("a stream-flagged collector is withheld until finalizeStream", () => {
  const before = ringSize();
  const req = mkReq("/v1/chat/completions");

  beginUsage(req, "/v1/chat/completions", "chat.completions");
  noteUsage(req, { model: "gemini-3.8-flash", stream: true, keyMasked: "AIzaOA…ST1" });

  // Middleware-level commit must not write a row for a live stream.
  expect(commitUsage(req, 200)).toBe(null);
  expect(ringSize()).toBe(before);

  noteUsage(req, { promptTokens: 5, completionTokens: 4, totalTokens: 9 });
  finalizeStream(req, 200);
  expect(ringSize()).toBe(before + 1);
});

test("aggregates bucket by model, key and day", () => {
  const req = mkReq("/v1/chat/completions");
  beginUsage(req, "/v1/chat/completions", "chat.completions");
  noteUsage(req, {
    model: "gemini-3.8-flash",
    keyMasked: "AIzaAG…GG99",
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
  });
  commitUsage(req, 200);

  const snap = usageOverview(1, 25);
  const model = snap.byModel.find((b) => b.key === "gemini-3.8-flash");
  const key = snap.byKey.find((b) => b.key === "AIzaAG…GG99");
  expect(model).toBeDefined();
  expect(model!.requests).toBeGreaterThanOrEqual(1);
  expect(key).toBeDefined();
  expect(key!.promptTokens).toBeGreaterThanOrEqual(100);
  expect(snap.byDay.length).toBeGreaterThanOrEqual(1);
});

test("error status is classified, not swallowed", () => {
  const req = mkReq("/v1/chat/completions");
  beginUsage(req, "/v1/chat/completions", "chat.completions");
  noteUsage(req, { model: "gemini-3.8-flash", errorCode: "http_429" });
  const row = commitUsage(req, 429);

  expect(row!.ok).toBe(false);
  expect(row!.status).toBe(429);
  expect(row!.errorCode).toBe("http_429");
});

test("filters narrow the row set by day, model, key and status", () => {
  const req = mkReq("/v1/audio/speech");
  beginUsage(req, "/v1/audio/speech", "audio.speech");
  noteUsage(req, { model: "gemini-3.8-flash-tts", keyMasked: "AIzaTT…TTS1" });
  commitUsage(req, 200);

  const total = usageOverview(1, 25).totalRows;
  const tts = usageOverview(1, 25, { model: "gemini-3.8-flash-tts" });
  expect(tts.totalRows).toBeGreaterThanOrEqual(1);
  expect(tts.totalRows).toBeLessThanOrEqual(total);
  expect(usageOverview(1, 25, { status: "error" }).rows.every((r) => !r.ok)).toBe(true);
  expect(
    usageOverview(1, 25, { key: "AIzaTT…TTS1" }).rows.every((r) => r.keyMasked === "AIzaTT…TTS1"),
  ).toBe(true);
});

test("csv output has a header and one line per row", () => {
  const snap = usageOverview(1, 5);
  const csv = toCsv(snap.rows);
  const lines = csv.trimEnd().split("\n");
  expect(lines[0]).toContain("promptTokens");
  expect(lines.length).toBe(snap.rows.length + 1);
});

test("pagination clamps to the ring and never returns page 0 rows", () => {
  const snap = usageOverview(9999, 25);
  expect(snap.rows.length).toBe(0);
  expect(snap.page).toBe(9999);
  expect(usageOverview(0, 25).page).toBe(1);
  expect(usageOverview(1, 100_000).pageSize).toBe(200);
});