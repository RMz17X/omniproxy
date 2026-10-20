/**
 * Live probe: classification against the mock upstream, plus the admin route
 * that folds a verdict back into pool state.
 */
import { beforeAll, expect, test } from "bun:test";

import "./env.ts";

import { ensureMock } from "./env.ts";
import { setPool } from "./harness.ts";

import app from "../src/app.ts";
import { cfg } from "../src/config.ts";
import { listKeys, mark429, maskKey, snapshot } from "../src/pool.ts";
import { probeKey } from "../src/probe.ts";

beforeAll(ensureMock);

const find = async (raw: string) => (await listKeys()).find((k) => k.key === maskKey(raw));

/** Admin routes are bearer-gated; every fetch in this file carries the token. */
const AUTH = { authorization: "Bearer test-admin-token", "content-type": "application/json" };

const adminPost = (path: string, body?: unknown) =>
  app.fetch(
    new Request(`http://geminesx.test${path}`, {
      method: "POST",
      headers: AUTH,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

test("a serving key probes as ok", async () => {
  await setPool(["AIzaPOOLGOOD1"]);
  const r = await probeKey("AIzaPOOLGOOD1");
  expect(r.status).toBe("ok");
  expect(r.httpStatus).toBe(200);
  expect(r.latencyMs).toBeGreaterThanOrEqual(0);
});

test("a rate-limited key probes as rate_limited and carries the upstream wait", async () => {
  await setPool(["AIzaPOOL429X"]);
  const r = await probeKey("AIzaPOOL429X");
  expect(r.status).toBe("rate_limited");
  expect(r.httpStatus).toBe(429);
  // Mock sends `retry-after: 2`
  expect(r.retryAfterMs).toBe(2000);
  expect(r.message).toContain("reset after 2s");
});

test("a revoked key probes as invalid", async () => {
  await setPool(["AIzaPOOLDEAD1"]);
  const r = await probeKey("AIzaPOOLDEAD1");
  expect(r.status).toBe("invalid");
  expect(r.httpStatus).toBe(400);
});

test("a 5xx key probes as server_error, not invalid", async () => {
  await setPool(["AIzaPOOLBOOM1"]);
  const r = await probeKey("AIzaPOOLBOOM1");
  expect(r.status).toBe("server_error");
  expect(r.httpStatus).toBe(500);
});

test("probing a cooling key with a 429 re-parks it with the upstream wait", async () => {
  await setPool(["AIzaPOOL429X"]);
  // Parked far in the future, as if it had failed minutes ago.
  await mark429("AIzaPOOL429X", 600_000);

  const res = await adminPost("/pengatur/keys/test", { key: "AIzaPOOL429X" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    ok: boolean;
    id: string;
    applied: string;
    probe: { status: string; retryAfterMs: number };
  };
  expect(body.ok).toBe(true);
  expect(body.id).toHaveLength(12);
  expect(body.probe.status).toBe("rate_limited");
  expect(body.probe.retryAfterMs).toBe(2000);
  expect(body.applied).toBe("cooling");

  // The 10 minute park is replaced by the live window, never left in place.
  // The rotator floors a cooldown at cfg.cooldownMs (5000 in tests), so the
  // upstream 2s hint alone cannot shorten the park below the floor.
  const floor = Math.max(cfg.cooldownMs, body.probe.retryAfterMs);
  const parked = await find("AIzaPOOL429X");
  expect(parked?.cooldownLeftMs).toBeLessThanOrEqual(floor + 100);
  expect(parked?.cooldownLeftMs).toBeLessThan(600_000);
  expect(parked?.status).toBe("cooling");
});

test("a successful probe revives a cooling key immediately", async () => {
  await setPool(["AIzaPOOLGOOD1"]);
  await mark429("AIzaPOOLGOOD1", 600_000);
  expect((await find("AIzaPOOLGOOD1"))?.status).toBe("cooling");

  const res = await adminPost("/pengatur/keys/test", { key: "AIzaPOOLGOOD1" });
  const body = (await res.json()) as { applied: string; probe: { status: string }; pool: { ready: number } };
  expect(body.probe.status).toBe("ok");
  expect(body.applied).toBe("revived");
  expect(body.pool.ready).toBe(1);

  const revived = await find("AIzaPOOLGOOD1");
  expect(revived?.status).toBe("ready");
  expect(revived?.cooldownLeftMs).toBe(0);
  expect(revived?.failures).toBe(0);
});

test("probing an unknown id is a 404, not a crash", async () => {
  await setPool(["AIzaPOOLGOOD1"]);
  const res = await adminPost("/pengatur/keys/test", { id: "000000000000" });
  expect(res.status).toBe(404);
});

test("test-all skips dead keys and reports the pool", async () => {
  await setPool(["AIzaPOOLGOOD1", "AIzaPOOL429X"]);
  const res = await adminPost("/pengatur/keys/test-all");
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    tested: number;
    results: { probe: { status: string } }[];
    pool: { total: number };
  };
  expect(body.tested).toBe(2);
  expect(body.pool.total).toBe(2);
  const statuses = body.results.map((r) => r.probe.status).sort();
  expect(statuses).toEqual(["ok", "rate_limited"]);
  expect((await snapshot()).ready).toBe(1);
});