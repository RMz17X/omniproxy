#!/usr/bin/env bun
/**
 * Client-key smoke test against the real database, no listening socket.
 *
 * Drives the Hono app through `app.request()`, so it exercises the same
 * middleware chain production uses (admin gate, client gate, route handlers)
 * without binding a port. Uses the deployment's own DATABASE_URL.
 *
 * Run: DATABASE_URL=... ADMIN_TOKEN=... bun run scripts/smoke-client-keys.ts
 */

import app from "../src/app.ts";

const admin = process.env.ADMIN_TOKEN ?? "";
const AUTH = { Authorization: `Bearer ${admin}`, "content-type": "application/json" };

const call = async (path: string, init: RequestInit = {}) => {
  const res = await app.request(path, init);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
};

const line = (label: string, value: unknown) => console.log(`  ${label}: ${JSON.stringify(value)}`);
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : "  → " + JSON.stringify(detail)}`);
};

console.log("== env ==");
line("DATABASE_URL set", (process.env.DATABASE_URL ?? "").length > 0);
line("ADMIN_TOKEN set", admin.length > 0);
line("CLIENT_TOKEN", (process.env.CLIENT_TOKEN ?? "").length > 0 ? "(set)" : "(empty)");

/* The latch is sticky across runs: once a key has ever been minted on this
   database, the gateway is armed forever. So the "open" expectation only
   holds on a database that has never minted one. Detect the state first and
   assert the matching behaviour instead of assuming a virgin database. */
const preflight = await call("/pengatur/settings/client-keys", { headers: AUTH });
const armedBefore = preflight.data?.armed === true;
/* Two independent reasons the gate can already be closed before this run:
   a deploy-time CLIENT_TOKEN in the environment, or the sticky mint latch.
   Both are legitimate, so the expectation is derived from the actual state. */
const envTokenBefore = preflight.data?.envToken === true;
const gatedBefore = armedBefore || envTokenBefore;
console.log(`\n== open state (armed=${armedBefore}, envToken=${envTokenBefore}) ==`);
const openBefore = await call("/v1/models");
if (gatedBefore) {
  check("gated gateway refuses anonymous /v1/models", openBefore.status === 401, openBefore.status);
} else {
  check("unconfigured gateway stays open on /v1/models", openBefore.status === 200, openBefore.status);
}

console.log("\n== mint without admin token ==");
const noAuth = await call("/pengatur/settings/client-keys", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ label: "should-fail" }),
});
check("unauthenticated mint is refused", noAuth.status === 401 || noAuth.status === 403, noAuth.status);

console.log("\n== mint ==");
const minted = await call("/pengatur/settings/client-keys", {
  method: "POST",
  headers: AUTH,
  body: JSON.stringify({ label: "smoke-test" }),
});
check("mint returns ok", minted.status === 200 && minted.data?.ok === true, minted.data?.error ?? minted.status);
const raw: string = minted.data?.raw ?? "";
const id: string = minted.data?.key?.id ?? "";
check("raw key returned once", raw.length > 20, raw.length);
check("id is a 12-hex handle", /^[0-9a-f]{12}$/.test(id), id);
check("raw key carries the op_live_ prefix", raw.startsWith("op_live_"), raw.slice(0, 12));

console.log("\n== /v1 gate ==");
const withKey = await call("/v1/models", { headers: { Authorization: `Bearer ${raw}` } });
check("minted key is accepted on /v1/models", withKey.status === 200, withKey.status);
const bogus = await call("/v1/models", { headers: { Authorization: "Bearer op_live_bogus_000" } });
check("bogus key is refused", bogus.status === 401, bogus.status);
const anon = await call("/v1/models");
check("anonymous request is refused once a key exists", anon.status === 401, anon.status);

console.log("\n== list ==");
const listed = await call("/pengatur/settings/client-keys", { headers: AUTH });
const rows: any[] = listed.data?.keys ?? [];
const mine = rows.find((r) => r.id === id);
check("list is admin-gated and returns rows", listed.status === 200 && Array.isArray(rows), listed.status);
check("minted key appears in the list", Boolean(mine), rows.map((r) => r.id));
check("list never carries the raw key", !JSON.stringify(listed.data).includes(raw), "hash leak" );
check("last_used_at was stamped by the /v1 call", Boolean(mine?.lastUsedAt), mine?.lastUsedAt);

console.log("\n== revoke ==");
const revoked = await call(`/pengatur/settings/client-keys/${id}`, { method: "DELETE", headers: AUTH });
check("revoke returns ok", revoked.status === 200 && revoked.data?.ok === true, revoked.data?.error ?? revoked.status);
const afterRevoke = await call("/v1/models", { headers: { Authorization: `Bearer ${raw}` } });
check("revoked key is refused on /v1/models", afterRevoke.status === 401, afterRevoke.status);
const reRevoke = await call(`/pengatur/settings/client-keys/${id}`, { method: "DELETE", headers: AUTH });
check("revoking twice is a 404", reRevoke.status === 404, reRevoke.status);

console.log("\n== gate stays armed after the last key is revoked ==");
// Revoking the last key must NOT reopen the gateway: "no keys" is not
// "never configured". The mint latch in gateway_settings keeps it closed.
const openAfter = await call("/v1/models");
check("gate does not reopen when the last key is revoked", openAfter.status === 401, openAfter.status);
const armed = await call("/pengatur/settings/client-keys", { headers: AUTH });
check("console reports the gate as armed", armed.data?.armed === true, armed.data?.armed);

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
