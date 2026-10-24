/**
 * OpenAI-wire passthrough for providers whose dialect already IS the
 * client's (whatstoken and every custom gateway).
 *
 * The request body crosses verbatim apart from one field — `model`, rewritten
 * to the bare id so a `whatstoken/deepseek-v4.1-flash-1017` prefix routes
 * without leaking into the upstream call. No translation layer exists here on
 * purpose: an OpenAI-compatible gateway that needed body surgery would be a
 * Gemini-shaped adapter, which is what `openai.ts` is for.
 *
 * Rotation, cooldown and quota verdicts all come from `execute()`, filtered to
 * the provider's own pool, so a whatstoken request can never be handed a
 * Gemini credential. Streaming responses are proxied byte-for-byte; the only
 * thing read off the wire is the final `usage` frame, for the ledger.
 */

import { execute } from "./upstream.ts";
import { finalizeStream, noteUsage } from "./ledger.ts";
import { baseUrlOf, type Provider } from "./providers.ts";

export type WireRoute = "chat" | "embeddings" | "images" | "audio";

const PATHS: Record<WireRoute, string> = {
  chat: "/chat/completions",
  embeddings: "/embeddings",
  images: "/images/generations",
  audio: "/audio/speech",
};

/** Routes whose upstream answer carries token usage worth recording. */
const METERED: WireRoute[] = ["chat", "embeddings"];

/**
 * Proxy one OpenAI-compatible call through the provider's pool.
 *
 * `model` is the bare id (prefix already stripped by the resolver). The
 * response is the upstream's own — for images that is the b64/url JSON, for
 * audio the encoded bytes — so nothing is re-framed on the way out.
 */
export async function openaiWire(
  req: Request,
  provider: Provider,
  route: WireRoute,
  model: string,
  signal?: AbortSignal,
): Promise<Response> {
  const base = baseUrlOf(provider);
  const bodyText = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();

  // Rewrite only the model field; every other field crosses untouched.
  let body = bodyText;
  let stream = false;
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      if (model) parsed.model = model;
      stream = Boolean(parsed.stream);
      body = JSON.stringify(parsed);
    }
  } catch {
    /* not JSON: forward verbatim, the upstream will answer */
  }

  const result = await execute(
    `${base}${PATHS[route]}`,
    {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        accept: stream ? "text/event-stream" : "application/json",
      }),
      body,
    },
    PATHS[route],
    signal,
    { provider: provider.id, model },
  );

  noteUsage(req, {
    provider: provider.id,
    model,
    keyRaw: result.key,
    attempts: result.attempts,
    rotated: result.rotated,
    errorCode: result.response.ok ? null : `http_${result.response.status}`,
  });

  if (result.response.status === 499) {
    return new Response(JSON.stringify({ error: { type: "client_closed_request", message: "Client disconnected." } }), {
      status: 499,
      headers: { "content-type": "application/json" },
    });
  }
  if (!result.response.ok) return result.response;

  const meter = METERED.includes(route);
  if (stream && result.response.body) {
    noteUsage(req, { stream: true });
    const tapped = tapUsage(result.response.body, (usage) => {
      noteUsage(req, {
        promptTokens: usage.prompt,
        completionTokens: usage.completion,
        totalTokens: usage.total,
      });
      finalizeStream(req, 200);
    });
    const headers = new Headers(result.response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    headers.delete("transfer-encoding");
    return new Response(tapped, { status: result.response.status, headers });
  }

  if (meter && result.response.body) {
    // Clone so the client still receives the untouched upstream answer while
    // the ledger reads the usage block off the copy.
    try {
      const copy = result.response.clone();
      const json = (await copy.json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
      const u = json.usage ?? {};
      noteUsage(req, {
        promptTokens: u.prompt_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0,
        totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
      });
    } catch {
      /* unmetered upstream: counts stay zero */
    }
  }

  return result.response;
}

/**
 * Tee a streaming body through a usage scanner. Every byte is re-enqueued
 * unchanged; the scanner only watches `data:` frames for the usage block
 * OpenAI emits on the final chunk (and only when the client asked for it).
 */
function tapUsage(
  upstream: ReadableStream<Uint8Array>,
  onDone: (usage: { prompt: number; completion: number; total: number }) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";
  let usage = { prompt: 0, completion: 0, total: 0 };
  let reported = false;
  const report = () => {
    if (reported) return;
    reported = true;
    onDone(usage);
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split(/\r?\n\r?\n/);
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split(/\r?\n/).find((l) => l.startsWith("data:"));
            if (!line) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;
            try {
              const json = JSON.parse(raw) as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
              if (json.usage) {
                usage = {
                  prompt: json.usage.prompt_tokens ?? usage.prompt,
                  completion: json.usage.completion_tokens ?? usage.completion,
                  total: json.usage.total_tokens ?? usage.total,
                };
              }
            } catch {
              /* a partial frame is not JSON yet */
            }
          }
        }
      } catch {
        /* upstream torn down: the ledger row still commits */
      } finally {
        report();
        try {
          controller.close();
        } catch {
          /* already closed by a cancel */
        }
        reader.releaseLock();
      }
    },
    cancel(reason) {
      report();
      return upstream.cancel(reason);
    },
  });
}

/**
 * Normalised model list from an OpenAI-wire provider's /v1/models, for the
 * console's import action and the public /v1/models union.
 */
export async function openaiModelList(
  provider: Provider,
  rawKey: string,
): Promise<{ id: string; ownedBy: string }[]> {
  const base = baseUrlOf(provider);
  if (!base) return [];
  try {
    const res = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${rawKey}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as { data?: Array<{ id?: string; owned_by?: string }> };
    return (payload.data ?? [])
      .map((m) => ({ id: String(m.id ?? "").trim(), ownedBy: String(m.owned_by ?? provider.id) }))
      .filter((m) => m.id);
  } catch {
    return [];
  }
}
