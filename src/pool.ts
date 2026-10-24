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
import { loadMaterial, materialEnabled, saveMaterial, saveMaterialNow, deleteMaterial } from "./key-material.ts";
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

/**
 * Why a credential was retired. `leaked` and `invalid` come from upstream
 * rejecting the key itself; `zero_quota` is the strongest quota evidence and
 * still leaves the key enabled for the operator to inspect.
 */
export type RetirementReason = "invalid" | "leaked" | "zero_quota";

export type KeyState = {
  key: string;
  provider: string;
  tier: KeyTier;
  failures: number;
  /** permanence marker: the key was rejected as invalid by upstream */
  invalid: boolean;
  /**
   * Observation instant (epoch ms) of the retirement on record; 0 when the
   * credential is not retired. Every verdict carries its own `observedAt`, and
   * only one observed strictly later than this may clear the retirement: a
   * quota or healthy answer that was issued BEFORE the leak verdict must not
   * resurrect the key, no matter which statement reaches Postgres last.
   */
  retiredAt: number;
  /** why the retirement stands: `leaked`, `invalid`, `zero_quota` */
  retiredReason: string | null;
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
  /**
   * model -> epoch ms until which this key has no allowance for that model.
   * A free-tier window is scoped to one model, so the refusal must not cool
   * the credential: the key keeps serving every other model meanwhile.
   */
  modelRefusals: Record<string, number>;
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

const blank = (key: string, provider: string = "gemini"): KeyState => ({
  key,
  provider,
  tier: "unknown",
  failures: 0,
  invalid: false,
  invalidations: 0,
  retiredAt: 0,
  retiredReason: null,
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
  modelRefusals: {},
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

/**
 * True when a verdict observed at `observedAt` is too old to speak about this
 * credential: a retirement recorded at or after it already won. The comparison
 * is strict so a verdict that arrives later at the same millisecond still
 * applies, which keeps in-process ordering sane.
 */
const outranked = (st: KeyState, observedAt: number): boolean =>
  st.retiredAt > observedAt;

/**
 * Persist raw material for pooled keys that are missing it.
 *
 * `saveMaterial` is fire-and-forget, and on a serverless runtime a detached
 * insert is dropped when the instance is recycled right after the response.
 * The visible symptom is a durable pool far smaller than the live one: keys
 * serve traffic in memory, `key_material` never records them, and the next
 * cold start rebuilds a pool without them — which is why model discovery
 * intermittently finds "no selectable key" on some instances and not others.
 *
 * Only keys already present in THIS instance's pool are backfilled, so a key
 * that was deliberately removed is never resurrected from a stale sync.
 * Returns how many rows were written.
 */
export async function backfillMaterial(): Promise<number> {
  if (!materialEnabled()) return 0;
  let have: Set<string>;
  try {
    have = new Set([...(await loadMaterial()).keys()]);
  } catch {
    return 0;
  }
  let written = 0;
  for (const [raw, st] of local) {
    if (st.invalid) continue;
    const id = keyId(raw);
    if (have.has(id)) continue;
    await saveMaterialNow(id, raw);
    written++;
  }
  if (written) log("info", "key_material.backfilled", { written });
  return written;
}

/**
 * Pool size and ready count, for diagnostics only.
 *
 * `snapshot()` builds a full view for the console; these are the two numbers a
 * "no selectable key" error needs to be actionable — whether the instance is
 * empty (hydration never ran) or full but filtered (every key is cooling down
 * or retired).
 */
export function poolSize(): number {
  return local.size;
}

export function readyCount(): number {
  const t = now();
  let n = 0;
  for (const s of local.values()) if (selectable(s, t)) n++;
  return n;
}

/** Push the identity half of a key record to the repository. */
function persistIdentity(st: KeyState): void {
  const id = keyId(st.key);
  const masked = maskKey(st.key);
  const plan = st.tier;
  const provider = st.provider;
  later(() => repo.upsertKey({ id, masked, plan, provider }));
}

function persistHealth(st: KeyState, observedAt: number = now()): void {
  const id = keyId(st.key);
  if (st.invalid || st.status === "dead") {
    // Guarded by `retired_at`: a retirement older than the one already on the
    // row cannot shorten it, and a stale enable=true cannot outrun it.
    const at = st.retiredAt || observedAt;
    const reason: RetirementReason =
      st.retiredReason === "leaked" || st.retiredReason === "zero_quota"
        ? st.retiredReason
        : "invalid";
    later(() => repo.retire(id, at, reason));
    return;
  }
  later(() => repo.touchLastSeen(id));
  if (st.failures > 0) later(() => repo.bumpFailCount(id));
  // Guarded too: a status from a verdict older than the recorded retirement
  // must not overwrite `dead` on a row another instance already retired.
  later(() => repo.setStatus(id, st.status, observedAt));
  // Serverless scales to zero; a park held only in memory is erased on the
  // next cold start and the key gets re-fired immediately. Persist the
  // deadline (or its clearing) so `hydrate()` can restore the park.
  later(() => repo.setCooldown(id, st.cooldownUntil));
  if (st.retryAfterAt > 0) later(() => repo.setRetryAfter(id, st.retryAfterAt));
  if (st.quota) later(() => repo.setQuotaState(id, st.quota));
  // Per-model refusals outlive the process too: the free-tier window is a day,
  // so a cold start that forgot them would re-fire the same key at the same
  // model. The map only grows until each deadline passes, so writing it whole
  // is cheaper than diffing, and it is only written once it is non-empty.
  if (Object.keys(st.modelRefusals).length > 0) {
    later(() => repo.setModelRefusals(id, st.modelRefusals));
  }
  // The last probe time is durable state: the recheck floor between two
  // probes of a key whose upstream named no reset is measured against it, so
  // without this the key is due again on the first tick after a cold start.
  if (st.lastCheckedAt > 0) later(() => repo.setLastCheckedAt(id, st.lastCheckedAt));
  // The same reasoning applies to the LRU stamp `pick()` orders by. It lived
  // only in memory, so every cold start reset it and the pool's load-spreading
  // restarted from the first key in the map.
  if (st.lastUsed > 0) later(() => repo.setLastUsed(id, st.lastUsed));
}

/* ---------- cold start ---------- */

/** Insert one key into the mirror when absent; never disturbs live state. */
function seed(key: string, provider: string = "gemini"): void {
  if (!local.has(key)) local.set(key, blank(key, provider));
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
    hit.provider = row.provider || "gemini";
    hit.tier = row.plan;
    hit.failures = Math.max(hit.failures, row.failCount);
    if (row.planValidated) {
      hit.planValidated = true;
      hit.planEvidence = row.planEvidence;
    }
    if (row.quota) hit.quota = row.quota;
    for (const [m, until] of Object.entries(row.modelRefusals)) {
      if (until > (hit.modelRefusals[m] ?? 0)) hit.modelRefusals[m] = until;
    }
    if (row.lastCheckedAt > 0) hit.lastCheckedAt = row.lastCheckedAt;
    if (row.lastUsed > 0) hit.lastUsed = row.lastUsed;
    hit.retiredAt = row.retiredAt;
    hit.retiredReason = row.retiredReason;
    if (!row.enabled || row.status === "dead") {
      hit.invalid = true;
      hit.status = "dead";
      hit.cooldownUntil = Number.MAX_SAFE_INTEGER;
      // A row retired before `retired_at` existed carries no instant; it is
      // the old 429 handling, so it is treated as infinitely old and any
      // fresh quota verdict may still clear it.
      hit.retiredAt = row.retiredAt || 1;
      if (!hit.retiredReason) hit.retiredReason = "invalid";
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

export async function addKey(key: string, provider: string = "gemini"): Promise<boolean> {
  const k = key.trim();
  if (!k) return false;
  const p = (provider || "").trim() || "gemini";
  const cur = local.get(k);
  if (cur && !cur.invalid) return false;
  const st = blank(k, p);
  local.set(k, st);
  persistIdentity(st);
  // Awaited, not fire-and-forget: the sync endpoint answers `durable: true`
  // from this write, and on a serverless runtime a detached insert is dropped
  // when the instance is recycled right after the response.
  await saveMaterialNow(keyId(k), k);
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
 * Drop every dead credential from the in-memory pool.
 *
 * `hydrate` only overlays rows it finds; a row deleted from the database is
 * invisible to it, so the process would keep serving a snapshot that still
 * counts credentials which no longer exist. Called after `purgeDead`.
 */
export function forgetDead(): number {
  let dropped = 0;
  for (const [raw, st] of local) {
    if (st.status === "dead" || st.invalid) {
      local.delete(raw);
      dropped++;
    }
  }
  return dropped;
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
function selectable(s: KeyState, t: number, model?: string, provider?: string): boolean {
  if (provider && (s.provider || "gemini") !== provider) return false;
  if (s.invalid || s.status === "dead" || s.status === "unverified") return false;
  // A per-model free-tier refusal disqualifies the pair only: another model
  // on the same credential is untouched, so the key stays in rotation.
  if (model && (s.modelRefusals[model] ?? 0) > t) return false;
  // An exhausted project has no window that a cooldown could wait out: it
  // re-enters rotation only when a reset is known and has passed.
  if (s.status === "quota_exhausted") return s.retryAfterAt > 0 && s.retryAfterAt <= t;
  return s.cooldownUntil <= t && s.retryAfterAt <= t;
}

/**
 * `model` narrows the candidate set to keys that still hold allowance for it.
 * `provider` filters keys by provider (e.g. 'gemini', 'elevenlabs').
 * Omit it to ask "any key at all", which is what the pool-exhaustion wait uses.
 */
/**
 * Re-hydrate on a timer, at most once per interval.
 *
 * A serverless deployment runs many instances against one Postgres. Each
 * instance hydrates once at cold start, so an instance that came up before a
 * key sync never learns the new keys — the sync request only lands on the
 * instance Vercel happened to route it to. The visible symptom is a pool that
 * reports "no selectable key" on one instance while another reports 177 ready
 * at the same moment. Re-hydrating periodically makes every instance converge
 * on the durable source instead of staying frozen at its own birth snapshot.
 *
 * `hydrate()` is idempotent: it merges missing keys and re-applies repo
 * metadata, so calling it repeatedly only adds keys, never drops state.
 */
const HYDRATE_REFRESH_MS = 20_000;
let lastHydrateAt = 0;
let hydrating: Promise<void> | null = null;

function refreshFromDurable(): Promise<void> | null {
  const t = Date.now();
  if (hydrating) return hydrating;
  if (t - lastHydrateAt < HYDRATE_REFRESH_MS) return null;
  lastHydrateAt = t;
  hydrating = hydrate()
    .then(() => undefined)
    .catch((err: unknown) => {
      log("warn", "pool.refresh_failed", { error: err instanceof Error ? err.message : String(err) });
    })
    .finally(() => {
      hydrating = null;
    });
  return hydrating;
}

export async function pick(
  exclude: Set<string> = new Set(),
  model?: string,
  provider?: string,
): Promise<KeyState | null> {
  // Cheap local check first; only when this instance has nothing to hand out
  // do we spend a round trip on the durable source.
  const t = now();
  const ready = [...local.values()].filter((s) => !exclude.has(s.key) && selectable(s, t, model, provider));
  if (ready.length === 0) {
    const pending = refreshFromDurable();
    if (pending) await pending;
    const t2 = now();
    const retry = [...local.values()].filter((s) => !exclude.has(s.key) && selectable(s, t2, model, provider));
    if (retry.length === 0) return null;
    retry.sort((a, b) => a.failures - b.failures || a.lastUsed - b.lastUsed);
    return retry[0];
  }
  ready.sort((a, b) => a.failures - b.failures || a.lastUsed - b.lastUsed);
  return ready[0];
}

/**
 * Why `pick` cannot serve `model` right now.
 *
 * - `model_refusal`: a live per-model refusal exists on some credential and no
 *   untried key can serve the model. The deadline is that model's next reset,
 *   so no bounded wait clears it and the chain must advance.
 * - `quota`: only parked project-quota keys remain — a verdict about the
 *   project, not the model — reported with `keys` so the caller's per-model
 *   tally keeps its evidence.
 * - `blocked`: nothing untried remains for other reasons (every candidate was
 *   already attempted in this request); a wait cannot help.
 * - `none`: an untried candidate exists, or only cooldowns block; wait.
 *
 * Refusals count even for keys already tried, because a refusal is a property
 * of the (key, model) pair, not of one attempt.
 */
export type ModelBlock = {
  kind: "none" | "model_refusal" | "quota" | "blocked";
  keys: string[];
};

export function modelBlock(exclude: Set<string>, model: string, provider?: string): ModelBlock {
  const t = now();
  const refused: string[] = [];
  const parked: string[] = [];
  let untried = false;
  for (const s of local.values()) {
    if (provider && (s.provider || "gemini") !== provider) continue;
    if (s.invalid || s.status === "dead" || s.status === "unverified") continue;
    if ((s.modelRefusals[model] ?? 0) > t) {
      refused.push(s.key);
      continue;
    }
    if (exclude.has(s.key)) continue;
    if (s.status === "quota_exhausted") {
      parked.push(s.key);
      continue;
    }
    untried = true;
  }
  if (untried) return { kind: "none", keys: [] };
  if (refused.length > 0) return { kind: "model_refusal", keys: refused };
  if (parked.length > 0) return { kind: "quota", keys: parked };
  return { kind: "blocked", keys: [] };
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
export async function mark429(
  key: string,
  cooldownMs: number,
  quota?: QuotaDetail | null,
  observedAt: number = now(),
): Promise<void> {
  const st = local.get(key) ?? blank(key);
  if (outranked(st, observedAt)) {
    // A retirement newer than this throttle stands: the key is revoked, and a
    // 429 observed before the leak verdict says nothing about it.
    st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
    local.set(key, st);
    persistHealth(st, observedAt);
    return;
  }
  st.failures += 1;
  st.invalidations += 1;
  st.cooldownUntil = now() + cooldownMs;
  st.retryAfterAt = st.cooldownUntil;
  st.invalid = false;
  st.retiredAt = 0;
  st.retiredReason = null;
  st.status = "cooling";
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  if (quota !== undefined) st.quota = quota;
  if (quota?.freeTier || quota?.quotaId || quota?.consumer) {
    st.planEvidence = quota ? tierFromQuota(quota) : st.planEvidence;
  }
  counters.cooldowns++;
  local.set(key, st);
  persistHealth(st, observedAt);
  later(() => repo.revive(keyId(key), observedAt, "cooling"));
}

/**
 * The project holds no allowance for this metric: no window will ever help.
 * The key is *not* retired — the credential is valid and the operator may fix
 * the project — so it stays enabled and waits for its reset to be rechecked.
 */
export async function markQuotaExhausted(
  key: string,
  quota: QuotaDetail | null,
  observedAt: number = now(),
): Promise<void> {
  const st = local.get(key) ?? blank(key);
  if (outranked(st, observedAt)) {
    // The credential was retired by a leak verdict observed AFTER this quota
    // answer. A quota answer and a revoked key are indistinguishable on
    // generateContent, so the stronger, newer evidence wins: stay retired.
    st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
    local.set(key, st);
    persistHealth(st, observedAt);
    log("warn", "key.quota_after_retirement", { key: maskKey(key) });
    return;
  }
  st.failures += 1;
  st.status = "quota_exhausted";
  st.quota = quota;
  st.retryAfterAt = quota?.retryAfterMs ? now() + quota.retryAfterMs : 0;
  st.cooldownUntil = st.retryAfterAt;
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  st.invalid = false;
  // Only a retirement OLDER than this verdict reaches here, so clearing it is
  // safe: the key is alive, upstream just refuses its project's allowance.
  st.retiredAt = 0;
  st.retiredReason = null;
  if (quota) st.planEvidence = tierFromQuota(quota);
  local.set(key, st);
  persistHealth(st, observedAt);
  // The durable "retired" flag must not survive a live credential. A key
  // retired by the old 429 handling was persisted with enabled=false, and
  // `hydrate()` reads that flag back as invalid, so without this it would be
  // re-killed on the next cold start. `revive` is guarded by `retired_at`: it
  // clears only a retirement older than the quota evidence above.
  later(() => repo.revive(keyId(key), observedAt, "quota_exhausted"));
}

/**
 * A 429 that names a model and blames no project: the credential is fine, its
 * allowance for *that model* is spent until the body's reset. Nothing
 * pool-wide may move — no cooldown, no failure count, no status, no
 * retirement — or a free-tier key would be lost to every other model it can
 * still serve. Only the tier evidence is recorded, because a free-tier
 * violation is still the only proof of the plan.
 */
export async function markModelRefused(
  key: string,
  model: string,
  quota: QuotaDetail | null,
  observedAt: number = now(),
): Promise<void> {
  const st = local.get(key) ?? blank(key);
  const until = quota?.retryAfterMs ? now() + quota.retryAfterMs : 0;
  // A refusal with no stated reset is held until the end of the UTC day: the
  // free tier window is daily, so re-firing sooner only repeats the 429.
  st.modelRefusals[model] = until > 0 ? until : endOfUtcDay();
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  // A per-model refusal is not credential evidence, so it must not clear a
  // retirement newer than itself either.
  if (!outranked(st, observedAt)) st.invalid = false;
  if (quota) {
    st.quota = quota;
    st.planEvidence = tierFromQuota(quota);
  }
  local.set(key, st);
  persistHealth(st, observedAt);
}

/** Midnight UTC after the current instant — the free tier's daily reset. */
function endOfUtcDay(): number {
  const d = new Date(now());
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** True when the key holds no live allowance for `model`. */
export function modelRefused(key: string, model: string): boolean {
  const st = local.get(key);
  if (!st) return false;
  return (st.modelRefusals[model] ?? 0) > now();
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
export async function markUnverified(key: string, observedAt: number = now()): Promise<void> {
  const st = local.get(key) ?? blank(key);
  if (outranked(st, observedAt)) {
    st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
    local.set(key, st);
    persistHealth(st, observedAt);
    return;
  }
  st.status = "unverified";
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  local.set(key, st);
  persistHealth(st, observedAt);
}

/** Store an upstream-validated plan. A bare 200 validates nothing. */
export async function markValidatedPlan(
  key: string,
  evidence: TierEvidence | null,
): Promise<void> {
  const st = local.get(key) ?? blank(key);
  if (!evidence || evidence.tier === "unknown") return;
  st.tier = evidence.tier as KeyTier;
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

/**
 * Permanently retire a key: memory takes the verdict, Postgres follows.
 *
 * `observedAt` is when upstream answered, and `reason` is what it answered.
 * A retirement already on record from a NEWER observation keeps its instant,
 * so the strongest evidence survives regardless of arrival order.
 */
export async function markInvalid(
  key: string,
  observedAt: number = now(),
  reason: RetirementReason = "invalid",
): Promise<boolean> {
  const st = local.get(key) ?? blank(key);
  const at = Math.max(st.retiredAt, observedAt);
  st.invalid = true;
  st.status = "dead";
  st.retiredAt = at;
  if (observedAt >= st.retiredAt || st.retiredReason === null) st.retiredReason = reason;
  st.invalidations += 1;
  st.failures = 999;
  st.cooldownUntil = Number.MAX_SAFE_INTEGER;
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  counters.invalidated++;
  local.set(key, st);
  persistHealth(st, observedAt);
  return true;
}

/**
 * A successful probe clears the parked state: the key demonstrably serves, so
 * keeping it cooling would only waste supply. Failures are reset because the
 * old count described a different (dead) window of the key's life.
 */
export async function markHealthy(key: string, observedAt: number = now()): Promise<void> {
  const st = local.get(key) ?? blank(key);
  if (outranked(st, observedAt)) {
    // The key served, but that answer predates a leak verdict: a revoked
    // credential cannot be revived by evidence observed before the revocation.
    st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
    local.set(key, st);
    persistHealth(st, observedAt);
    return;
  }
  st.invalid = false;
  st.retiredAt = 0;
  st.retiredReason = null;
  st.failures = 0;
  st.cooldownUntil = 0;
  st.retryAfterAt = 0;
  st.lastUsed = now();
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  st.status = "ready";
  local.set(key, st);
  const id = keyId(key);
  persistHealth(st, observedAt);
  // One guarded statement enables the key, writes `ready` and clears the
  // retirement clock; a newer retirement on the row refuses the revive, so a
  // slow healthy verdict cannot resurrect a key another instance just retired.
  later(() => repo.revive(id, observedAt, "ready"));
  later(() => repo.touchLastSeen(id));
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
  provider: string;
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
export async function listKeys(provider?: string): Promise<KeyView[]> {
  const t = now();
  const all = [...local.values()];
  const filtered = provider ? all.filter((s) => (s.provider || "gemini") === provider) : all;
  const list = filtered
    .map((s) => ({
      id: keyId(s.key),
      key: maskKey(s.key),
      provider: s.provider || "gemini",
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

  const byProvider: Record<string, KeyView[]> = {};
  for (const item of list) {
    (byProvider[item.provider] ??= []).push(item);
  }
  Object.defineProperty(list, "byProvider", {
    value: byProvider,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(list, "providers", {
    value: byProvider,
    enumerable: false,
    configurable: true,
  });

  return list;
}

/** Tier census for the console strip: how many keys of each declared plan. */
export function tierCounts(list: KeyView[]): Record<KeyTier, number> {
  const out: Record<KeyTier, number> = { unknown: 0, free: 0, paid: 0, pro: 0 };
  for (const k of list) out[k.tier] = (out[k.tier] ?? 0) + 1;
  return out;
}

/** Provider census: how many keys of each provider. */
export function providerCounts(list: KeyView[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of list) out[k.provider] = (out[k.provider] ?? 0) + 1;
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

export type ProviderSnapshot = {
  total: number;
  ready: number;
  cooling: number;
  quota_exhausted: number;
  dead: number;
  unverified: number;
};

export type PoolSnapshot = {
  total: number;
  ready: number;
  cooling: number;
  quota_exhausted: number;
  dead: number;
  unverified: number;
  soonestReadyMs: number;
  /** "hosted" when Postgres backs the pool, "memory" when it does not. */
  storage: "memory" | "hosted";
  degraded: boolean;
  byProvider: Record<string, ProviderSnapshot>;
  providers: Record<string, ProviderSnapshot>;
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
  const byProvider: Record<string, ProviderSnapshot> = {};

  const getSlot = (p: string): ProviderSnapshot => {
    if (!byProvider[p]) {
      byProvider[p] = {
        total: 0,
        ready: 0,
        cooling: 0,
        quota_exhausted: 0,
        dead: 0,
        unverified: 0,
      };
    }
    return byProvider[p]!;
  };

  for (const s of all) {
    const prov = s.provider || "gemini";
    const ps = getSlot(prov);
    ps.total++;

    if (s.invalid || s.status === "dead") {
      dead++;
      ps.dead++;
    } else if (s.status === "unverified") {
      unverified++;
      ps.unverified++;
    } else if (s.status === "quota_exhausted" && !(s.retryAfterAt > 0 && s.retryAfterAt <= t)) {
      // A project with no allocation has no reset to wait for: `retryAfterAt`
      // stays 0, so it must not be counted as ready. It stays out of rotation
      // until a recheck proves the upstream serves it again.
      quotaExhausted++;
      ps.quota_exhausted++;
      if (s.retryAfterAt > t) soonest = Math.min(soonest, s.retryAfterAt - t);
    } else if (s.cooldownUntil > t) {
      cooling++;
      ps.cooling++;
      soonest = Math.min(soonest, s.cooldownUntil - t);
    } else {
      ready++;
      ps.ready++;
    }
  }

  // Ensure 'gemini' entry is always present in byProvider
  getSlot("gemini");

  return {
    total: all.length,
    ready,
    cooling,
    quota_exhausted: quotaExhausted,
    dead,
    unverified,
    soonestReadyMs: Number.isFinite(soonest) ? soonest : 0,
    /* One vocabulary for the rail footer: "hosted" when the pool is backed by
       Postgres, "memory" when it is not. pool.ts used to emit "postgres",
       which disagreed with settings.data on the same page. */
    storage: dbEnabled() ? "hosted" : "memory",
    degraded: counters.dbDegraded > 0,
    byProvider,
    providers: byProvider,
  };
}