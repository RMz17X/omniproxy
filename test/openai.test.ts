/**
 * OpenAI chat completions surface: request translation, non-streaming,
 * and SSE stream re-framing into OpenAI chunks with a final `[DONE]`.
 */
import { beforeAll, expect, test } from "bun:test";

import "./env.ts";

import { ensureMock } from "./env.ts";
import { setPool } from "./harness.ts";

import { addKey } from "../src/pool.ts";
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
