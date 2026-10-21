# F6 — Durable key material (plaintext), method gate

Repo: `/workspaces/geminesx` (bun + Hono, deployed on Vercel + Neon).
Branch: cut `wt/f6-key-material` from `master`. Commit per task. Do not push.

## Why

Raw key material lives only in `GEMINI_API_KEYS`. `addKey()` puts the raw value
into the in-memory map and `persistIdentity()` writes only `sha256[:12]` plus the
masked form into `keys`. A key pushed by an external hunter is therefore lost on
the next cold start, silently, while its `keys` row lingers forever.

Second defect, same file: the `/pengatur/*` middleware treats `SHELL_PATHS` as an
allowlist for **every method**. `POST /pengatur/keys` is a shell path, so a
tokenless POST reaches the handler. Proven in production: `POST {}` answers
`400 "No keys supplied."` (handler reached) while `GET /pengatur/keys/list`
answers `401` (gate).

Both must be fixed in this phase. Nothing else.

## Storage decision: plaintext, no encryption

Store the raw key in Postgres. Do **not** add AES, GCM, a KDF, or any new secret
environment variable. An encryption key would sit in the same Vercel environment
as `DATABASE_URL`, so it protects nothing operationally while adding a whole
class of failure (rotate the secret, every stored key becomes undecryptable).
The console is single-operator and the database is Neon managed Postgres.

Consequence to accept and state in `docs/F6.md`: anyone who can read the
`key_material` table can read every live API key. That is the trade, taken
deliberately. Do not quietly reintroduce crypto.

No new dependency. No `node:crypto` import in `src/key-material.ts`.

## Scope fence — writable files ONLY

```
src/schema.sql            (add one table)
src/key-material.ts       (new)
src/pool.ts               (hydrate, addKey, removeKey)
src/app.ts                (gate method check + one import + response field)
test/key-material.test.ts (new)
test/gate.test.ts         (new)
docs/F6.md                (new, short)
```

**Forbidden:** `src/*-ui.ts`, `src/ui.ts`, `api/index.js` (the bundle is built
after merge by the operator), `serverless/*`, `vercel.json`, `test/*` other than
the two new files, `scripts/*`, `.gitignore`, `README.md`, `src/settings.ts`.

Do not reformat untouched code. Minimal diff.

## T1 — module `src/key-material.ts`

```ts
export function materialEnabled(): boolean                 // dbEnabled()
export async function loadMaterial(): Promise<Map<string, string>>  // id -> raw
export function saveMaterial(id: string, raw: string): void // sqlLater upsert
export function deleteMaterial(id: string): void            // sqlLater delete
```

Rules:

- `materialEnabled()` delegates to `dbEnabled()` from `./db`. No env var of its
  own.
- `loadMaterial()` runs `select id, raw_key from key_material` through `sql()`
  from `./db`. On `ok: false` (disabled, timeout, breaker, error) it returns an
  empty map and logs one `log("warn", "key_material.load_failed", { reason })`
  line. It never throws.
- Rows with an empty or whitespace-only `raw_key` are skipped.
- `saveMaterial` and `deleteMaterial` use `sqlLater` (fire and forget), the same
  contract as `persistIdentity` in `pool.ts`. Never `await` them on the request
  path.
- Upsert statement:

  ```sql
  insert into key_material (id, raw_key) values ($1, $2)
  on conflict (id) do update
    set raw_key = excluded.raw_key, updated_at = now()
  ```

- Never log the raw value. `grep -n "raw" src/key-material.ts` may show the
  column name; no log call may pass a key through.

## T2 — schema

Append to `src/schema.sql`:

```sql
create table if not exists key_material (
  id         text primary key,          -- sha256(raw)[:12], joins keys.id
  raw_key    text not null,             -- stored as-is, NOT encrypted
  updated_at timestamptz not null default now()
);
```

Keep the file idempotent. Do not touch the existing tables.

## T3 — pool integration

In `src/pool.ts`:

1. Add an internal `seed(key: string)` holding the body of today's env loop
   (insert into `local` when absent, using `blank(key)`).
2. `hydrate()` seeds from `GEMINI_API_KEYS` via `seed()`, then when
   `materialEnabled()` awaits `loadMaterial()` and `seed()`s every value not
   already present, then runs the existing identity overlay unchanged. Add
   `material: n` to the existing `pool.hydrated` payload.
3. `addKey(key)` calls `saveMaterial(keyId(k), k)` alongside the existing
   `persistIdentity(st)`. Keep the boolean return and the `false` for an
   already-present healthy key.
4. `removeKey(key)` calls `deleteMaterial(keyId(k))` alongside
   `repo.deleteKey(id)`.
5. Export `keyMaterialDurable(): boolean` = `materialEnabled()`.
6. `hydrate()` must not throw when the table is missing; `loadMaterial()`
   already swallows that.

## T4 — method gate in `src/app.ts`

Replace the single allowlist check (currently line 116) with:

```ts
const method = c.req.method.toUpperCase();
const readOnly = method === "GET" || method === "HEAD" || method === "OPTIONS";
if (readOnly && (SHELL_PATHS.includes(adminPath) || KEY_PAGE.test(adminPath))) return next();
```

Everything else, including `POST /pengatur/keys`, `DELETE /pengatur/keys`,
`POST /pengatur/keys/test` and `POST /pengatur/keys/test-all`, must fall through
to the token check. Keep `403` when `ADMIN_TOKEN` is unset and `401` on
mismatch.

Then in the accepted response of `POST /pengatur/keys` add `durable:
keyMaterialDurable()`. When it is `false`, also add `warning: "KEY_MATERIAL is
not durable: keys added now survive until the next cold start only."`.

Do not change the `400 "No keys supplied."` contract.

Do not add an `/admin/keys` alias. That path must stay 404; the hunter is patched
on its own side.

## T5 — tests (bun, no live database)

`test/key-material.test.ts`, install a fake runner with `setSqlRunner`:

- round trip: `saveMaterial("abc123", "AIzaPLAIN1")`, then `loadMaterial()`
  returns `abc123 -> AIzaPLAIN1`
- the upsert parameters are exactly `["abc123", "AIzaPLAIN1"]` and the query
  text contains `on conflict (id) do update`
- `loadMaterial()` with a runner returning `{ ok: false, reason: "disabled" }`
  returns an empty map and does not throw
- a row with `raw_key: "   "` is skipped, a good row next to it still loads
- `deleteMaterial` issues a `delete from key_material` with the id parameter

`test/gate.test.ts`, use `app.request()` from `../src/app.ts` (Hono instance, no
listener):

- `POST /pengatur/keys` body `{}` no `Authorization` -> **401**
- `DELETE /pengatur/keys` body `{}` no token -> **401**
- `POST /pengatur/keys` with `Bearer test-admin-token` body `{}` -> **400**
  (`No keys supplied.`, handler reached)
- `POST /pengatur/keys` with `{ "keys": ["AIzaGATE1"] }` plus token -> **200**,
  `added === 1`, `durable` present as a boolean
- `GET /pengatur/keys` no token -> **200** (shell still public)
- `GET /pengatur/keys/list` no token -> **401**

`test/env.ts` already sets `ADMIN_TOKEN=test-admin-token` and deletes
`DATABASE_URL` and `GEMINI_API_KEYS`. `materialEnabled()` reads env at call
time, so a test that needs it true sets `process.env.DATABASE_URL` to any
non-empty string inside the test body and restores it afterwards.

## Verification you must run IN THIS SESSION before yielding

```
bun x tsc --noEmit          # rc 0
bun test                    # 0 fail; report the real pass count
```

Paste the real output (exit code, pass/fail counts). No "done" without it.
Do not build `api/index.js`.

## Acceptance

- `schema.sql` has `key_material` with a `raw_key` column and no `ciphertext`,
  `iv` or `tag` column.
- `grep -nE "createCipheriv|createDecipheriv|node:crypto" src/key-material.ts`
  -> no match.
- `hydrate()` reads env first, material second, identity overlay last.
- `POST /pengatur/keys` tokenless is 401, not 400.
- `GET` shells stay public; data endpoints stay gated.
- Both new test files pass, whole suite green.
- `docs/F6.md` states that raw keys are stored unencrypted and why.
- Four commits minimum:
  `feat(storage): key_material table and plaintext material store`,
  `feat(pool): hydrate and persist raw key material`,
  `fix(admin): gate mutating verbs on console paths`,
  `test: key material durability and method gate`.