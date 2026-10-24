/**
 * Model-level fallback and anonymous-route redaction.
 *
 * The point of this file is the *boundary* between a model failure and a key
 * failure. A retired model (404) or an overloaded one (503) says nothing about
 * the credential, so the router must move to the next model and leave the key
 * untouched. Only a credential-level answer may park a key.
 */
import { beforeAll, expect, test } from "bun:test";

import "./env.ts";

import { ensureMock } from "./env.ts";
import { setPool } from "./harness.ts";

import app from "../src/app.ts";
import { chatCompletions, visibleModels } from "../src/openai.ts";
import { listKeys, snapshot } from "../src/pool.ts";
import { probeKey } from "../src/probe.ts";

beforeAll(ensureMock);

const GOOD = "AIzaPOOLGOOD1";
/** Out of quota on every model. */
const ZERO = "AIzaPOOLZEROQUOTA1";
/** Out of quota on 3.5-flash only; the other models still serve it. */
const HALF = "AIzaPOOLHALFQUOTA1";

const chat = (model: string) =>
  app.fetch(
    new Request("http://omniproxy.test/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }] }),
    }),
  );

const ADMIN = { authorization: "Bearer test-admin-token" };

test("a retired model falls through to the next model and the key stays healthy", async () => {
  await setPool([GOOD]);

  const res = await chat("gemini-retired-model");
  expect(res.status).toBe(200);

  // The key must not be parked: a model that is gone is not a key problem.
  const keys = await listKeys();
  expect(keys[0]?.status).toBe("ready");
  expect(keys[0]?.failures).toBe(0);
  expect(keys[0]?.invalid).toBe(false);
  expect((await snapshot()).ready).toBe(1);
});

test("an overloaded model falls through to the next model", async () => {
  await setPool([GOOD]);

  const res = await chat("gemini-busy-model");
  expect(res.status).toBe(200);

  const keys = await listKeys();
  expect(keys[0]?.status).toBe("ready");
  expect(keys[0]?.failures).toBe(0);
});

test("the answer names the model that actually served, not the one requested", async () => {
  await setPool([GOOD]);

  const res = await chat("gemini-retired-model");
  const body = (await res.json()) as { model: string; choices: { message: { content: string } }[] };
  expect(body.model).not.toBe("gemini-retired-model");
  expect(body.choices[0].message.content).toContain("pong from");
});

test("a key out of quota on one model still serves through another", async () => {
  await setPool([HALF]);

  const res = await chat("gemini-3.5-flash");
  expect(res.status).toBe(200);

  // The 429 was for 3.5-flash only, so the key is not retired and the
  // fallback model answers.
  const keys = await listKeys();
  expect(keys[0]?.invalid).toBe(false);
});

test("a probe of a retired model does not condemn the key", async () => {
  await setPool([GOOD]);

  const r = await probeKey(GOOD, "gemini-retired-model");
  expect(r.status).toBe("ok");
});

test("a probe reports zero_quota only when every model agrees", async () => {
  await setPool([ZERO]);

  const r = await probeKey(ZERO);
  expect(r.status).toBe("zero_quota");
});

test("a key out of quota on one model alone is not retired by the probe", async () => {
  await setPool([HALF]);

  // 3.5-flash says zero quota, the next model serves: the key is alive.
  const r = await probeKey(HALF, "gemini-3.5-flash");
  expect(r.status).toBe("ok");
});

test("the retired list is filtered out of the model catalog", () => {
  const visible = visibleModels([
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.5-flash-image",
    "gemini-3.5-flash",
  ]);
  expect(visible).toContain("gemini-3.5-flash");
  // The image variant answers 429 (quota spent), not 404: it stays listed.
  expect(visible).toContain("gemini-2.5-flash-image");
  expect(visible).not.toContain("gemini-2.5-flash");
  expect(visible).not.toContain("gemini-2.5-flash-lite");
  expect(visible).not.toContain("gemini-2.5-pro");
});

test("the anonymous routes leak neither the pool nor the defaults", async () => {
  await setPool([GOOD, ZERO]);

  for (const path of ["/", "/health"]) {
    const res = await app.fetch(new Request(`http://omniproxy.test${path}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.pool).toBeUndefined();
    expect(body.defaults).toBeUndefined();
    expect(body.storage).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("total");
  }
});

test("the operator view is admin-gated and carries the full picture", async () => {
  await setPool([GOOD]);

  const anon = await app.fetch(new Request("http://omniproxy.test/pengatur/status"));
  expect(anon.status).toBe(401);

  const res = await app.fetch(
    new Request("http://omniproxy.test/pengatur/status", { headers: ADMIN }),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    ok: boolean;
    pool: { total: number; ready: number };
    defaults: { model: string; modelFallback: string[]; retiredModels: string[] };
  };
  expect(body.ok).toBe(true);
  expect(body.pool.total).toBe(1);
  expect(body.pool.ready).toBe(1);
  expect(body.defaults.model).toBeTruthy();
  expect(body.defaults.modelFallback.length).toBeGreaterThan(0);
  expect(body.defaults.retiredModels).toContain("gemini-2.5-flash");
});
