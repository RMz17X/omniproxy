/**
 * Key pool: health tracking, selection, cooldown.
 *
 * The pool is a per-instance memory mirror. Postgres (optional) supplies the
 * durable identity of each key — plan, enable flag, fail count — and receives
 * fire-and-forget updates. It is never on the request critical path: one load
 * at cold start, async writes afterwards.
 *
 *   hydrate()     cold start: seed from GEMINI_API_KEYS, overlay repo metadata
 *   pick()        selection from memory only, no I/O
 *   markX()       mutate memory immediately, persist in the background
 *
 * With DATABASE_URL unset the pool behaves exactly as it did before Postgres:
 * keys come from the environment, all state is process-local.
 */

import { createHash } from "node:crypto";
import { log } from "./log.ts";
import { counters } from "./metrics.ts";
import { dbEnabled } from "./db.ts";
import * as repo from "./keys-repo.ts";
import { loadMaterial, materialEnabled, saveMaterial, deleteMaterial } from "./key-material.ts";

/** Where durable key metadata lives. */
export const storageMode: "memory" | "postgres" = dbEnabled() ? "postgres" : "memory";

/**
 * Billing tier attached to a key by the operator. Google does not expose which
 * plan a project is on, and the answer changes what a 429 means (free tier
 * quota vs paid quota), so the pool stores the operator's declaration instead
 * of guessing. `unknown` is the safe default: no pricing claims are made.
 */
export type KeyTier = "unknown" | "free" | "paid" | "pro";

export const KEY_TIERS: KeyTier[] = ["unknown", "free", "paid", "pro"];

export type KeyState = {
  key: string;
  tier: KeyTier;
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

const now = (): number => Date.now();

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

const blank = (key: string): KeyState => ({
  key,
  tier: "unknown",
  failures: 0,
  invalid: false,
  invalidations: 0,
  cooldownUntil: 0,
  lastUsed: 0,
});

/* ---------- persistence (fire-and-forget) ---------- */

/**
 * Run a durable write off the request path. `db.ts` already turns failures
 * into typed results; this wrapper only guarantees the caller never awaits it.
 */
function later(fn: () => Promise<void>): void {
  if (!dbEnabled()) return;
  queueMicrotask(() => {
    void fn().catch((err: unknown) => {
      log("warn", "pool.persist_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });
}

/** Push the identity half of a key record to the repository. */
function persistIdentity(st: KeyState): void {
  const id = keyId(st.key);
  const masked = maskKey(st.key);
  const plan = st.tier;
  later(() => repo.upsertKey({ id, masked, plan }));
}

function persistHealth(st: KeyState): void {
  const id = keyId(st.key);
  if (st.invalid) {
    later(() => repo.setEnabled(id, false));
    return;
  }
  later(() => repo.touchLastSeen(id));
  if (st.failures > 0) later(() => repo.bumpFailCount(id));
  // Serverless scales to zero; a 429 park held only in memory is erased on the
  // next cold start and the key gets re-fired immediately. Persist the deadline
  // (or its clearing) so `hydrate()` can restore the park.
  later(() => repo.setCooldown(id, st.cooldownUntil));
}

/* ---------- cold start ---------- */

/** Insert one key into the mirror when absent; never disturbs live state. */
function seed(key: string): void {
  if (!local.has(key)) local.set(key, blank(key));
}

/**
 * Fill the mirror, in priority order:
 *
 *   1. `GEMINI_API_KEYS` — the deployment's own supply
 *   2. `key_material`    — keys added through the console or by the hunter
 *   3. `keys`            — identity overlay (plan, enable flag, fail count)
 *
 * Step 2 is what makes a key survive a cold start; step 3 never introduces a
 * key, it only decorates ones already present. A missing table is not fatal:
 * `loadMaterial()` swallows the failure and returns an empty map.
 */
export async function hydrate(): Promise<number> {
  const env = (process.env.GEMINI_API_KEYS ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const k of env) seed(k);

  if (!dbEnabled()) {
    log("info", "pool.hydrated", { source: "env", keys: local.size, material: 0 });
    return local.size;
  }

  let material = 0;
  if (materialEnabled()) {
    for (const raw of (await loadMaterial()).values()) {
      seed(raw);
      material++;
    }
  }

  const rows = await repo.loadKeys();
  const byId = new Map([...local.values()].map((s) => [keyId(s.key), s]));
  for (const row of rows) {
    const hit = byId.get(row.id);
    if (!hit) continue;
    hit.tier = row.plan;
    hit.failures = Math.max(hit.failures, row.failCount);
    if (!row.enabled) {
      hit.invalid = true;
      hit.cooldownUntil = Number.MAX_SAFE_INTEGER;
    } else if (row.cooldownUntil > now()) {
      // Restore a persisted park. `max` keeps a live in-memory deadline that is
      // already further out (the same instance served the 429).
      hit.cooldownUntil = Math.max(hit.cooldownUntil, row.cooldownUntil);
    }
  }
  log("info", "pool.hydrated", {
    source: "postgres+env",
    keys: local.size,
    rows: rows.length,
    material,
  });
  return local.size;
}

/** True when key material outlives the process. Consoles report this. */
export function keyMaterialDurable(): boolean {
  return materialEnabled();
}

/* ---------- pool management ---------- */

export async function addKey(key: string): Promise<boolean> {
  const k = key.trim();
  if (!k) return false;
  const cur = local.get(k);
  if (cur && !cur.invalid) return false;
  const st = blank(k);
  local.set(k, st);
  persistIdentity(st);
  saveMaterial(keyId(k), k);
  return true;
}

export async function removeKey(key: string): Promise<boolean> {
  const k = key.trim();
  const had = local.delete(k);
  if (had) {
    const id = keyId(k);
    later(() => repo.deleteKey(id));
    deleteMaterial(id);
  }
  return had;
}

/**
 * Resolve a key id (see `keyId`) against the live pool and remove it.
 * The raw key never crosses the admin API boundary, so the id is the only
 * handle a browser can hold.
 */
export async function removeKeyById(id: string): Promise<boolean> {
  const hit = [...local.values()].find((s) => keyId(s.key) === id);
  if (!hit) return false;
  return removeKey(hit.key);
}

/**
 * Declare the billing plan behind a key. Pricing on /pengatur/models is
 * computed against this, and the key table shows it, so the operator can tell a
 * free-tier 429 apart from a paid-quota 429 without leaving the console.
 */
export async function setKeyTier(key: string, tier: KeyTier): Promise<boolean> {
  const st = local.get(key);
  if (!st) return false;
  st.tier = tier;
  const id = keyId(key);
  later(() => repo.setPlan(id, tier));
  return true;
}

/** Same as setKeyTier but addressed by the admin id, never by raw key. */
export async function setTierById(id: string, tier: KeyTier): Promise<boolean> {
  const raw = await rawKeyById(id);
  if (!raw) return false;
  return setKeyTier(raw, tier);
}

/** Raw key for an id, resolved server-side only. Never returned to a client. */
export async function rawKeyById(id: string): Promise<string | null> {
  const hit = [...local.values()].find((s) => keyId(s.key) === id);
  return hit ? hit.key : null;
}

/* ---------- selection ---------- */

/**
 * Pick the healthiest key: lowest failure count, then least-recently-used.
 * Restricting to ready keys makes pacing implicit — a key that just served
 * a request has lastUsed=now and loses every LRU comparison until its rate
 * window elapses, at which point it becomes the freshest candidate.
 */
export async function pick(exclude: Set<string> = new Set()): Promise<KeyState | null> {
  const all = [...local.values()].filter((s) => !s.invalid && !exclude.has(s.key));
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
  persistHealth(st);
}

/**
 * 429 / RESOURCE_EXHAUSTED. A throttled key is a *valid* credential, so this
 * also clears a previous retirement: if the upstream answered with a quota
 * verdict for this key, the key is alive and only owes the pool a cooldown.
 */
export async function mark429(key: string, cooldownMs: number): Promise<void> {
  const st = local.get(key) ?? blank(key);
  st.failures += 1;
  st.invalidations += 1;
  st.cooldownUntil = now() + cooldownMs;
  st.invalid = false;
  counters.cooldowns++;
  local.set(key, st);
  persistHealth(st);
}

/** 5xx / transport hiccup: park briefly, never retire. */
export async function markSoftError(key: string, cooldownMs: number): Promise<void> {
  const st = local.get(key) ?? blank(key);
  st.failures += 1;
  st.cooldownUntil = now() + cooldownMs;
  local.set(key, st);
  persistHealth(st);
}

/** Permanently retire a key: memory takes the verdict, Postgres follows. */
export async function markInvalid(key: string): Promise<boolean> {
  const st = local.get(key) ?? blank(key);
  st.invalid = true;
  st.invalidations += 1;
  st.failures = 999;
  st.cooldownUntil = Number.MAX_SAFE_INTEGER;
  counters.invalidated++;
  local.set(key, st);
  persistHealth(st);
  return true;
}

/**
 * A successful probe clears the parked state: the key demonstrably serves, so
 * keeping it cooling would only waste supply. Failures are reset because the
 * old count described a different (dead) window of the key's life.
 */
export async function markHealthy(key: string): Promise<void> {
  const st = local.get(key) ?? blank(key);
  st.invalid = false;
  st.failures = 0;
  st.cooldownUntil = 0;
  st.lastUsed = now();
  local.set(key, st);
  const id = keyId(key);
  later(() => repo.setEnabled(id, true));
  later(() => repo.touchLastSeen(id));
  // A cleared park must reach Postgres too, or the next cold start revives a
  // deadline that this successful probe already proved obsolete.
  later(() => repo.setCooldown(id, 0));
}

export async function deadKeys(): Promise<string[]> {
  return [...local.values()].filter((s) => s.invalid).map((s) => maskKey(s.key));
}

/* ---------- read side ---------- */

export type KeyView = {
  id: string;
  key: string;
  tier: KeyTier;
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
  const t = now();
  return [...local.values()]
    .map((s) => ({
      id: keyId(s.key),
      key: maskKey(s.key),
      tier: s.tier,
      failures: s.failures,
      invalidations: s.invalidations,
      cooldownLeftMs: Math.max(0, s.cooldownUntil - t),
      lastUsed: s.lastUsed,
      invalid: s.invalid,
      status: s.invalid ? ("dead" as const) : s.cooldownUntil > t ? ("cooling" as const) : ("ready" as const),
      cooldownUntil: s.cooldownUntil,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Tier census for the console strip: how many keys of each declared plan. */
export function tierCounts(list: KeyView[]): Record<KeyTier, number> {
  const out: Record<KeyTier, number> = { unknown: 0, free: 0, paid: 0, pro: 0 };
  for (const k of list) out[k.tier] = (out[k.tier] ?? 0) + 1;
  return out;
}

/** Mirror view for /metrics: masked keys plus health counters. */
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

export type PoolSnapshot = {
  total: number;
  ready: number;
  cooling: number;
  dead: number;
  soonestReadyMs: number;
  storage: "memory" | "postgres";
  degraded: boolean;
};

export async function snapshot(): Promise<PoolSnapshot> {
  const all = [...local.values()];
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
    degraded: counters.dbDegraded > 0,
  };
}