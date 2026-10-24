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
/**
 * Translate an OpenAI-compatible `/v1/audio/speech` body into ElevenLabs' native
 * shape, leaving a body that already looks native untouched.
 *
 * Forwarding the client body verbatim — the previous behaviour — makes every
 * OpenAI-compatible call fail with `422 Field required: text`, because
 * ElevenLabs reads `text` and `model_id` while the OpenAI schema names those
 * fields `input` and `model`. Returning the translated body as a string keeps
 * the caller's own stream contract intact.
 */
function toElevenLabsBody(bodyText: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return bodyText;
  }
  if (!parsed || typeof parsed !== "object") return bodyText;

  // Already native: ElevenLabs callers send `text` (and usually `model_id`).
  const isNative = typeof parsed.text === "string";
  const hasModelId = typeof parsed.model_id === "string";
  if (isNative && hasModelId) return bodyText;

  const out: Record<string, unknown> = { ...parsed };

  const text = parsed.input ?? parsed.text ?? parsed.prompt;
  if (typeof text === "string") out.text = text;
  delete out.input;
  delete out.prompt;

  const model = parsed.model_id ?? parsed.model;
  if (typeof model === "string") out.model_id = model;
  delete out.model;

  const voice = parsed.voice_id ?? parsed.voice;
  if (typeof voice === "string") out.voice_id = voice;
  delete out.voice;

  const fmt = parsed.response_format;
  if (typeof fmt === "string" && !out.output_format) {
    out.output_format = fmt === "wav" ? "pcm_44100" : `mp3_44100_${fmt === "opus" ? "64" : "128"}`;
  }
  delete out.response_format;

  // OpenAI `speed` maps onto ElevenLabs' voice_settings, which must stay nested.
  const speed = typeof parsed.speed === "number" ? parsed.speed : undefined;
  delete out.speed;
  const vs = (typeof parsed.voice_settings === "object" && parsed.voice_settings) || {};
  out.voice_settings = speed === undefined ? vs : { ...vs, speed };

  // A voice that the free tier refuses (the `professional` category) still has
  // to be requested by id — the caller chose it, so we surface the upstream 402
  // rather than silently substituting a voice they did not ask for.
  return JSON.stringify(out);
}

/**
 * Proxy POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}.
 *
 * Accepts either the native ElevenLabs body or the OpenAI-compatible
 * `/v1/audio/speech` schema, translating the latter. The voice id may come from
 * the path, a query parameter, or the body.
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
    body: toElevenLabsBody(bodyText),
    signal: req.signal,
  });

  noteUsage(req, {
    model: "elevenlabs",
    provider: "elevenlabs",
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

/* ---------- live inventory ---------- */

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
};

export type ElevenLabsModel = {
  model_id: string;
  name?: string;
  description?: string;
  can_do_text_to_speech?: boolean;
  languages?: Array<{ language_id: string; name?: string }>;
};

type VoicesResponse = { voices?: ElevenLabsVoice[] };
type ModelsResponse = ElevenLabsModel[];

/**
 * Fetch the live voice and model inventory from ElevenLabs.
 *
 * Unlike Gemini there is no "leaked" gate here: every pooled ElevenLabs
 * credential answers `/v1/voices` and `/v1/models` as long as it is alive, so
 * one healthy key is enough and the result is cached by the caller.
 *
 * Returns `null` when no ElevenLabs key can serve the call, so the caller can
 * distinguish "no provider keys" from "upstream said something useless".
 */
export async function listElevenLabsInventory(): Promise<{
  voices: ElevenLabsVoice[];
  models: ElevenLabsModel[];
} | null> {
  const st = await pick(new Set(), undefined, "elevenlabs");
  if (!st) return null;
  const rawKey = (await rawKeyById(st.key)) || st.key;

  const fetchJson = async <T>(path: string): Promise<T | null> => {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/${path}`, {
        headers: { "xi-api-key": rawKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  };

  const [voices, models] = await Promise.all([
    fetchJson<VoicesResponse>("voices"),
    fetchJson<ModelsResponse>("models"),
  ]);

  return {
    voices: voices?.voices ?? [],
    models: models ?? [],
  };
}
