# F5 — total redesign of the operator console

Repo: `/workspaces/geminesx`. Branch: `wt/console-redesign`. Base: `master` at
`2aafb9f`.

## Why this branch exists

`master` carried four different visual languages for the same console: the
three pages on `src/ui.ts`, and `stats-ui.ts`, `keys-ui.ts`, `settings-ui.ts`
and `audit-ui.ts` each with a private `<style>` block, a different accent, a
different body font and a different top bar. Three of them could not reach
each other: the main pages linked only to each other, so Statistics, Keys,
Settings and Audit were unreachable from the Overview.

This branch replaces the whole surface with one system. It is a **total
replacement** of the console look, not a port of four pages onto the old
system, so it supersedes the F4c2 brief rather than completing it.

## What changed

### One system

`src/ui.ts` is the whole design system and the only place a colour, a radius,
a font size or a control shape is written down.

- **Palette.** Near-monochrome graphite with one teal accent (`--accent:
  #4fb0c4`). Status keeps three separate hues (`--ok`, `--warn`, `--danger`)
  and is always a dot plus a word, never a painted block. Every text colour
  clears 4.5:1 on the surface it sits on.
- **Type.** Five sizes, 11 / 12 / 13 / 14 / 18px, system sans for prose and
  monospace for ids, keys, timestamps and numbers. Numbers are tabular.
- **Shape.** Three radii, 4 / 6 / 8px. No gradient, no shadow, no blur, no
  pill, no glow.
- **Layout.** A 236px left rail holds the seven console sections and the
  session footer. The page header holds the title, the one line that explains
  it and the actions that apply to the whole view. Under it, an instrument
  strip of label and value pairs separated by hairlines, then panels.
- **Responsive.** Under 1024px the rail becomes a sticky top bar with a
  horizontally scrolling section strip; under 768px every table folds into
  labelled rows, so no table ever scrolls sideways on a phone.

### One client runtime

`CLIENT_JS` in `src/ui.ts` is the browser side of the system: one token store,
one `api()` helper with a single error shape, one gate behaviour, one set of
formatters, one DOM helper that never parses a value as markup. The eight
page scripts no longer each carry their own copy of that code.

`consolePage()` builds the document: head, landmarks, skip link, rail, page
header. No template may build its own shell.

### Per page

| Page | What it is now |
|---|---|
| `/pengatur` Overview | Health strip, pool table with plan control, plan breakdown, pool level actions, add keys in a dialog |
| `/pengatur/logs` Logs | Totals strip, filter toolbar, three breakdowns, request log with pager, CSV export |
| `/pengatur/stats` Statistics | Range segmented control, totals strip, hour by weekday heatmap with legend, values toggle and peak line, four breakdowns |
| `/pengatur/keys` Keys | Bulk console: row selection, plan for the whole selection, probe, remove, search, filter, pager, per key detail link |
| `/pengatur/keys/:id` | Counters, daily request bars, cooldown timeline, recent requests |
| `/pengatur/models` Models | Plan segmented control, search, capability filter, live list, per model probe |
| `/pengatur/settings` Settings | Read only configuration: defaults, limits, ledger, storage, environment, caveats |
| `/pengatur/audit` Audit | Filter toolbar, the trail, empty state in words |

### Production readiness

- Skip link, landmarks, `aria-current` on the active section, `aria-live` on
  every status message, `aria-busy` on a button while it works.
- Visible focus ring on every control, `prefers-reduced-motion` honoured.
- Touch targets grow to 44px under `pointer: coarse`.
- Every page renders loading, empty and error states from the real fetch
  result. An empty result never leaves a table frame behind.
- Upstream error bodies are trimmed to one line and capped, so a failure
  reads as a message and not as a JSON dump.
- No control is decorative: the enable and disable buttons that had no route
  behind them are gone.
- `noindex` on every console page, one favicon set, one document title shape.

## Non-negotiables, still enforced

- No gradient, no `box-shadow`, no `backdrop-filter`, no glow, no pill shape.
- Only the radii 4px, 6px and 8px. Only the sizes 11, 12, 13, 14 and 18px.
- Colours only from the `src/ui.ts` custom properties.
- Inline SVG only, no Unicode glyph as a control, no emoji.
- No em dash, English copy only.
- Keys render as the 12 char id or the masked form, truncated to one line.
- No fake numbers, no placeholder statistics, no "coming soon" filler.

## Verification

1. `bun run check` exits 0 with no output.
2. `bun test` passes 39 tests across 6 files.
3. `bun run bundle:api` succeeds; `api/index.js` is restored afterwards, the
   operator rebuilds it once this branch merges.
4. With `ADMIN_TOKEN` unset, all nine console paths answer 200 and `/health`
   answers 503 for an empty pool.
5. `rg -c 'linear-gradient|radial-gradient|backdrop-filter|box-shadow' src/*.ts`
   is 0 for every file.
6. `rg -c '—' src/*-ui.ts src/ui.ts` is 0.
7. `rg -n '[▶❚✕🔊★⚙→]' src/*-ui.ts src/ui.ts` finds nothing.
8. `rg -o 'border-radius: *[0-9]+px' src/ui.ts | sort -u` prints 4px, 6px,
   8px. `rg -o 'font-size: *[0-9.]+px' src/ui.ts | sort -u` prints 11px,
   12px, 13px, 14px, 18px.

## Merging

This branch replaces the console files of `wt/console-restyle-2` and
`wt/ui-system-restyle`. Merge it last and take its version of
`src/ui.ts`, `src/admin-ui.ts`, `src/usage-ui.ts`, `src/models-ui.ts`,
`src/stats-ui.ts`, `src/keys-ui.ts`, `src/settings-ui.ts`, `src/audit-ui.ts`
and `src/favicon.ts`. `src/app.ts` and every backend module are untouched, so
no route, payload or behaviour changes.
