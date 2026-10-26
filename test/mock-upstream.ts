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
 * Plan classification needs the two real 429 shapes plus a model that only a
 * paid project can reach:
 *   key containing "freequota" -> 429 QuotaFailure (no limit value) on every
 *                                model except the older image preview, which
 *                                is 404 for a free project
 *   key containing "paidquota" -> 429 ErrorInfo (limit value present) on the
 *                                image models, 200 elsewhere
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

    // ---- the paid-only endpoint that names a revoked credential ----
    // generateContent answers a leaked key with the same zero-quota shape a
    // live project without an allocation sends, so the leak is invisible
    // there. cachedContents is the only endpoint that says it outright.
    if (url.pathname.endsWith("/v1beta/cachedContents")) {
      if (key.toLowerCase().includes("leaked")) {
        return q(403, {
          error: {
            code: 403,
            status: "PERMISSION_DENIED",
            message: "Your API key was reported as leaked. Please use another API key.",
          },
        });
      }
      // A key that is merely out of quota is out of quota here too: the probe
      // must not read this as a credential answer.
      if (key.toLowerCase().includes("zeroquota")) return q(429, zeroQuotaBody);
      // A live key is rejected before any cached content object is created.
      return q(400, {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message: "Cached content is required to have content.role set.",
        },
      });
    }
    if (key.toLowerCase().includes("zeroquota")) {
      return q(429, zeroQuotaBody);
    }
    // A revoked key's serving endpoint looks exactly like an exhausted project.
    if (key.toLowerCase().includes("leaked")) {
      return q(429, zeroQuotaBody);
    }
    if (key.toLowerCase().includes("halfquota") && model.includes("3.5-flash")) {
      // Out of quota on one model only: the other models still serve it.
      return q(429, zeroQuotaBody);
    }
    // ---- plan shapes ----
    // Free tier: `QuotaFailure.violations[]` names the free-tier quota and
    // carries NO limit value. The daily window resets, so the key is parked.
    const freeQuotaBody = {
      error: {
        code: 429,
        message:
          "You exceeded your current quota, please check your plan and billing details.",
        status: "RESOURCE_EXHAUSTED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [
              {
                quotaMetric:
                  "generativelanguage.googleapis.com/generate_content_free_tier_requests",
                quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
                quotaDimensions: { model, location: "global" },
              },
            ],
          },
          {
            "@type": "type.googleapis.com/google.rpc.RetryInfo",
            retryDelay: "30659s",
          },
        ],
      },
    };
    if (key.toLowerCase().includes("freequota")) {
      // The older image preview model is not served to a free project at all,
      // which is what lets a caller prove the free tier by elimination.
      if (model.includes("2.0-flash-preview-image-generation")) {
        return q(404, {
          error: {
            code: 404,
            status: "NOT_FOUND",
            message: `models/${model} is not found for API version v1beta.`,
          },
        });
      }
      return q(429, freeQuotaBody);
    }
    if (key.toLowerCase().includes("modelquota") && model.includes("3.5-flash")) {
      // Allowance spent for ONE model only. The body names the model and
      // blames no project, so the key must stay in rotation for every other
      // model instead of taking a pool-wide cooldown.
      return q(429, freeQuotaBody);
    }
    if (
      key.toLowerCase().includes("paidquota") &&
      (model.includes("flash-image") || model.includes("preview-image-generation"))
    ) {
      // A paid project serves both image models and is rate limited on them.
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
    // An `AQ.` OAuth token presented as an API key: Google refuses the
    // credential type with a 401 that names neither API_KEY_INVALID nor a
    // leak. It is still a dead credential on this surface.
    if (key.toLowerCase().includes("oauth")) {
      return q(401, {
        error: {
          code: 401,
          status: "UNAUTHENTICATED",
          message:
            "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.",
        },
      });
    }
    // A credential from another provider reaching Google's endpoint: the
    // shape is foreign, so Google rejects it the same way. Selection must
    // never let this happen; the rule exists so a regression fails loudly
    // instead of silently retiring the key.
    if (key.startsWith("sk_")) {
      return q(401, {
        error: {
          code: 401,
          status: "UNAUTHENTICATED",
          message:
            "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.",
        },
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
