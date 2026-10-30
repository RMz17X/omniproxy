/**
 * Client API keys — the credentials end users present on `/v1/*`.
 *
 * Distinct from the two other credential layers on purpose:
 *
 *   - `ADMIN_TOKEN` / `INGEST_TOKEN` open the console (`/pengatur/*`).
 *   - `CLIENT_TOKEN` is the single deploy-time bearer for `/v1/*`.
 *   - a row here is a *named* client key an operator mints from the settings
 *     page: revocable one by one, with a last-used stamp, so handing a key to
 *     a client no longer means shipping them the deployment-wide token.
 *
 * Storage policy mirrors `key_material`: the plaintext is never persisted, and
 * the table holds only the SHA-256. A key is displayed exactly once, at mint
 * time, and the console can never show it again — it can only revoke it.
 *
 * The verification path runs on every `/v1/*` request, so the live hash set is
 * cached in process for a few seconds. Serverless instances scale to zero, so
 * a cold start re-reads; a revocation therefore lands within one TTL.
 */

import { createHash, randomBytes } from "node:crypto";
import { dbEnabled, sql, sqlLater } from "./db.ts";
import { getSetting, setSetting } from "./settings-store.ts";
import { log } from "./log.ts";

/** Recognisable prefix so a leaked string is greppable in logs and code. */
export const CLIENT_KEY_PREFIX = "op_live_";

/** How much of the raw value the console shows. Prefix + first 8 hex chars. */
const SHOWN_LEN = CLIENT_KEY_PREFIX.length + 8;

/** How long the verified-hash set is trusted before re-reading the table. */
const CACHE_TTL_MS = 10_000;

/** `last_used_at` is written at most once per key per this window. */
const TOUCH_TTL_MS = 60_000;

/**
 * Latch: "this deployment has minted a client key at least once".
 *
 * Without it, revoking the last key would silently reopen `/v1/*` to the
 * world, because "no keys" is indistinguishable from "never configured".
 * Minting sets it, nothing clears it, so access can only be revoked — never
 * accidentally granted back. Stored in `gateway_settings`, the same runtime
 * override table the rotation cap uses.
 */
const CONFIGURED_KEY = "client_keys_configured";

export type ClientKeyRow = {
  id: string;
  prefix: string;
  label: string | null;
  enabled: boolean;
  /** epoch ms */
  createdAt: number;
  /** epoch ms; 0 when the key has never been used */
  lastUsedAt: number;
};

type DbRow = {
  id: string;
  prefix: string;
  label: string | null;
  enabled: boolean;
  created_at: string | Date | null;
  last_used_at: string | Date | null;
};

/** Drivers disagree on timestamptz: some hand back Date, some an ISO string. */
const toEpoch = (v: string | Date | null): number => {
  if (!v) return 0;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : 0;
};

/** The console handle for a key: sha256 prefix, same shape as a pool key id. */
export const clientKeyId = (raw: string): string =>
  createHash("sha256").update(raw).digest("hex").slice(0, 12);

const hashOf = (raw: string): string => createHash("sha256").update(raw).digest("hex");

/** A fresh raw credential. 24 random bytes: 48 hex chars of entropy. */
export function mintClientKey(): string {
  return CLIENT_KEY_PREFIX + randomBytes(24).toString("hex");
}

export type CreatedClientKey = { raw: string; row: ClientKeyRow };

export async function createClientKey(label: string | null): Promise<CreatedClientKey> {
  const raw = mintClientKey();
  const id = clientKeyId(raw);
  const prefix = raw.slice(0, SHOWN_LEN);
  const hash = hashOf(raw);

  const res = await sql(
    `insert into client_keys (id, hash, prefix, label) values ($1, $2, $3, $4)`,
    [id, hash, prefix, label],
  );
  if (!res.ok) throw new Error(res.message ?? "could not store the client key");

  /* Arm the gate permanently. Done after the insert so a failed write cannot
     leave the deployment latched with no key to show for it. */
  await setSetting(CONFIGURED_KEY, "1");

  // A fresh key must be usable on the very next request, not after one TTL.
  cache.at = 0;
  return { raw, row: { id, prefix, label, enabled: true, createdAt: Date.now(), lastUsedAt: 0 } };
}

const toRow = (r: DbRow): ClientKeyRow => ({
  id: r.id,
  prefix: r.prefix,
  label: r.label ?? null,
  enabled: r.enabled === true,
  createdAt: toEpoch(r.created_at),
  lastUsedAt: toEpoch(r.last_used_at),
});

/** Every key, newest first. Never carries the hash or the raw value. */
export async function listClientKeys(): Promise<ClientKeyRow[]> {
  if (!dbEnabled()) return [];
  const res = await sql<DbRow>(
    `select id, prefix, label, enabled, created_at, last_used_at
       from client_keys
      order by created_at desc`,
  );
  if (!res.ok) {
    log("warn", "client_keys.list_failed", { reason: res.reason });
    return [];
  }
  return res.rows.map(toRow);
}

/** Drop one key. Returns false when the id matches nothing. */
export async function revokeClientKey(id: string): Promise<boolean> {
  if (!dbEnabled()) return false;
  const res = await sql(`delete from client_keys where id = $1 returning id`, [id]);
  if (!res.ok) throw new Error(res.message ?? "could not revoke the client key");
  cache.at = 0;
  return res.rows.length > 0;
}

/* ---------- verification ---------- */

type Cache = { at: number; hashes: Set<string>; enabled: boolean };

let cache: Cache = { at: 0, hashes: new Set(), enabled: false };
const touched = new Map<string, number>();

async function load(): Promise<Cache> {
  if (Date.now() - cache.at < CACHE_TTL_MS) return cache;
  if (!dbEnabled()) {
    cache = { at: Date.now(), hashes: new Set(), enabled: false };
    return cache;
  }
  const res = await sql<{ hash: string; enabled: boolean }>(`select hash, enabled from client_keys`);
  if (!res.ok) {
    // Keep the previous set: a database blip must not lock every client out.
    log("warn", "client_keys.load_failed", { reason: res.reason });
    return cache;
  }
  const hashes = new Set<string>();
  let enabled = false;
  for (const row of res.rows) {
    if (row.enabled !== true) continue;
    hashes.add(row.hash);
    enabled = true;
  }
  cache = { at: Date.now(), hashes, enabled };
  return cache;
}

/** True when at least one live client key exists right now. */
export async function clientKeysEnabled(): Promise<boolean> {
  return (await load()).enabled;
}

/**
 * True when `/v1/*` must be gated because of stored keys.
 *
 * Two independent reasons, either is enough:
 *   1. a live key exists — obviously gated;
 *   2. the mint latch is set — a key existed at some point and was revoked.
 *      "No keys left" must not read as "never configured", otherwise revoking
 *      the last key would reopen the gateway to anyone.
 *
 * Only a deployment that has never minted a key reports false, which keeps the
 * historical unauthenticated behaviour for a private install.
 */
export async function clientKeysArmed(): Promise<boolean> {
  if ((await load()).enabled) return true;
  return (await getSetting(CONFIGURED_KEY)) === "1";
}

/** Validate a presented credential and stamp its last use. */
export async function verifyClientKey(raw: string): Promise<boolean> {
  const value = raw.trim();
  if (!value.startsWith(CLIENT_KEY_PREFIX)) return false;

  const { hashes } = await load();
  const hash = hashOf(value);
  if (!hashes.has(hash)) return false;

  const last = touched.get(hash) ?? 0;
  if (Date.now() - last > TOUCH_TTL_MS) {
    touched.set(hash, Date.now());
    sqlLater(`update client_keys set last_used_at = now() where hash = $1`, [hash]);
  }
  return true;
}

/** Counts for the settings page: how many keys exist, how many still work. */
export async function clientKeyStats(): Promise<{ total: number; enabled: number }> {
  if (!dbEnabled()) return { total: 0, enabled: 0 };
  const res = await sql<{ total: string | number; enabled: string | number }>(
    `select count(*) as total, count(*) filter (where enabled) as enabled from client_keys`,
  );
  if (!res.ok) return { total: 0, enabled: 0 };
  const row = res.rows[0];
  return { total: Number(row?.total ?? 0), enabled: Number(row?.enabled ?? 0) };
}