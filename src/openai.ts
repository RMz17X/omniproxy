/**
 * OpenAI-compatible surface: /v1/chat/completions, /v1/models.
 *
 * Translates the OpenAI message array into a Gemini generateContent body,
 * forwards it through the rotating pool, and translates the reply back.
 * Streaming is handled by proxying Gemini's SSE frames as OpenAI chunks.
 */

import { cfg } from "./config.ts";
import { execute } from "./upstream.ts";

const UP = cfg.upstream.replace(/\/$/, "");

type OAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | { type: string; text?: string }[] | null;
  name?: string;
};

type OAIRequest = {
  model?: string;
  messages?: OAIMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stop?: string | string[];
  tools?: any[];
  response_format?: { type?: string };
  /** non-standard: enable Google Search grounding */
  web_search?: boolean;
  search?: boolean;
};

const textOf = (c: OAIMessage["content"]): string => {
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n");
};

function toGemini(body: OAIRequest) {
  const msgs = body.messages ?? [];
  const systemParts: { text: string }[] = [];
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];

  for (const m of msgs) {
    const text = textOf(m.content);
    if (!text) continue;
    if (m.role === "system") {
      systemParts.push({ text });
    } else if (m.role === "assistant") {
      contents.push({ role: "model", parts: [{ text }] });
    } else {
      // user + tool results both map to user turns
      const label = m.role === "tool" && m.name ? `[tool:${m.name}]\n` : "";
      contents.push({ role: "user", parts: [{ text: label + text }] });
    }
  }

  const wantsSearch = Boolean(body.web_search ?? body.search);
  const model =
    body.model && body.model.startsWith("gemini")
      ? body.model
      : wantsSearch
        ? cfg.searchModel
        : cfg.defaultModel;

  const gen: Record<string, unknown> = {};
  if (typeof body.temperature === "number") gen.temperature = body.temperature;
  if (typeof body.top_p === "number") gen.topP = body.top_p;
  const maxTokens = body.max_completion_tokens ?? body.max_tokens;
  if (typeof maxTokens === "number") gen.maxOutputTokens = maxTokens;
  if (body.stop) gen.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  if (body.response_format?.type === "json_object") gen.responseMimeType = "application/json";

  const payload: Record<string, unknown> = { contents };
  if (systemParts.length) payload.systemInstruction = { parts: systemParts };
  if (Object.keys(gen).length) payload.generationConfig = gen;
  if (wantsSearch) payload.tools = [{ google_search: {} }];

  return { model, payload, wantsSearch };
}

function estimateTokens(text: string): number {
  // ~4 chars/token is the accepted rough ratio for English + code.
  return Math.max(1, Math.ceil(text.length / 4));
}

function flattenParts(json: any): { text: string; grounding: any } {
  const cand = json?.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const text = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
  return { text, grounding: cand?.groundingMetadata ?? null };
}

export async function chatCompletions(req: Request): Promise<Response> {
  let body: OAIRequest;
  try {
    body = (await req.json()) as OAIRequest;
  } catch {
    return err(400, "invalid_request_error", "Body must be JSON.");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return err(400, "invalid_request_error", "`messages` must be a non-empty array.");
  }

  const { model, payload, wantsSearch } = toGemini(body);
  const stream = Boolean(body.stream);
  const method = stream ? "streamGenerateContent" : "generateContent";
  const search = stream ? "?alt=sse" : "";
  const url = `${UP}/v1beta/models/${model}:${method}${search}`;

  const result = await execute(
    url,
    {
      method: "POST",
      headers: new Headers({ "content-type": "application/json", accept: stream ? "text/event-stream" : "application/json" }),
      body: JSON.stringify(payload),
      // @ts-expect-error Bun streaming body
      duplex: "half",
    },
    `/v1beta/models/${model}:${method}`,
  );

  if (!result.response.ok) return result.response;

  const id = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  if (!stream) {
    let json: any;
    try {
      json = await result.response.json();
    } catch {
      return err(502, "upstream_error", "Upstream returned non-JSON.");
    }
    const { text, grounding } = flattenParts(json);
    const usage = json?.usageMetadata ?? {};
    return Response.json({
      id,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: mapFinish(json?.candidates?.[0]?.finishReason),
        },
      ],
      usage: {
        prompt_tokens: usage.promptTokenCount ?? 0,
        completion_tokens: usage.candidatesTokenCount ?? 0,
        total_tokens: usage.totalTokenCount ?? 0,
      },
      ...(wantsSearch && grounding ? { grounding } : {}),
    });
  }

  // ---- streaming: re-frame Gemini SSE as OpenAI chunks ----
  const encoder = new TextEncoder();
  const upstream = result.response.body;
  if (!upstream) return err(502, "upstream_error", "Upstream returned no stream.");

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      send({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      });

      const reader = upstream.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finish: string | null = null;

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;
            let json: any;
            try {
              json = JSON.parse(raw);
            } catch {
              continue;
            }
            const { text } = flattenParts(json);
            const fr = json?.candidates?.[0]?.finishReason;
            if (fr) finish = mapFinish(fr);
            if (text) {
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
              });
            }
          }
        }
        send({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: finish ?? "stop" }],
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: { message: String(e) } })}\n\n`),
        );
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-gkr-attempts": String(result.attempts),
      "x-gkr-rotated": result.rotated ? "1" : "0",
    },
  });
}

function mapFinish(reason: string | undefined): string {
  switch (reason) {
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "PROHIBITED_CONTENT":
      return "content_filter";
    case "STOP":
    case undefined:
      return "stop";
    default:
      return "stop";
  }
}

export function models(): Response {
  const list = [
    cfg.defaultModel,
    cfg.searchModel,
    cfg.defaultTtsModel,
    "gemini-2.5-pro",
    "gemini-2.0-flash",
  ];
  return Response.json({
    object: "list",
    data: [...new Set(list)].map((id) => ({
      id,
      object: "model",
      created: 1700000000,
      owned_by: "google",
    })),
  });
}

function err(status: number, type: string, message: string): Response {
  return Response.json({ error: { type, message } }, { status });
}
