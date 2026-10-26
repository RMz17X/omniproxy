/**
 * Key verdict taxonomy.
 *
 * One place decides what an upstream answer means for a *credential*. The
 * decision is structural, not prose-based: Google's 429 envelope carries two
 * shapes that read almost identically but mean opposite things.
 *
 *   free tier  `QuotaFailure.violations[].quotaId` ends in `-FreeTier`, the
 *              `quotaMetric` carries `_free_tier_requests`, and there is NO
 *              `quota_limit_value`. The daily window resets, so the key is
 *              merely rate limited.
 *   project    `ErrorInfo.metadata` carries `quota_metric`, `quota_limit`,
 *              `quota_limit_value` and `consumer`. A value of `0` means the
 *              project holds no allocation for that metric: the key cannot
 *              serve that model until an operator changes billing, but the
 *              credential itself is alive. It is never `invalid`.
 *
 * A 200 response carries no tier marker at all (models.list is identical for
 * both classes, so is every header), which is why tier evidence can only ever
 * be read out of a 429.
 */

export type KeyVerdict =
  | "ok"
  | "rate_limited"
  | "quota_exhausted"
  | "invalid"
  | "server_error"
  | "network_error"
  | "unexpected";

export type QuotaDetail = {
  /** metadata.quota_metric — the project shape only */
  metric: string | null;
  /** violations[0].quotaId — the free tier shape only */
  quotaId: string | null;
  /** violations[0].quotaMetric */
  quotaMetric: string | null;
  /** metadata.quota_limit */
  limit: string | null;
  /** metadata.quota_limit_value, as sent (string) */
  limitValue: string | null;
  /** derived window, or null when the body does not name one */
  window: "per_day_per_project_per_model" | "per_minute_per_project_per_region" | null;
  /** metadata.quota_location */
  location: string | null;
  /** metadata.consumer, e.g. "projects/123" */
  consumer: string | null;
  /** project number lifted out of `consumer` */
  project: string | null;
  /** epoch ms when the window resets, or null when the body does not say */
  resetAt: number | null;
  /** how long to wait, in ms; 0 when unknown */
  retryAfterMs: number;
  /**
   * violations[0].quotaDimensions.model — the model a free tier window is
   * scoped to. A 429 that names it refuses the (key, model) pair, not the key.
   */
  model: string | null;
  /** free tier shape: `-FreeTier` quotaId or `_free_tier_requests` metric */
  freeTier: boolean;
};

export type TierEvidence = {
  tier: string;
  source: "violations" | "consumer" | "none" | "subscription";
  quotaId: string | null;
  quotaMetric: string | null;
  consumer: string | null;
  observedAt: number;
};

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : null;

const asString = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Parse the body once; a body that is not JSON yields null rather than throwing. */
function parseBody(body: string): Json | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return asObject(parsed);
  } catch {
    return null;
  }
}

/** The `error` object of a Google envelope, or the whole body when unwrapped. */
function errorOf(root: Json | null): Json | null {
  if (!root) return null;
  return asObject(root.error) ?? root;
}

/** `error.details[]`, tolerated as absent. */
function detailsOf(err: Json | null): Json[] {
  const raw = err?.details;
  if (!Array.isArray(raw)) return [];
  return raw.map(asObject).filter((d): d is Json => d !== null);
}

/** The detail whose `@type` ends with the given rpc name. */
function detailOfType(details: Json[], name: string): Json | null {
  for (const d of details) {
    const type = asString(d["@type"]);
    if (type && type.endsWith(name)) return d;
  }
  return null;
}

/** `violations[]` of the QuotaFailure detail, if present. */
function violationsOf(details: Json[]): Json[] {
  const failure = detailOfType(details, "google.rpc.QuotaFailure");
  const raw = failure?.violations;
  if (!Array.isArray(raw)) return [];
  return raw.map(asObject).filter((v): v is Json => v !== null);
}

/** `metadata` of the ErrorInfo detail, if present. */
function metadataOf(details: Json[]): Json {
  const info = detailOfType(details, "google.rpc.ErrorInfo");
  return asObject(info?.metadata) ?? {};
}

/**
 * RetryInfo.retryDelay is a protobuf Duration string: "30659s", occasionally
 * with fractional seconds. Returns ms, or null when absent/unparseable.
 */
function retryDelayOf(details: Json[]): number | null {
  const info = detailOfType(details, "google.rpc.RetryInfo");
  const raw = asString(info?.retryDelay);
  if (!raw) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(raw.trim());
  if (!m) return null;
  const secs = Number(m[1]);
  if (!Number.isFinite(secs) || secs < 0) return null;
  return Math.round(secs * 1000);
}

/**
 * RetryInfo.retryDelay lifted out of a response body, in ms. Exported for the
 * text-level retry parsing in `upstream.ts`, which must not mint verdicts.
 */
export function retryDelayMs(body: string): number | null {
  return retryDelayOf(detailsOf(errorOf(parseBody(body))));
}

/**
 * First instant of the next calendar month, UTC.
 *
 * A plan allowance that is spent refills on the provider's billing cycle and
 * the response names no instant, so this is the earliest moment a parked key
 * can be probed again without wasting a call.
 */
function nextMonthStart(from: number = Date.now()): number {
  const d = new Date(from);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0);
}

/** Retry-After header in either of its legal forms; ms, or null. */
function retryAfterHeaderMs(headers?: Record<string, string>): number | null {
  if (!headers) return null;
  let raw: string | undefined;
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "retry-after") raw = value;
  }
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs > 0) return Math.round(secs * 1000);
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return null;
}

/** `projects/123` and `project_number:123` both carry the project number. */
function projectOf(consumer: string | null): string | null {
  if (!consumer) return null;
  const m = /(?:projects\/|project_number:)(\d+)/.exec(consumer);
  return m ? m[1] : null;
}

/** Map the limit/quota identifier onto the two windows the UI names. */
function windowOf(quotaId: string | null, limit: string | null): QuotaDetail["window"] {
  const text = `${quotaId ?? ""} ${limit ?? ""}`;
  if (/per_?day|PerDay|FreeTier/i.test(text)) return "per_day_per_project_per_model";
  if (/per_?minute|PerMinute/i.test(text)) return "per_minute_per_project_per_region";
  return null;
}

const isFreeQuotaId = (v: string | null): boolean => v !== null && /FreeTier/i.test(v);
const isFreeQuotaMetric = (v: string | null): boolean => v !== null && /_free_tier_requests/i.test(v);

/**
 * Read the quota shape out of a 429 body. Returns null when the body carries
 * neither a violation nor quota metadata — such a 429 is still rate limiting,
 * but there is nothing to describe.
 */
export function parseQuotaDetail(
  body: string,
  headers?: Record<string, string>,
): QuotaDetail | null {
  const details = detailsOf(errorOf(parseBody(body)));
  const violations = violationsOf(details);
  const meta = metadataOf(details);

  const quotaId = asString(violations[0]?.quotaId);
  const quotaMetric = asString(violations[0]?.quotaMetric);
  const metric = asString(meta.quota_metric);
  const limit = asString(meta.quota_limit);
  const limitValue = asString(meta.quota_limit_value);
  const consumer = asString(meta.consumer);
  const dimensions = asObject(violations[0]?.quotaDimensions);
  const model = asString(dimensions?.model) ?? asString(meta.model);

  if (!quotaId && !quotaMetric && !metric && !limit && !consumer && !model) return null;

  const fromBody = retryDelayOf(details);
  const retryAfterMs = fromBody ?? retryAfterHeaderMs(headers) ?? 0;

  return {
    metric,
    quotaId,
    quotaMetric,
    limit,
    limitValue,
    model,
    window: windowOf(quotaId, limit),
    location: asString(meta.quota_location),
    consumer,
    project: projectOf(consumer),
    resetAt: retryAfterMs > 0 ? Date.now() + retryAfterMs : null,
    retryAfterMs,
    freeTier: isFreeQuotaId(quotaId) || isFreeQuotaMetric(quotaMetric),
  };
}

/**
 * A refusal scoped to a model rather than to the credential: the body names
 * the model and does not blame the consumer project. The free tier shape
 * (`violations[0].quotaId` ending in `-FreeTier`, `quotaDimensions.model` set,
 * no `metadata.consumer`) is exactly this. Such a 429 says "no allowance for
 * this model", so the key stays in the pool for every other model.
 */
export function isModelScopedQuota(quota: QuotaDetail): boolean {
  if (quota.model === null) return false;
  if (quota.consumer !== null || quota.limitValue !== null) return false;
  return quota.freeTier || /-FreeTier$/i.test(quota.quotaId ?? "");
}

/**
 * Tier evidence read strictly out of a 429 body: a free-tier violation proves
 * free, a consumer without one proves paid, nothing else proves anything.
 * The top-level `quota_metric` is deliberately ignored — it appears in both
 * shapes and would mislabel a free key as paid.
 */
export function tierEvidenceFrom(body: string): TierEvidence | null {
  const details = detailsOf(errorOf(parseBody(body)));
  const violations = violationsOf(details);
  const meta = metadataOf(details);

  const quotaId = asString(violations[0]?.quotaId);
  const quotaMetric = asString(violations[0]?.quotaMetric);
  const consumer = asString(meta.consumer);
  const observedAt = Date.now();

  if (isFreeQuotaId(quotaId) || isFreeQuotaMetric(quotaMetric)) {
    return { tier: "free", source: "violations", quotaId, quotaMetric, consumer, observedAt };
  }
  if (consumer) {
    return { tier: "paid", source: "consumer", quotaId, quotaMetric, consumer, observedAt };
  }
  return null;
}

/** A model that does not serve this call is never a statement about the key. */
const MODEL_UNAVAILABLE =
  /no longer available to new users|is not found for API version|not supported for generateContent|does not support generateContent|MODEL_NOT_FOUND|is not supported|experiencing high demand|currently unavailable/i;

/** The only texts that make a 403 a permanent credential verdict. */
/**
 * Text that proves the credential itself is unusable, whichever surface
 * answered. The last two alternatives are Google's OAuth refusal — the shape
 * an `AQ.` token draws when it is presented to generateContent as an API key:
 * "Request had invalid authentication credentials. Expected OAuth 2 access
 * token…". That credential type can never authenticate this API, so the key
 * is dead here. It is NOT the case a bare 401 protects: a live key refused
 * for project or model access carries no such text.
 */
const INVALID_KEY =
  /reported as leaked|API_KEY_INVALID|API key not valid|API key expired|invalid.?api.?key|expected oauth 2 access token|invalid authentication credentials|wrong.?api.?key|user not found/i;

/**
 * The single "this credential is dead" predicate.
 *
 * The serving path (execute) and the probe must never disagree about it:
 * when they did, an OAuth token was soft-parked on every request and
 * re-admitted by the probe forever. `isInvalidKeyText` in upstream.ts
 * delegates here for the same reason.
 */
export function isInvalidKeyBody(body: string): boolean {
  return INVALID_KEY.test(body);
}

function messageOf(body: string): string {
  const err = errorOf(parseBody(body));
  return asString(err?.message) ?? "";
}

/**
 * Classify one upstream answer. `status` 0 stands for a transport failure,
 * which is the only verdict a caller can reach without an HTTP response.
 */
export function classifyResponse(
  status: number,
  body: string,
  headers?: Record<string, string>,
): { verdict: KeyVerdict; quota: QuotaDetail | null; tierEvidence: TierEvidence | null } {
  const none = { quota: null, tierEvidence: null } as const;

  if (status === 0) return { verdict: "network_error", ...none };

  if (status >= 200 && status < 300) return { verdict: "ok", ...none };

  // A bare 401 is not a dead credential on its own (project/model access
  // refusals answer 401 too); only invalid-key text retires the key.
  if (status === 401) {
    return INVALID_KEY.test(body) ? { verdict: "invalid", ...none } : { verdict: "unexpected", ...none };
  }

  if (status === 403) {
    return INVALID_KEY.test(body)
      ? { verdict: "invalid", ...none }
      : { verdict: "unexpected", ...none };
  }

  if (status === 429) {
    const quota = parseQuotaDetail(body, headers);
    const evidence = tierEvidenceFrom(body);
    // The free tier shape has no limit value at all: its daily window resets.
    if (!quota || quota.freeTier) {
      return { verdict: "rate_limited", quota, tierEvidence: evidence };
    }
    // The project shape is decided by the value, never by the prose: both
    // shapes mention "per minute" in the limit name.
    const verdict: KeyVerdict = quota.limitValue === "0" ? "quota_exhausted" : "rate_limited";
    return { verdict, quota, tierEvidence: evidence };
  }

  // A retired model or a model that cannot answer generateContent is a
  // property of the model. No key verdict may be minted from it.
  if (status === 404) return { verdict: "unexpected", ...none };
  if (status === 400 && MODEL_UNAVAILABLE.test(body)) return { verdict: "unexpected", ...none };
  if (status === 400) {
    return INVALID_KEY.test(body)
      ? { verdict: "invalid", ...none }
      : { verdict: "unexpected", ...none };
  }

  if (status >= 500) return { verdict: "server_error", ...none };

  return { verdict: "unexpected", ...none };
}

/**
 * Classify an ElevenLabs response into the existing verdict taxonomy.
 *
 * `dead` ONLY for 401, and for 403 with invalid-key wording (a bare 403 is
 * a permission/voice restriction, not a dead credential).
 * 429 enters quota state with reset time if available.
 * 200 proves key is alive and captures plan from subscription.tier.
 */
export function classifyElevenLabsResponse(
  status: number,
  body: string,
  headers?: Record<string, string>,
): { verdict: KeyVerdict; quota: QuotaDetail | null; tierEvidence: TierEvidence | null } {
  const none = { quota: null, tierEvidence: null } as const;

  if (status === 0) return { verdict: "network_error", ...none };

  if (status >= 200 && status < 300) {
    let tier = "unknown";
    let limit: string | null = null;
    let count: string | null = null;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.subscription?.tier) {
        tier = String(parsed.subscription.tier);
      }
      if (parsed?.subscription?.character_limit !== undefined) {
        limit = String(parsed.subscription.character_limit);
      }
      if (parsed?.subscription?.character_count !== undefined) {
        count = String(parsed.subscription.character_count);
      }
    } catch {}

    const evidence: TierEvidence = {
      tier,
      source: "subscription",
      quotaId: count !== null ? `chars_${count}` : null,
      quotaMetric: "characters",
      consumer: limit,
      observedAt: Date.now(),
    };

    /* 200 authenticates the credential but says nothing about its allowance:
       /v1/user answers 200 while character_count sits at character_limit, and
       the refusal only appears later on /v1/text-to-speech. Compare the two
       numbers the body already carries — otherwise a spent key is reported
       ready forever, is never re-probed, and every request that lands on it
       fails. Not `invalid`: the allowance refills on the monthly cycle. */
    const limitN = limit === null ? NaN : Number(limit);
    const countN = count === null ? NaN : Number(count);
    if (Number.isFinite(limitN) && Number.isFinite(countN) && limitN - countN <= 0) {
      const resetAt = nextMonthStart();
      return {
        verdict: "quota_exhausted",
        quota: {
          metric: "characters",
          quotaId: count !== null ? `chars_${count}` : null,
          quotaMetric: "characters",
          limit,
          limitValue: String(limitN - countN),
          window: null,
          location: null,
          consumer: limit,
          project: null,
          resetAt,
          retryAfterMs: Math.max(0, resetAt - Date.now()),
          model: null,
          freeTier: tier === "free",
        },
        tierEvidence: evidence,
      };
    }

    return { verdict: "ok", quota: null, tierEvidence: evidence };
  }

  // 401 is a dead credential for ElevenLabs; a 403 on its own is NOT — it
  // is commonly a permission/voice restriction on a live key, and retiring
  // on it burned healthy keys. Only 403 bodies carrying invalid-key wording
  // retire.
  if (status === 401) {
    return { verdict: "invalid", ...none };
  }
  if (status === 403) {
    return /invalid|expired|revoked/i.test(body)
      ? { verdict: "invalid", ...none }
      : { verdict: "unexpected", ...none };
  }

  // 429 masuk quota state (bukan mati)
  if (status === 429) {
    let retryAfterMs = 0;
    if (headers) {
      for (const [name, val] of Object.entries(headers)) {
        if (name.toLowerCase() === "retry-after") {
          const secs = Number(val);
          if (Number.isFinite(secs) && secs > 0) retryAfterMs = secs * 1000;
        }
      }
    }
    try {
      const parsed = JSON.parse(body);
      const resetUnix =
        parsed?.detail?.next_character_count_reset_unix ??
        parsed?.next_character_count_reset_unix;
      if (typeof resetUnix === "number" && resetUnix > 0) {
        const diffMs = resetUnix * 1000 - Date.now();
        if (diffMs > 0) retryAfterMs = Math.max(retryAfterMs, diffMs);
      }
    } catch {}

    const quota: QuotaDetail = {
      metric: "characters",
      quotaId: "elevenlabs_quota",
      quotaMetric: "characters",
      limit: null,
      limitValue: null,
      window: null,
      location: null,
      consumer: null,
      project: null,
      resetAt: retryAfterMs > 0 ? Date.now() + retryAfterMs : null,
      retryAfterMs,
      model: null,
      freeTier: false,
    };

    return { verdict: "rate_limited", quota, tierEvidence: null };
  }

  if (status >= 500) return { verdict: "server_error", ...none };

  return { verdict: "unexpected", ...none };
}
