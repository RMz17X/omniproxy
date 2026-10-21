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

export const cfg = {
  /** upstream base, no trailing slash */
  upstream: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com",
  /** per-key pacing: after a successful call the key sleeps this long.
   *  4000ms == 15 RPM, the Gemini free-tier ceiling per project. */
  rateWindowMs: num(process.env.KEY_RATE_WINDOW_MS, 4000),
  /** cooldown applied on 429 / RESOURCE_EXHAUSTED */
  cooldownMs: num(process.env.KEY_COOLDOWN_MS, 60_000),
  /** cooldown applied on 5xx */
  serverErrCooldownMs: num(process.env.KEY_5XX_COOLDOWN_MS, 15_000),
  /** max key attempts per request before giving up */
  maxAttempts: num(process.env.MAX_ATTEMPTS, 6),
  /** how long to wait for a busy pool before 429-ing the client */
  maxWaitMs: num(process.env.MAX_WAIT_MS, 8_000),
  /** hard ceiling for one upstream attempt; also the client-disconnect bound */
  upstreamTimeoutMs: num(process.env.UPSTREAM_TIMEOUT_MS, 120_000),
  /** default model when the client omits one */
  defaultModel: process.env.DEFAULT_MODEL ?? "gemini-3.8-flash",
  defaultTtsModel: process.env.DEFAULT_TTS_MODEL ?? "gemini-3.8-flash-tts",
  defaultEmbedModel: process.env.DEFAULT_EMBED_MODEL ?? "gemini-embedding-001",
  defaultVoice: process.env.DEFAULT_VOICE ?? "Kore",
  adminToken: process.env.ADMIN_TOKEN ?? "",
  /** OpenAI-compatible bearer the clients present ("" = open) */
  clientToken: process.env.CLIENT_TOKEN ?? "",
  /** inject Google Search grounding when the client asks for "search" */
  searchModel: process.env.SEARCH_MODEL ?? "gemini-3.8-flash",

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