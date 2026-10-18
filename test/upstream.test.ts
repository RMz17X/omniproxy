/**
 * Upstream execution: Gemini TTS PCM to WAV container wrapping, native
 * passthrough, and retry/rotation behaviour.
 */
import { beforeAll, expect, test } from "bun:test";

import "./env.ts";

import { ensureMock } from "./env.ts";
import { setPool } from "./harness.ts";

import { addKey } from "../src/pool.ts";
import { geminiPassthrough, speech } from "../src/gemini.ts";

const TEST_KEY = "AIzaUPSTREAM1";

beforeAll(async () => {
  await ensureMock();
  await setPool([TEST_KEY]);
  await addKey(TEST_KEY);
});

test("wraps Gemini 16-bit 24kHz mono PCM into a valid WAV container", async () => {
  await setPool([TEST_KEY]);

  const req = new Request("http://localhost/v1/audio/speech", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: "halo dunia",
      voice: "nova",
      response_format: "wav",
    }),
  });

  const res = await speech(req);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("audio/wav");

  const buf = Buffer.from(await res.arrayBuffer());

  // RIFF header structure: 44 bytes
  expect(buf.length).toBe(44 + 480);
  expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buf.readUInt32LE(4)).toBe(36 + 480);
  expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
  expect(buf.toString("ascii", 12, 16)).toBe("fmt ");
  expect(buf.readUInt32LE(16)).toBe(16); // PCM chunk size
  expect(buf.readUInt16LE(20)).toBe(1); // audio format: PCM (1)
  expect(buf.readUInt16LE(22)).toBe(1); // channels: 1 (mono)
  expect(buf.readUInt32LE(24)).toBe(24_000); // sample rate
  expect(buf.readUInt32LE(28)).toBe(24_000 * 2); // byte rate (24000 * 1 * 16 / 8)
  expect(buf.readUInt16LE(32)).toBe(2); // block align
  expect(buf.readUInt16LE(34)).toBe(16); // bits per sample
  expect(buf.toString("ascii", 36, 40)).toBe("data");
  expect(buf.readUInt32LE(40)).toBe(480); // pcm byte length
});

test("serves raw PCM without WAV header when response_format=pcm", async () => {
  await setPool([TEST_KEY]);

  const req = new Request("http://localhost/v1/audio/speech", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: "halo dunia",
      response_format: "pcm",
    }),
  });

  const res = await speech(req);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("audio/L16");
  const buf = Buffer.from(await res.arrayBuffer());
  expect(buf.length).toBe(480);
});

test("passes native Gemini requests through verbatim", async () => {
  await setPool([TEST_KEY]);

  const req = new Request(
    "http://localhost/v1beta/models/gemini-2.5-flash:generateContent?alt=json",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
    },
  );

  const res = await geminiPassthrough(req, "/v1beta/models/gemini-2.5-flash:generateContent");
  expect(res.status).toBe(200);
  const json = (await res.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  expect(json.candidates[0].content.parts[0].text).toContain("pong from");
});
