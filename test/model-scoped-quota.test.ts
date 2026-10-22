/**
 * A free-tier 429 that names one model is a verdict about the (key, model)
 * pair, never about the key. The pool must keep the credential in rotation for
 * every other model, advance the chain, and leave status/failures/cooldown
 * untouched. A project-shaped zero-quota 429 must still retire a key once the
 * whole chain agrees.
 */
import { beforeAll, expect, test } from "bun:test";

import "./env.ts";

import { ensureMock } from "./env.ts";
import { setPool } from "./harness.ts";

import app from "../src/app.ts";
import { listKeys, modelRefused, snapshot } from "../src/pool.ts";

beforeAll(ensureMock);

/** Free-tier allowance spent on 3.5-flash only. */
const MODELQUOTA = "AIzaPOOLMODELQUOTA1";
/** Project has no allocation at all — every model refuses. */
const ZERO = "AIzaPOOLZEROQUOTA1";

const FLASH = "gemini-3.5-flash";

const chat = (model: string) =>
  app.fetch(
    new Request("http://geminesx.test/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }] }),
    }),
  );

test("a model-scoped free-tier refusal advances the chain and leaves the key in rotation", async () => {
  await setPool([MODELQUOTA]);

  const res = await chat(FLASH);
  expect(res.status).toBe(200);
  const first: unknown = await res.json();
  const firstModel =
    first !== null && typeof first === "object" && "model" in first ? first.model : undefined;
  expect(firstModel).not.toBe(FLASH);

  const keys = await listKeys();
  expect(keys[0]?.status).toBe("ready");
  expect(keys[0]?.failures).toBe(0);
  expect(keys[0]?.invalid).toBe(false);
  expect(keys[0]?.cooldownUntil).toBe(0);
  expect((await snapshot()).ready).toBe(1);

  // The refusal is recorded against the pair, so it is not re-fired.
  expect(modelRefused(MODELQUOTA, FLASH)).toBe(true);

  // A second identical request must not stall in the pool-exhaustion wait:
  // the refusal deadline is the next UTC midnight, which no sleep can clear.
  const started = Date.now();
  const again = await chat(FLASH);
  const elapsed = Date.now() - started;
  expect(again.status).toBe(200);
  const second: unknown = await again.json();
  const secondModel =
    second !== null && typeof second === "object" && "model" in second ? second.model : undefined;
  expect(secondModel).not.toBe(FLASH);
  expect(elapsed).toBeLessThan(4_000);
});

test("a project-shaped zero quota still retires the key once every model refuses", async () => {
  await setPool([ZERO]);

  const res = await chat(FLASH);
  expect(res.status).toBe(429);

  // This shape blames the project, not a model: no per-model refusal exists.
  expect(modelRefused(ZERO, FLASH)).toBe(false);

  const keys = await listKeys();
  expect(keys[0]?.invalid).toBe(true);
});