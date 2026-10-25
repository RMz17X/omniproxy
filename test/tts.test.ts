/**
 * ElevenLabs adapter tests:
 * - key format validation (sk_ + 40-64 hex)
 * - probe classification (200 = alive with tier, 401/403 = dead/invalid, 429 = quota state with reset)
 * - serve proxy (forward client body as-is with xi-api-key)
 * - routing in app.ts (/v1/audio/speech routes to elevenlabs when the model
 *   names it; a gemini model with only an elevenlabs pool fails on the empty
 *   gemini pool instead of misrouting through the TTS-only provider)
 */
import { afterEach, describe, expect, test } from "bun:test";
import "./env.ts";
import { setPool } from "./harness.ts";

import app from "../src/app.ts";
import { addKey, listKeys, removeKeyById } from "../src/pool.ts";
import {
  isValidElevenLabsKey,
  probeElevenLabs,
  serveElevenLabs,
} from "../src/tts.ts";
import { probeKey } from "../src/probe.ts";
import { classifyElevenLabsResponse } from "../src/verdict.ts";

const VALID_KEY_40 = "sk_" + "a".repeat(40);
const VALID_KEY_64 = "sk_" + "0123456789abcdef".repeat(4);
const INVALID_KEY_SHORT = "sk_12345";
const INVALID_KEY_NONHEX = "sk_" + "z".repeat(40);
const GEMINI_KEY = "AIzaSyTestKeyForGemini0123456789";

describe("ElevenLabs key format validation", () => {
  test("accepts sk_ followed by 40 to 64 hex characters", () => {
    expect(isValidElevenLabsKey(VALID_KEY_40)).toBe(true);
    expect(isValidElevenLabsKey(VALID_KEY_64)).toBe(true);
    expect(isValidElevenLabsKey("sk_0123456789abcdef0123456789abcdef01234567")).toBe(true);
  });

  test("rejects invalid keys (too short, too long, non-hex, missing sk_ prefix)", () => {
    expect(isValidElevenLabsKey(INVALID_KEY_SHORT)).toBe(false);
    expect(isValidElevenLabsKey(INVALID_KEY_NONHEX)).toBe(false);
    expect(isValidElevenLabsKey(GEMINI_KEY)).toBe(false);
    expect(isValidElevenLabsKey("")).toBe(false);
    expect(isValidElevenLabsKey("sk_" + "a".repeat(39))).toBe(false);
    expect(isValidElevenLabsKey("sk_" + "a".repeat(65))).toBe(false);
  });
});

describe("ElevenLabs classification and probe", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  test("200 response classifies as ok and captures plan from subscription.tier", () => {
    const body = JSON.stringify({
      subscription: {
        tier: "creator",
        character_count: 12000,
        character_limit: 100000,
        status: "active",
      },
    });

    const res = classifyElevenLabsResponse(200, body);
    expect(res.verdict).toBe("ok");
    expect(res.tierEvidence).toBeDefined();
    expect(res.tierEvidence?.tier).toBe("creator");
    expect(res.tierEvidence?.source).toBe("subscription");
    expect(res.tierEvidence?.consumer).toBe("100000");
    expect(res.tierEvidence?.quotaId).toBe("chars_12000");
    expect(res.tierEvidence?.quotaMetric).toBe("characters");
    expect(res.quota).toBeNull();
  });

  test("401 classifies as invalid; a bare 403 does not (permission, not a dead key)", () => {
    const res401 = classifyElevenLabsResponse(401, '{"detail":{"status":"invalid_api_key"}}');
    expect(res401.verdict).toBe("invalid");
    expect(res401.quota).toBeNull();

    const res403 = classifyElevenLabsResponse(403, '{"detail":{"status":"forbidden"}}');
    expect(res403.verdict).toBe("unexpected");
    expect(res403.quota).toBeNull();

    const res403Invalid = classifyElevenLabsResponse(403, '{"detail":{"status":"invalid_api_key"}}');
    expect(res403Invalid.verdict).toBe("invalid");
  });

  test("429 classifies as rate_limited (quota state, not dead)", () => {
    const body = JSON.stringify({
      detail: {
        status: "quota_exceeded",
        next_character_count_reset_unix: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    const headers = { "retry-after": "120" };

    const res = classifyElevenLabsResponse(429, body, headers);
    expect(res.verdict).toBe("rate_limited");
    expect(res.quota).toBeDefined();
    expect(res.quota?.quotaId).toBe("elevenlabs_quota");
    expect(res.quota?.metric).toBe("characters");
    expect(res.quota?.retryAfterMs).toBeGreaterThan(0);
    expect(res.quota?.resetAt).toBeGreaterThan(Date.now());
  });

  test("probeElevenLabs mocks fetch: 200 is ok with tier, 401 is dead, 429 is quota", async () => {
    // 1. Mock 200
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (!u.includes("elevenlabs.io")) return origFetch(url, init);
      expect(u).toBe("https://api.elevenlabs.io/v1/user");
      const headers = new Headers(init?.headers);
      expect(headers.get("xi-api-key")).toBe(VALID_KEY_40);

      return new Response(
        JSON.stringify({
          subscription: {
            tier: "pro",
            character_count: 50000,
            character_limit: 500000,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as any;

    const probeOk = await probeElevenLabs(VALID_KEY_40);
    expect(probeOk.status).toBe("ok");
    expect(probeOk.httpStatus).toBe(200);
    expect(probeOk.tierEvidence?.tier).toBe("pro");

    // Also test probeKey routing:
    const probeKeyOk = await probeKey(VALID_KEY_40, undefined, "elevenlabs");
    expect(probeKeyOk.status).toBe("ok");
    expect(probeKeyOk.tierEvidence?.tier).toBe("pro");

    // 2. Mock 401 (dead)
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (!u.includes("elevenlabs.io")) return origFetch(url, init);
      return new Response(JSON.stringify({ detail: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    const probe401 = await probeElevenLabs(VALID_KEY_40);
    expect(probe401.status).toBe("invalid");
    expect(probe401.httpStatus).toBe(401);
    expect(probe401.quota).toBeNull();

    // 3. Mock 429 (quota, NOT dead)
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (!u.includes("elevenlabs.io")) return origFetch(url, init);
      return new Response(
        JSON.stringify({
          detail: {
            message: "Quota exceeded",
            next_character_count_reset_unix: Math.floor(Date.now() / 1000) + 60,
          },
        }),
        {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "60" },
        },
      );
    }) as any;

    const probe429 = await probeElevenLabs(VALID_KEY_40);
    expect(probe429.status).toBe("rate_limited");
    expect(probe429.httpStatus).toBe(429);
    expect(probe429.quota).toBeDefined();
    expect(probe429.quota?.quotaId).toBe("elevenlabs_quota");
  });
});

describe("ElevenLabs serve proxy", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  test("proxies POST /v1/text-to-speech/{voice_id} with client body as-is", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    let capturedKey = "";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (!u.includes("elevenlabs.io")) return origFetch(url, init);
      capturedUrl = u;
      capturedBody = String(init?.body);
      const headers = new Headers(init?.headers);
      capturedKey = headers.get("xi-api-key") ?? "";

      return new Response(Buffer.from("mock-audio-bytes"), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      });
    }) as any;

    const req = new Request("http://localhost/v1/audio/speech?output_format=mp3_44100_128", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        voice_id: "21m00Tcm4TlvDq8ikWAM",
        text: "Halo ini tes suara ElevenLabs",
        model_id: "eleven_multilingual_v2",
      }),
    });

    const res = await serveElevenLabs(req, VALID_KEY_40);
    expect(res.status).toBe(200);
    expect(capturedUrl).toContain("https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM");
    expect(capturedUrl).toContain("output_format=mp3_44100_128");
    expect(capturedKey).toBe(VALID_KEY_40);

    const parsed = JSON.parse(capturedBody);
    expect(parsed.text).toBe("Halo ini tes suara ElevenLabs");
    expect(parsed.model_id).toBe("eleven_multilingual_v2");
  });
});

describe("app routing for ElevenLabs vs Gemini", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  test("routes /v1/audio/speech to ElevenLabs when the model names it", async () => {
    for (const k of await listKeys()) {
      await removeKeyById(k.id);
    }
    await addKey(VALID_KEY_40, "elevenlabs");

    let forwardedToEleven = false;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("elevenlabs.io")) {
        forwardedToEleven = true;
        return new Response(Buffer.from("audio"), { status: 200, headers: { "content-type": "audio/mpeg" } });
      }
      return origFetch(url, init);
    }) as any;

    const req = new Request("http://localhost/v1/audio/speech", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "eleven_multilingual_v2",
        voice: "21m00Tcm4TlvDq8ikWAM",
        input: "Test voice",
      }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(forwardedToEleven).toBe(true);
  });

  test("a gemini model with only an ElevenLabs pool fails on the empty gemini pool", async () => {
    for (const k of await listKeys()) {
      await removeKeyById(k.id);
    }
    await addKey(VALID_KEY_40, "elevenlabs");

    // The capability gate resolves the provider from the model BEFORE any key
    // is picked, so a gemini model never reaches the TTS-only pool: it fails
    // on the gemini pool being empty, which is the actionable truth.
    const chatReq = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    const chatRes = await app.fetch(chatReq);
    expect(chatRes.status).toBe(503);
    expect((await chatRes.json()).error?.message).toContain("Gemini");

    // /v1/embeddings -> 503 on the same empty gemini pool
    const embReq = new Request("http://localhost/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "text-embedding-004",
        input: "hi",
      }),
    });
    const embRes = await app.fetch(embReq);
    expect(embRes.status).toBe(503);

    // /v1/models is a catalog union, not a pool probe: it answers from the
    // gemini catalog even with no gemini key pooled.
    const modReq = new Request("http://localhost/v1/models", {
      method: "GET",
    });
    const modRes = await app.fetch(modReq);
    expect(modRes.status).toBe(200);
  });
});
