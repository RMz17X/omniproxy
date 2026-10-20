# F3 — Ledger, rollup, retention, cron

Repo: `/workspaces/geminesx`. Base: `master` at `b6bab8c`. Read `docs/PRD.md`
(§5 Schema, §6 Modules, §9 Env, §11 Acceptance, §12 Invariants) before editing.
The PRD is in Indonesian; this brief is the authoritative English spec.

## State already on disk — do not redo

F1 and F2 already landed. Present and working at the base commit:

- Brand migration complete: no `gkr` / `gemini-key-rotator` string left outside
  lockfiles and the generated `api/index.js`.
- `src/schema.sql` — DDL for `keys`, `usage_events`, `usage_daily`, `admin_audit`.
  These four tables already exist in the live Neon database with 6 indexes.
- `src/db.ts` — Neon HTTP client, query helper with timeout and breaker.
- `src/keys-repo.ts` — read/write key identities.
- `scripts/migrate.ts` — applies `src/schema.sql`.
- `src/pool.ts` — rewritten; reads pool state from `keys` instead of Upstash.
- `src/config.ts` — Upstash env gone, `DATABASE_URL` optional.
- `@neondatabase/serverless` is the only storage dependency.
- The `keys` table already holds 228 rows (one per existing Gemini key).

Treat `src/db.ts` and `src/keys-repo.ts` as drafts to extend, not as contracts
you may not touch. If a helper you need is missing, add it there.

## Goal

Implement the write path (ledger), the aggregation path (rollup), retention,
and the daily trigger. Today the gateway serves traffic but nothing is recorded
durably beyond the `keys` mirror.

## T1 — `src/ledger.ts`

New module. Absorbs what `src/usage.ts` does today (see PRD §6, `usage.ts` is
"diserap ke ledger.ts").

- In-memory ring buffer of the newest `LEDGER_TAIL_ROWS` events (default 500),
  used by the live console tail. Oldest evicted.
- `record(event)` appends and returns immediately. It must never await the
  database and must never throw into the request path.
- Batched flush to `usage_events`: flush when the pending buffer reaches
  `LEDGER_MAX_ROWS` (default 200) or when `LEDGER_FLUSH_MS` (default 2000) has
  elapsed since the first pending event.
- Overflow policy: if the pending buffer exceeds twice `LEDGER_MAX_ROWS` while
  the database is unavailable, drop the oldest pending rows and increment a
  dropped counter. The counter must be readable for metrics.
- Database failure degrades to memory-only. A failed flush must not fail the
  HTTP request that produced the event, and must not lose the ring buffer tail.
- Event fields (match `usage_events` in `src/schema.sql` exactly): `ts`,
  `req_id`, `route`, `model`, `key_id`, `status`, `attempts`, `rotated`,
  `stream`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `cost_usd`,
  `latency_ms`, `error_code`.
- Never persist a prompt or completion body, not even truncated.

## T2 — wire the ledger into the request path

- In the completion handler (`src/app.ts`) and wherever a key attempt is
  resolved (`src/pool.ts`), record exactly one `usage_events` row per completed
  request, after the response is produced.
- `key_id` is the `sha256(raw)[:12]` identifier from `keys.id`. Never the raw
  key. `route` is the request path, `model` the resolved model.
- On Vercel, schedule the flush after the response using the platform's
  post-response hook when it is available; otherwise flush on the next tick.
  The response must not be delayed by the flush.

## T3 — `src/rollup.ts`

New module. Aggregates `usage_events` into `usage_daily` for one day.

- `rollupDay(day)` recomputes the whole day from `usage_events` and upserts
  `usage_daily` on the primary key `(day, route, model, key_id)`.
- Per bucket: `requests`, `errors`, `rotated`, `prompt_tokens`,
  `completion_tokens`, `total_tokens`, `cost_usd`, `p50_ms`, `p95_ms`.
  `errors` counts rows whose `status` is an error status. `rotated` counts rows
  where `rotated` is true. p50/p95 come from `percentile_cont` over
  `latency_ms`.
- Idempotent: running it twice for the same day must converge to the same rows
  with no duplicates. Recompute-and-replace, do not increment.
- `pruneOlderThan(days)` deletes `usage_events` rows older than
  `RETENTION_DAYS` (default 30). `usage_daily` is kept.
- Day boundary is WIB (UTC+7), not UTC. A day column value of `2026-10-21`
  covers 2026-10-21T00:00+07:00 through 2026-10-22T00:00+07:00.
- `rollupDay` defaults to yesterday WIB when no day is passed.

## T4 — `POST /internal/rollup`

- New route in `src/app.ts`. Requires header `Authorization: Bearer
  <ROLLUP_TOKEN>` or `X-Rollup-Token: <ROLLUP_TOKEN>`; choose one and state
  which in your report.
- Missing or wrong token returns 401 with a JSON body. It must not return 200.
- Success runs rollup for the requested day (body or query, default yesterday
  WIB) then retention prune, then returns JSON: the day, number of buckets
  written, number of rows pruned.
- Must work when called twice in a row.

## T5 — daily trigger

- Add the cron entry to `vercel.json`: once per day. Vercel Hobby allows only
  one run per day, so do not add more. Schedule it for 02:00 WIB = 19:00 UTC
  and pass the path `/internal/rollup`.
- Do not add a keep-alive or warm-up cron. The Neon compute is allowed to
  scale to zero.

## T6 — tests

- `test/ledger.test.ts`: batching threshold flush, age-based flush, overflow
  drop-oldest behaviour, and that `record` does not await the database.
- `test/rollup.test.ts`: aggregation correctness and idempotency against a fake
  query executor, or exact SQL assertion when a fake is impractical. Use
  `test/env.ts` conventions already in the repo.
- Do not add a test that needs a live database.

## Invariants — must hold at every commit

1. No prompt or completion body is ever written to the database, the ring
   buffer, or a log line.
2. A key only ever appears as `keys.id` (12 hex chars) or in masked form
   `AIzaSy...XXXX`. No raw key in any log, metric, response body, or row.
3. `/admin` and `/models` stay 404. Console paths are not advertised anywhere.
4. With `DATABASE_URL` absent, the gateway still serves
   `/v1/chat/completions` and `/health`, and the ledger degrades to
   memory-only without throwing.
5. A database error never turns a successful upstream completion into a failed
   HTTP response.
6. Unrelated modules keep working: `src/gemini.ts`, `src/openai.ts`,
   `src/upstream.ts`, `src/probe.ts`, `src/models.ts`, `src/models-catalog.ts`
   change only for brand strings.
7. The env names are exactly the PRD §9 names: `DB_QUERY_TIMEOUT_MS` (3000),
   `LEDGER_FLUSH_MS` (2000), `LEDGER_MAX_ROWS` (200), `LEDGER_TAIL_ROWS` (500),
   `RETENTION_DAYS` (30), `ROLLUP_TOKEN`. Do not invent alternatives.
8. No new runtime dependency except what is already installed. Do not add a
   Redis, Upstash, queue, or ORM package.

## Acceptance criteria

Run these yourself before you stop. Paste the real output in your report.

1. `./node_modules/.bin/tsc --noEmit` exits 0.
2. `bun run bundle:api` succeeds and regenerates `api/index.js`.
3. `rg -i 'gkr|upstash|redis' src/ serverless/ scripts/ test/ package.json`
   returns zero hits.
4. `rg -c 'ROLLUP_TOKEN|LEDGER_FLUSH_MS|LEDGER_MAX_ROWS|LEDGER_TAIL_ROWS|RETENTION_DAYS'`
   shows every one of those names is read from config.
5. The cron block exists in `vercel.json` and contains exactly one schedule.
6. At least four local commits on the branch, each one self-describing.
7. `git log --oneline master..HEAD` lists them and the tree is clean.

## Operational rules

- Commit after each task, not in one batch at the end. A checkpoint commit costs
  seconds and protects hours of work.
- If the same tool result repeats, stop retrying it and switch tool. Use
  `cat -n` or `awk` to read a specific line range instead of re-reading a file.
- Maximum three reads per file. Read once, decide, edit.
- Do not end a turn with prose while a task is unfinished. Either edit the next
  file or commit what you have.
- Do not run `git push`. Commit locally only. The operator handles remotes.
- Do not touch `.env`, `.env.*`, or any credential file.
- Do not create a test file for UI work; T6 is backend logic only.
- Report format: a numbered list mapping each task to its commit hash and the
  exact verification command output.