# F4 — Operator console: logs, stats, keys, settings, audit

Repo: `/workspaces/geminesx`. Base: `master` at `ca92ec6`. Read `docs/PRD.md`
(§6 Modules, §7 Console pages, §11 Acceptance, §12 Invariants) before editing.
The PRD is Indonesian; this brief is the authoritative English spec.

## State already on disk — do not rebuild

- `src/admin-ui.ts` exports `ADMIN_HTML` (Overview), `src/usage-ui.ts` exports
  `USAGE_HTML` (request log tail with filters, paging and CSV export),
  `src/models-ui.ts` exports `MODELS_HTML` (model inventory).
- All three are plain string templates inlined into `src/app.ts` routes with
  `c.html(...)`. Follow that pattern; do not introduce a framework, bundler for
  the UI, or client build step.
- `src/ledger.ts` already exposes the in-memory ring plus filters, paging and
  CSV for the log tail, and `/pengatur/usage`, `/pengatur/usage/data`,
  `/pengatur/usage/export.csv` are wired.
- `src/rollup.ts` reads `usage_daily`; `src/rollup.ts:rollupDay` returns
  `{ day, buckets, ok, error }` and the internal route answers 500 on `ok:false`.
- `admin_audit` exists in `src/schema.sql` and is unused.
- The admin gate is `app.use("/pengatur/*", ...)` in `src/app.ts`: the shells
  `/pengatur`, `/pengatur/models`, `/pengatur/usage` are reachable without a
  token; every other path under `/pengatur` demands `ADMIN_TOKEN`.

## Hard rules for every task

- The nine console paths plus `/health` must answer **200**, not a redirect.
- A shell page carries no data. Its JavaScript fetches `/pengatur/*/data` with
  the token the operator pastes in; the page itself renders before any token.
- A raw key must never appear in any response body, log line, CSV cell or
  attribute. Only `keys.id` (12 hex) or `masked` (`AIzaSy...XXXX`).
- No prompt or completion body is ever rendered, stored or exported.
- No new runtime dependency. No client framework. No build step for the UI.
- Do not create test files for UI work (no DOM, snapshot, render or e2e tests).
  Backend `audit.ts` logic may be tested.

## T1 — `src/audit.ts`

New module. Persists operator actions to `admin_audit`.

- `record(action, input)` writes one row: action name, target (key id, model
  name, or empty), actor label from the request (truncated user agent or
  `api`), and a JSON detail object that must be free of secrets and of raw keys.
- Writes are fire-and-forget, same policy as the ledger: never awaited on the
  request path, never throws. A database failure must not fail the admin action
  it is recording.
- `list(filter)` returns recent rows, newest first, bounded (default 100, max
  500) with an `action` prefix filter and a `since` timestamp filter.
- Wire `record(...)` into every mutating admin route that already exists: key
  add, key delete, tier change, single key test, test-all, and the new settings
  export. Missing an existing route is a defect.

## T2 — `src/stats-ui.ts` + stats route

- New template `STATS_HTML`, served at `GET /pengatur/stats`.
- Data endpoint `GET /pengatur/stats/data?range=1h|24h|7d|30d`, bearer required.
  - `1h` and `24h` come from the in-memory ledger ring.
  - `7d` and `30d` come from `usage_daily`.
  - Returns: totals (requests, errors, rotated, tokens, cost), breakdown by
    model, by key id, by route, by status code, p50 and p95 latency, an
    hour x weekday heatmap, and a projected monthly cost from the observed daily
    mean of the selected range.
  - An empty range returns zeros and empty arrays, never an error.
- `POST /pengatur/stats/data` is not needed; keep it a GET.
- If `usage_daily` has no rows for the range, the page says so plainly instead
  of rendering an empty grid.

## T3 — `src/keys-ui.ts` + keys routes

- New template `KEYS_HTML`, served at `GET /pengatur/keys`.
- **Move the existing JSON list** from `GET /pengatur/keys` to
  `GET /pengatur/keys/list` so the page and the API stop colliding. Keep
  `POST /pengatur/keys`, `DELETE /pengatur/keys`, `POST /pengatur/keys/tier`,
  `POST /pengatur/keys/test`, `POST /pengatur/keys/test-all` exactly as they are.
- Page offers: list with id, masked key, plan, enabled, fail count, last seen;
  bulk tier set, enable/disable (via the existing tier and delete routes only if
  they actually implement it; otherwise render the control disabled and say
  why), test one, test all, add key, soft delete.
- New detail page `GET /pengatur/keys/:id` with `GET /pengatur/keys/:id/data`:
  daily request chart for that key, its 100 most recent requests from the ring,
  and a cooldown timeline. Unknown id returns 404 with a JSON error on the data
  endpoint and a plain "not found" body on the page.

## T4 — `src/settings-ui.ts` + settings routes

- New template `SETTINGS_HTML` at `GET /pengatur/settings`.
- `GET /pengatur/settings/data` returns the **effective** configuration: default
  model, default TTS model, default voice, key cooldown ms, rate window ms,
  ledger flush ms, max rows, tail rows, retention days, database region host
  suffix, and for each expected env name whether it is present — never its
  value. Token values are reported only as `set` or `unset`.
- `GET /pengatur/settings/export` returns a JSON download of that same object
  with a `Content-Disposition` attachment name of
  `geminesx-config-<YYYY-MM-DD>.json`. It must contain zero secrets: assert this
  in code by building the object from an explicit allowlist, never by spreading
  `process.env`.
- Token rotation and editing cooldown values are deploy-time actions on Vercel.
  The page states that in one line and does not pretend to write them.

## T5 — `src/audit-ui.ts` + audit route

- New template `AUDIT_HTML` at `GET /pengatur/audit`.
- `GET /pengatur/audit/data?action=&since=&limit=` returns rows newest first with
  ts, action, target, actor and detail. Bounded as in T1.
- Empty state: "no admin actions recorded yet", not a broken table.

## T6 — routing and gate

- Add the new shells to the token-free allowlist in `app.use("/pengatur/*")`:
  `/pengatur/stats`, `/pengatur/keys`, `/pengatur/settings`, `/pengatur/audit`,
  and `/pengatur/logs`.
- `GET /pengatur/logs` must serve the existing `USAGE_HTML` template with status
  200 (the request-log page already lives at `/pengatur/usage`; both paths must
  work, no redirect). Its data calls keep using `/pengatur/usage/data`.
- Every `/pengatur/*/data`, `/pengatur/*/export*` and `/pengatur/keys/:id/data`
  path stays behind the bearer check.
- `/admin` and `/models` remain 404.

## Invariants — must hold at every commit

1. No raw key anywhere. Only `keys.id` or masked form.
2. No prompt or completion body rendered, stored or exported.
3. `/admin` and `/models` stay 404. Console paths are not advertised.
4. With `ADMIN_TOKEN` unset, every shell page still returns 200 and every data
   endpoint returns 403; with a wrong token, data endpoints return 401.
5. A database failure never fails an HTTP response on the gateway path, and an
   internal console data endpoint reports `ok:false` rather than a silent zero.
6. Existing routes keep their behaviour and their response shape, except the one
   documented move of the key list to `/pengatur/keys/list`.
7. No new dependency, no client framework, no UI build step.
8. The ledger ring stays bounded; a stats request must not grow it.

## Acceptance criteria

Run these yourself before you stop and paste the real output.

1. `bun run check` exits 0 with no output.
2. `bun run bundle:api` succeeds; `git status --porcelain api/index.js` is empty
   after the rebuild, so the committed artifact matches a fresh build.
3. With `ADMIN_TOKEN` unset, `curl` each of `/pengatur`, `/pengatur/logs`,
   `/pengatur/stats`, `/pengatur/keys`, `/pengatur/settings`, `/pengatur/audit`,
   `/pengatur/models`, `/pengatur/usage` and `/health` → every one returns 200.
4. `/admin` and `/models` return 404.
5. With `ADMIN_TOKEN` set and a wrong bearer, `GET /pengatur/stats/data` returns
   401 and `GET /pengatur/settings/data` returns 401.
6. `rg -n 'AIza' src/*-ui.ts` finds no literal key material and no template
   interpolation of a raw key variable.
7. `git log --oneline master..HEAD` lists at least five self-describing commits
   and the tree is clean.

## Operational rules

- Commit after each task, not in one batch at the end.
- If the same tool result repeats, switch tool. Use `cat -n` or `awk` for a line
  range instead of re-reading a whole file. Maximum three reads per file.
- Do not end a turn with prose while a task is unfinished. Either edit the next
  file or commit what you have.
- Do not run `git push`. Commit locally only; the operator handles remotes.
- Do not touch `.env`, `.env.*`, or any credential file.
- Report as a numbered list mapping each task to its commit hash plus the exact
  verification output, including the nine status codes from criterion 3.