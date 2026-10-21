# F4c2 — finish the console restyle

> **Superseded.** The console was redesigned as a whole in
> `f5-console-redesign.md`. `src/ui.ts` was replaced there, so the writable
> set, the primitives and the layout this brief describes no longer match the
> code. Read `f5-console-redesign.md` instead.

Repo: `/workspaces/geminesx`. Base: `master` at `4b92299`.

## What already exists

`src/ui.ts` is complete and correct. It exports `BASE_CSS`, `stateBlock(kind, message)`,
`NAV_ITEMS` (seven destinations) and `navBar(active)`, plus a `.heatgrid` primitive
for a weekday by hour heatmap. Three pages already consume it: `src/admin-ui.ts`,
`src/usage-ui.ts`, `src/models-ui.ts`.

Four pages are still old-style with their own inline `<style>`:
`src/stats-ui.ts`, `src/keys-ui.ts`, `src/settings-ui.ts`, `src/audit-ui.ts`.

## Writable set

```
src/stats-ui.ts  src/keys-ui.ts  src/settings-ui.ts  src/audit-ui.ts
src/admin-ui.ts  src/usage-ui.ts  src/models-ui.ts
```

Do not edit `src/ui.ts` unless a primitive is genuinely missing, and then add it
there instead of inlining CSS in a template. Do not edit `src/app.ts`,
`api/index.js`, any backend module, or any test.

## T1 — one nav, everywhere

Replace the hand-written top-bar markup in all seven templates with
`<${navBar("/pengatur/xxx")}>` for that page's path. After this task no template
may contain a hardcoded list of nav links.

## T2 — restyle the four remaining pages

For `stats-ui.ts`, `keys-ui.ts`, `settings-ui.ts`, `audit-ui.ts`:

- Drop the private `<style>` block. Import `BASE_CSS`, `navBar`, `stateBlock` and
  interpolate them.
- Compose the body from the shared primitives only: `.strip` for a single-line
  instrument strip, `.panel` and `.panel-title` for grouping, `.table` for
  tabular data, `.badge` and `.dot` for status, `.btn`, `.btn-primary`,
  `.btn-danger`, `.input`, `.select`, `.state`, `.dialog`, `.heatgrid`.
- Keep every existing `id`, JavaScript hook, fetch URL and control behaviour
  identical in meaning. A button that posted a body still posts the same body.
- Loading, empty and error states render through `stateBlock` off the real fetch
  results. An empty audit trail says so in words, never an empty table frame.
- `/pengatur/keys`: the add-key form lives inside a `<dialog>` opened from one
  `Add keys` button in the page header. No `<input>` may sit in the page body.
- `/pengatur/stats`: the heatmap uses `.heatgrid`; show the p50 and p95 figures
  and the monthly cost projection the data endpoint already returns.
- `/pengatur/settings`: read-only. The export button downloads
  `/pengatur/settings/export`. Say in one line that tokens and cooldown values are
  changed at deploy time on Vercel, and do not render a fake save button.
- `/pengatur/audit`: table of ts, action, target, actor, detail. Empty state in
  words.

## Non-negotiables

- No gradient, no `box-shadow`, no `backdrop-filter`, no glow, no pill shape.
- Only radii 4px, 6px, 8px. Only font sizes 11, 12, 13, 14, 18px.
- Colours only from the `src/ui.ts` custom properties.
- Inline SVG only, no Unicode glyph as a control. No em dash. English copy.
- Keys render as the 12-char id or the masked form, truncated to one line.
- No fake numbers, no placeholder statistics, no "coming soon" filler.
- Desktop controls 26 to 30px, 44px only under `@media (pointer: coarse)`.

## Verification you must run and paste

1. `bun run check` exits 0 with no output.
2. `bun run bundle:api` succeeds, then `git checkout -- api/index.js`.
3. With `ADMIN_TOKEN` unset, start the server on a spare port and report the
   status of all nine console paths plus `/health`. State plainly if `/health`
   answers 503 for an empty pool.
4. `rg -c 'linear-gradient|radial-gradient|backdrop-filter|box-shadow' src/*-ui.ts`
   is 0 for every template. `rg -c '—' src/*-ui.ts` is 0.
5. `git diff --stat master..HEAD` lists only the seven template files.

## Operational rules

- Commit after each page. Four pages, at least four commits before you stop.
- If a tool result repeats, switch tool. Maximum three reads per file.
- Never end a turn with prose while a page is unstyled.
- Do not run `git push`.
- If `bun run check` fails with "Too many levels of symbolic links", run
  `unlink node_modules && bun install` first.
- Report each page mapped to its commit hash, the nine status codes, and gates 4
  and 5.