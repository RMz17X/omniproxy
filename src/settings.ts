/**
 * Effective configuration view for the operator console.
 *
 * Two hard rules:
 *   1. Nothing here is read from `process.env` by spread. The object is built
 *      from an explicit allowlist, so a newly added secret can never leak by
 *      accident.
 *   2. Token values are reported as `set` or `unset` only. The connection
 *      string is reduced to the region host suffix, which is not a secret and
 *      is the only part an operator needs to confirm which database is live.
 *
 * The page is read-only on purpose: cooldowns and tokens are deploy-time
 * values on the host, so the UI must not pretend it can rotate them.
 */

import { cfg } from "./config.ts";

/** One expected env name and whether the process sees it. */
export type EnvFlag = { name: string; state: "set" | "unset" };

/** Everything the settings page and the export render. */
export type SettingsView = {
  ok: true;
  defaults: {
    model: string;
    ttsModel: string;
    embedModel: string;
    voice: string;
    searchModel: string;
  };
  limits: {
    keyCooldownMs: number;
    serverErrCooldownMs: number;
    rateWindowMs: number;
    maxAttempts: number;
    maxWaitMs: number;
    upstreamTimeoutMs: number;
  };
  ledger: {
    flushMs: number;
    maxRows: number;
    tailRows: number;
    retentionDays: number;
    queryTimeoutMs: number;
  };
  storage: {
    /** "hosted" when DATABASE_URL is set, "memory" otherwise. */
    mode: "hosted" | "memory";
    /** Region host suffix, e.g. "ap-southeast-1.aws.neon.tech". */
    regionHostSuffix: string;
  };
  env: EnvFlag[];
  /** One line the page prints verbatim; the export carries it too. */
  note: string;
};

/**
 * Tokens are the only names whose *value* must never be observable, so they
 * are listed separately and reduced to a boolean before anything is returned.
 *
 * `WHATSTOKEN_API_KEYS` is the pattern for every provider: `<ID>_API_KEYS`
 * seeds that provider's pool at hydrate(), so a custom provider registered
 * through the console is seeded the same way.
 */
const TOKEN_ENVS = ["ADMIN_TOKEN", "CLIENT_TOKEN", "ROLLUP_TOKEN", "GEMINI_API_KEYS", "WHATSTOKEN_API_KEYS"] as const;

/** Non-secret knobs an operator may want to confirm are present. */
const FLAG_ENVS = [
  "DATABASE_URL",
  "DEFAULT_MODEL",
  "DEFAULT_TTS_MODEL",
  "DEFAULT_EMBED_MODEL",
  "DEFAULT_VOICE",
  "SEARCH_MODEL",
  "GEMINI_BASE_URL",
  "KEY_COOLDOWN_MS",
  "KEY_5XX_COOLDOWN_MS",
  "KEY_RATE_WINDOW_MS",
  "MAX_ATTEMPTS",
  "MAX_WAIT_MS",
  "UPSTREAM_TIMEOUT_MS",
  "DB_QUERY_TIMEOUT_MS",
  "LEDGER_FLUSH_MS",
  "LEDGER_MAX_ROWS",
  "LEDGER_TAIL_ROWS",
  "RETENTION_DAYS",
  "PORT",
  "LOG_LEVEL",
] as const;

const NOTES =
  "Cooldown values and tokens are deploy-time settings: change them in the host environment, then redeploy. This page is read-only.";

/**
 * Reduce a Postgres URI to its region host suffix.
 *
 * `postgresql://user:pw@ep-cool-name-123-pooler.ap-southeast-1.aws.neon.tech/db`
 * becomes `ap-southeast-1.aws.neon.tech`: the first label is the endpoint id
 * (instance identity, not useful here) and everything after it is the region
 * and provider. Anything that does not parse is reported as "unknown" rather
 * than echoed back, because a malformed DSN may still contain credentials.
 */
export function regionHostSuffix(dsn: string): string {
  const at = dsn.indexOf("@");
  if (at < 0) return "unknown";
  const hostAndRest = dsn.slice(at + 1);
  const host = hostAndRest.split(/[/?#]/)[0].toLowerCase();
  if (!host) return "unknown";
  const labels = host.split(":").join(".").split(".").filter((l) => l !== "");
  // Keep only DNS-safe characters; a sanitised suffix cannot carry a secret.
  const safe = labels.filter((l) => /^[a-z0-9-]+$/.test(l));
  if (safe.length < 2) return "unknown";
  return safe.slice(1).join(".");
}

/** Build the effective configuration. Pure except for `process.env` reads. */
export function settingsView(): SettingsView {
  const flags: EnvFlag[] = [...TOKEN_ENVS, ...FLAG_ENVS].map((name) => {
    const raw = process.env[name];
    return { name, state: raw && raw.trim() !== "" ? "set" : "unset" };
  });

  const hosted = cfg.databaseUrl !== "";
  return {
    ok: true,
    defaults: {
      model: cfg.defaultModel,
      ttsModel: cfg.defaultTtsModel,
      embedModel: cfg.defaultEmbedModel,
      voice: cfg.defaultVoice,
      searchModel: cfg.searchModel,
    },
    limits: {
      keyCooldownMs: cfg.cooldownMs,
      serverErrCooldownMs: cfg.serverErrCooldownMs,
      rateWindowMs: cfg.rateWindowMs,
      maxAttempts: cfg.maxAttempts,
      maxWaitMs: cfg.maxWaitMs,
      upstreamTimeoutMs: cfg.upstreamTimeoutMs,
    },
    ledger: {
      flushMs: cfg.ledgerFlushMs,
      maxRows: cfg.ledgerMaxRows,
      tailRows: cfg.ledgerTailRows,
      retentionDays: cfg.retentionDays,
      queryTimeoutMs: cfg.dbQueryTimeoutMs,
    },
    storage: {
      mode: hosted ? "hosted" : "memory",
      regionHostSuffix: hosted ? regionHostSuffix(cfg.databaseUrl) : "none",
    },
    env: flags,
    note: NOTES,
  };
}