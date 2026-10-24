/**
 * Rotation and pool health, driven through `execute()` against the mock
 * upstream.
 */
import { beforeAll, expect, test } from "bun:test";

import "./env.ts";

import { ensureMock } from "./env.ts";
import { setPool } from "./harness.ts";

import { cfg } from "../src/config.ts";
import {
  addKey,
  deadKeys,
  listKeys,
  mark429,
  maskKey,
  markUsed,
  pick,
  snapshot,
} from "../src/pool.ts";
import { execute } from "../src/upstream.ts";
import type { ExecResult } from "../src/upstream.ts";

const PATH = "/v1beta/models/gemini-2.5-flash:generateContent";

beforeAll(ensureMock);

function generate(): Promise<ExecResult> {
  return execute(
    `${cfg.upstream}${PATH}`,
    {
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] }),
    },
    PATH,
  );
}

test("a 429 parks the key and the request retries on the next key", async () => {
  await setPool(["AIzaPOOL429X", "AIzaPOOLGOOD2"]);
  // Make the 429 key the least-recently-used one so it is picked first.
  await markUsed("AIzaPOOLGOOD2");

  const r = await generate();
  expect(r.response.status).toBe(200);
  expect(r.attempts).toBe(2);
  expect(r.rotated).toBe(true);
  expect(await r.response.text()).toContain("pong from");

  const parked = (await listKeys()).find((k) => k.key === maskKey("AIzaPOOL429X"));
  expect(parked?.cooldownLeftMs).toBeGreaterThan(0);
  expect(parked?.failures).toBe(1);
});

test("a key rejected as invalid is blacklisted and never selected again", async () => {
  await setPool(["AIzaPOOLDEAD1", "AIzaPOOLGOOD1"]);
  await markUsed("AIzaPOOLGOOD1");

  const r = await generate();
  expect(r.response.status).toBe(200);
  expect(r.rotated).toBe(true);

  expect(await deadKeys()).toContain(maskKey("AIzaPOOLDEAD1"));
  const listed = (await listKeys()).find((k) => k.key === maskKey("AIzaPOOLDEAD1"));
  expect(listed?.invalid).toBe(true);
  expect(listed?.cooldownLeftMs).toBeGreaterThan(0);
  expect((await snapshot()).dead).toBeGreaterThanOrEqual(1);
});

test("a 5xx parks the key briefly and the request retries", async () => {
  await setPool(["AIzaPOOLBOOM1", "AIzaPOOLGOOD1"]);
  await markUsed("AIzaPOOLGOOD1");

  const r = await generate();
  expect(r.response.status).toBe(200);
  expect(r.rotated).toBe(true);
  expect(r.attempts).toBe(2);

  const listed = (await listKeys()).find((k) => k.key === maskKey("AIzaPOOLBOOM1"));
  expect(listed?.failures).toBe(1);
});

test("an all-cooling pool answers 429 pool_exhausted without waiting out the cooldown", async () => {
  await setPool(["AIzaPOOL429X"]);
  await mark429("AIzaPOOL429X", 60_000);

  const t0 = Date.now();
  const r = await generate();
  const waited = Date.now() - t0;

  expect(r.response.status).toBe(429);
  const payload = (await r.response.json()) as { error?: { code?: string } };
  expect(payload.error?.code).toBe("pool_exhausted");
  // Bounded by MAX_WAIT_MS (600ms), not by the 60s cooldown.
  expect(waited).toBeLessThan(5_000);
});

test("key pool supports provider dimension and filters selection by provider", async () => {
  await setPool(["AIzaGEMINI1"]);
  await addKey("sk_test_elevenlabs_1", "elevenlabs");

  const keys = await listKeys();
  const eleven = keys.find((k) => k.provider === "elevenlabs");
  const gemini = keys.find((k) => k.provider === "gemini");

  expect(eleven).toBeDefined();
  expect(gemini).toBeDefined();

  // pick with provider filter
  const pickedEleven = await pick(new Set(), undefined, "elevenlabs");
  expect(pickedEleven?.key).toBe("sk_test_elevenlabs_1");
  expect(pickedEleven?.provider).toBe("elevenlabs");

  const pickedGemini = await pick(new Set(), undefined, "gemini");
  expect(pickedGemini?.key).toBe("AIzaGEMINI1");
  expect(pickedGemini?.provider).toBe("gemini");

  // snapshot includes byProvider breakdown
  const snap = await snapshot();
  expect(snap.byProvider).toBeDefined();
  expect(snap.byProvider["elevenlabs"]?.total).toBe(1);
  expect(snap.byProvider["gemini"]?.total).toBeGreaterThanOrEqual(1);
  expect(snap.providers["elevenlabs"]?.total).toBe(1);
});
