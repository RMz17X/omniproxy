/**
 * Dynamic providers: only gemini and elevenlabs are protected builtins.
 * WhatsToken is an ordinary operator-added upstream: it registers with
 * builtin=false, refuses removal while keys are attached, and removes
 * cleanly once its keys are gone. Tool calls ride on chat (llm) — there is
 * no separate toolcalls capability, so nothing here tests for one.
 */
import "./env.ts";

import { expect, test } from "bun:test";

import { addKey, listKeys, removeKey } from "../src/pool.ts";
import {
  allProviders,
  builtinProviders,
  getProvider,
  registerProvider,
  removeProvider,
} from "../src/providers.ts";

const WT_KEY = "sk-wt-dynamic-test-1234567890";

async function freshIds(): Promise<string[]> {
  return (await allProviders(true)).map((p) => p.id);
}

test("only gemini and elevenlabs are protected builtins", () => {
  expect(builtinProviders().map((p) => p.id)).toEqual(["gemini", "elevenlabs"]);
  expect(builtinProviders().every((p) => p.builtin)).toBe(true);
});

test("a fresh registry holds only the protected defaults", async () => {
  expect(await freshIds()).toEqual(["gemini", "elevenlabs"]);
});

test("builtin ids still cannot be redefined", async () => {
  await expect(
    registerProvider({
      id: "gemini",
      label: "Fake",
      baseUrl: "https://example.com/v1",
      capabilities: ["llm"],
    }),
  ).rejects.toThrow("builtin");
});

test("whatstoken registers as an ordinary removable provider", async () => {
  const p = await registerProvider({
    id: "whatstoken",
    label: "WhatsToken",
    baseUrl: "https://www.whatstoken.ai/v1",
    capabilities: ["llm"],
    keyPattern: "^sk-[A-Za-z0-9_-]{16,}$",
    models: ["deepseek-v4.1-flash-1017"],
    note: "DeepSeek models through the WhatsToken gateway. Chat only.",
  });
  expect(p.builtin).toBe(false);
  const found = await getProvider("whatstoken");
  expect(found?.builtin).toBe(false);
  expect(found?.wire).toBe("openai");
});

test("removal is refused while keys are attached, then succeeds", async () => {
  expect(await addKey(WT_KEY, "whatstoken")).toBe(true);
  expect((await listKeys("whatstoken")).length).toBe(1);
  const refused = await removeProvider("whatstoken");
  expect(refused.ok).toBe(false);
  expect(refused.error ?? "").toContain("still belong");
  expect(await getProvider("whatstoken")).not.toBeNull();

  expect(await removeKey(WT_KEY)).toBe(true);
  const removed = await removeProvider("whatstoken");
  expect(removed.ok).toBe(true);
  expect(await getProvider("whatstoken")).toBeNull();
  expect(await freshIds()).toEqual(["gemini", "elevenlabs"]);
});

test("protected defaults still cannot be removed", async () => {
  const r = await removeProvider("gemini");
  expect(r.ok).toBe(false);
  expect(r.error ?? "").toContain("Builtin");
});
