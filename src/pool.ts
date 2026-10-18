/**
 * Key pool: health tracking, selection, cooldown.
 *
 * Backed by Upstash Redis REST when configured (multi-instance safe), with a
 * per-instance memory mirror fronting it:
 *
 *   readThrough()   one pipelined HTTP request for the whole pool
 *   markX()         one pipelined HTTP request per state change
 *   Redis down      the mirror keeps serving; the request is never 500'd
 *
 * A key record is a compact string in Redis:
 *   f=<failures>;u=<invalid 0|1>;c=<cooldownUntilEpochMs>;l=<lastUsedEpochMs>;v=<invalidations>
 *
 * The mirror is authoritative for *selection* (so a pick never needs a
 * round trip to read state it just wrote) and is reconciled with Redis on
 * every successful refresh, conservatively: the stricter of the two views
 * wins, so an outage can never resurrect a parked key early.
 */

import { createHash } from "node:crypto";
import { log } from "./log.ts";
import { counters } from "./metrics.ts";

const KV_URL = (process.env.UPSTASH_REDIS_REST_URL ?? "").replace(/\/+$/, "");
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const USE_KV = Boolean(KV_URL && KV_TOKEN);

const IDX_KEY = "gkr:idx";
const DEAD_KEY = "gkr:idx:dead";
const KEY_PREFIX = "gkr:k:";

/** How long a refreshed pool view is reused before hitting Redis again. */
export const CACHE_TTL_MS = Number(process.env.POOL_CACHE_TTL_MS ?? 250);
/** How long to stop calling Redis after repeated failures. */
const BREAKER_MS = Number(process.env.REDIS_BREAKER_MS ?? 30_000);
/** Failure streak that trips the breaker. */
const BREAKER_TRIP_AT = 2;

export type KeyState = {
  key: string;
  failures: number;
  /** permanence marker: the key was rejected as invalid by upstream */
  invalid: boolean;
  /** incremented every time a cooldown is applied (metric + persistence) */
  invalidations: number;
  cooldownUntil: number;
  lastUsed: number;
};

/* ---------- memory mirror ---------- */

const local = new Map<string, KeyState>();

const now = () => Date.now();

/**
 * Credential-safe display form. Every log line, metric label and admin
 * response addresses a key through this; the raw value never leaves the pool.
 */
export function maskKey(k: string): string {
  if (k.length <= 4) return "*".repeat(k.length);
  if (k.length <= 12) return `${k.slice(0, 2)}…${k.slice(-2)}`;
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

/**
 * Stable short identifier for a key, safe to expose in the admin UI: the
 * masked form is ambiguous between keys that share a prefix and suffix, so
 * destructive actions address a key by hash instead of by plaintext.
 */
export function keyId(k: string): string {
  return createHash("sha256").update(k).digest("hex").slice(0, 12);
}

const encode = (s: KeyState) =>
  `f=${s.failures};u=${s.invalid ? 1 : 0};c=${s.cooldownUntil};l=${s.lastUsed};v=${s.invalidations}`;

const decode = (key: string, raw: string | null): KeyState => {
  const out: KeyState = {
    key,
    failures: 0,
    invalid: false,
    invalidations: 0,
    cooldownUntil: 0,
    lastUsed: 0,
  };
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (k === "f") out.failures = Number(v) || 0;
    else if (k === "u") out.invalid = v === "1";
    else if (k === "c") out.cooldownUntil = Number(v) || 0;
    else if (k === "l") out.lastUsed = Number(v) || 0;
    else if (k === "v") out.invalidations = Number(v) || 0;
  }
  return out;
};


function mergeInto(key: string, fromRedis: KeyState | null): KeyState {
  const cur = local.get(key);
  if (!cur) {
    const fresh = fromRedis ?? decode(key, null);
    local.set(key, fresh);
    return fresh;
  }
  if (!fromRedis) return cur;
  cur.failures = Math.max(cur.failures, fromRedis.failures);
  cur.invalid = cur.invalid || fromRedis.invalid;
  cur.invalidations = Math.max(cur.invalidations, fromRedis.invalidations);
  cur.cooldownUntil = Math.max(cur.cooldownUntil, fromRedis.cooldownUntil);
  cur.lastUsed = Math.max(cur.lastUsed, fromRedis.lastUsed);
  return cur;
}

/* ---------- Upstash REST ---------- */

/**
 * One HTTP request executes every command in order (Upstash REST `/pipeline`).
 * A pipeline that contains a failing command still returns per-command results,
 * so an error in one entry does not hide the rest.
 */
async function kvPipeline(commands: unknown[][]): Promise<unknown[]> {
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(3_000),
  });
  if (!res.ok) throw new Error(`kv ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result?: unknown; error?: string }[] | { error?: string };
  if (!Array.isArray(json)) throw new Error(`kv: ${json.error ?? "malformed response"}`);
  return json.map((entry) => {
    if (entry?.error) throw new Error(`kv: ${entry.error}`);
    return entry?.result ?? null;
  });
}

/* ---------- circuit breaker ---------- */

let breakerOpenUntil = 0;
let failStreak = 0;

export const redisDegraded = () => USE_KV && breakerOpenUntil > now();

function kvOk(): void {
  failStreak = 0;
  if (breakerOpenUntil > 0) {
    log("info", "redis.recovered", {});
    breakerOpenUntil = 0;
  }
}

function kvFailed(err: unknown): void {
  failStreak++;
  if (failStreak >= BREAKER_TRIP_AT && breakerOpenUntil <= now()) {
    breakerOpenUntil = now() + BREAKER_MS;
    log("warn", "redis.degraded", {
      breakerMs: BREAKER_MS,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/* ---------- read path ---------- */

let cacheAt = 0;
/** Keys the last successful refresh saw; drives the MGET fast path. */
let cachedIndex: string[] = [];
let cachedFallback = false;

/**
 * Refresh the pool from Redis into the mirror.
 *
 * Steady state is a single pipelined request: `[SMEMBERS, MGET …]`. When the
 * index is unknown or changed, a second request fetches exactly the new keys,
 * so the read path is never more than two round trips.
 */
async function refresh(knowsIndex: boolean): Promise<void> {
  const index = (
    (await kvPipeline(
      knowsIndex ? [["SMEMBERS", IDX_KEY], ["MGET", ...cachedIndex.map((k) => KEY_PREFIX + k)]] : [["SMEMBERS", IDX_KEY]],
    )) as [string[] | null, (string | null)[]?]
  );
  const members = index[0] ?? [];
  const values = index[1];

  let fetched: (string | null)[] | null = null;
  if (values && members.length === cachedIndex.length && members.every((k, i) => k === cachedIndex[i])) {
    fetched = values;
  } else if (members.length > 0) {
    // kvPipeline always returns one entry per command, so a single MGET is
    // unwrapped here — without [0] the decoder receives an array of values
    // instead of one value per key.
    const [vals] = await kvPipeline([["MGET", ...members.map((k) => KEY_PREFIX + k)]]);
    fetched = (vals as (string | null)[] | null) ?? null;
  }

  const seen = new Set(members);
  for (const [key] of local) if (!seen.has(key)) local.delete(key);
  members.forEach((key, i) => mergeInto(key, decode(key, fetched?.[i] ?? null)));
  cachedIndex = members;
  cacheAt = now();
  cachedFallback = false;
}

/** Pool view for selection: mirror, refreshed from Redis when allowed. */
async function states(): Promise<KeyState[]> {
  if (!USE_KV) return [...local.values()];
  if (breakerOpenUntil > now()) return [...local.values()];
  if (cacheAt > 0 && now() - cacheAt < CACHE_TTL_MS) return [...local.values()];
  try {
    await refresh(cacheAt > 0 && cachedIndex.length > 0);
    kvOk();
  } catch (err) {
    kvFailed(err);
    if (!cachedFallback) {
      cachedFallback = true;
      counters.redisDegraded++;
      log("warn", "redis.read_failed", {
        servedFrom: "memory-mirror",
        keys: local.size,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return [...local.values()];
}

/** Best-effort persistence; a Redis outage must never fail the caller. */
async function persist(st: KeyState, extra: unknown[][] = []): Promise<boolean> {
  local.set(st.key, st);
  if (!USE_KV) return true;
  try {
    await kvPipeline([["SET", KEY_PREFIX + st.key, encode(st)], ...extra]);
    kvOk();
    return true;
  } catch (err) {
    kvFailed(err);
    return false;
  }
}

/* ---------- pool management ---------- */

export async function addKey(key: string): Promise<boolean> {
  const k = key.trim();
  if (!k) return false;
  const cur = local.get(k);
  if (cur && !cur.invalid) return false;
  const st = decode(k, null);
  local.set(k, st);
  if (!USE_KV) return true;
  try {
    await kvPipeline([
      ["SET", KEY_PREFIX + k, encode(st)],
      ["SADD", IDX_KEY, k],
      ["SREM", DEAD_KEY, k],
    ]);
    kvOk();
    cacheAt = 0;
    return true;
  } catch (err) {
    kvFailed(err);
    return true;
  }
}

export async function removeKey(key: string): Promise<boolean> {
  const k = key.trim();
  const had = local.delete(k);
  if (!USE_KV) return had;
  try {
    await kvPipeline([
      ["DEL", KEY_PREFIX + k],
      ["SREM", IDX_KEY, k],
      ["SREM", DEAD_KEY, k],
    ]);
    kvOk();
    cacheAt = 0;
    return had;
  } catch (err) {
    kvFailed(err);
    return had;
  }
}

/**
 * Resolve a key id (see `keyId`) against the live pool and remove it.
 * The raw key never crosses the admin API boundary, so the id is the only
 * handle a browser can hold.
 */
export async function removeKeyById(id: string): Promise<boolean> {
  const all = await states();
  const hit = all.find((s) => keyId(s.key) === id);
  if (!hit) return false;
  return removeKey(hit.key);
}

/** Raw key for an id, resolved server-side only. Never returned to a client. */
export async function rawKeyById(id: string): Promise<string | null> {
  const all = await states();
  const hit = all.find((s) => keyId(s.key) === id);
  return hit ? hit.key : null;
}

/**
 * A successful probe clears the parked state: the key demonstrably serves, so
 * keeping it cooling would only waste supply. Failures are reset because the
 * old count described a different (dead) window of the key's life.
 */
export async function markHealthy(key: string): Promise<void> {
  const st = local.get(key) ?? decode(key, null);
  st.invalid = false;
  st.failures = 0;
  st.cooldownUntil = 0;
  st.lastUsed = now();
  await persist(st, [["SREM", DEAD_KEY, key]]);
}

export type KeyView = {
  id: string;
  key: string;
  failures: number;
  invalidations: number;
  cooldownLeftMs: number;
  lastUsed: number;
  invalid: boolean;
  status: "ready" | "cooling" | "dead";
  /** epoch ms when the key becomes selectable again, 0 when it already is */
  cooldownUntil: number;
};

/** Admin view: masked key plus the id used for mutation. */
export async function listKeys(): Promise<KeyView[]> {
  const all = await states();
  const t = now();
  return all.map((s) => ({
    id: keyId(s.key),
    key: maskKey(s.key),
    failures: s.failures,
    invalidations: s.invalidations,
    cooldownLeftMs: Math.max(0, s.cooldownUntil - t),
    lastUsed: s.lastUsed,
    invalid: s.invalid,
    status: s.invalid ? "dead" : s.cooldownUntil > t ? "cooling" : "ready",
    cooldownUntil: s.cooldownUntil,
  }));
}

export type PoolSnapshot = {
  total: number;
  ready: number;
  cooling: number;
  dead: number;
  soonestReadyMs: number;
  storage: "memory" | "upstash-redis";
  degraded: boolean;
};

export async function snapshot(): Promise<PoolSnapshot> {
  const all = await states();
  const t = now();
  let ready = 0;
  let cooling = 0;
  let dead = 0;
  let soonest = Infinity;
  for (const s of all) {
    if (s.invalid) dead++;
    else if (s.cooldownUntil > t) {
      cooling++;
      soonest = Math.min(soonest, s.cooldownUntil - t);
    } else ready++;
  }
  return {
    total: all.length,
    ready,
    cooling,
    dead,
    soonestReadyMs: Number.isFinite(soonest) ? soonest : 0,
    storage: storageMode,
    degraded: redisDegraded(),
  };
}

/** Mirror view for /metrics: masked keys plus health and usage counters. */
export function keySnapshots(): {
  key: string;
  failures: number;
  invalidations: number;
  invalid: boolean;
  cooldownUntil: number;
  lastUsed: number;
}[] {
  return [...local.values()].map((s) => ({
    key: maskKey(s.key),
    failures: s.failures,
    invalidations: s.invalidations,
    invalid: s.invalid,
    cooldownUntil: s.cooldownUntil,
    lastUsed: s.lastUsed,
  }));
}

/* ---------- selection ---------- */

/**
 * Pick the healthiest key: lowest failure count, then least-recently-used.
 * Restricting to ready keys makes pacing implicit — a key that just served
 * a request has lastUsed=now and loses every LRU comparison until its rate
 * window elapses, at which point it becomes the freshest candidate.
 */
export async function pick(exclude: Set<string> = new Set()): Promise<KeyState | null> {
  const all = (await states()).filter((s) => !s.invalid && !exclude.has(s.key));
  const t = now();
  const ready = all.filter((s) => s.cooldownUntil <= t);
  if (ready.length === 0) return null;
  ready.sort((a, b) => a.failures - b.failures || a.lastUsed - b.lastUsed);
  return ready[0];
}

export async function markUsed(key: string): Promise<void> {
  const st = local.get(key);
  if (!st) return;
  st.lastUsed = now();
  await persist(st);
}

export async function mark429(key: string, cooldownMs: number): Promise<void> {
  const st = local.get(key) ?? decode(key, null);
  st.failures += 1;
  st.invalidations += 1;
  st.cooldownUntil = now() + cooldownMs;
  counters.cooldowns++;
  await persist(st);
}

export async function markSoftError(key: string, cooldownMs: number): Promise<void> {
  const st = local.get(key) ?? decode(key, null);
  st.failures += 1;
  st.cooldownUntil = now() + cooldownMs;
  await persist(st);
}

/**
 * Permanently retire a key. `SADD gkr:idx:dead` doubles as the conditional
 * claim: it returns 0 when another instance already retired this key, so only
 * the first writer logs the death.
 */
export async function markInvalid(key: string): Promise<boolean> {
  const st = local.get(key) ?? decode(key, null);
  st.invalid = true;
  st.invalidations += 1;
  st.failures = 999;
  st.cooldownUntil = Number.MAX_SAFE_INTEGER;
  counters.invalidated++;
  if (!USE_KV) {
    local.set(key, st);
    return true;
  }
  local.set(key, st);
  try {
    const [, claimed] = await kvPipeline([
      ["SET", KEY_PREFIX + key, encode(st)],
      ["SADD", DEAD_KEY, key],
    ]);
    kvOk();
    return claimed === 1;
  } catch (err) {
    kvFailed(err);
    return true;
  }
}

export async function deadKeys(): Promise<string[]> {
  if (!USE_KV) return [...local.values()].filter((s) => s.invalid).map((s) => maskKey(s.key));
  if (breakerOpenUntil > now()) return [];
  try {
    const [members] = (await kvPipeline([["SMEMBERS", DEAD_KEY]])) as [string[] | null];
    kvOk();
    return (members ?? []).map(maskKey);
  } catch (err) {
    kvFailed(err);
    return [];
  }
}

export const storageMode: "memory" | "upstash-redis" = USE_KV ? "upstash-redis" : "memory";
