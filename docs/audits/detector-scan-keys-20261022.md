# Assessment B — deterministic detector + source verification: /pengatur/keys

Surface: keys list + key detail (`src/keys-ui.ts`), shared stylesheet (`src/ui.ts`).
Mode: Operate. Evidence: detector runs and `sed`/`grep` reads executed this session; no browser.
Date: 2026-10-22.

---

## 1. Detector run

```
$ cd /workspaces/geminesx
$ /home/ricki/.hermes/skills/creative/impeccable/scripts/impeccable detect --json src
EXIT_CODE=2   (one finding)
```

Target coverage table (same binary, same cwd):

| target | exit | findings |
|---|---|---|
| `src` | 2 | 1 |
| `src/ui.ts` | 2 | 1 |
| `src/keys-ui.ts` | 0 | 0 |
| `src/keys-ui.ts src/ui.ts` | 2 | 1 |

No narrowing was necessary — the tree is 13k lines and `src` completed in one pass.

## 2. Was the stylesheet read? Yes — and here is the proof, because absence of the
warning is not proof

The console has no linked stylesheet. `grep -rn "<link" src/*.ts` returns only favicon
links (`src/ui.ts:1521-1523`, `:1666`); there is no `rel="stylesheet"` anywhere, and
`find . -name "*.css" -not -path "./node_modules/*"` returns nothing. CSS lives in
`BASE_CSS` (a template literal, `src/ui.ts:23`) and is inlined at `src/ui.ts:1526-1528`
and `:1668`.

Because the detector therefore had nothing to resolve, it printed **no** "could not read
linked stylesheet" message. That silence is ambiguous on its own, so two control probes
settled it:

- **Positive control** — a synthetic file with a route-style link:
  `linkprobe.html` containing `<link rel="stylesheet" href="/static/nope.css">` →
  stderr: `impeccable detect: could not read linked stylesheet /static/nope.css (resolved
  to /tmp/improbe/static/nope.css); color and custom-property rules will be incomplete`,
  stdout `[]`, exit 0. So the warning does exist and this console does not trigger it.
- **Negative control** — `clean.ts` with one trivial inline rule → `[]`, exit 0.
- **Coverage control** — the single finding on `src` lands on `ui.ts:1033`, a line *inside*
  the `BASE_CSS` template literal. The parser read the inline CSS.

Verdict: **stylesheet read, rule set complete for this project's CSS.** Exit 2 is a
coverage signal that rules ran, not a verdict.

## 3. Detector findings

### F1 — `side-tab` at `src/ui.ts:1033` — TRUE POSITIVE (by the rule), low value

```
src/ui.ts:1027  .toast {
src/ui.ts:1033    border-left: 3px solid var(--text-3);
src/ui.ts:1041  .toast[data-tone="ok"]   { border-left-color: var(--ok); }
src/ui.ts:1042  .toast[data-tone="warn"] { border-left-color: var(--warn); }
src/ui.ts:1043  .toast[data-tone="err"]  { border-left-color: var(--bad); }
```

The rule matches literally: a 3px one-sided colored border. Two facts change what the fix
should be:

- The element is a transient toast (`src/ui.ts:2308`), not a card, so the "card tell"
  framing does not apply. The 3px stripe is the only carrier of `data-tone` — remove it and
  the toast loses its ok/warn/err affordance entirely, because the text color is
  `var(--text)` for every tone (`src/ui.ts:1036`).
- `--text-3` default at `:1033` is also the neutral state, so a neutral toast draws a
  colored edge that means nothing.

Judgment: true positive on the letter of the rule, but the fix is **replace the cue, not
delete it** — put the tone on a 6px dot plus the text color (the `.tag .dot` pattern
already exists at `:621`), and drop `border-left` to 0. Deleting the border alone would be
a regression in tone signalling.

## 4. Hand-verified gaps (what the detector's antipattern set cannot see)

### G1 — P0: fixed `65px` row height survives the mobile table fold — `src/ui.ts:825` vs `:1236-1247`

```
src/ui.ts:781   .table tbody tr { height: 1px; }
src/ui.ts:782   .table tbody td { height: inherit; }
src/ui.ts:825   #keysBody .table tbody tr { height: 65px; }      /* (1,1,2) */
src/ui.ts:1236    .table, .table tbody, .table tr, .table td { display: block; width: 100%; }  /* (0,1,1) */
```

The 720px block folds every table row into stacked blocks and never resets the height.
`#keysBody .table tbody tr` (id + class + two elements) beats `.table tr` (class + element),
and no `height` declaration appears anywhere in `:1226-1265` (`grep height` on that range
returns only `.canvas-head { min-height: 52px }`). With `td { height: inherit }` at `:782`,
each of the nine cells inherits 65px:

- 9 `td` per row (pick, Id, Key, Plan, Status, Fails, Cooldown, Last used, actions —
  (`src/keys-ui.ts:451-459`, cells at `:507-613`)
- 9 × 65px = **585px per row** at ≤720px, where the intended stacked height is ~9 × 26px ≈ 234px.

This is the mobile counterpart of the row-height bug already fixed for desktop, and the
fold at `:1236` is exactly what reopens it. Not visible at any width >720px.

### G2 — P1: mobile cell widths keep the desktop column caps — `src/ui.ts:716,720,721` vs `:1236`

```
src/ui.ts:716   .table td[data-l="key"]    { width: 250px; max-width: 250px; ... }   /* (0,2,1) */
src/ui.ts:720   .table td[data-l="status"] { width: 230px; max-width: 230px; }       /* (0,2,1) */
src/ui.ts:721   .table td[data-l="plan"]   { width: 170px; max-width: 170px; }       /* (0,2,1) */
src/ui.ts:1236  .table, ... .table td { display: block; width: 100%; }               /* (0,1,1) */
```

The mobile `width: 100%` is (0,1,1) and loses to every `[data-l]` rule at (0,2,1), and no
`!important` exists on either side (`grep !important` returns only `[hidden]` and the
reduced-motion block at `:192-195`). In the stacked layout the Key cell stays 250px, Status
230px and Plan 170px wide while `justify-content: space-between` (`:1242`) still spreads
label against value — so those three rows are 250/230/170px wide inside a full-width card,
with the value pushed to a different right edge than the other six rows. Visible as ragged
right alignment on mobile, not as overflow.

### G3 — P1: no focus indicator on the command-palette input — `src/ui.ts:1124`

```
src/ui.ts:1124  .palette-input:focus { outline: none; }
src/ui.ts:1833  '<input id="paletteInput" class="palette-input" type="text" role="combobox" ...'
```

The one control that keyboard users land in immediately after `Ctrl K` removes its outline
and adds nothing back: `.palette-input` (`:1116-1122`) has `border: 0` and
`background: transparent`, so there is no border-color change either. The global
`:focus-visible` rule at `:187` is overridden by this more specific `:focus` rule. Zero
focus indication on a text input — WCAG 2.4.7 failure, and the only place in the sheet
where this happens.

### G4 — P1: text inputs lose the ring and keep only a 1px border tint — `src/ui.ts:501`

```
src/ui.ts:501  .input:focus, .select:focus, .textarea:focus { outline: none; border-color: var(--accent); }
```

Every other control keeps the 2px ring (`:187`, `:567`, `:577`, `:768`, `:837`). Here the
ring is replaced by a 1px border color change. The replacement is at least measurable:
accent vs unfocused `--line-2` is **4.52:1** light (`#2646c9` vs `#cbc9c1`) and **4.56:1**
dark (`#8ea2ff` vs `#363d49`), so it clears 1.4.11 for the indicator itself. It is a
consistency defect and a weaker-than-spec indicator, not a contrast failure.

### G5 — P2: `role="combobox"` with no `aria-activedescendant` and a hardcoded `aria-expanded` — `src/ui.ts:1833-1837, 2438, 2463`

```
src/ui.ts:1833  'aria-expanded="true" aria-controls="paletteList" aria-autocomplete="list"'
src/ui.ts:1837  '<div id="paletteList" class="palette-list" role="listbox" aria-label="Commands">'
src/ui.ts:2438  "aria-selected": index === 0 ? "true" : "false",
src/ui.ts:2463  node.setAttribute("aria-selected", on ? "true" : "false");
```

`grep -rn "aria-activedescendant" src/` → no matches. Arrow keys move `aria-selected`
across `<button role="option">` children while DOM focus stays in the input, and the options
carry no `id`, so the combobox can never point at the active option. A screen reader
announces "combobox, expanded" and then nothing about which command is highlighted. Also
`aria-expanded="true"` is a literal in the markup and is never updated — it is true even
when the palette is closed, because the input only exists inside the `<dialog>`.

### G6 — P2: 15 tables, 1 caption, 0 `scope`, 0 accessible names — `src/stats-ui.ts:249` is the only one

```
src/stats-ui.ts:249   sr.appendChild(GX.el("caption", { text: "Requests by hour and weekday" }));
src/keys-ui.ts:502    var table = GX.el("table", { class: "table" });        /* pool list */
src/keys-ui.ts:870    var table = GX.el("table", { class: "table" });        /* detail */
src/keys-ui.ts:1055   <table class="table" id="dailyTable">                  /* no caption */
src/keys-ui.ts:1068   <table class="table" id="recentTable">                 /* no caption */
```

`grep -c "scope=" src/*.ts` → 0 in every file. `grep -o 'el("th"' src/*.ts | wc -l` → 19
plus 44 literal `<th ` occurrences across 15 table render sites.

Judgment split: **missing `scope` is a should-fix, not a failure** — every table here is a
flat grid with no merged or nested header cells, and browsers infer column scope from the
`th` position, so no real AT gets the wrong header. **Missing captions on the four
`keys-ui.ts` tables is the real gap**: those tables have neither `<caption>` nor
`aria-label` nor `aria-labelledby`, so they are announced as an unnamed "table" while the
sibling `<h2>` sits in a separate `.panel-head` div (`src/keys-ui.ts:98`, `:1048`) that is
not referenced. The pool table is the primary surface of the console and it is unnamed.

### G7 — P2: dead selection styling — `src/ui.ts:665` and `:547` have no producer

```
src/ui.ts:665  .table tbody tr[aria-selected="true"] { background: var(--accent-wash); }
src/ui.ts:547  .check input[type="checkbox"]:indeterminate { ... }
```

`grep -n "aria-selected" src/keys-ui.ts` → no matches. Selection lives only in
`state.selected` and is reflected by `box.checked` (`src/keys-ui.ts:511-515`), so the row
tint never fires. Likewise `grep -rn "indeterminate" src/` returns only the two CSS rules
at `:547-548` — nothing ever assigns `.indeterminate`, so the select-all checkbox at
`src/keys-ui.ts:451-455` can never show the partial state even though it selects only the
current slice. Two visual states are specified and unreachable.

### G8 — P2: toast dismiss target is 22×22 — `src/ui.ts:1061-1062`

```
src/ui.ts:1061   width: 22px;
src/ui.ts:1062   height: 22px;      /* .toast-x */
```

22×22 is under the 24×24 minimum of WCAG 2.5.8. It is corrected on coarse pointers only
(`src/ui.ts:1278` `.toast-x, .toast-act { min-height: 40px; min-width: 40px }`), so the
failure is desktop-mouse specific. Arithmetic on the rest of the set, for the record:

| control | box | vs 24×24 |
|---|---|---|
| `.toast-x` `:1061` | 22×22 | **fail** |
| `.toast-act` `:1045-1048` | ≥24 min-height | pass (exactly 24) |
| `.seg button` `:590` | calc(36−8) = 28 | pass |
| `.icon-btn.btn-sm` `:484` | 30×30 | pass |
| `.pickbox` `:581` | 36×36 | pass |
| `.table td > .link` `:838` | 24 min-height | pass (exactly 24) |

### G9 — P2: `tag[data-tone="ok"]` drops to 4.16:1 on a hovered row (light theme) — `src/ui.ts:622, :661`

Alpha-composited, not compared against its own tint. `--wash-ok` is
`rgba(15,122,74,0.10)` (`:49`) over the row background, and the row background changes on
hover to `--surface-2` (`:661`). Composited over `#f1f1ec` the effective tag background is
`rgb(218,229,220)`, and `--ok` `#0f7a4a` on that is **4.16:1** at 11.5px text (`:616`) —
below 4.5. On the resting row (`#ffffff`) the same pair is 4.69:1, which is why this only
appears while the pointer is over the row.

Every other tone, both themes, both row states:

| tone | light rest | light hover | dark rest | dark hover |
|---|---|---|---|---|
| ok | 4.69 | **4.16** | 7.04 | 6.47 |
| warn | 5.53 | 4.90 | 7.26 | 6.67 |
| bad | 5.63 | 5.01 | 6.03 | 5.56 |
| accent | 6.48 | 5.78 | 5.95 | 5.47 |

### G10 — P2: the thead select-all checkbox is not `accent-color`ed — `src/ui.ts:573` vs `src/keys-ui.ts:451`

```
src/ui.ts:569   td input[type=checkbox] {
src/ui.ts:573     accent-color: var(--accent);
src/ui.ts:582   .pickbox input[type=checkbox] { width: 18px; height: 18px; margin: 0; cursor: pointer; }
src/keys-ui.ts:451   GX.el("th", { class: "num" }, GX.el("label", { class: "pickbox" }, GX.el("input", {
```

`accent-color` is declared exactly once in the sheet (`grep -n accent-color` → `:573`) and
only under `td`. Row checkboxes are descendants of a `td` (`src/keys-ui.ts:507-509`) and
get the brand tint; the select-all checkbox sits inside a `<th>` (`:451`), matches only
`.pickbox input` at `:582` (sizing, no color), and renders in the UA default blue —
`#0075ff`-ish, not `--accent` `#2646c9` light / `#8ea2ff` dark. Two checkbox controls on
the same table, two different blues, most visible in dark theme where the UA blue is far
lighter than `#8ea2ff`. Focus is unaffected: the universal `:focus-visible` at `:187`
still applies.

### G11 — P2: control boundaries are 1.66:1 in both themes — `src/ui.ts:33, :98, :29, :94`

Opaque hex, no alpha involved:

- light: `--line-2` `#cbc9c1` on `--surface` `#ffffff` = **1.66:1**; on `--bg` `#f5f5f2` = 1.52:1
- dark: `--line-2` `#363d49` on `--surface` `#13161c` = **1.66:1**
- the fill cannot substitute: input `--surface` vs `--bg` is 1.09:1 light, 1.07:1 dark

`--line-2` is the entire affordance for `.input`, `.select`, `.textarea` (`:491`) and
`.btn` (`:460`), so 1.4.11 wants 3:1 and gets 1.66. Real, and the single highest-leverage
token change in the sheet: it affects every control on every console page.

### G12 — passes, one line each (no padding)

- `:focus-visible`: global rule at `:187`, per-component at `:567`, `:577`, `:768`, `:837` — present and 2px.
- `<main>`: `:1534` (`id="main" tabindex="-1"`), login at `:1669`; skip link `:1529`; `aside aria-label="Sections"` `:1441`, `nav aria-label="Console sections"` `:1448`.
- `aria-live`/`role="status"`: `src/keys-ui.ts:166`, `:192`; host `src/ui.ts:1624`.
- `@media`: 16 in `src/ui.ts` (`:120,190,578,583,709,710,769,810,814,862,1208,1213,1226,1267,1274,1294`), 0 in `src/keys-ui.ts` — correct, that file carries no CSS at all (`grep -c "<style\|BASE_CSS"` → 0) and inherits the shell.
- reduced motion honoured at `:190-196` and `:862`.
- `prefers-color-scheme` dark fallback at `:120`, explicit `data-theme` at `:93`.
- already-fixed items from the brief: action buttons are icons (`src/keys-ui.ts:580-611`), copy button is appended (`:543`), dead keys hidden by default (`src/keys-ui.ts:234` state, `:408` filter), cooldown sentinel guarded at `src/ui.ts:2114-2117`, `th` sticky at `:639-640`. No contrary evidence found; not re-reported.

## 5. Could not check

- **Computed layout, hover states, and actual rendered contrast.** No browser tool in this
  context by design. G1/G2/G9 are derived from cascade specificity and color arithmetic on
  the source, not from `getComputedStyle`. G1's 585px figure assumes the nine `td` render,
  which `src/keys-ui.ts:507-611` confirms structurally but which no measurement verified.
- **`color-mix()` results** at `:622-626` and `:1108-1109` — border colors only; I did not
  compute them, since no text contrast depends on them.
- **`--rail-*` and print stylesheet** — outside the target surface.
- **Detector rule coverage beyond the emitted set** — the binary reports only what it
  matched; I cannot enumerate its full rule list from the CLI, so "1 finding" bounds the
  rules that fired, not the rules that exist.
