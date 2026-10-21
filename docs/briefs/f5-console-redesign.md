# F5 — the operator console as a product

Repo: `/workspaces/geminesx`. Branch: `master`. Base: `9df2c3f`.

This supersedes `f4c-restyle-remaining.md` and `f4c2-restyle-finish.md`.

## The problem with the previous console

Every page wore the same grey box: a strip of counters, a panel with a
border, a table underneath. Seven pages, one layout, no hierarchy, no
visualisation of the data, and a lot of empty space. The Overview was a table
with a heading. It read like a prototype of a dashboard, not like a product.

## The direction

A **product console**, chosen over a dense terminal and over a light airy
theme. Three reference screens were built first, compared, and the product
one was picked:

- the surface is near-monochrome (`#0b0d12` page, `#12151c` card)
- one near-white accent marks the active section and the primary action
- **colour is reserved for status**: ready green, cooling amber, dead red,
  informational teal
- hierarchy comes from type size and space, never from painted boxes
- every page gets a purpose built layout, not the same stack of panels

## What is in the system

`src/ui.ts` holds the tokens, the stylesheet, the shell and the browser
runtime. The seven templates only describe their own content.

### Shell

A top bar: brand and mark, the seven sections as a switcher, the session and
storage state as pills, and the actions of the current page. Below it the
page head with the title, one line of explanation and the update time.

### Components that carry meaning

| Component | What it is for |
|---|---|
| `.donut` | The pool split, ready / cooling / dead, as a ring |
| `.kpi` | A figure with a label and one line of context |
| `.facts` | The counters that belong next to a ring |
| `.chips` | Facts that do not deserve a card |
| `.meter` | A proportion with a label and a count |
| `.attn-item` | Something that needs the operator, with a way to open it |
| `.feed-item` | A trail of actions, newest first |
| `.tag` | Status as a dot plus a word, never a painted block |
| `.seg` | A segmented control for a small set of choices |
| `.table` | Dense tables with tabular numbers |

### Client runtime

`CLIENT_JS` is the browser side of the system: one token store, one `api()`
helper with one error shape, one gate, one set of formatters, one DOM helper
that never parses a value as markup, and the builders for the components
above.

## Per page

| Page | Layout |
|---|---|
| `/pengatur` Overview | Pool health ring and counters, a needs attention list, four traffic figures, the pool table, the plan mix, the activity feed |
| `/pengatur/logs` Logs | Six figures, the filters, three full width breakdowns, the request log with its pager |
| `/pengatur/stats` Statistics | Range control in the page head, six figures, the heatmap with a legend and a peak line, three breakdowns |
| `/pengatur/keys` Keys | Five figures, the full table with bulk tools, a pager |
| `/pengatur/keys/:id` | Seven counters, the daily bars beside the cooldown timeline, the recent requests |
| `/pengatur/models` Models | Five figures, search and plan control, the live inventory |
| `/pengatur/settings` Settings | Five figures, defaults and limits side by side, ledger and environment side by side, the caveats |
| `/pengatur/audit` Audit | Three figures, the filters, the trail as a feed |

## Rules

- No decorative gradient, no shadow, no blur, no glow. The only gradients are
  the pool ring and the heatmap, where the colour is the data.
- Radii: 4, 6, 7, 10, 12 and pills for tags and chips.
- Type: 11, 12, 13, 14, 16, 18, 20, 26, 28. A product console needs a wider
  scale than a control panel, because hierarchy has to be visible.
- Colours only from the `src/ui.ts` custom properties.

### Spacing

One scale, declared once and used everywhere:

| Token | Value | Used for |
|---|---|---|
| `--sp-1` | 4px | inside a control, between a label and its value |
| `--sp-2` | 8px | between controls, between a table cell and its content |
| `--sp-3` | 12px | inside a card band, between a field and its label |
| `--sp-4` | 16px | the one horizontal inset: card padding, table cells |
| `--sp-5` | 20px | between cards in a grid |
| `--sp-6` | 24px | between the bands of a page |
| `--sp-7` | 32px | the bottom of the page, an empty state |

`--inset: 16px` is shared by the card padding, the table cells and the page
padding, so a table's first column sits exactly under the card title. No
padding or gap outside the scale, and the only exceptions are a browser
default (the `<option>` box) and the hairline seams of the segmented
controls.

The page bands are separated by 24px, the inside of a card by 12 to 16px, and
the tight pairs (a label and its value) by 4 to 8px. That contrast is the
rhythm: tight where things belong together, generous where they do not.
- Inline SVG only, no Unicode glyph as a control, no emoji.
- No em dash, English copy only.
- Keys render as the 12 char id or the masked form, truncated to one line.
- No fake numbers, no placeholder statistics, no "coming soon" filler.
- Every figure comes from a real endpoint. When an endpoint cannot answer,
  the figure says so instead of showing a zero.

## Production readiness

- Skip link, landmarks, `aria-current` on the active section, `aria-live` on
  every status message, `aria-busy` on a button while it works.
- Visible focus ring on every control, `prefers-reduced-motion` honoured.
- Touch targets grow to 44px under `pointer: coarse`.
- Responsive down to 320px: the section strip scrolls, the hero stacks, the
  figures go two by two, every table folds into labelled rows.
- Every page renders loading, empty and error states from the real fetch
  result. An empty result never leaves a table frame behind.
- An upstream error body is reduced to one sentence before it is shown.
- No control is decorative: the enable and disable buttons that had no route
  behind them are gone.
- `noindex` on every console page, one favicon set, one document title shape.

## Verification

1. `bun run check` exits 0 with no output.
2. `bun test` passes 39 tests across 6 files.
3. `bun run bundle:api` succeeds and the artefact is committed, so a deploy
   ships the same console the source holds.
4. With `ADMIN_TOKEN` unset, all nine console paths answer 200 and `/health`
   answers 503 for an empty pool.
5. `rg -c 'linear-gradient|radial-gradient|backdrop-filter|box-shadow' src/*.ts`
   is 0 for every file.
6. `rg -c '—' src/*-ui.ts src/ui.ts` is 0.
7. `rg -n '[▶❚✕🔊★⚙→]' src/*-ui.ts src/ui.ts` finds nothing.
8. `rg -n 'AIza' src/*-ui.ts` finds nothing.
9. Every page was checked in Chrome at 1440 and 390 pixels wide.
