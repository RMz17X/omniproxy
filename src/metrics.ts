/**
 * Process-local counters exposed by GET /metrics.
 *
 * Deliberately dumb: increment-only integers plus a per-key health table, no
 * histograms. Nothing here may contain a raw key — `keyStat` is addressed by
 * the masked form of the key.
 */

const startedAt = Date.now();

export type Counters = {
  /** inbound requests seen by the gateway */
  requests: number;
  /** upstream fetch attempts (one per key try) */
  upstreamRequests: number;
  /** how many times a request moved on to another key */
  rotations: number;
  /** 429s observed from upstream */
  upstream429: number;
  /** keys parked (cooldown applied) */
  cooldowns: number;
  /** keys marked permanently invalid */
  invalidated: number;
  /** client-facing 429 issued by the gateway itself */
  poolExhausted: number;
  /** upstream 5xx responses */
  upstream5xx: number;
  /** fetch attempts that threw (network/DNS/TLS) */
  networkErrors: number;
  /** client disconnects that aborted an upstream fetch */
  clientAborts: number;
  /** requests served while the Postgres breaker was open */
  dbDegraded: number;
  /** OpenAI embeddings requests */
  embeddings: number;
  /** Gemini functionCall parts translated to OpenAI tool_calls */
  toolCalls: number;
};

export const counters: Counters = {
  requests: 0,
  upstreamRequests: 0,
  rotations: 0,
  upstream429: 0,
  cooldowns: 0,
  invalidated: 0,
  poolExhausted: 0,
  upstream5xx: 0,
  networkErrors: 0,
  clientAborts: 0,
  dbDegraded: 0,
  embeddings: 0,
  toolCalls: 0,
};

export type KeyStat = {
  /** how many upstream attempts used this key */
  used: number;
  /** how many times this key was parked on cooldown */
  cooldowns: number;
  /** how many times this key was retired as invalid */
  invalidations: number;
};

const keyStats = new Map<string, KeyStat>();

/** `masked` MUST already be the masked key — never the raw one. */
export function keyStat(masked: string): KeyStat {
  let s = keyStats.get(masked);
  if (!s) {
    s = { used: 0, cooldowns: 0, invalidations: 0 };
    keyStats.set(masked, s);
  }
  return s;
}

/** Merge the health store into the usage table for /metrics. */
export function keyStatsList(
  store: {
    key: string;
    failures: number;
    invalidations: number;
    invalid: boolean;
    cooldownUntil: number;
    lastUsed: number;
  }[],
): ({ key: string } & KeyStat & { failures: number; invalid: boolean; cooldownLeftMs: number; lastUsed: number })[] {
  for (const s of store) {
    const st = keyStat(s.key);
    st.cooldowns = Math.max(st.cooldowns, s.invalidations);
  }
  const t = Date.now();
  return store.map((s) => ({
    key: s.key,
    ...keyStat(s.key),
    failures: s.failures,
    invalid: s.invalid,
    cooldownLeftMs: Math.max(0, s.cooldownUntil - t),
    lastUsed: s.lastUsed,
  }));
}

export const uptimeMs = () => Date.now() - startedAt;
