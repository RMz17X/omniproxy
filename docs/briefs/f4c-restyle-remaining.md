# F4c — put the four remaining console pages on the shared design system

> **Superseded.** The console was redesigned as a whole in
> `f5-console-redesign.md`. The four pages named here are on the new shared
> system now, and `src/ui.ts` was replaced there. Read
> `f5-console-redesign.md` instead.

Repo: `/workspaces/geminesx`. Base: `master` at `ca39c14`.

## State now

`src/ui.ts` is the design system and it is correct: near-monochrome tokens, one
desaturated accent, three radii, five type sizes, zero gradients, zero shadows,
zero em dashes. Three pages already consume it: `src/admin-ui.ts`,
`src/usage-ui.ts`, `src/models-ui.ts`.

Four pages are still built in the old ad-hoc style with their own inline
`<style>` blocks: `src/stats-ui.ts`, `src/keys-ui.ts`, `src/settings-ui.ts`,
`src/audit-ui.ts`. That is the visual inconsistency this task removes.

## Writable set

Exactly these eight files:

```
src/ui.ts  src/admin-ui.ts  src/usage-ui.ts  src/models-ui.ts
src/stats-ui.ts  src/keys-ui.ts  src/settings-ui.ts  src/audit-ui.ts
```

Do not edit `src/app.ts`, `api/index.js`, any backend module, or any test file.

## T1 — one nav, defined once

Add to `src/ui.ts`:

- `NAV_ITEMS`, an exported array of `{ href, label }` in this order and with
  these labels: `/pengatur` Overview, `/pengatur/logs` Logs, `/pengatur/stats`
  Statistics, `/pengatur/keys` Keys, `/pengatur/models` Models,
  `/pengatur/settings` Settings, `/pengatur/audit` Audit.
- `navBar(active)`, exported, returning the top-bar markup: the wordmark
  `geminesx` at 18px plus the links at 13px, the active one marked with a 2px
  accent underline. `/pengatur/usage` is the same page as `/pengatur/logs`, so
  passing either marks Logs active.

Then replace the hand-written nav markup in all seven templates with
`navBar("...")`. After this task no template may contain a hardcoded list of
nav links; the nav comes from `navBar` only.

## T2 — restyle the four remaining pages

For each of `stats-ui.ts`, `keys-ui.ts`, `settings-ui.ts`, `audit-ui.ts`:

- Delete the private `<style>` block, import `BASE_CSS` and `navBar` from
  `./ui.ts`, and interpolate them into the document.
- Rebuild the page body from the shared primitives: `.strip` for the
  single-line instrument strip, `.panel` for grouped content, `.table` for tabular
  data, `.badge`/`.dot` for status, `.btn`/`.btn-primary`/`.btn-danger` for
  actions, `.input`/`.select` for fields, `.state` for empty/loading/error,
  `.dialog` for any modal.
- Keep every existing `id`, class hook the JavaScript queries, fetch URL and
  control behaviour byte-identical in meaning. This is a visual pass: if a button
  posted a body before, it posts the same body after.
- Every page renders loading, empty and error states through the existing fetch
  results. An empty audit trail says so in words; it does not render an empty
  table frame.
- `/pengatur/keys` keeps its add-key form inside a `<dialog>` opened from a single
  `Add keys` button in the page header. No form controls may sit in the page body
  of that list page.
- `/pengatur` keeps its token input and connect flow. It is the entry point, so
  the auth panel stays visible until a token is accepted.

## Non-negotiables

- No gradient, no `box-shadow`, no `backdrop-filter`, no glow, no pill shape.
- Only the radii 4px, 6px and 8px. Only the sizes 11, 12, 13, 14 and 18px.
- Colours come from the `src/ui.ts` custom properties. No new colour literal
  anywhere.
- Inline SVG only. No Unicode glyph as a control.
- No em dash in any copy. English copy only.
- Keys render as the 12-char id or the masked form, truncated to one line.
- No fake numbers, no placeholder statistics, no "coming soon" filler.
- Desktop controls stay 26 to 30px; 44px only under `@media (pointer: coarse)`.

## Verification you must run and paste

1. `bun run check` exits 0 with no output.
2. `bun run bundle:api` succeeds, then `git checkout -- api/index.js` so the
   generated artifact is not committed.
3. With `ADMIN_TOKEN` unset, start the server on a spare port and `curl` these
   nine paths: `/pengatur`, `/pengatur/logs`, `/pengatur/stats`,
   `/pengatur/keys`, `/pengatur/models`, `/pengatur/settings`,
   `/pengatur/audit`, `/pengatur/usage`, `/health`. Report the status code of
   each. `/health` may answer 503 when the pool is empty, state that plainly
   instead of hiding it.
4. `rg -c 'linear-gradient|radial-gradient|backdrop-filter|box-shadow' src/*.ts`
   gives 0 for every template.
5. `rg -c '—' src/*-ui.ts` gives 0.
6. `rg -o 'border-radius: *[0-9]+px' src/ui.ts | sort -u` prints only 4px, 6px,
   8px; `rg -o 'font-size: *[0-9.]+px' src/ui.ts | sort -u` prints at most five
   values.
7. `rg -n 'pengatur/(stats|keys|settings|audit)">' src/*-ui.ts` finds no nav list
   built by hand. Every nav comes from `navBar`.
8. `git diff --stat master..HEAD` lists only the eight files in the writable set.

## Operational rules

- Commit after each page, not in one batch at the end. Four pages, at least four
  commits.
- If a tool result repeats, switch tool. Maximum three reads per file.
- Do not end a turn with prose while a page is still unstyled.
- Do not run `git push`.
- Your `node_modules` may be a broken symlink; if `bun run check` fails with
  "Too many levels of symbolic links", run `unlink node_modules && bun install`
  before anything else.
- Report: each page mapped to its commit hash, the nine status codes, and the
  output of gates 4 to 7.