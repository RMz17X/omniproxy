# Design system + restyle of the three existing console pages

Repo: `/workspaces/geminesx`. Base: `master` at `181d244`.

## Scope fence — read this first

Another agent is concurrently building five *new* console modules in this repo on
its own branch (`stats-ui.ts`, `keys-ui.ts`, `settings-ui.ts`, `audit-ui.ts`, and
the `/pengatur/logs` alias). To avoid a merge collision:

- **Do not edit `src/app.ts`.** Not one line. Route registration is out of scope.
- **Do not create** `src/stats-ui.ts`, `src/keys-ui.ts`, `src/settings-ui.ts`,
  `src/audit-ui.ts`, `src/audit.ts`.
- **Do not edit** `src/pool.ts`, `src/ledger.ts`, `src/rollup.ts`, `src/db.ts`,
  `src/keys-repo.ts`, `src/config.ts`.
- Your writable set is exactly: `src/ui.ts` (new), `src/admin-ui.ts`,
  `src/usage-ui.ts`, `src/models-ui.ts`.

The three templates already export one HTML string each and are served as-is.
They may `import` from `src/ui.ts`; that is why this task needs no `app.ts` edit.

## The problem

The current UI is three ad-hoc dark pages, each carrying its own inline `<style>`
with different colours, spacing and shapes, no shared tokens, default system
fonts, a card for everything, and controls with no consistent height. It reads as
a prototype, not a console.

## Design direction

**Reading this as:** an operations console for a key router, used by one operator
for long sessions at a workstation. Dial **ENERGY 1 / RHYTHM 2 / MOTION 1**.

The brief is restraint. Nothing decorative, nothing loud, no costume. If an
element does not carry information, it does not get a background, a border, a
shadow, or a colour.

### Palette (near-monochrome, one accent)

Define these as CSS custom properties on `:root` in `src/ui.ts`. No other colour
literals anywhere in the three templates.

- `--bg: #0c0e11` page
- `--surface: #12151a` panels
- `--surface-2: #171b21` raised rows, inputs
- `--line: #232932` hairline borders (1px, never thicker)
- `--line-strong: #2f3742` separators that must stay visible
- `--text: #e3e7ec` primary
- `--text-2: #9aa4b2` secondary and metadata, never darker than this
- `--text-3: #6b7684` only on non-essential decoration such as table headers
- `--accent: #6f93ad` desaturated steel blue, used only for focus ring, active
  nav underline, and inline links
- `--ok: #4f9e6a`, `--warn: #c08b3e`, `--danger: #c05c5c` status only, never as
  decoration, never as a gradient

No gradient anywhere. No `box-shadow` except one 1px inset ring on focus. No
`backdrop-filter`. No glow. No coloured surface fills; a status is a dot or a
short text, not a painted block.

### Type

Exactly five sizes, no others: `11px` metadata and table headers, `12px`
captions and timestamps, `13px` body, table cells and inputs, `14px` section and
page titles, `18px` the wordmark only. Line height 1.45 for body, 1.25 for
titles. Interface font stays the system sans stack already in use. Monospace
(`ui-monospace, SFMono-Regular, Menlo, monospace`) is reserved for key ids,
masked keys, timestamps, model ids and numbers in tables.

Numbers in tables and metric strips use `font-variant-numeric: tabular-nums`.

### Shape, space, density

- Radius scale is exactly three values: `4px` chips and tags, `6px` buttons and
  inputs, `8px` panels and dialogs. Nothing is a pill. Nothing is 50%.
- Control height token: `--tap: 30px`, `--tap-sm: 26px`, and
  `@media (pointer: coarse) { :root { --tap: 44px; --tap-sm: 44px } }`. Desktop
  controls stay 26 to 30px; touch gets 44px.
- Spacing scale: 4, 8, 12, 16, 24, 32. Use only these.
- Page padding 24px desktop, 16px under 768px. Section gap 24px.
- Tables are dense: 8px vertical cell padding, hairline row separators, header
  row in `--text-3` at 11px uppercase with 0.04em letter spacing.

### Layout

One shared shell: a 48px top bar holding the wordmark `geminesx` at 18px in
`--text` plus a horizontal nav of plain text links at 13px, active link marked by
a 2px `--accent` underline. No sidebar, no icons in the nav, no avatar, no
breadcrumbs. Below it, content starts with a single-line instrument strip of
label/value pairs separated by 1px vertical rules (hidden under 768px), not a row
of KPI cards.

## Deliverable 1 — `src/ui.ts`

Export a single `BASE_CSS` string containing the tokens, the reset, the shell,
and these primitives as plain class names: `.topbar`, `.nav`, `.strip`, `.panel`,
`.panel-title`, `.table`, `.badge`, `.dot`, `.btn`, `.btn-primary`, `.btn-danger`,
`.input`, `.select`, `.notice`, `.state` (empty/loading/error), `.dialog`. Also
export `BASE_CSS` plus one small helper `stateBlock(kind, message)` returning the
markup for an empty, loading or error state.

Include `[hidden] { display: none !important; }` in the reset. Style `:focus-visible`
with a 2px `--accent` outline offset 2px. Buttons must set both `color` and
`font-family: inherit` explicitly, because a `<button>` does not inherit them.

Use inline SVG (viewBox 20 20, `currentColor`, 1.5 stroke) for any icon, never a
Unicode glyph.

## Deliverable 2 — restyle the three templates

`src/admin-ui.ts`, `src/usage-ui.ts`, `src/models-ui.ts`:

- Delete their private `<style>` blocks and import `BASE_CSS` from `./ui.ts`,
  interpolating it into the document `<head>`.
- Keep every existing `id`, class hook and fetch call that their JavaScript
  depends on. This is a visual and structural pass, not a rewrite of behaviour:
  every control that worked must still work, and every fetch URL must stay
  identical.
- Replace the card-per-thing layout with the shell plus tables and the
  instrument strip.
- Every page must render three states: loading, empty, error. Wire them to the
  existing fetch results.
- All copy in English. No em dash anywhere. No emoji.
- Never render a raw key: only the id or the masked form, and truncate long ids
  with `text-overflow: ellipsis` on a single line.

## Visual gates — all of these are checked after you stop

1. `rg -c 'linear-gradient|radial-gradient|backdrop-filter|box-shadow' src/admin-ui.ts src/usage-ui.ts src/models-ui.ts src/ui.ts` → every count is `0`.
2. `rg -n '—' src/admin-ui.ts src/usage-ui.ts src/models-ui.ts src/ui.ts` → zero hits. The em dash is banned in UI copy.
3. `rg -o 'border-radius: *[0-9]+px' src/ui.ts | sort -u` → only `4px`, `6px`, `8px`.
4. `rg -o 'font-size: *[0-9.]+px' src/ui.ts | sort -u` → at most five distinct values, all from the declared scale.
5. `rg -c 'pill|rounded-full' src/ui.ts` → `0`.
6. No Unicode glyph used as a control: `rg -n '[▶❚✕🔊★⚙→]' src/*-ui.ts` → zero hits.
7. `rg -n 'AIza' src/*-ui.ts` → zero hits, and no template interpolation of a raw key variable.

## Acceptance criteria

Run these yourself and paste the real output.

1. `bun run check` exits 0 with no output.
2. `bun run bundle:api` succeeds and prints `api/index.js` with a plausible
   size. Then run `git checkout -- api/index.js` and do NOT commit that file: a
   concurrent branch regenerates the same artifact and a committed bundle would
   guarantee a merge conflict. The operator rebuilds it once after both merge.
3. Start the server with `ADMIN_TOKEN` unset and `bun run start` on a spare port,
   then `curl` `/pengatur`, `/pengatur/usage`, `/pengatur/models` and `/health`:
   all four return 200.
4. `git diff --stat master..HEAD` touches only `src/ui.ts`, `src/admin-ui.ts`,
   `src/usage-ui.ts` and `src/models-ui.ts`. Any other file in the diff is a
   scope violation and must be reverted before you report. `api/index.js` must
   not appear in the diff.
5. At least three self-describing commits on the branch, tree clean.

## Operational rules

- Commit after each task, not in one batch at the end.
- If the same tool result repeats, switch tool. Maximum three reads per file.
- Do not end a turn with prose while a task is unfinished.
- Do not run `git push`. Commit locally only.
- Do not touch `.env`, `.env.*`, or any credential file.
- Do not create test files for UI work.
- Report: each deliverable mapped to its commit hash, the gate output above, and
  one line naming every visual decision you made that is not in this brief.