/**
 * ElevenLabs TTS adapter: probe, serve, key validation.
 */

import { cfg } from "./config.ts";
import { pick, rawKeyById } from "./pool.ts";
import { noteUsage } from "./ledger.ts";
import { classifyElevenLabsResponse } from "./verdict.ts";
import type { ProbeResult } from "./probe.ts";

export const ELEVENLABS_KEY_REGEX = /^sk_[a-fA-F0-9]{40,64}$/;

export function isValidElevenLabsKey(key: string): boolean {
  return ELEVENLABS_KEY_REGEX.test((key ?? "").trim());
}

export type ElevenLabsUserSubscription = {
  tier?: string;
  character_count?: number;
  character_limit?: number;
  status?: string;
  next_character_count_reset_unix?: number;
};

export type ElevenLabsUserResponse = {
  subscription?: ElevenLabsUserSubscription;
};

const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 8000);

/**
 * Probe an ElevenLabs credential via GET https://api.elevenlabs.io/v1/user.
 *
 * 200 = alive: reads subscription.tier, character_limit, character_count for remaining quota.
 * 401/403 = dead (invalid).
 * 429 = quota state (not dead).
 */
export async function probeElevenLabs(
  rawKey: string,
  timeoutMs: number = TIMEOUT_MS,
): Promise<ProbeResult> {
  const started = Date.now();
  const k = rawKey.trim();

  if (!isValidElevenLabsKey(k)) {
    return {
      status: "invalid",
      httpStatus: 400,
      latencyMs: 0,
      retryAfterMs: 0,
      message: "Invalid ElevenLabs API key format (must be sk_ followed by 40-64 hex chars)",
      quota: null,
      tierEvidence: null,
    };
  }

  const url = "https://api.elevenlabs.io/v1/user";
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "xi-api-key": k,
        accept: "application/json",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return {
      status: "network_error",
      httpStatus: 0,
      latencyMs: Date.now() - started,
      retryAfterMs: 0,
      message: err instanceof Error ? err.message : String(err),
      quota: null,
      tierEvidence: null,
    };
  }

  const latencyMs = Date.now() - started;
  const body = await res.text().catch(() => "");
  const headers = Object.fromEntries(res.headers.entries());

  const classified = classifyElevenLabsResponse(res.status, body, headers);

  return {
    status:
      classified.verdict === "invalid"
        ? "invalid"
        : classified.verdict === "rate_limited"
          ? "rate_limited"
          : classified.verdict === "ok"
            ? "ok"
            : classified.verdict === "server_error"
              ? "server_error"
              : "unexpected",
    httpStatus: res.status,
    latencyMs,
    retryAfterMs: classified.quota?.retryAfterMs ?? 0,
    message: res.status === 200 ? "serving" : body.slice(0, 220) || `HTTP ${res.status}`,
    quota: classified.quota,
    tierEvidence: classified.tierEvidence,
  };
}

/**
 * Proxy POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id} with client body as-is.
 */
export async function serveElevenLabs(req: Request, key?: string): Promise<Response> {
  let rawKey = key ? (await rawKeyById(key)) || key : undefined;
  if (!rawKey) {
    const st = await pick(new Set(), undefined, "elevenlabs");
    if (st) {
      rawKey = (await rawKeyById(st.key)) || st.key;
    }
  }

  if (!rawKey) {
    return new Response(JSON.stringify({ error: { message: "No available ElevenLabs API keys in pool." } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const bodyText = hasBody ? await req.text() : "";

  let voiceId = "21m00Tcm4TlvDq8ikWAM";
  try {
    const parsed = JSON.parse(bodyText);
    if (typeof parsed.voice_id === "string" && parsed.voice_id) voiceId = parsed.voice_id;
    else if (typeof parsed.voice === "string" && parsed.voice) voiceId = parsed.voice;
  } catch {}

  const url = new URL(req.url);
  const pathVoiceMatch = /\/text-to-speech\/([^/?]+)/.exec(url.pathname);
  if (pathVoiceMatch?.[1]) voiceId = pathVoiceMatch[1];
  else if (url.searchParams.get("voice_id")) voiceId = url.searchParams.get("voice_id")!;
  else if (url.searchParams.get("voice")) voiceId = url.searchParams.get("voice")!;

  const upstreamUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}${url.search}`;

  const res = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": rawKey,
    },
    body: bodyText,
    signal: req.signal,
  });

  noteUsage(req, {
    model: "elevenlabs",
    keyRaw: rawKey,
    attempts: 1,
    rotated: false,
    errorCode: res.ok ? null : `http_${res.status}`,
  });

  const respHeaders = new Headers(res.headers);
  respHeaders.delete("content-encoding");
  respHeaders.delete("content-length");
  respHeaders.delete("transfer-encoding");

  return new Response(res.body, {
    status: res.status,
    headers: respHeaders,
  });
}
