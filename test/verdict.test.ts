/**
 * The key verdict contract, end to end.
 *
 * Three layers, each pinned against a real envelope rather than prose:
 *   - `classifyResponse` turns one upstream answer into exactly one verdict;
 *   - the tier evidence that rides on a 429 body, which is the ONLY place a
 *     plan may be inferred from (a 200 carries no marker at all);
 *   - the pool transitions the admin routes fold those verdicts into.
 *
 * The two 429 shapes read almost identically — both say "per minute", both
 * name a metric — and differ only in structure: the free tier lists a
 * `QuotaFailure.violations[]` with no limit value, the project shape carries
 * `ErrorInfo.metadata.quota_limit_value`.
 */
import { beforeAll, expect, test } from "bun:test";

import "./env.ts";

import { ensureMock } from "./env.ts";
import { setSqlRunner, type SqlResult } from "../src/db.ts";

import { cfg } from "../src/config.ts";
import {
  addKey,
  deadKeys,
  type KeyView,
  listKeys,
  mark429,
  markHealthy,
  markInvalid,
  markQuotaExhausted,
  markUnverified,
  keyId,
  pick,
  removeKey,
  removeKeyById,
  snapshot,
} from "../src/pool.ts";
import { probeKey, probeTier } from "../src/probe.ts";
import { classifyResponse, parseQuotaDetail, retryDelayMs, tierEvidenceFrom } from "../src/verdict.ts";

/** The real free-tier envelope: a violation, no limit value, a daily window. */
type Call = { query: string; params: unknown[] };

let calls: Call[] = [];

/** A fake executor that records every statement the pool persists. */
function install(): void {
  calls = [];
  setSqlRunner(async <T>(query: string, params: unknown[]): Promise<SqlResult<T>> => {
    calls.push({ query, params });
    return { ok: true, rows: [] };
  });
}

const FREE_TIER_429 = JSON.stringify({
  error: {
    code: 429,
    message: "You exceeded your current quota, please check your plan and billing details.",
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [
          {
            quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
            quotaDimensions: { model: "gemini-2.5-flash", location: "global" },
          },
        ],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "30659s" },
    ],
  },
});

/** The project shape: ErrorInfo metadata, and a limit value that decides everything. */
function project429(limitValue: string): string {
  return JSON.stringify({
    error: {
      code: 429,
      message:
        "Quota exceeded for quota metric 'Generate Content API requests per minute' and limit " +
        "'GenerateContent request limit per minute for a region'.",
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "RATE_LIMIT_EXCEEDED",
          domain: "googleapis.com",
          metadata: {
            quota_limit_value: limitValue,
            consumer: "projects/160256998078",
            quota_location: "asia-southeast1",
            quota_limit: "GenerateContentRequestsPerMinutePerProjectPerRegion",
            quota_metric: "generativelanguage.googleapis.com/generate_content_requests",
          },
        },
      ],
    },
  });
}

const LEAKED_403 = JSON.stringify({
  error: {
    code: 403,
    status: "PERMISSION_DENIED",
    message: "Your API key was reported as leaked. Please use another API key.",
  },
});

const RETIRED_404 = JSON.stringify({
  error: {
    code: 404,
    status: "NOT_FOUND",
    message: "models/gemini-1.0-pro is no longer available to new users.",
  },
});

beforeAll(ensureMock);

/* ---------- the seven verdicts ---------- */

test("every transport and status class maps to exactly one verdict", () => {
  expect(classifyResponse(0, "").verdict).toBe("network_error");
  expect(classifyResponse(200, "{}").verdict).toBe("ok");
  expect(classifyResponse(204, "").verdict).toBe("ok");
  expect(classifyResponse(401, "{}").verdict).toBe("invalid");
  expect(classifyResponse(403, LEAKED_403).verdict).toBe("invalid");
  expect(classifyResponse(403, '{"error":{"message":"Permission denied."}}').verdict).toBe("unexpected");
  expect(classifyResponse(500, "{}").verdict).toBe("server_error");
  expect(classifyResponse(503, "{}").verdict).toBe("server_error");
  expect(classifyResponse(418, "{}").verdict).toBe("unexpected");
  expect(classifyResponse(400, '{"error":{"message":"bad request"}}').verdict).toBe("unexpected");
});

test("a retired model never mints a key verdict", () => {
  const r = classifyResponse(404, RETIRED_404);
  expect(r.verdict).toBe("unexpected");
  expect(r.quota).toBeNull();
  expect(r.tierEvidence).toBeNull();

  // A model that cannot answer generateContent is equally a model property.
  const unavailable = JSON.stringify({
    error: { code: 400, message: "models/x does not support generateContent." },
  });
  expect(classifyResponse(400, unavailable).verdict).toBe("unexpected");
});

/* ---------- the two 429 shapes ---------- */

test("a free-tier 429 is rate limiting, and proves the free plan", () => {
  const r = classifyResponse(429, FREE_TIER_429);
  expect(r.verdict).toBe("rate_limited");
  expect(r.quota?.freeTier).toBe(true);
  expect(r.quota?.quotaId).toBe("GenerateRequestsPerDayPerProjectPerModel-FreeTier");
  expect(r.quota?.limitValue).toBeNull();
  expect(r.quota?.window).toBe("per_day_per_project_per_model");
  expect(r.tierEvidence?.tier).toBe("free");
  expect(r.tierEvidence?.source).toBe("violations");
});

test("a project 429 is decided by the limit value, never by the prose", () => {
  const zero = classifyResponse(429, project429("0"));
  expect(zero.verdict).toBe("quota_exhausted");
  expect(zero.quota?.window).toBe("per_minute_per_project_per_region");
  expect(zero.tierEvidence?.tier).toBe("paid");
  expect(zero.tierEvidence?.source).toBe("consumer");
  expect(zero.tierEvidence?.consumer).toBe("projects/160256998078");

  const positive = classifyResponse(429, project429("15"));
  expect(positive.verdict).toBe("rate_limited");
  expect(positive.quota?.limitValue).toBe("15");
  expect(positive.tierEvidence?.tier).toBe("paid");
});

test("a 429 with no structure is still rate limiting, with nothing to describe", () => {
  const bare = JSON.stringify({ error: { code: 429, message: "Quota exceeded. reset after 2s" } });
  const r = classifyResponse(429, bare, { "retry-after": "2" });
  // No violation and no metadata: there is no quota shape to describe, so the
  // verdict rests on the status alone.
  expect(r.verdict).toBe("rate_limited");
  expect(r.quota).toBeNull();
  expect(r.tierEvidence).toBeNull();
});

test("RetryInfo.retryDelay is parsed as a protobuf duration", () => {
  expect(retryDelayMs(FREE_TIER_429)).toBe(30_659_000);
  expect(retryDelayMs(project429("0"))).toBeNull();
  expect(retryDelayMs("not json")).toBeNull();
});

test("tier evidence is null when a body proves neither plan", () => {
  expect(tierEvidenceFrom('{"error":{"code":429,"message":"slow down"}}')).toBeNull();
  expect(tierEvidenceFrom("")).toBeNull();
});

test("quota parsing tolerates a missing body entirely", () => {
  expect(parseQuotaDetail("")).toBeNull();
  expect(parseQuotaDetail("{}")).toBeNull();
});

/* ---------- probe: the live classification over the mock ---------- */

async function serve(key: string, model: string): Promise<Response> {
  return fetch(`${cfg.upstream}/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
  });
}

test("probeKey separates a live key, a throttled key and a leaked key", async () => {
  const good = await probeKey("AIzaVERDICTGOOD1", "gemini-2.5-flash");
  expect(good.status).toBe("ok");
  expect(good.tierEvidence ?? null).toBeNull();

  const free = await probeKey("AIzaVERDICTFREEQUOTA1", "gemini-2.5-flash");
  expect(free.status).toBe("rate_limited");
  expect(free.quota?.freeTier).toBe(true);
  expect(free.tierEvidence?.tier).toBe("free");

  // A project with no allowance is not a dead credential.
  const zero = await probeKey("AIzaVERDICTZEROQUOTA1", "gemini-2.5-flash");
  expect(zero.status).toBe("zero_quota");
  expect(zero.tierEvidence?.tier).toBe("paid");
});

test("probeTier proves free by elimination and paid on the same model", async () => {
  // The free project gets a 404 on the older image model and a 429 on the
  // first one, so the first answer already carries the evidence.
  const free = await probeTier("AIzaVERDICTFREEQUOTA2", 4000);
  expect(free.verdict).toBe("rate_limited");
  expect(free.httpStatus).toBe(429);
  expect(free.tierEvidence?.tier).toBe("free");

  const paid = await probeTier("AIzaVERDICTPAIDQUOTA2", 4000);
  expect(paid.verdict).toBe("quota_exhausted");
  expect(paid.httpStatus).toBe(429);
  expect(paid.quota?.limitValue).toBe("0");
  expect(paid.tierEvidence?.tier).toBe("paid");
});

/* ---------- pool transitions ---------- */

async function held(key: string): Promise<KeyView | undefined> {
  return (await listKeys()).find((k) => k.key.endsWith(key.slice(-4)));
}

/**
 * Leave `key` as the only member of the pool.
 *
 * Pool state is global to the test process, so a selection assertion is only
 * meaningful once every other file's keys are gone.
 */
async function onlyKey(key: string): Promise<void> {
  for (const k of await listKeys()) {
    if (!k.key.endsWith(key.slice(-4))) await removeKeyById(k.id);
  }
  if (!(await held(key))) await addKey(key);
}

test("a rate-limited key cools down and its plan reads unspecified", async () => {
  const key = "AIzaVERDICTPOOLRATE1";
  await removeKey(key);
  await onlyKey(key);
  await mark429(key, 60_000, parseQuotaDetail(FREE_TIER_429));

  const view = await held(key);
  expect(view?.status).toBe("cooling");
  expect(view?.plan).toBe("unspecified");
  expect(view?.nextAccessAt).toBeGreaterThan(Date.now());
  // A throttled key is a live credential, so it is never disabled.
  expect(view?.invalid).toBe(false);
  expect(await pick()).toBeNull();
  await removeKey(key);
});

test("an exhausted project keeps the key enrolled but out of rotation", async () => {
  const key = "AIzaVERDICTPOOLQUOTA1";
  await removeKey(key);
  await onlyKey(key);
  await markQuotaExhausted(key, parseQuotaDetail(project429("0")));

  const view = await held(key);
  expect(view?.status).toBe("quota_exhausted");
  expect(view?.plan).toBe("unspecified");
  // The credential is valid: only the project's allowance is gone.
  expect(view?.invalid).toBe(false);
  expect(view?.planEvidence?.tier).toBe("paid");
  // No reset was advertised, so no future instant makes it selectable.
  expect(await pick()).toBeNull();
  await removeKey(key);
});

test("an exhausted project is counted as quota exhausted, never as ready", async () => {
  const key = "AIzaVERDICTSNAPSHOT1";
  await removeKey(key);
  await onlyKey(key);
  await markQuotaExhausted(key, parseQuotaDetail(project429("0")));

  // The project holds no allocation, so no reset is advertised and
  // `retryAfterAt` stays 0. The snapshot must not count that as ready: the
  // key cannot serve, and reporting it as ready is what made the console
  // claim a rotation that does not exist.
  const snap = await snapshot();
  expect(snap.quota_exhausted).toBe(1);
  expect(snap.ready).toBe(0);
  expect(snap.total).toBe(1);
  await removeKey(key);
});

test("a quota exhausted key is re-enabled, so a cold start does not re-kill it", async () => {
  const key = "AIzaVERDICTREENABLE1";
  install();
  await removeKey(key);
  await onlyKey(key);

  // A key retired by an earlier verdict carries enabled=false in Postgres.
  // The upstream then answers with a quota refusal rather than a credential
  // rejection, which proves the credential is alive, so the durable
  // retirement flag must be cleared.
  await markInvalid(key);
  expect((await held(key))?.status).toBe("dead");

  await markQuotaExhausted(key, parseQuotaDetail(project429("0")));
  expect((await held(key))?.status).toBe("quota_exhausted");
  expect((await held(key))?.invalid).toBe(false);

  // Give the fire-and-forget persistence a turn, then read what was written.
  await new Promise((r) => setTimeout(r, 50));
  const enableWrites = calls.filter((c) => /update keys set enabled/i.test(c.query));
  expect(enableWrites.length).toBeGreaterThan(0);
  // The last enable write must turn the key back on: the durable "retired"
  // flag is what `hydrate()` reads back as invalid on a cold start.
  expect(enableWrites[enableWrites.length - 1].params[1]).toBe(true);
  expect(enableWrites[enableWrites.length - 1].params[0]).toBe(keyId(key));

  const statusWrites = calls.filter((c) => /update keys set status/i.test(c.query));
  expect(statusWrites.some((c) => c.params[1] === "quota_exhausted")).toBe(true);

  setSqlRunner(null);
  await removeKey(key);
});

test("a retired key is dead and never selected; a revived key serves again", async () => {
  const key = "AIzaVERDICTPOOLDEAD9";
  await removeKey(key);
  await onlyKey(key);
  await markInvalid(key);

  expect((await held(key))?.status).toBe("dead");
  expect(await deadKeys()).toContain((await held(key))!.key);
  expect(await pick()).toBeNull();

  await markHealthy(key);
  const view = await held(key);
  expect(view?.status).toBe("ready");
  expect(view?.invalid).toBe(false);
  expect(view?.plan).toBe("unknown");
  await removeKey(key);
});

test("an unverified key is withheld from selection until a probe passes", async () => {
  const key = "AIzaVERDICTPOOLNEW01";
  await removeKey(key);
  await onlyKey(key);
  await markUnverified(key);

  expect((await held(key))?.status).toBe("unverified");
  expect(await pick()).toBeNull();

  await markHealthy(key);
  expect((await held(key))?.status).toBe("ready");
  expect((await pick())?.key).toBe(key);
  await removeKey(key);
});