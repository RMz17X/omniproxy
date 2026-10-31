/**
 * Gemini TTS combo tests:
 * - the combo model id expands to the configured chain: when the lead
 *   model's quota is gone for the pool, the next chain model serves the
 *   same request (same key, same voice)
 * - when every chain model is out of quota, the caller gets the honest
 *   429 model_zero_quota, not a hang or a misroute
 * - a concrete model id does NOT fall back (the combo is opt-in by id)
 * - the combo is published in GET /v1/models and retrievable by bare id
 */
import { describe, expect, test } from "bun:test";
import "./env.ts";
import { setPool } from "./harness.ts";

import app from "../src/app.ts";

const speechReq = (model: string) =>
  new Request("http://localhost/v1/audio/speech", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, voice: "Kore", input: "halo, ini tes combo" }),
  });

describe("Gemini TTS combo (auto-fallback)", () => {
  test("falls through to the next chain model when the lead model's quota is gone", async () => {
    await setPool(["AIzaTTSQUOTA1"]);
    const res = await app.fetch(speechReq("gemini-tts-combo"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-omniproxy-model")).toBe("gemini-2.5-flash-preview-tts");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 4).toString()).toBe("RIFF");
  });

  test("surfaces model_zero_quota when every chain model is out of quota", async () => {
    await setPool(["AIzaZEROQUOTA9"]);
    const res = await app.fetch(speechReq("gemini-tts-combo"));
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("model_zero_quota");
  });

  test("a concrete model id does not fall back", async () => {
    await setPool(["AIzaTTSQUOTA1"]);
    const res = await app.fetch(speechReq("gemini-3.8-flash-tts"));
    expect(res.status).toBe(429);
  });

  test("the combo is published and retrievable in the models surface", async () => {
    await setPool(["AIzaPOOLGOOD1"]);
    const list = (await (await app.fetch(new Request("http://localhost/v1/models"))).json()) as {
      data: { id: string }[];
    };
    expect(list.data.some((m) => m.id === "gemini/gemini-tts-combo")).toBe(true);
    const one = await app.fetch(new Request("http://localhost/v1/models/gemini-tts-combo"));
    expect(one.status).toBe(200);
  });
});
