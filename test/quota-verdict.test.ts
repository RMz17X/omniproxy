/**
 * Quota verdict classification.
 *
 * Google's 429 envelope carries two shapes that look alike in prose but mean
 * opposite things for the pool:
 *
 *   - a key whose project still has an allowance: `quota_limit_value` is the
 *     positive per-minute number. The window resets, so the key is parked.
 *   - a key whose project holds no allocation: `quota_limit_value` is 0. No
 *     window will ever help, so the key is retired.
 *
 * The retired shape also carries "requests per minute" in the limit name, so
 * the prose cannot be used to tell them apart. Only the limit value can.
 */
import { expect, test } from "bun:test";

import { isInvalidKeyText, isZeroQuota } from "../src/upstream.ts";

/** The real envelope observed from Google for a project with no allocation. */
const PERMANENT_ZERO_QUOTA = JSON.stringify({
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
});

/** The envelope for a valid key that simply burned its per-minute window. */
const TRANSIENT_QUOTA = JSON.stringify({
  error: {
    code: 429,
    message:
      "You exceeded your current quota, please check your plan and billing details. " +
      "For more information on this error, head to: " +
      "https://ai.google.dev/gemini-api/docs/rate-limits.",
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "RATE_LIMIT_EXCEEDED",
        domain: "googleapis.com",
        metadata: {
          quota_limit_value: "15",
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
});

test("a project with no allocation is retired, not parked", () => {
  expect(isZeroQuota(PERMANENT_ZERO_QUOTA)).toBe(true);
});

test("an exhausted but valid key keeps its allowance and is only parked", () => {
  expect(isZeroQuota(TRANSIENT_QUOTA)).toBe(false);
});

test("a positive limit value is never read as zero quota", () => {
  expect(isZeroQuota('{"metadata":{"quota_limit_value":"5"}}')).toBe(false);
  expect(isZeroQuota('{"metadata":{"quota_limit_value":"100"}}')).toBe(false);
});

test("a leaked key is recognised as invalid, not as a caller error", () => {
  const leaked = JSON.stringify({
    error: {
      code: 403,
      message: "Your API key was reported as leaked. Please use another API key.",
      status: "PERMISSION_DENIED",
    },
  });
  expect(isInvalidKeyText(leaked)).toBe(true);
});

test("an unrelated 403 is not mistaken for an invalid key", () => {
  const denied = JSON.stringify({
    error: { code: 403, message: "Permission denied for this resource.", status: "PERMISSION_DENIED" },
  });
  expect(isInvalidKeyText(denied)).toBe(false);
});

test("an OAuth token presented as an API key is a dead credential", () => {
  // `AQ.` tokens are OAuth credentials: generateContent refuses the type
  // itself, so the key can never serve and must retire, not cycle.
  const oauth = JSON.stringify({
    error: {
      code: 401,
      status: "UNAUTHENTICATED",
      message:
        "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.",
    },
  });
  expect(isInvalidKeyText(oauth)).toBe(true);
  // A bare 401 stays ambiguous: a live key can be refused for project access.
  expect(isInvalidKeyText(JSON.stringify({ error: { code: 401, message: "Unauthorized" } }))).toBe(false);
});
