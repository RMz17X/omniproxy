/**
 * Key pool: health tracking, selection, cooldown.
 *
 * Backed by Upstash Redis REST when configured (multi-instance safe),
 * otherwise by a process-local Map (single instance / dev).
 *
 * A key record is a compact string in Redis:
 *   f=<failures>;u=<invalid 0|1>;c=<cooldownUntilEpochMs>;l=<lastUsedEpochMs>
 */

const KV_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const USE_KV = Boolean(KV_URL && KV_TOKEN);

const IDX_KEY = "gkr:idx";
const KEY_PREFIX = "gkr:k:";

export type KeyState = {
  key: string;
  failures: number;
  invalid: boolean;
  cooldownUntil: number;
  lastUsed: number;
};

const local = new Map<string, KeyState>();

const now = () => Date.now();

const mask = (k: string) => {
  if (k.length <= 4) return "*".repeat(k.length);
  if (k.length <= 12) return `${k.slice(0, 2)}…${k.slice(-2)}`;
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
};

const encode = (s: KeyState) =>
  `f=${s.failures};u=${s.invalid ? 1 : 0};c=${s.cooldownUntil};l=${s.lastUsed}`;

const decode = (key: string, raw: string | null): KeyState => {
  const out: KeyState = { key, failures: 0, invalid: false, cooldownUntil: 0, lastUsed: 0 };
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
  }
  return out;
};

/* ---------- Upstash REST ---------- */

async function kvCommand(...args: (string | number)[]): Promise<unknown> {
  const res = await fetch(KV_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`kv ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`kv: ${json.error}`);
  return json.result;
}

/* ---------- abstract ops ---------- */

async function readAll(): Promise<KeyState[]> {
  if (!USE_KV) {
    return [...local.values()].filter((s) => !s.invalid);
  }
  const idx = (await kvCommand("SMEMBERS", IDX_KEY)) as string[] | null;
  if (!idx || idx.length === 0) return [];
  // Sequential GETs: pools are small (tens of keys) and this keeps the
  // Upstash REST surface to plain commands, no pipeline payload shaping.
  const out: KeyState[] = [];
  for (const k of idx) {
    const v = (await kvCommand("GET", KEY_PREFIX + k)) as string | null;
    if (v === null) continue;
    const st = decode(k, v);
    if (!st.invalid) out.push(st);
  }
  return out;
}

async function writeState(st: KeyState): Promise<void> {
  if (!USE_KV) {
    local.set(st.key, st);
    return;
  }
  await kvCommand("SET", KEY_PREFIX + st.key, encode(st));
  await kvCommand("SADD", IDX_KEY, st.key);
}

export async function addKey(key: string): Promise<boolean> {
  const k = key.trim();
  if (!k) return false;
  if (!USE_KV) {
    if (local.has(k) && !local.get(k)!.invalid) return false;
    local.set(k, { key: k, failures: 0, invalid: false, cooldownUntil: 0, lastUsed: 0 });
    return true;
  }
  const exists = await kvCommand("SISMEMBER", IDX_KEY, k);
  if (exists === 1) {
    const v = (await kvCommand("GET", KEY_PREFIX + k)) as string | null;
    if (v && !decode(k, v).invalid) return false;
  }
  await writeState({ key: k, failures: 0, invalid: false, cooldownUntil: 0, lastUsed: 0 });
  return true;
}

export async function removeKey(key: string): Promise<boolean> {
  const k = key.trim();
  if (!USE_KV) return local.delete(k);
  await kvCommand("DEL", KEY_PREFIX + k);
  await kvCommand("SREM", IDX_KEY, k);
  return true;
}

export async function listKeys(): Promise<
  { key: string; masked: string; failures: number; cooldownLeftMs: number; lastUsed: number }[]
> {
  const all = await readAll();
  const t = now();
  return all.map((s) => ({
    key: mask(s.key),
    masked: mask(s.key),
    failures: s.failures,
    cooldownLeftMs: Math.max(0, s.cooldownUntil - t),
    lastUsed: s.lastUsed,
  }));
}

export type PoolSnapshot = {
  total: number;
  ready: number;
  cooling: number;
  soonestReadyMs: number;
};

export async function snapshot(): Promise<PoolSnapshot> {
  const all = await readAll();
  const t = now();
  let ready = 0;
  let cooling = 0;
  let soonest = Infinity;
  for (const s of all) {
    if (s.cooldownUntil > t) {
      cooling++;
      soonest = Math.min(soonest, s.cooldownUntil - t);
    } else ready++;
  }
  return {
    total: all.length,
    ready,
    cooling,
    soonestReadyMs: Number.isFinite(soonest) ? soonest : 0,
  };
}

/* ---------- selection ---------- */

/**
 * Pick the healthiest key: lowest failure count, then least-recently-used.
 * Restricting to ready keys makes pacing implicit — a key that just served
 * a request has lastUsed=now and loses every LRU comparison until its
 * rate window elapses, at which point it becomes the freshest candidate.
 */
export async function pick(exclude: Set<string> = new Set()): Promise<KeyState | null> {
  const all = (await readAll()).filter((s) => !exclude.has(s.key));
  const t = now();
  const ready = all.filter((s) => s.cooldownUntil <= t);
  if (ready.length === 0) return null;
  ready.sort((a, b) => a.failures - b.failures || a.lastUsed - b.lastUsed);
  return ready[0];
}

export async function markUsed(key: string): Promise<void> {
  const cur = await getState(key);
  if (!cur) return;
  cur.lastUsed = now();
  await writeState(cur);
}

export async function mark429(key: string, cooldownMs: number): Promise<void> {
  const cur = (await getState(key)) ?? {
    key,
    failures: 0,
    invalid: false,
    cooldownUntil: 0,
    lastUsed: 0,
  };
  cur.failures += 1;
  cur.cooldownUntil = now() + cooldownMs;
  await writeState(cur);
}

export async function markInvalid(key: string): Promise<void> {
  const cur = (await getState(key)) ?? {
    key,
    failures: 0,
    invalid: false,
    cooldownUntil: 0,
    lastUsed: 0,
  };
  cur.invalid = true;
  cur.cooldownUntil = Number.MAX_SAFE_INTEGER;
  cur.failures = 999;
  await writeState(cur);
}

export async function markSoftError(key: string, cooldownMs: number): Promise<void> {
  const cur = (await getState(key)) ?? {
    key,
    failures: 0,
    invalid: false,
    cooldownUntil: 0,
    lastUsed: 0,
  };
  cur.failures += 1;
  cur.cooldownUntil = now() + cooldownMs;
  await writeState(cur);
}

async function getState(key: string): Promise<KeyState | null> {
  if (!USE_KV) return local.get(key) ?? null;
  const v = (await kvCommand("GET", KEY_PREFIX + key)) as string | null;
  return v === null ? null : decode(key, v);
}

export const storageMode = USE_KV ? "upstash-redis" : "memory";
