/**
 * OpenAI-compatible surface: /v1/chat/completions, /v1/embeddings, /v1/models.
 *
 * Translates the OpenAI message array (text, images, tool calls, tool results)
 * into a Gemini generateContent body, forwards it through the rotating pool,
 * and translates the reply back — including functionCall → tool_calls.
 * Streaming is handled by proxying Gemini's SSE frames as OpenAI chunks.
 */

import { cfg } from "./config.ts";
import { counters } from "./metrics.ts";
import { execute } from "./upstream.ts";

const UP = cfg.upstream.replace(/\/$/, "");

type OAIContentPart =
  | { type: "text"; text?: string }
  | { type: "image_url"; image_url?: { url?: string; detail?: string } };

type OAIToolCall = {
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
};

type OAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OAIContentPart[] | null;
  name?: string;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
};

type OAITool = {
  type: "function";
  function?: { name?: string; description?: string; parameters?: Record<string, unknown> };
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
  tools?: OAITool[];
  tool_choice?: unknown;
  response_format?: { type?: string };
  /** non-standard: enable Google Search grounding */
  web_search?: boolean;
  search?: boolean;
};

/* ---------- Gemini wire shapes (the subset this gateway reads) ---------- */

type GeminiPart = {
  text?: string;
  functionCall?: { name?: string; args?: unknown };
  inlineData?: { mimeType?: string; data?: string };
};

type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
  groundingMetadata?: unknown;
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  embedding?: { values?: number[] };
  embeddings?: { values?: number[] }[];
};

/** Text of one content part; image parts carry none. */
const partText = (p: OAIContentPart): string =>
  "text" in p && typeof p.text === "string" ? p.text : "";

const textOf = (c: OAIMessage["content"]): string => {
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c.map(partText).filter(Boolean).join("\n");
};

/**
 * Gemini's classic Schema dialect wants upper-case type names and rejects the
 * JSON-Schema keywords OpenAI emits (`$schema`, `additionalProperties`,
 * `strict`), so normalise the tool schema before forwarding it.
 */
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === "$schema" || k === "additionalProperties" || k === "strict" || k === "title") continue;
    if (k === "type" && typeof v === "string") {
      out.type = v.toUpperCase();
      continue;
    }
    if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) {
      const props: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) props[pk] = toGeminiSchema(pv);
      out.properties = props;
      continue;
    }
    out[k] = toGeminiSchema(v);
  }
  return out;
}

function toolDeclarations(tools: OAITool[] | undefined): Record<string, unknown>[] {
  const decls: Record<string, unknown>[] = [];
  for (const t of tools ?? []) {
    if (t?.type !== "function" || !t.function?.name) continue;
    const d: Record<string, unknown> = { name: t.function.name };
    if (t.function.description) d.description = t.function.description;
    if (t.function.parameters) d.parameters = toGeminiSchema(t.function.parameters);
    decls.push(d);
  }
  return decls;
}

/** `data:image/png;base64,…` → inlineData; other URLs → fileData. */
function imagePart(url: string): Record<string, unknown> | null {
  if (!url) return null;
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (m) {
    const mime = m[1] || "application/octet-stream";
    const data = m[2] ? m[3] : Buffer.from(decodeURIComponent(m[3])).toString("base64");
    return { inlineData: { mimeType: mime, data } };
  }
  if (/^https?:|^gs:|^files\//.test(url)) {
    const ext = /\.(png|jpe?g|webp|heic|heif|gif|bmp)(?:\?|$)/i.exec(url)?.[1];
    const mime = ext ? `image/${ext.toLowerCase().replace("jpg", "jpeg")}` : "application/octet-stream";
    return { fileData: { mimeType: mime, fileUri: url } };
  }
  return null;
}

function partsOf(c: OAIMessage["content"]): Record<string, unknown>[] {
  if (typeof c === "string") return c ? [{ text: c }] : [];
  if (!Array.isArray(c)) return [];
  const parts: Record<string, unknown>[] = [];
  for (const p of c) {
    const t = partText(p);
    if (t) parts.push({ text: t });
    else if (p?.type === "image_url") {
      const part = imagePart(p.image_url?.url ?? "");
      if (part) parts.push(part);
    }
  }
  return parts;
}

/** Parse a JSON string defensively; Gemini wants an object, never a string. */
function jsonArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toGemini(body: OAIRequest) {
  const msgs = body.messages ?? [];
  const systemParts: { text: string }[] = [];
  const contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[] = [];
  /** tool_call_id → function name, so role=tool replies can name their function */
  const callNames = new Map<string, string>();

  for (const m of msgs) {
    if (m.role === "system") {
      const text = textOf(m.content);
      if (text) systemParts.push({ text });
      continue;
    }

    if (m.role === "assistant") {
      const parts = partsOf(m.content);
      for (const call of m.tool_calls ?? []) {
        const name = call.function?.name ?? "";
        if (!name) continue;
        if (call.id) callNames.set(call.id, name);
        parts.push({ functionCall: { name, args: jsonArgs(call.function?.arguments) } });
      }
      if (parts.length) contents.push({ role: "model", parts });
      continue;
    }

    if (m.role === "tool") {
      // OpenAI tool results are addressed by tool_call_id; Gemini wants the
      // function name plus a structured response object.
      const name = callNames.get(m.tool_call_id ?? "") ?? m.name ?? "tool";
      const text = textOf(m.content);
      let response: unknown;
      try {
        const v: unknown = JSON.parse(text);
        response = v && typeof v === "object" && !Array.isArray(v) ? v : { result: v };
      } catch {
        response = { result: text };
      }
      contents.push({ role: "user", parts: [{ functionResponse: { name, response } }] });
      continue;
    }

    const parts = partsOf(m.content);
    if (parts.length) contents.push({ role: "user", parts });
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

  const decls = toolDeclarations(body.tools);
  const tools: Record<string, unknown>[] = [];
  if (decls.length) tools.push({ functionDeclarations: decls });
  if (wantsSearch) tools.push({ google_search: {} });

  const payload: Record<string, unknown> = { contents };
  if (systemParts.length) payload.systemInstruction = { parts: systemParts };
  if (Object.keys(gen).length) payload.generationConfig = gen;
  if (tools.length) payload.tools = tools;

  return { model, payload, wantsSearch };
}

type ParsedReply = {
  text: string;
  grounding: unknown;
  toolCalls: { id: string; name: string; args: string }[];
};

const newCallId = () =>
  `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

function parseCandidate(cand: GeminiCandidate | undefined): ParsedReply {
  const parts = cand?.content?.parts ?? [];
  let text = "";
  const toolCalls: { id: string; name: string; args: string }[] = [];
  for (const p of parts) {
    if (typeof p.text === "string") text += p.text;
    else if (p.functionCall?.name) {
      toolCalls.push({
        id: newCallId(),
        name: String(p.functionCall.name),
        args: JSON.stringify(p.functionCall.args ?? {}),
      });
    }
  }
  if (toolCalls.length) counters.toolCalls += toolCalls.length;
  return { text, grounding: cand?.groundingMetadata ?? null, toolCalls };
}

const metaHeaders = (attempts: number, rotated: boolean): Record<string, string> => ({
  "x-gkr-attempts": String(attempts),
  "x-gkr-rotated": rotated ? "1" : "0",
});

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
      headers: new Headers({
        "content-type": "application/json",
        accept: stream ? "text/event-stream" : "application/json",
      }),
      body: JSON.stringify(payload),
      // @ts-expect-error Bun streaming body
      duplex: "half",
    },
    `/v1beta/models/${model}:${method}`,
    req.signal,
  );

  if (result.response.status === 499) return err(499, "client_closed_request", "Client disconnected.");
  if (!result.response.ok) return result.response;

  const id = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  if (!stream) {
    let json: GeminiResponse;
    try {
      json = (await result.response.json()) as GeminiResponse;
    } catch {
      return err(502, "upstream_error", "Upstream returned non-JSON.");
    }
    const cand = json.candidates?.[0];
    const { text, grounding, toolCalls } = parseCandidate(cand);
    const usage = json.usageMetadata ?? {};
    const message: Record<string, unknown> = {
      role: "assistant",
      content: text || (toolCalls.length ? null : ""),
    };
    if (toolCalls.length) {
      message.tool_calls = toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.args },
      }));
    }
    return Response.json(
      {
        id,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message,
            finish_reason: toolCalls.length ? "tool_calls" : mapFinish(cand?.finishReason),
          },
        ],
        usage: {
          prompt_tokens: usage.promptTokenCount ?? 0,
          completion_tokens: usage.candidatesTokenCount ?? 0,
          total_tokens: usage.totalTokenCount ?? 0,
        },
        ...(wantsSearch && grounding ? { grounding } : {}),
      },
      { headers: metaHeaders(result.attempts, result.rotated) },
    );
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
      const toolCalls: { id: string; name: string; args: string }[] = [];

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
            let json: GeminiResponse;
            try {
              json = JSON.parse(raw) as GeminiResponse;
            } catch {
              continue;
            }
            const cand = json.candidates?.[0];
            const { text, toolCalls: calls } = parseCandidate(cand);
            const fr = cand?.finishReason;
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
            for (const c of calls) {
              // Emit each call as its own delta so clients that accumulate by
              // index (the OpenAI SDK) see them arrive incrementally.
              const index = toolCalls.length;
              toolCalls.push(c);
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index,
                          id: c.id,
                          type: "function",
                          function: { name: c.name, arguments: c.args },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              });
            }
          }
        }
        send({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: toolCalls.length ? "tool_calls" : (finish ?? "stop"),
            },
          ],
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
    cancel(reason) {
      // Client hung up mid-stream: tear the upstream body down immediately.
      return upstream.cancel(reason);
    },
  });

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...metaHeaders(result.attempts, result.rotated),
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
    default:
      return "stop";
  }
}

/* ---------- embeddings ---------- */

type EmbeddingsRequest = {
  model?: string;
  input?: string | string[] | number[] | number[][];
  encoding_format?: string;
  dimensions?: number;
};

const asTextList = (input: EmbeddingsRequest["input"]): string[] => {
  if (typeof input === "string") return input ? [input] : [];
  if (Array.isArray(input)) return input.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
  return [];
};

function base64Float32(values: number[]): string {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf.toString("base64");
}

/**
 * POST /v1/embeddings — one Gemini batchEmbedContents call per request, still
 * rotated like every other route (a 429 on the batch moves to the next key).
 */
export async function embeddings(req: Request): Promise<Response> {
  counters.embeddings++;
  let body: EmbeddingsRequest;
  try {
    body = (await req.json()) as EmbeddingsRequest;
  } catch {
    return err(400, "invalid_request_error", "Body must be JSON.");
  }
  const texts = asTextList(body.input);
  if (texts.length === 0) {
    return err(400, "invalid_request_error", "`input` must be a string or an array of strings.");
  }
  const model = body.model && body.model.startsWith("text-embedding") ? body.model : cfg.defaultEmbedModel;
  const gen: Record<string, unknown> = {};
  if (typeof body.dimensions === "number") gen.outputDimensionality = body.dimensions;

  const payload = {
    requests: texts.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      ...(Object.keys(gen).length ? { generationConfig: gen } : {}),
    })),
  };

  const path = `/v1beta/models/${model}:batchEmbedContents`;
  const result = await execute(
    `${UP}${path}`,
    {
      method: "POST",
      headers: new Headers({ "content-type": "application/json", accept: "application/json" }),
      body: JSON.stringify(payload),
    },
    path,
    req.signal,
  );

  if (result.response.status === 499) return err(499, "client_closed_request", "Client disconnected.");
  if (!result.response.ok) return result.response;

  let json: GeminiResponse;
  try {
    json = (await result.response.json()) as GeminiResponse;
  } catch {
    return err(502, "upstream_error", "Upstream returned non-JSON.");
  }

  const vectors = json.embeddings ?? (json.embedding ? [json.embedding] : []);
  if (vectors.length === 0) {
    return err(502, "upstream_error", "Upstream returned no embeddings.");
  }

  const wantsBase64 = body.encoding_format === "base64";
  const data = vectors.map((v, index) => ({
    object: "embedding",
    index,
    embedding: wantsBase64 ? base64Float32(v.values ?? []) : (v.values ?? []),
  }));
  const tokens = json.usageMetadata?.promptTokenCount ?? 0;

  return Response.json(
    {
      object: "list",
      data,
      model,
      usage: { prompt_tokens: tokens, total_tokens: tokens },
    },
    { headers: metaHeaders(result.attempts, result.rotated) },
  );
}

export function models(): Response {
  const list = [
    cfg.defaultModel,
    cfg.searchModel,
    cfg.defaultTtsModel,
    cfg.defaultEmbedModel,
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
