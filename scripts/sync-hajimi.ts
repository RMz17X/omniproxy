#!/usr/bin/env bun
/**
 * sync-hajimi.ts — pulls valid keys from hajimi-king's data dir on agent-server
 * and registers them with the OmniProxy pool via POST /admin/keys.
 *
 * Usage:
 *   OMNIPROXY_URL=http://localhost:3200 ADMIN_TOKEN=adm bun scripts/sync-hajimi.ts
 */

const OMNIPROXY_URL = (process.env.OMNIPROXY_URL ?? "http://127.0.0.1:3200").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "adm";
const HAJIMI_SSH = process.env.HAJIMI_SSH ?? "agent@192.168.90.109";
const HAJIMI_DATA = process.env.HAJIMI_DATA ?? "/workspaces/hajimi-king/data/keys";

console.log(`[sync] pulling keys from ${HAJIMI_SSH}:${HAJIMI_DATA}...`);

const proc = Bun.spawn([
  "ssh",
  HAJIMI_SSH,
  `cat ${HAJIMI_DATA}/keys_valid_*.txt 2>/dev/null || true`,
]);

const text = await new Response(proc.stdout).text();
const keys = [
  ...new Set(
    text
      .split(/[\r\n]+/)
      .map((k) => k.trim())
      .filter((k) => k.startsWith("AIzaSy")),
  ),
];

console.log(`[sync] found ${keys.length} valid unique key(s)`);
if (keys.length === 0) {
  process.exit(0);
}

const res = await fetch(`${OMNIPROXY_URL}/admin/keys`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${ADMIN_TOKEN}`,
  },
  body: JSON.stringify({ keys }),
});

const body = await res.json();
console.log(`[sync] OMNIPROXY response (${res.status}):`, body);
