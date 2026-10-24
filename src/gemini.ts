/**
 * Native Gemini surface: generateContent, streamGenerateContent, TTS.
 *
 * The passthrough is byte-transparent: the request body, method, query and
 * every response byte are forwarded unchanged, only the credential is swapped,
 * and the caller's abort signal is bridged into the upstream fetch so a
 * disconnect tears the upstream connection down instead of holding it open.
 */

import { cfg, VOICE_MAP } from "./config.ts";
import { execute } from "./upstream.ts";
import { noteUsage } from "./ledger.ts";

/**
 * The upstream base, read per call. `cfg.upstream` is a getter on purpose: the
 * test harness boots its mock on an OS-assigned port, and a module-level
 * constant would freeze the value before the harness knew it.
 */
const up = (): string => cfg.upstream.replace(/\/$/, "");

export async function geminiPassthrough(req: Request, path: string): Promise<Response> {
  const url = new URL(req.url);
  const upstreamUrl = `${up()}${path}${url.search}`;

  // The body is buffered before the first attempt on purpose. `execute()` may
  // retry with a different key, and a ReadableStream can only be consumed once:
  // reusing it made Bun throw "Response body object should not be disturbed or
  // locked" on every retry, which surfaced as a 500 after the 120 s timeout.
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const r = await execute(
    upstreamUrl,
    {
      method: req.method,
      headers: req.headers,
      body,
    },
    path,
    req.signal,
  );

  // The passthrough is byte-transparent on success, so the body is never parsed
  // here and token counts stay 0. The row still records the route, the model in
  // the path, the key and the outcome — which is what an audit needs.
  const model = /\/models\/([^:/?]+)/.exec(path)?.[1] ?? "";
  noteUsage(req, {
    model,
    keyRaw: r.key,
    attempts: r.attempts,
    rotated: r.rotated,
    errorCode: r.response.ok ? null : `http_${r.response.status}`,
  });
  return withMeta(r.response, r);
}

function withMeta(res: Response, meta: { attempts: number; rotated: boolean }): Response {
  const h = new Headers(res.headers);
  // `fetch` has already decoded the body, but the upstream headers still claim
  // `content-encoding: gzip` / a `content-length` that no longer matches. A
  // serverless runtime re-reads those headers and drops or truncates the body,
  // which is why the passthrough answered 200 with an empty payload.
  h.delete("content-encoding");
  h.delete("content-length");
  h.delete("transfer-encoding");
  h.set("x-omniproxy-attempts", String(meta.attempts));
  h.set("x-omniproxy-rotated", meta.rotated ? "1" : "0");
  return new Response(res.body, { status: res.status, headers: h });
}

/* ---------- OpenAI-compatible speech ---------- */

type SpeechBody = {
  model?: string;
  input?: string;
  voice?: string;
  response_format?: string;
  speed?: number;
};

/**
 * Translate an OpenAI /v1/audio/speech payload into a Gemini TTS call and
 * wrap the PCM result in a WAV container. Gemini returns 16-bit mono
 * 24 kHz little-endian PCM with no header, which most players reject.
 */
export async function speech(req: Request): Promise<Response> {
  let body: SpeechBody;
  try {
    body = (await req.json()) as SpeechBody;
  } catch {
    return badRequest("Body must be JSON.");
  }

  const text = (body.input ?? "").trim();
  if (!text) return badRequest("`input` is required.");

  const model = body.model && body.model.startsWith("gemini") ? body.model : cfg.defaultTtsModel;
  const voice = VOICE_MAP[(body.voice ?? "").toLowerCase()] ?? body.voice ?? cfg.defaultVoice;
  const fmt = (body.response_format ?? "wav").toLowerCase();

  const payload = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };

  const path = `/v1beta/models/${model}:generateContent`;
  const result = await execute(
    `${up()}${path}`,
    {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        accept: "application/json",
      }),
      body: JSON.stringify(payload),
    },
    path,
    req.signal,
  );

  if (result.response.status === 499) {
    return new Response(null, { status: 499 });
  }

  // TTS has no prompt/completion split worth reporting: Gemini bills the input
  // text and the returned audio as two different meters, and this endpoint
  // never asks for usageMetadata. Record the attempt and the model only.
  noteUsage(req, {
    model,
    keyRaw: result.key,
    attempts: result.attempts,
    rotated: result.rotated,
    errorCode: result.response.ok ? null : `http_${result.response.status}`,
  });

  if (!result.response.ok) return result.response;

  let json: { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
  try {
    json = await result.response.json();
  } catch {
    return new Response("Upstream returned non-JSON audio response.", { status: 502 });
  }

  const part = json.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) {
    return Response.json(
      { error: { code: "no_audio", message: "Upstream returned no audio part." } },
      { status: 502 },
    );
  }

  const mime = part?.inlineData?.mimeType ?? "audio/L16;rate=24000";
  const pcm = Buffer.from(b64, "base64");
  const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);

  if (fmt === "pcm") {
    return new Response(new Uint8Array(pcm), {
      headers: {
        "content-type": "audio/L16",
        "x-omniproxy-attempts": String(result.attempts),
      },
    });
  }

  const wav = pcmToWav(pcm, rate, 1, 16);
  return new Response(new Uint8Array(wav), {
    headers: {
      "content-type": "audio/wav",
      "content-length": String(wav.byteLength),
      "x-omniproxy-attempts": String(result.attempts),
      "x-omniproxy-rotated": result.rotated ? "1" : "0",
      "x-omniproxy-voice": voice,
    },
  });
}

function pcmToWav(pcm: Buffer, rate: number, channels: number, bits: number): Buffer {
  const blockAlign = (channels * bits) / 8;
  const byteRate = rate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function badRequest(message: string): Response {
  return Response.json({ error: { code: "bad_request", message } }, { status: 400 });
}
