/**
 * OpenAI chat completions surface: request translation, non-streaming,
 * and SSE stream re-framing into OpenAI chunks with a final `[DONE]`.
 */
import { beforeAll, expect, test } from "bun:test";

import "./env.ts";

import { ensureMock } from "./env.ts";
import { setPool } from "./harness.ts";

import { addKey, keyId, listKeys } from "../src/pool.ts";
import { chatCompletions } from "../src/openai.ts";

const TEST_KEY = "AIzaOAITEST1";

beforeAll(async () => {
  await ensureMock();
  await setPool([TEST_KEY]);
  await addKey(TEST_KEY);
});

test("translates an OpenAI non-streaming chat request and returns an OpenAI response", async () => {
  await setPool([TEST_KEY]);

  const req = new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are a test helper." },
        {
          role: "user",
          content: [
            { type: "text", text: "hello" },
            { type: "text", text: "world" },
          ],
        },
      ],
      temperature: 0.2,
    }),
  });

  const res = await chatCompletions(req);
  expect(res.status).toBe(200);
  const data = (await res.json()) as {
    object: string;
    model: string;
    choices: { message: { role: string; content: string }; finish_reason: string }[];
    usage: { total_tokens: number };
  };

  expect(data.object).toBe("chat.completion");
  expect(data.model).toBe("gemini-2.5-flash");
  expect(data.choices[0].message.role).toBe("assistant");
  expect(data.choices[0].message.content).toContain("pong from");
  expect(data.choices[0].finish_reason).toBe("stop");
  expect(data.usage.total_tokens).toBe(10);
});

test("re-frames Gemini streamGenerateContent SSE into OpenAI chat chunks with [DONE]", async () => {
  await setPool([TEST_KEY]);

  const req = new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      stream: true,
      messages: [{ role: "user", content: "stream me" }],
    }),
  });

  const res = await chatCompletions(req);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");

  const text = await res.text();
  expect(text).toContain("data: [DONE]");

  // Parse every `data: { ... }` frame and rebuild the complete assistant reply.
  const lines = text.split("\n").filter((l) => l.startsWith("data: "));
  let assembled = "";
  let sawDone = false;
  let chunkCount = 0;

  for (const line of lines) {
    const raw = line.slice(6).trim();
    if (raw === "[DONE]") {
      sawDone = true;
      continue;
    }
    const chunk = JSON.parse(raw) as {
      object: string;
      choices: { delta: { content?: string; role?: string } }[];
    };
    expect(chunk.object).toBe("chat.completion.chunk");
    chunkCount++;
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) assembled += delta;
  }

  expect(sawDone).toBe(true);
  expect(chunkCount).toBeGreaterThan(2);
  expect(assembled).toBe("Hello from mock!");
});

test("an OAuth token is retired on its first refusal, and the request rotates past it", async () => {
  // An `AQ.` OAuth token answers generateContent with a 401 that names
  // neither API_KEY_INVALID nor a leak. It must retire like any dead
  // credential — soft-parking it made the key cycle ready -> 401 -> ready
  // forever, and every request paid for it again.
  const oauth = "AIzaOAUTHTEST00000000000001";
  await setPool([oauth, TEST_KEY]);
  await addKey(oauth);
  await addKey(TEST_KEY);

  const req = new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "hi" }],
    }),
  });

  const res = await chatCompletions(req);
  expect(res.status).toBe(200); // rotated onto the healthy key

  const view = (await listKeys()).find((k) => k.id === keyId(oauth));
  expect(view?.status).toBe("dead");
});

test("a Gemini request never draws a key from another provider's pool", async () => {
  // Selection without a provider filter once handed an ElevenLabs `sk_` key
  // to Google: the 401 that followed retired a healthy credential from the
  // wrong pool (90 of them in production). With the pool holding only an
  // ElevenLabs key, a Gemini request must report exhaustion instead of
  // spending that key.
  const eleven = "sk_0123456789abcdef0123456789abcdef01234567";
  await setPool([]);
  await addKey(eleven, "elevenlabs");

  const req = new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "hi" }],
    }),
  });

  const res = await chatCompletions(req);
  // Not 401: a 401 here would mean the ElevenLabs key was actually sent to
  // Google. The pool has a key, just none for this provider.
  expect(res.status).toBe(429);
  const body = (await res.json()) as { error: { code?: string } };
  expect((body.error as { code?: string }).code).toBe("pool_exhausted");

  const view = (await listKeys()).find((k) => k.id === keyId(eleven));
  expect(view?.status).toBe("ready");
});
