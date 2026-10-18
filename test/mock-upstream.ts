/**
 * Mock Gemini upstream. Behaviour is driven by the key it receives:
 *   key containing "429"  -> always 429 RESOURCE_EXHAUSTED
 *   key containing "dead" -> always 400 API_KEY_INVALID
 *   key containing "boom" -> always 500
 *   anything else         -> 200 with a canned answer (echoes the key)
 */
const server = Bun.serve({
  port: 8089,
  async fetch(req) {
    const url = new URL(req.url);
    const key = req.headers.get("x-goog-api-key") ?? url.searchParams.get("key") ?? "";
    const body = await req.text();

    const q = (status: number, obj: unknown) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (key.includes("429")) {
      return new Response(
        JSON.stringify({
          error: {
            code: 429,
            status: "RESOURCE_EXHAUSTED",
            message: "Quota exceeded. reset after 2s",
          },
        }),
        { status: 429, headers: { "content-type": "application/json", "retry-after": "2" } },
      );
    }
    if (key.includes("dead")) {
      return q(400, {
        error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. API_KEY_INVALID" },
      });
    }
    if (key.includes("boom")) return q(500, { error: { message: "internal" } });

    if (url.pathname.endsWith(":streamGenerateContent")) {
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        start(c) {
          for (const t of ["Hello", " from", " mock"]) {
            c.enqueue(
              enc.encode(
                `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`,
              ),
            );
          }
          c.enqueue(
            enc.encode(
              `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "!" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 4, totalTokenCount: 9 } })}\n\n`,
            ),
          );
          c.close();
        },
      });
      return new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      });
    }

    // TTS path: return PCM inlineData
    if (body.includes('"AUDIO"')) {
      const pcm = Buffer.alloc(480); // 10ms of silence @24k mono 16-bit
      return q(200, {
        candidates: [
          {
            content: {
              parts: [
                { inlineData: { mimeType: "audio/L16;rate=24000", data: pcm.toString("base64") } },
              ],
            },
          },
        ],
      });
    }

    return q(200, {
      candidates: [
        {
          content: { parts: [{ text: `pong from ${key.slice(0, 6)}` }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10 },
    });
  },
});

console.log("mock upstream on", server.port);
