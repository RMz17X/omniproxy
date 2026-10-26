/**
 * Runtime configuration, all overridable by env.
 *
 * Every storage key is optional. An absent `DATABASE_URL` disables the whole
 * persistence layer: the gateway still boots, serves traffic, and keeps the
 * pool in process memory exactly as it did before Postgres existed.
 */

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/** Comma-separated model list from env, else the code default. */
const list = (v: string | undefined, d: string[]) => {
  const fromEnv = (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : d;
};
export const cfg = {
  /**
   * upstream base, no trailing slash
   *
   * A getter, not a plain field: the test harness boots its mock upstream on
   * an OS-assigned port and only then knows the URL. Reading the env var at
   * call time means the harness does not have to win a module-evaluation race
   * against this file.
   */
  get upstream(): string {
    return process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com";
  },
  /** per-key pacing, ENFORCED by pool.selectable(): a key whose lastUsed is
   *  inside this window is not selectable at all (not merely deprioritised
   *  by LRU). 4000ms == 15 RPM, the Gemini free-tier ceiling per project. */
  rateWindowMs: num(process.env.KEY_RATE_WINDOW_MS, 4000),
  /** cooldown applied on 429 / RESOURCE_EXHAUSTED */
  cooldownMs: num(process.env.KEY_COOLDOWN_MS, 60_000),
  /** cooldown applied on 5xx */
  serverErrCooldownMs: num(process.env.KEY_5XX_COOLDOWN_MS, 15_000),
  /** max key attempts per request before giving up */
  // 10 per operator policy: a 429 must rotate to another still-valid key, and
  // the console can override this at runtime (see settings-store.ts).
  maxAttempts: num(process.env.MAX_ATTEMPTS, 10),
  /** how long to wait for a busy pool before 429-ing the client */
  maxWaitMs: num(process.env.MAX_WAIT_MS, 8_000),
  /** hard ceiling for one upstream attempt; also the client-disconnect bound */
  upstreamTimeoutMs: num(process.env.UPSTREAM_TIMEOUT_MS, 120_000),
  /**
   * Ceiling for a *fallback* model attempt.
   *
   * A congested model does not answer fast — measured 2026-10-22:
   * `gemini-3.8-flash` took 49-99 s before answering 503, and
   * `gemini-flash-latest` never answered at all. Waiting the full upstream
   * timeout on every fallback turns one request into minutes of silence, so a
   * fallback is given a short window: it either serves quickly or the chain
   * moves on.
   */
  fallbackTimeoutMs: num(process.env.FALLBACK_TIMEOUT_MS, 20_000),
  /**
   * Ceiling for the whole model chain, so a client is always answered.
   * The first (requested) model keeps `upstreamTimeoutMs`; whatever budget is
   * left is shared by the fallbacks.
   */
  modelChainBudgetMs: num(process.env.MODEL_CHAIN_BUDGET_MS, 45_000),
  /** default model when the client omits one */
  defaultModel: process.env.DEFAULT_MODEL ?? "gemini-3.5-flash",
  defaultTtsModel: process.env.DEFAULT_TTS_MODEL ?? "gemini-3.8-flash-tts",
  defaultEmbedModel: process.env.DEFAULT_EMBED_MODEL ?? "gemini-embedding-001",
  defaultVoice: process.env.DEFAULT_VOICE ?? "Kore",
  adminToken: process.env.ADMIN_TOKEN ?? "",
  /**
   * Scoped credential for machine ingestion (`POST /pengatur/keys` only).
   * A harvester should not hold a token that can also delete or purge keys;
   * empty means the endpoint keeps requiring ADMIN_TOKEN.
   */
  ingestToken: process.env.INGEST_TOKEN ?? "",
  /** OpenAI-compatible bearer the clients present ("" = open) */
  clientToken: process.env.CLIENT_TOKEN ?? "",
  /** inject Google Search grounding when the client asks for "search" */
  searchModel: process.env.SEARCH_MODEL ?? "gemini-3.5-flash",
  /**
   * Ordered models to try when the upstream refuses a model rather than a key
   * (404 retired, 503 high demand). The requested model always leads the
   * chain; this list supplies the rest.
   *
   * The order is measured, not guessed: on 2026-10-22 `gemini-3.5-flash`
   * answered 15/15 in 1.87 s and `gemini-3-flash-preview` in 1.85 s, while
   * `gemini-3.1-flash-lite` (503) and `gemini-3.8-flash` (503, 49-99 s) were
   * congested. A retired model must never lead this list.
   */
  modelFallback: list(process.env.MODEL_FALLBACK_MODELS, [
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
  ]),
  /** Probe chain; `PROBE_MODELS` wins over the code default. */
  probeModels: list(process.env.PROBE_MODELS, [
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
  ]),
  /**
   * Tier probe chain. A single generateContent call against a quota-gated
   * model answers 429 for both key classes, and the 429 shape is the only
   * place Google discloses the tier. Measured 2026-10-22: `gemini-2.5-flash-image`
   * answers 429 for free and paid keys; `gemini-2.0-flash-preview-image-generation`
   * answers 404 for free keys and 429 for paid ones. The default model is the
   * last resort so a probe never ends without an answer.
   */
  tierProbeModels: list(process.env.TIER_PROBE_MODELS, [
    "gemini-2.5-flash-image",
    "gemini-2.0-flash-preview-image-generation",
  ]),
  /** keys per recheck batch on /internal/keys/recheck */
  recheckBatchSize: num(process.env.RECHECK_BATCH_SIZE, 25),
  /**
   * How often the in-process timer probes what is due. A per-minute rate
   * limit is the common case, so 19 minutes clears every window with margin
   * while staying well inside a serverless function's practical lifetime.
   * 0 disables the timer (the HTTP route still works).
   */
  recheckIntervalMinutes: num(process.env.RECHECK_INTERVAL_MINUTES, 19),
  /**
   * How often public traffic may trigger a background re-check of due keys.
   * A serverless instance is frozen between requests, so the timer alone can
   * miss a rate-limit window expiring; the first request after it pays that
   * miss with a 429 unless traffic drives the probe. 0 disables the hook (the
   * timer and the HTTP route still work); tests set 0 to keep pools still.
   */
  lazyRecheckMs: num(process.env.LAZY_RECHECK_MS, 60_000),
  /** a key rejected as invalid is not re-probed more often than this */
  invalidRecheckFloorMinutes: num(process.env.INVALID_RECHECK_FLOOR_MINUTES, 1440),
  /**
   * A project with no allocation never advertises a reset, so its key would
   * otherwise be due on every tick and take every slot in the batch. This is
   * the floor between two such probes.
   */
  quotaRecheckFloorMinutes: num(process.env.QUOTA_RECHECK_FLOOR_MINUTES, 60),
  /**
   * Models the upstream has retired, filtered out of the /v1/models catalog.
   *
   * Verified on 2026-10-22 against production: `gemini-2.5-flash`,
   * `gemini-2.5-flash-lite` and `gemini-2.5-pro` answer 404 "no longer
   * available to new users" for every key. The other 2.5 ids are NOT retired
   * and must stay listed: `gemini-2.5-flash-image` and
   * `gemini-2.5-pro-preview-tts` answer 429 (quota), and the
   * `gemini-2.5-flash-native-audio-*` ids answer 400 because they serve live
   * bidirectional streaming, not generateContent.
   */
  retiredModels: list(process.env.RETIRED_MODELS, [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
  ]),

  /* ---------- storage (all optional) ---------- */

  /** Postgres connection string. Unset disables every persistence path. */
  databaseUrl: (process.env.DATABASE_URL ?? "").trim(),
  /** per-statement ceiling for one Neon HTTP query */
  dbQueryTimeoutMs: num(process.env.DB_QUERY_TIMEOUT_MS, 3000),
  /** flush the ledger batch after this long */
  ledgerFlushMs: num(process.env.LEDGER_FLUSH_MS, 2000),
  /** flush the ledger batch once it holds this many rows */
  ledgerMaxRows: num(process.env.LEDGER_MAX_ROWS, 200),
  /** rows kept for the live tail view */
  ledgerTailRows: num(process.env.LEDGER_TAIL_ROWS, 500),
  /** how long raw usage_events survive a rollup run */
  retentionDays: num(process.env.RETENTION_DAYS, 30),
  /** bearer for /internal/rollup; unset disables the route */
  rollupToken: process.env.ROLLUP_TOKEN ?? "",
  /** Vercel sends this as `Authorization: Bearer <CRON_SECRET>` on cron runs */
  cronSecret: process.env.CRON_SECRET ?? "",
};

export const VOICE_MAP: Record<string, string> = {
  alloy: "Kore",
  echo: "Puck",
  fable: "Charon",
  onyx: "Fenrir",
  nova: "Zephyr",
  shimmer: "Leda",
  ballad: "Aoede",
  coral: "Kore",
  sage: "Sulafat",
  verse: "Bright",
};