# F1 brief - brand migration and Neon storage scaffold

Atomic objective: complete work unit F1 from `docs/PRD.md`. Rename the brand to
`geminesx` everywhere, regenerate the serverless bundle, and add the Postgres
storage layer with `DATABASE_URL` OPTIONAL. No live database credentials are
required for this unit; a missing `DATABASE_URL` must degrade gracefully instead
of crashing.

One branch, tests green, local commits only. Do NOT push to any remote.

## A. Brand migration (13 source files plus generated bundle)

Replace every occurrence of the token `gkr` and the string `gemini-key-rotator`
with `geminesx`, in these files only:

- `src/openai.ts` (6 occurrences), `src/gemini.ts` (6), `test/env.ts` (5),
  `src/pool.ts` (4), `scripts/sync-hajimi.ts` (4), `src/models-ui.ts` (3),
  `src/usage-ui.ts` (2), `src/app.ts` (2), `test/probe.test.ts` (1),
  `src/index.ts` (1), `src/admin-ui.ts` (1), `serverless/index.ts` (1),
  `README.md` (1)
- `package.json`: the `name` field becomes `geminesx`.

Naming rules that must hold exactly:

- Response header prefix `x-gkr-attempts` becomes `x-geminesx-attempts`. Any
  other response header carrying the old prefix is renamed the same way.
- Log prefix `[gkr]` becomes `[geminesx]`, including the unhandled-error line
  in `src/app.ts`.
- CSV export filename `gkr-usage-<date>.csv` becomes `geminesx-usage-<date>.csv`.
- The `service` field in the health and metrics payloads becomes `geminesx`
  (two call sites, both in `src/app.ts`).
- The human-readable product name is `GeminesX` wherever a display name is
  rendered: page titles, console headers, and the README heading.

`api/index.js` is a generated esbuild artifact (`bun run bundle:api` from
`serverless/index.ts`). Do NOT hand-edit it. Regenerate it and confirm the new
file contains no `gkr` token.

`bun.lock` and `package-lock.json` are lockfiles. Only the `name` field may
change there; do not otherwise rewrite them.

## B. Storage layer with OPTIONAL DATABASE_URL

Add dependency `@neondatabase/serverless`. New module `src/db.ts`:

- Reads `DATABASE_URL`. When the variable is absent or empty, export a null
  client and a `dbEnabled()` predicate that returns false. Every call site must
  treat a disabled database as a normal, expected state, not an error.
- When present, build the client with the HTTP driver. Expose
  `sql(query, params, {timeoutMs})` returning rows.
- Enforce `DB_QUERY_TIMEOUT_MS` (default 3000) per query. On timeout or error,
  log one line WITHOUT the connection string and return a typed failure.
- A simple circuit breaker: after 5 consecutive failures, stop issuing queries
  for 60 seconds, then allow one probe.

Add `src/schema.sql` containing exactly the four tables and four indexes defined
in section 5 of `docs/PRD.md`. Provide `bun run db:migrate` which executes that
file when `DATABASE_URL` is set and prints a clear skip message when it is not.

New module `src/keys-repo.ts`:

- `loadKeys()` returns rows from the `keys` table ordered by `id`. When the
  database is disabled, it returns an empty list and the caller falls back.
- `upsertKey(identity)`, `setEnabled(id, boolean)`, `setPlan(id, plan)`,
  `touchLastSeen(id)`, `bumpFailCount(id)`.
- Every statement is parameterised. No string interpolation into SQL, ever.

Refactor `src/pool.ts`:

- Remove `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
  `REDIS_BREAKER_MS`, and `POOL_CACHE_TTL_MS` usage completely.
- Cold start path: when the database is enabled, seed the in-memory mirror from
  `loadKeys()`. When disabled, build the mirror from `GEMINI_API_KEYS` exactly
  as today. Both paths keep the same in-memory record shape.
- Runtime behaviour is unchanged: cooldown, pacing window, failure counting and
  rotation all stay in memory. Persistence of `last_seen_at` and `fail_count` is
  fire-and-forget and MUST NOT block or fail a request.
- Critical path rule: no database query may sit between an incoming request and
  the upstream call. Load once at cold start, write asynchronously afterwards.

New module `src/ledger.ts`:

- Keeps the existing in-memory ring buffer that serves the live tail view.
- Adds a batch writer that, when the database is enabled, flushes buffered rows
  to `usage_events` as a single multi-row INSERT after the response is sent
  (the runtime's `waitUntil`, or `queueMicrotask` fallback). Flush triggers on
  `LEDGER_FLUSH_MS` (2000) or `LEDGER_MAX_ROWS` (200), whichever comes first.
- `LEDGER_TAIL_ROWS` (default 500) bounds the in-memory tail.
- A failed flush drops those rows and logs one line. It never throws into the
  request path and never retries in a loop.
- Prompt and completion BODY TEXT is never written to any column. Only the
  numeric columns, identifiers, status, and timing defined in the schema.
- `src/usage.ts` is superseded by this module. Delete `src/usage.ts` only after
  every import of it has been repointed; if any import remains, keep the file.

New module `src/rollup.ts`:

- `POST /internal/rollup` guarded by `ROLLUP_TOKEN` (constant-time compare).
  Missing or wrong token returns 401. No token configured returns 403.
- Aggregate the previous UTC day from `usage_events` into `usage_daily`,
  computing `p50_ms` and `p95_ms` with `percentile_cont`.
- Delete `usage_events` rows older than `RETENTION_DAYS` (default 30).
- Returns a JSON summary: day processed, groups written, rows deleted.
- Register it in `vercel.json` as one daily cron entry. Hobby allows a single
  daily schedule; use `0 19 * * *` (02:00 Asia/Jakarta).

New module `src/audit.ts`:

- `recordAdminAction(actor, action, target, detail)` inserting into
  `admin_audit`. Fire-and-forget, never blocking. Called from the existing key
  mutation routes in `src/app.ts`.

Validation: invalid input on any new route returns 400. Missing admin bearer on
the key routes returns 401. Do not add a new validation dependency; reuse the
existing manual checks already present in `src/app.ts`.

## C. Configuration

`src/config.ts` gains, all optional:

- `DATABASE_URL` (unset disables the whole persistence layer)
- `DB_QUERY_TIMEOUT_MS` = 3000
- `LEDGER_FLUSH_MS` = 2000
- `LEDGER_MAX_ROWS` = 200
- `LEDGER_TAIL_ROWS` = 500
- `RETENTION_DAYS` = 30
- `ROLLUP_TOKEN` (unset disables the rollup route)

`src/config.ts` loses `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`REDIS_BREAKER_MS`, `POOL_CACHE_TTL_MS`. Remove them from `.env.example` too and
add the new keys with the defaults above and empty values where required.

## D. Verification required INSIDE this session, with real output pasted back

1. `bunx tsc --noEmit` exits 0.
2. `bun run bundle:api` regenerates `api/index.js`.
3. `rg -i -g '!*.lock' -g '!api/index.js' 'gkr' .` returns zero matches.
   Then confirm the NEW `api/index.js` also has zero `gkr` matches.
4. Boot smoke test WITHOUT `DATABASE_URL`:
   `PORT=3999 ADMIN_TOKEN=testadmin CLIENT_TOKEN=testclient GEMINI_API_KEYS=testkey bun run src/index.ts`
   started in the background, then `curl -s -o /dev/null -w '%{http_code}'`
   against `/health`, `/pengatur`, `/pengatur/models`, `/pengatur/usage`,
   `/favicon.ico`, and confirm `/admin` and `/models` both return 404. Report the
   actual status code for each path. Kill the process afterwards.
5. Confirm no `process.env.UPSTASH` reference remains anywhere in `src/`.

Report every file changed, and paste the raw command output for items 1 through
5. A claim without the pasted output is rejected.

## E. Invariants - must not break

- `/admin` and `/models` MUST still return 404. Do not restore any redirect.
- No secret, token, key, or connection string may appear in any log line.
- API keys are always displayed masked; never log or render a full key.
- Prompt and completion body text is never persisted.
- `/pengatur/keys` and every mutating key route still require the admin bearer.
- `/internal/rollup` requires `ROLLUP_TOKEN` and is not reachable without it.
- Upstream Gemini call behaviour, model catalog, and probe logic are unchanged.
- The gateway MUST start and serve traffic with `DATABASE_URL` unset.

## F. Build and verify commands

```
cd /workspaces/geminesx
bunx tsc --noEmit
bun run bundle:api
rg -i -g '!*.lock' -g '!api/index.js' 'gkr' .
git status --porcelain
git add -A && git commit -m "<conventional message>"
```

Commit locally on the worktree branch. Do NOT push.