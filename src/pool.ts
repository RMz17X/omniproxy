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
import type { QuotaDetail, TierEvidence } from "./verdict.ts";

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

/**
 * Where a key stands right now.
 *
 *   unknown          seeded, never observed
 *   ready            served, or nothing has contradicted it
 *   cooling          a transient limit with a reset in the future
 *   quota_exhausted  the project holds no allowance for the metric; the key
 *                    stays enabled because only the owner can change it
 *   dead             upstream rejected the credential itself
 *   unverified       admitted but not yet proven to serve
 */
export type KeyStatus =
  | "unknown"
  | "ready"
  | "cooling"
  | "quota_exhausted"
  | "dead"
  | "unverified";

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
  status: KeyStatus;
  /** the stored tier came from an upstream answer, not an operator guess */
  planValidated: boolean;
  planEvidence: TierEvidence | null;
  quota: QuotaDetail | null;
  /** epoch ms when a quota/park deadline passes; 0 when none is known */
  retryAfterAt: number;
  lastCheckedAt: number;
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
  // A fresh key carries no disqualifying verdict yet: it serves until an
  // upstream answer says otherwise. `unverified` is set explicitly on admission.
  status: "ready",
  planValidated: false,
  planEvidence: null,
  quota: null,
  retryAfterAt: 0,
  lastCheckedAt: 0,
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
  if (st.invalid || st.status === "dead") {
    later(() => repo.setEnabled(id, false));
    later(() => repo.setStatus(id, "dead"));
    return;
  }
  later(() => repo.touchLastSeen(id));
  if (st.failures > 0) later(() => repo.bumpFailCount(id));
  later(() => repo.setStatus(id, st.status));
  // Serverless scales to zero; a park held only in memory is erased on the
  // next cold start and the key gets re-fired immediately. Persist the
  // deadline (or its clearing) so `hydrate()` can restore the park.
  later(() => repo.setCooldown(id, st.cooldownUntil));
  if (st.retryAfterAt > 0) later(() => repo.setRetryAfter(id, st.retryAfterAt));
  if (st.quota) later(() => repo.setQuotaState(id, st.quota));
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
    if (row.planValidated) {
      hit.planValidated = true;
      hit.planEvidence = row.planEvidence;
    }
    if (row.quota) hit.quota = row.quota;
    if (row.retryAfterAt > 0) hit.retryAfterAt = row.retryAfterAt;
    if (row.lastCheckedAt > 0) hit.lastCheckedAt = row.lastCheckedAt;
    if (!row.enabled || row.status === "dead") {
      hit.invalid = true;
      hit.status = "dead";
      hit.cooldownUntil = Number.MAX_SAFE_INTEGER;
    } else {
      // A persisted park outlives the process; `max` keeps a live in-memory
      // deadline that is already further out (the same instance served it).
      hit.status = row.status;
      if (row.cooldownUntil > now()) hit.cooldownUntil = Math.max(hit.cooldownUntil, row.cooldownUntil);
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
/**
 * A key may serve when nothing currently disqualifies it: not dead, not still
 * unproven, and past every known deadline.
 */
function selectable(s: KeyState, t: number): boolean {
  if (s.invalid || s.status === "dead" || s.status === "unverified") return false;
  // An exhausted project has no window that a cooldown could wait out: it
  // re-enters rotation only when a reset is known and has passed.
  if (s.status === "quota_exhausted") return s.retryAfterAt > 0 && s.retryAfterAt <= t;
  return s.cooldownUntil <= t && s.retryAfterAt <= t;
}

export async function pick(exclude: Set<string> = new Set()): Promise<KeyState | null> {
  const t = now();
  const ready = [...local.values()].filter((s) => !exclude.has(s.key) && selectable(s, t));
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
export async function mark429(key: string, cooldownMs: number, quota?: QuotaDetail | null): Promise<void> {
  const st = local.get(key) ?? blank(key);
  st.failures += 1;
  st.invalidations += 1;
  st.cooldownUntil = now() + cooldownMs;
  st.retryAfterAt = st.cooldownUntil;
  st.invalid = false;
  st.status = "cooling";
  st.lastCheckedAt = now();
  if (quota !== undefined) st.quota = quota;
  if (quota?.freeTier || quota?.quotaId || quota?.consumer) {
    st.planEvidence = quota ? tierFromQuota(quota) : st.planEvidence;
  }
  counters.cooldowns++;
  local.set(key, st);
  persistHealth(st);
}

/**
 * The project holds no allowance for this metric: no window will ever help.
 * The key is *not* retired — the credential is valid and the operator may fix
 * the project — so it stays enabled and waits for its reset to be rechecked.
 */
export async function markQuotaExhausted(key: string, quota: QuotaDetail | null): Promise<void> {
  const st = local.get(key) ?? blank(key);
  st.failures += 1;
  st.status = "quota_exhausted";
  st.quota = quota;
  st.retryAfterAt = quota?.retryAfterMs ? now() + quota.retryAfterMs : 0;
  st.cooldownUntil = st.retryAfterAt;
  st.lastCheckedAt = now();
  st.invalid = false;
  if (quota) st.planEvidence = tierFromQuota(quota);
  local.set(key, st);
  persistHealth(st);
  // The credential is alive, so the durable "retired" flag must not survive.
  // A key that was retired by an earlier verdict (the old 429 handling marked
  // quota-exhausted projects as dead) was persisted with enabled=false, and
  // `hydrate()` reads that flag back as invalid. Without this the key would be
  // re-killed on the next cold start even though the upstream still refuses it
  // with a quota answer rather than a credential answer.
  later(() => repo.setEnabled(keyId(key), true));
}

/** A plan declared by upstream evidence rather than by the operator. */
function tierFromQuota(quota: QuotaDetail): TierEvidence {
  return {
    tier: quota.freeTier ? "free" : "paid",
    source: quota.freeTier ? "violations" : "consumer",
    quotaId: quota.quotaId,
    quotaMetric: quota.quotaMetric,
    consumer: quota.consumer,
    observedAt: Date.now(),
  };
}

/** Admitted but not yet proven: withheld from selection until a probe passes. */
export async function markUnverified(key: string): Promise<void> {
  const st = local.get(key) ?? blank(key);
  st.status = "unverified";
  st.lastCheckedAt = now();
  local.set(key, st);
  persistHealth(st);
}

/** Store an upstream-validated plan. A bare 200 validates nothing. */
export async function markValidatedPlan(
  key: string,
  evidence: TierEvidence | null,
): Promise<void> {
  const st = local.get(key) ?? blank(key);
  if (!evidence || evidence.tier === "unknown") return;
  st.tier = evidence.tier;
  st.planValidated = true;
  st.planEvidence = evidence;
  local.set(key, st);
  const id = keyId(key);
  later(() => repo.setValidatedPlan(id, evidence.tier as KeyTier, evidence));
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
  st.status = "dead";
  st.invalidations += 1;
  st.failures = 999;
  st.cooldownUntil = Number.MAX_SAFE_INTEGER;
  st.lastCheckedAt = now();
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
  st.retryAfterAt = 0;
  st.lastUsed = now();
  st.lastCheckedAt = now();
  st.status = "ready";
  local.set(key, st);
  const id = keyId(key);
  later(() => repo.setEnabled(id, true));
  later(() => repo.touchLastSeen(id));
  later(() => repo.setStatus(id, "ready"));
  // A cleared park must reach Postgres too, or the next cold start revives a
  // deadline that this successful probe already proved obsolete.
  later(() => repo.setCooldown(id, 0));
}

export async function deadKeys(): Promise<string[]> {
  return [...local.values()].filter((s) => s.invalid).map((s) => maskKey(s.key));
}

/* ---------- read side ---------- */

/** Admin-facing projection of one key: masked value plus mutable state. */
export type KeyView = {
  id: string;
  key: string;
  tier: KeyTier;
  /**
   * What the console may display as the plan. `unspecified` while the key is
   * parked or out of quota: the last validated tier describes the project at
   * the time of the probe, not a live entitlement.
   */
  plan: KeyTier | "unspecified";
  planValidated: boolean;
  planEvidence: TierEvidence | null;
  quota: QuotaDetail | null;
  failures: number;
  invalidations: number;
  cooldownLeftMs: number;
  lastUsed: number;
  lastCheckedAt: number;
  invalid: boolean;
  status: KeyStatus;
  /** epoch ms when the key becomes selectable again, 0 when it already is */
  cooldownUntil: number;
  nextAccessAt: number;
};

const planOf = (s: KeyState): KeyTier | "unspecified" =>
  s.status === "cooling" || s.status === "quota_exhausted" ? "unspecified" : s.tier;

/** Admin view: masked key plus the id used for mutation. */
export async function listKeys(): Promise<KeyView[]> {
  const t = now();
  return [...local.values()]
    .map((s) => ({
      id: keyId(s.key),
      key: maskKey(s.key),
      tier: s.tier,
      plan: planOf(s),
      planValidated: s.planValidated,
      planEvidence: s.planEvidence,
      quota: s.quota,
      failures: s.failures,
      invalidations: s.invalidations,
      cooldownLeftMs: Math.max(0, s.cooldownUntil - t),
      lastUsed: s.lastUsed,
      lastCheckedAt: s.lastCheckedAt,
      invalid: s.invalid,
      status: s.status,
      cooldownUntil: s.cooldownUntil,
      nextAccessAt: Math.max(s.cooldownUntil, s.retryAfterAt),
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
  quota_exhausted: number;
  dead: number;
  unverified: number;
  soonestReadyMs: number;
  storage: "memory" | "postgres";
  degraded: boolean;
};

export async function snapshot(): Promise<PoolSnapshot> {
  const all = [...local.values()];
  const t = now();
  let ready = 0;
  let cooling = 0;
  let quotaExhausted = 0;
  let dead = 0;
  let unverified = 0;
  let soonest = Infinity;
  for (const s of all) {
    if (s.invalid || s.status === "dead") dead++;
    else if (s.status === "unverified") unverified++;
    else if (s.status === "quota_exhausted" && !(s.retryAfterAt > 0 && s.retryAfterAt <= t)) {
      // A project with no allocation has no reset to wait for: `retryAfterAt`
      // stays 0, so it must not be counted as ready. It stays out of rotation
      // until a recheck proves the upstream serves it again.
      quotaExhausted++;
      if (s.retryAfterAt > t) soonest = Math.min(soonest, s.retryAfterAt - t);
    } else if (s.cooldownUntil > t) {
      cooling++;
      soonest = Math.min(soonest, s.cooldownUntil - t);
    } else ready++;
  }
  return {
    total: all.length,
    ready,
    cooling,
    quota_exhausted: quotaExhausted,
    dead,
    unverified,
    soonestReadyMs: Number.isFinite(soonest) ? soonest : 0,
    storage: storageMode,
    degraded: counters.dbDegraded > 0,
  };
}