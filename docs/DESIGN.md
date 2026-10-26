# OmniProxy console design direction

Reference for `/pengatur`. Code lives in `src/ui.ts` (`BASE_CSS`); this file says
what the system is and which decisions are load-bearing, so a future change does
not have to reverse-engineer them.

Dials: **ENERGY 1 (calm) / RHYTHM 2 (balanced) / MOTION 1 (hover only)**.
An operator tool, not a landing page. The data is the loudest thing on screen.

## Surface

- Light is the default dashboard; dark is an explicit toggle. Both must pass at
  every breakpoint.
- One accent: black on light, white on dark. Provider hues are identity, never
  decoration, and always appear with the provider word.
- No gradients, no glow, no background patterns. One shadow for dialogs, one
  for toasts. The sticky header is the only blurred surface.

## Layout

- Full bleed. The sidebar owns a fixed 232px column; the canvas owns the rest.
  No page max-width.
- Tokens: `--gutter` 28/24/16, `--sp-1..6` (4/8/12/16/24/48), `--tap` 32,
  `--tap-sm` 28. Layout tokens live on `:root` only. Repeating them inside a
  theme selector outranks every media query.
- Breakpoints: 1400 (gutter), 1100 (sidebar becomes the drawer), 720 (tables
  fold), 400 (KPI 2-up collapses).
- Grids use `auto-fit` floors so wide screens gain columns. Any floor wider
  than the phone breakpoint must be re-asserted inside `@media (max-width: 720px)`,
  because `:has()` beats a plain class selector.

## Tables

- Sticky header, row hover, mono for ids and keys.
- Registry tables keep one line per row. The Base URL column is the only cell
  allowed to ellipsize; the full value lives in the title.
- Below 720px a table becomes labelled blocks. `thead` is hidden, each `td`
  shows its `data-l` label, row height is `auto`.
- The action column stays reachable: it is natural width, and sticky right
  between 720 and 1400.

## Dialogs

- A sheet, not a floating card: fixed head, scrolling body, pinned foot.
- Width 620, `.wide` 960. The `<form>` inside a dialog is the flex column that
  shrinks; without it the footer leaves the viewport on a phone.
- Add/Edit provider uses a 5fr/7fr split with `.form-section` blocks.
- First field receives focus. Escape closes. The native dialog provides the
  focus trap and restores focus on close.

## Type and colour

- Sans for prose, mono for ids, keys, model names and numbers.
- Type scale 11 / 12 / 12.5 / 13 / 14 / 16 / 24.
- Radii: 6 controls, 8 cards, 12 dialogs, 999 pills.
- Muted text (`--text-3`) must clear 4.5:1 on `--surface`, `--surface-2` and
  the canvas. Current values: `#6b6b6b` light, `#8a8a8a` dark.
- Provider text colours must clear 4.5:1 on their own wash, not just on white.

## Copy

- No em dashes. Comma, colon, or parentheses.
- Specific verbs: "Purge dead", "Test all", "Add keys". No "Get started".
- Empty, loading and error states are part of the design, not an afterthought.
  A dead control is a bug.
