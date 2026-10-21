/**
 * Mock Gemini upstream. Behaviour is driven by the key it receives:
 *   key containing "429"  -> always 429 RESOURCE_EXHAUSTED
 *   key containing "dead" -> always 400 API_KEY_INVALID
 *   key containing "boom" -> always 500
 *   anything else         -> 200 with a canned answer (echoes the key)
 *
 * Model-level failures are driven by the model id in the path, because they
 * are a property of the model and not of the credential:
 *   model containing "retired" -> 404 "no longer available to new users"
 *   model containing "busy"    -> 503 "experiencing high demand"
 *   model containing "hang"    -> never answers (upstream timeout)
 *
 * Two quota keys separate "out of quota everywhere" from "out of quota on one
 * model only":
 *   key containing "zeroquota" -> 429 zero-quota on every model
 *   key containing "halfquota" -> 429 zero-quota on 3.5-flash only, 200 elsewhere
 */
const server = Bun.serve({
  // Port 0: the OS assigns a free one, so a mock left behind by an earlier
  // run can never shadow this one.
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const key = req.headers.get("x-goog-api-key") ?? url.searchParams.get("key") ?? "";
    const body = await req.text();
    const model = /\/v1beta\/models\/([^:/]+)/.exec(url.pathname)?.[1] ?? "";

    const q = (status: number, obj: unknown) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
      });

    // ---- model-level failures (the credential is fine) ----
    if (model.includes("retired")) {
      return q(404, {
        error: {
          code: 404,
          status: "NOT_FOUND",
          message: `models/${model} is no longer available to new users.`,
        },
      });
    }
    if (model.includes("busy")) {
      return q(503, {
        error: {
          code: 503,
          status: "UNAVAILABLE",
          message: "The model is currently experiencing high demand. Please try again later.",
        },
      });
    }
    if (model.includes("hang")) {
      // Never answers: the caller must hit its own timeout.
      await new Promise<void>(() => {});
      return q(200, { candidates: [] });
    }

    // ---- quota shapes ----
    // The envelope mirrors what Google really sends: the limit value lives in
    // `details[].metadata.quota_limit_value`. A prose-only body is not enough,
    // because the classification reads the value, not the wording.
    const zeroQuotaBody = {
      error: {
        code: 429,
        message:
          "Quota exceeded for quota metric 'Generate Content API requests per minute' and limit " +
          "'GenerateContent request limit per minute for a region' of service " +
          "'generativelanguage.googleapis.com' for consumer 'project_number:160256998078'.",
        status: "RESOURCE_EXHAUSTED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "RATE_LIMIT_EXCEEDED",
            domain: "googleapis.com",
            metadata: {
              quota_limit_value: "0",
              consumer: "projects/160256998078",
              service: "generativelanguage.googleapis.com",
              quota_location: "asia-southeast1",
              quota_limit: "GenerateContentRequestsPerMinutePerProjectPerRegion",
              quota_unit: "1/min/{project}/{region}",
              quota_metric: "generativelanguage.googleapis.com/generate_content_requests",
            },
          },
        ],
      },
    };
    if (key.toLowerCase().includes("zeroquota")) {
      return q(429, zeroQuotaBody);
    }
    if (key.toLowerCase().includes("halfquota") && model.includes("3.5-flash")) {
      // Out of quota on one model only: the other models still serve it.
      return q(429, zeroQuotaBody);
    }

    if (key.toLowerCase().includes("429".toLowerCase())) {
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
    if (key.toLowerCase().includes("dead".toLowerCase())) {
      return q(400, {
        error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. API_KEY_INVALID" },
      });
    }
    if (key.toLowerCase().includes("boom".toLowerCase())) return q(500, { error: { message: "internal" } });

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
