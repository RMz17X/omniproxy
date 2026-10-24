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
import { execute, executeWithFallback, modelChain } from "./upstream.ts";
import { finalizeStream, noteUsage } from "./ledger.ts";
import { listLiveModels, pricingMeta, type LiveModel } from "./models.ts";
import { catalogFor, PRICING_AS_OF } from "./models-catalog.ts";

/**
 * The upstream base, read per call. `cfg.upstream` is a getter on purpose: the
 * test harness boots its mock on an OS-assigned port, and a module-level
 * constant would freeze the value before the harness knew it.
 */
const up = (): string => cfg.upstream.replace(/\/$/, "");

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
  stream_options?: { include_usage?: boolean };
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
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
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

/** `data:image/png;base64,...` → inlineData; other URLs → fileData. */
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
  "x-omniproxy-attempts": String(attempts),
  "x-omniproxy-rotated": rotated ? "1" : "0",
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

  const { model: requested, payload, wantsSearch } = toGemini(body);
  const stream = Boolean(body.stream);
  const method = stream ? "streamGenerateContent" : "generateContent";
  const search = stream ? "?alt=sse" : "";

  // A retired model (404) or an overloaded one (503 "high demand") is a model
  // problem: `executeWithFallback` moves to the next model in the chain with
  // the key state untouched, so one dead model cannot burn the key pool.
  const result = await executeWithFallback(
    modelChain(requested),
    (candidate) => ({
      url: `${up()}/v1beta/models/${candidate}:${method}${search}`,
      init: {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
          accept: stream ? "text/event-stream" : "application/json",
        }),
        body: JSON.stringify(payload),
        // Bun wants `duplex` on a streaming body; the DOM `RequestInit` does
        // not declare it, so the cast keeps the intent without silencing the
        // whole literal.
        duplex: "half",
      } as RequestInit & { method: string; duplex: "half" },
      path: `/v1beta/models/${candidate}:${method}`,
    }),
    req.signal,
  );

  /** The model that actually served this request, not the one requested. */
  const model = result.model;

  noteUsage(req, {
    model,
    keyRaw: result.key,
    attempts: result.attempts,
    rotated: result.rotated,
    stream,
    errorCode: result.response.ok ? null : `http_${result.response.status}`,
  });

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
    // Gemini reports thinking tokens on a separate meter. OpenAI counts them
    // inside completion_tokens, so fold them in to keep the numbers comparable
    // (a "PONG" reply was reporting total 109 with completion 2 before this).
    const thoughts = usage.thoughtsTokenCount ?? 0;
    const promptTokens = usage.promptTokenCount ?? 0;
    const completionTokens = (usage.candidatesTokenCount ?? 0) + thoughts;
    const totalTokens = usage.totalTokenCount ?? promptTokens + completionTokens;
    noteUsage(req, {
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens: usage.cachedContentTokenCount ?? 0,
    });
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
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          ...(thoughts ? { completion_tokens_details: { reasoning_tokens: thoughts } } : {}),
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
      // Gemini only reports token counts on the last SSE frame, so accumulate
      // the newest non-zero values and publish them once the stream drains.
      let sPrompt = 0;
      let sCompletion = 0;
      let sThoughts = 0;
      let sTotal = 0;
      let sCached = 0;
      let streamErr: string | null = null;

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          /* Gemini separates SSE frames with CRLF CRLF, not LF LF. Splitting on
             "\n\n" therefore matched nothing: every frame stayed in buf and was
             discarded when the stream ended, so a streaming reply delivered
             only the opening role chunk and the closing stop chunk with no
             content at all. Match either line ending. */
          const frames = buf.split(/\r?\n\r?\n/);
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split(/\r?\n/).find((l) => l.startsWith("data:"));
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
            if (json.usageMetadata) {
              const u = json.usageMetadata;
              if (u.promptTokenCount) sPrompt = u.promptTokenCount;
              if (u.candidatesTokenCount) sCompletion = u.candidatesTokenCount;
              if (u.thoughtsTokenCount) sThoughts = u.thoughtsTokenCount;
              // Always take the newest total; a thinking model's last frame is
              // the only one that carries the final count.
              if (u.totalTokenCount) sTotal = u.totalTokenCount;
              if (u.cachedContentTokenCount) sCached = u.cachedContentTokenCount;
            }
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
        /* A stream can close on a frame boundary that left the last frame in
           buf (no trailing separator, or a truncated tail). Parse it rather
           than dropping the final token. */
        if (buf.trim()) {
          const tailLine = buf.split(/\r?\n/).find((l) => l.startsWith("data:"));
          const tailRaw = tailLine ? tailLine.slice(5).trim() : "";
          if (tailRaw && tailRaw !== "[DONE]") {
            try {
              const tail = JSON.parse(tailRaw) as GeminiResponse;
              const tailCand = tail.candidates?.[0];
              const tailParsed = parseCandidate(tailCand);
              if (tailCand?.finishReason) finish = mapFinish(tailCand.finishReason);
              if (tailParsed.text) {
                send({
                  id,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [{ index: 0, delta: { content: tailParsed.text }, finish_reason: null }],
                });
              }
            } catch {
              /* a partial JSON tail is not a frame; ignore it */
            }
          }
          buf = "";
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
        // OpenAI's stream contract: a usage chunk arrives only when the caller
        // asks for it, and only after the finish_reason chunk. Thinking tokens
        // are folded into completion_tokens the same way the non-stream path
        // does, so the two responses agree on the same prompt.
        if (body.stream_options?.include_usage) {
          const completion = sCompletion + sThoughts;
          send({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [],
            usage: {
              prompt_tokens: sPrompt,
              completion_tokens: completion,
              total_tokens: sTotal || sPrompt + completion,
              ...(sThoughts ? { completion_tokens_details: { reasoning_tokens: sThoughts } } : {}),
              ...(sCached ? { prompt_tokens_details: { cached_tokens: sCached } } : {}),
            },
          });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        streamErr = "stream_error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: { message: String(e) } })}\n\n`),
        );
      } finally {
        // The row is only committed now: token counts are final and the client
        // already has every byte it will get.
        noteUsage(req, {
          promptTokens: sPrompt,
          completionTokens: sCompletion + sThoughts,
          totalTokens: sTotal || sPrompt + sCompletion + sThoughts,
          cachedTokens: sCached,
        });
        finalizeStream(req, streamErr ? 502 : 200, streamErr ?? undefined);
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
  const model =
    body.model && (body.model.includes("embed") || body.model.startsWith("gemini"))
      ? body.model
      : cfg.defaultEmbedModel;
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
    `${up()}${path}`,
    {
      method: "POST",
      headers: new Headers({ "content-type": "application/json", accept: "application/json" }),
      body: JSON.stringify(payload),
    },
    path,
    req.signal,
  );

  noteUsage(req, {
    model,
    keyRaw: result.key,
    attempts: result.attempts,
    rotated: result.rotated,
    errorCode: result.response.ok ? null : `http_${result.response.status}`,
  });

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
  noteUsage(req, { promptTokens: tokens, totalTokens: tokens });

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

/**
 * Drop models the upstream has retired. A retired model answers 404 "no longer
 * available to new users" for every key, so advertising it in the catalog
 * only steers clients into a fallback.
 *
 * The list is the measured one in `cfg.retiredModels` (2026-10-22:
 * `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`). The other
 * 2.5 ids stay listed on purpose: the image and TTS variants answer 429
 * because their quota is spent, not because the model is gone, and the
 * native-audio ids answer 400 because they serve live bidirectional
 * streaming instead of generateContent.
 */
export function visibleModels(ids: string[]): string[] {
  const retired = new Set(cfg.retiredModels.map((m) => m.replace(/^models\//, "").toLowerCase()));
  return ids.filter((id) => !retired.has(id.replace(/^models\//, "").toLowerCase()));
}

export async function models(): Promise<Response> {
  const fallback = visibleModels([
    cfg.defaultModel,
    cfg.searchModel,
    cfg.defaultTtsModel,
    cfg.defaultEmbedModel,
    "gemini-3-flash-preview",
    "gemini-2.0-flash",
  ]);

  let live: LiveModel[] = [];
  let cached = false;
  let degraded = false;
  try {
    const r = await listLiveModels();
    live = r.models.filter((m) => visibleModels([m.id]).length > 0);
    cached = r.cached;
  } catch {
    degraded = true;
  }

  if (!live.length) {
    return Response.json(
      {
        object: "list",
        data: [...new Set(fallback)].map((id) => ({
          id,
          object: "model",
          created: 1700000000,
          owned_by: "google",
        })),
        omniproxy: { source: "fallback", cached: false, degraded, live: 0, pricing: pricingMeta() },
      },
      { headers: { "x-omniproxy-models": "fallback" } },
    );
  }

  return Response.json(
    {
      object: "list",
      data: live.map((m) => {
        const c = catalogFor(m.id);
        return {
          id: m.id,
          object: "model",
          created: 1700000000,
          owned_by: "google",
          // OpenAI clients ignore unknown fields; these are additive.
          display_name: m.displayName,
          kind: m.kind,
          free: m.free,
          context_window: m.inputTokenLimit,
          max_output_tokens: m.outputTokenLimit,
          pricing: c
            ? { input_per_1m_usd: c.inUsd, output_per_1m_usd: c.outUsd, as_of: PRICING_AS_OF }
            : null,
        };
      }),
      omniproxy: { source: "live", cached, degraded, live: live.length, pricing: pricingMeta() },
    },
    { headers: { "x-omniproxy-models": cached ? "live-cached" : "live" } },
  );
}

function err(status: number, type: string, message: string): Response {
  return Response.json({ error: { type, message } }, { status });
}
