# F6 — Durable key material, method gate, hunter ingest

Repo: `/workspaces/geminesx` (bun + Hono, deployed on Vercel + Neon).
Branch: cut `wt/f6-key-material` from `master`. Commit per task. Do not push.

## Why

Today raw key material lives only in `GEMINI_API_KEYS`. `addKey()` puts the raw
value in the in-memory map and `persistIdentity()` writes only `sha256[:12]` +
masked into `keys`. A key pushed by an external hunter is therefore lost on the
next cold start, silently, while its `keys` row lingers forever.

Second defect, same file: the `/pengatur/*` middleware treats `SHELL_PATHS` as an
allowlist for **every method**. `POST /pengatur/keys` is a shell path, so a
tokenless POST reaches the handler. Proven: `POST {}` answers
`400 "No keys supplied."` (handler) while `GET /pengatur/keys/list` answers
`401` (gate).

Both must be fixed in this phase. Nothing else.

## Scope fence — writable files ONLY

```
src/schema.sql          (add one table)
src/key-material.ts     (new)
src/pool.ts             (hydrate, addKey, removeKey)
src/app.ts              (gate method check + one import + response field)
src/settings.ts         (one flag: KEY_ENC_SECRET)
test/key-material.test.ts (new)
test/gate.test.ts       (new)
docs/F6.md              (new, short)
```

**Forbidden:** `src/*-ui.ts`, `src/ui.ts`, `api/index.js` (bundle is built after
merge by the operator), `serverless/*`, `vercel.json`, `test/*` other than the
two new files, `scripts/*`, `.gitignore`, `README.md`.

Do not reformat untouched code. Minimal diff.

## T1 — crypto module `src/key-material.ts`

AES-256-GCM via `node:crypto`. No new dependency.

```ts
export function materialEnabled(): boolean   // KEY_ENC_SECRET set and non-empty
export async function loadMaterial(): Promise<Map<string, string>>  // id -> raw
export function saveMaterial(id: string, raw: string): void          // sqlLater
export function deleteMaterial(id: string): void                     // sqlLater
```

Rules:

- Key derivation: `createHash("sha256").update(secret).digest()` → 32 bytes.
  Never store the secret, never log it, never return it.
- IV: 12 random bytes per record (`randomBytes(12)`).
- Ciphertext, IV and auth tag are stored **base64 in `text` columns**, not
  `bytea`: the Neon HTTP driver serialises parameters as JSON, and base64 avoids
  any binary encoding ambiguity. Column names: `ciphertext`, `iv`, `tag`.
- `loadMaterial()` returns an empty map when the database or the secret is
  disabled — never throws.
- Decryption of a row that fails the auth tag is skipped and counted in one
  aggregated `log("warn", "key_material.decrypt_failed", { count })` line. One
  bad row must never block the pool.
- `saveMaterial` / `deleteMaterial` use `sqlLater` (fire-and-forget), same
  contract as `persistIdentity` in `pool.ts`.

## T2 — schema

Append to `src/schema.sql`:

```sql
create table if not exists key_material (
  id         text primary key,          -- sha256(raw)[:12], joins keys.id
  ciphertext text not null,             -- base64 AES-256-GCM(raw)
  iv         text not null,             -- base64, 12 bytes
  tag        text not null,             -- base64, 16 bytes
  updated_at timestamptz not null default now()
);
```

No raw key, no masked, no prompt text in this table. Keep the file idempotent.

## T3 — pool integration

In `src/pool.ts`:

1. Add an internal `seed(key: string)` that only inserts into the map (the body
   of today's env loop).
2. `hydrate()` seeds from `GEMINI_API_KEYS` via `seed()`, then — when
   `materialEnabled()` — awaits `loadMaterial()` and `seed()`s each decrypted
   value that is not already present, then runs the existing identity overlay
   unchanged. Log line gains `material: n` in the existing
   `pool.hydrated` payload.
3. `addKey(key)` persists material through `saveMaterial(keyId(k), k)` **in
   addition to** the existing `persistIdentity`. Keep the boolean return.
4. `removeKey(key)` calls `deleteMaterial(keyId(k))` alongside
   `repo.deleteKey(id)`.
5. Export `keyMaterialDurable(): boolean` = `materialEnabled()`.

`hydrate()` must never throw when the new table is missing: `loadMaterial`
swallows the query failure and returns an empty map.

## T4 — method gate in `src/app.ts`

Replace the single allowlist check with:

```ts
const method = c.req.method.toUpperCase();
const readOnly = method === "GET" || method === "HEAD" || method === "OPTIONS";
if (readOnly && (SHELL_PATHS.includes(adminPath) || KEY_PAGE.test(adminPath))) return next();
```

Everything else — including `POST /pengatur/keys`, `DELETE /pengatur/keys`,
`POST /pengatur/keys/test` — must fall through to the token check. Keep the
existing `403` when `ADMIN_TOKEN` is unset and `401` on mismatch.

Then add one field to the accepted response of `POST /pengatur/keys`:
`durable: keyMaterialDurable()`. When it is `false`, also include
`warning: "KEY_ENC_SECRET is not set: keys added now survive until the next cold start only."`
Do not change the `400 "No keys supplied."` contract.

## T5 — tests (bun, no live database)

`test/key-material.test.ts` — install a fake runner with `setSqlRunner`:

- round trip: `saveMaterial(id, raw)` then `loadMaterial()` returns the same
  string for that id
- the SQL parameter list passed to the runner contains **no** plaintext key —
  assert `params.every(p => typeof p !== "string" || !p.startsWith("AIza"))`
- `materialEnabled()` false when `KEY_ENC_SECRET` is deleted → `loadMaterial()`
  returns an empty map and the runner is never called
- a row whose ciphertext was tampered with (flip one base64 char) is skipped,
  the good row still decrypts

`test/gate.test.ts` — use `app.request()` from `../src/app.ts` (Hono instance,
no listener):

- `POST /pengatur/keys` with body `{}` and no `Authorization` → **401**
- `DELETE /pengatur/keys` with body `{}` and no token → **401**
- `POST /pengatur/keys` with the right `Bearer test-admin-token` and body `{}`
  → **400** (`No keys supplied.` — handler reached)
- `POST /pengatur/keys` with `{ "keys": ["AIzaGATE1"] }` + token → **200**,
  `added === 1`, `durable` present as a boolean
- `GET /pengatur/keys` with no token → **200** (shell still public)
- `GET /pengatur/keys/list` with no token → **401**

Note `test/env.ts` already sets `ADMIN_TOKEN=test-admin-token`, deletes
`DATABASE_URL` and `GEMINI_API_KEYS`. Set `process.env.KEY_ENC_SECRET` inside
`test/key-material.test.ts` before importing the module under test is not
possible (module reads env at call time, not import) — so set it at the top of
the test body with `process.env.KEY_ENC_SECRET = "test-secret"` and delete it
in the disabled-case test. Verify the real behaviour, do not stub the crypto.

## Verification you must run IN THIS SESSION before yielding

```
bun x tsc --noEmit          # rc 0
bun test                    # 0 fail; report the real pass count
bun run check               # only if tsc above is unavailable
```

Paste the real output (exit code, pass/fail counts). No "done" without it.
Do not build `api/index.js`.

## Acceptance

- `schema.sql` has the table, still idempotent, still no plaintext column.
- `grep -n "AIza" src/key-material.ts` → no match.
- `hydrate()` reads env first, material second, identity overlay last.
- `POST /pengatur/keys` tokenless is 401, not 400.
- `GET` shells stay public; data endpoints stay gated.
- Both new test files pass, whole suite green.
- Four commits minimum: `feat(storage): encrypted key material table and crypto`,
  `feat(pool): hydrate and persist raw key material`,
  `fix(admin): gate mutating verbs on console paths`,
  `test: key material durability and method gate`.