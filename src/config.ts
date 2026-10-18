/** Runtime configuration, all overridable by env. */

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
  /** how many ready keys to sample when picking */
  pickSample: num(process.env.PICK_SAMPLE, 5),
  /** how long to wait for a busy pool before 429-ing the client */
  maxWaitMs: num(process.env.MAX_WAIT_MS, 8_000),
  /** default model when the client omits one */
  defaultModel: process.env.DEFAULT_MODEL ?? "gemini-2.5-flash",
  defaultTtsModel: process.env.DEFAULT_TTS_MODEL ?? "gemini-2.5-flash-preview-tts",
  defaultVoice: process.env.DEFAULT_VOICE ?? "Kore",
  adminToken: process.env.ADMIN_TOKEN ?? "",
  /** OpenAI-compatible bearer the clients present ("" = open) */
  clientToken: process.env.CLIENT_TOKEN ?? "",
  /** inject Google Search grounding when the client asks for "search" */
  searchModel: process.env.SEARCH_MODEL ?? "gemini-2.5-flash",
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