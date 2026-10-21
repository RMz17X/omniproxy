/**
 * `/pengatur/*` gate: console shells are public for reads only, every mutating
 * verb presents the token. Driven through `app.request()`, no listener.
 */
import { expect, test } from "bun:test";

import "./env.ts";

import app from "../src/app.ts";

const TOKEN = "test-admin-token";

test("tokenless POST /pengatur/keys is 401, not the handler's 400", async () => {
  const res = await app.request("/pengatur/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(res.status).toBe(401);
});

test("tokenless DELETE /pengatur/keys is 401", async () => {
  const res = await app.request("/pengatur/keys", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(res.status).toBe(401);
});

test("an authorised empty body reaches the handler and is 400", async () => {
  const res = await app.request("/pengatur/keys", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
    },
    body: "{}",
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { message: string } };
  expect(body.error.message).toBe("No keys supplied.");
});

test("an authorised add reports added and durable", async () => {
  const res = await app.request("/pengatur/keys", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ keys: ["AIzaGATE1"] }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { added: number; durable: unknown };
  expect(body.added).toBe(1);
  expect(typeof body.durable).toBe("boolean");
});

test("the keys shell stays public", async () => {
  const res = await app.request("/pengatur/keys");
  expect(res.status).toBe(200);
});

test("the keys data endpoint stays gated", async () => {
  const res = await app.request("/pengatur/keys/list");
  expect(res.status).toBe(401);
});