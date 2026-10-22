# Assessment A — Design review: /pengatur/keys

Surface: keys list (`keys-ui.ts` KEYS_BODY/KEYS_SCRIPT), key detail (DETAIL_BODY/DETAIL_SCRIPT),
shared shell (`ui.ts`), overview (`admin-ui.ts`), audit (`audit-ui.ts`), routes (`app.ts`).
Mode: Operate. Evidence: source lines read this session + the measured numbers supplied in the brief.

---

## 1. Design specificity

**Grounded, not generic.** This composition could not be lifted into an unrelated admin
dashboard. The identity is not in the chrome (which is a stock rail + panel + figures shell) but
in three decisions that only exist because this product is a 1277-key pool with 964 retired rows:

- `keys-ui.ts:404-408` — dead rows hidden by default, with the reason written into the comment:
  "964 of them meant 39 pages of scrolling to reach the 81 ready keys."
- `keys-ui.ts:474-479` — the count line says `1277 in pool, 964 dead hidden, 81 match`, three
  different numbers instead of one vague "shown".
- `keys-ui.ts:322-335` — plan is *evidence*, not operator input: `rowPlan()` refuses to render a
  tier while the key is cooling/quota-held and prints "held back while the key cannot serve".
  No generic dashboard has that rule.

The generic parts are the KPI strip (`renderKpis`, 440-447) and the toolbar. Those would survive a
copy-paste. The one place the product's own model breaks is the plan filter — see P0.

## 2. Holistic design

**Hierarchy** works: eyebrow → 34px title → lede → 5 figures → panel. The eye lands on the count
line and the table, which is right for Operate. `th` at 10.5px/0.12em uppercase vs `td` 13px gives
a clean header/body split.

**IA** is honest at the top and wrong at the edges. Three scopes of "select" coexist
(`keys-ui.ts:111` "Select all" = every filtered key, 937-939; `:454` thead checkbox = current
slice only, 622-626; `:160` the count = every id in `state.selected`, never pruned on refresh).
The operator has no way to learn which of the three they triggered.

**Emotional fit**: the console reads as a ledger, not a toy. The irreversibility of removal is
stated in the dialog instead of hidden. Good.

**Discoverability**: three row actions are icon-only (`keys-ui.ts:586-609` — check / pulse / trash).
Check and pulse are the two hardest glyphs to tell apart and they are the two most similar actions
(validate the plan vs probe the key). Hover title is the only disambiguator.

**Composition**: at 1024px the table needs 1085px inside a 723px wrapper. Order is
pick 68 + Id 111 + Key 250 + Plan 170 = 599, so **Status is the column that falls off the edge**
(599+230=829 > 723), and Cooldown/actions need a scroll. The one column that explains why a key
cannot serve is the one clipped at the most common laptop width.

**Typography**: sound scale, one nit — `Fails` (th) vs `Failures` (detail `defs`, `keys-ui.ts:1146`).

**Colour**: 6 text colours in one table (measured). Row carries accent (id link), text (key),
text (plan), tone (tag), text-2 (hint), text-3 (nothing in body). Hue is spent on a link, so
"find the red row" competes with "this id is clickable". Reserve hue for status; make the id link
neutral mono with an underline on hover.

**States**: strong list-error state (`drawListError`, 868-885 keeps the header and puts retry inside
the table). Two other error paths are invisible — P1 below.

**Copy**: the best copy in the file is the empty state at 485-490 ("Every key is dead and dead keys
are hidden. Uncheck Hide dead, or pick status dead, to see them."). The worst is the overview
sentence at `admin-ui.ts:78` — "Declare it on the Keys page" — because no such control exists.

**Edge cases**: masked text stays until `fetchRaw` resolves (548-552) so the table paints
immediately — good. But that `.catch(function () {})` swallows the failure, leaving masked text with
no marker that the row is degraded.

## 3. Cognitive load (8-item checklist)

| Item | Verdict |
|---|---|
| Single focus per screen | **Pass** — one table, one job. |
| Chunking ≤4 per group | **Fail** — toolbar has 6 controls (`keys-ui.ts:110-155`), panel-head has 2, page-head has 2. |
| Grouping | **Partial** — filter/status/plan/per-page are one undifferentiated `.toolbar` row; plan is dead, so the grouping lies. |
| Visual hierarchy | **Pass** — count line, then table, then pager. |
| One thing at a time | **Fail** — auto-refresh fires every 15s (`:915`) while the operator is mid-selection; the table is rebuilt under the cursor. |
| ≤4 visible options at a decision point | **Fail** — bulk bar (`:158-167`) presents Validate / Remove / Clear plus the count plus 25 row checkboxes. The removal decision point shows 4 buttons + 25 checkboxes. |
| Working memory | **Fail** — nothing tells the operator that "Select all" spans all 52 pages while the header checkbox spans 25 rows. Must remember which one they pressed. |
| Progressive disclosure | **Pass** — detail page hides empty panels and replaces them with one line (`:1238-1246`). |

Decision points exceeding 4 options: the toolbar (6), the bulk bar (3 actions + count + Clear), and
each row (3 icon actions + 1 copy button = 4, at the limit).

## 4. Emotional journey

**Peak (positive)**: the count line `1277 in pool, 964 dead hidden, 81 match`. It is the moment the
console admits what it is hiding, and it converts a 39-page scroll into one sentence.

**Peak (negative)**: pressing "Select all" after setting Plan = "Pay as you go". The filter is
decorative (P0), so 81 ready keys get selected, not the paid subset, and Remove selected is one
click away with a confirm that says "Remove 81 keys?" — which is *correct* but arrives after the
mistake.

**Valleys**: (a) opening a key detail and having the raw credential appear with no gesture and no
acknowledgement that it was logged; (b) a failed detail load rendering nothing at all.

**Reassurance at high-stakes moments**:
- Delete: good. `removeKey` names the key, states "The gateway stops serving with it", and states it
  cannot be restored *and why* (`:774-785`). Bulk version names the first three keys and the count
  (`:801-818`).
- Credential reveal: **absent**. `#keyMaskNote` says "revealed on demand" (`:1017`) while
  `renderCredential` fetches on load (`:1112`). The label contradicts the behaviour, and the operator
  is never told the reveal wrote a `keys.raw` audit row (`app.ts:719-724`).

**Peak-end**: the end of every mutation is a toast. Success auto-dismisses in 5.2s, failures persist
(`ui.ts:2316-2321`) — the right asymmetry.

## 5. Nielsen's 10 heuristics

| # | Heuristic | Score | Finding |
|---|---|---|---|
| 1 | Visibility of system status | 3 | `updated HH:MM:SS`, `listMeta` counts, `aria-busy` — but a 15s auto-refresh gives no "refreshing" cue and Test-all shows no per-row progress. |
| 2 | Match to real world | 2 | `cooling/dead/ready` is the operator's vocabulary, but one action is called "Validate the plan", "Probe this key" (title) and "Test" (post-click text, `:721,735`) in three places. |
| 3 | User control and freedom | 3 | Esc clears filters (`:975-985`), Clear deselects, Cancel everywhere; removal is irreversible by design and says so — but selection scope is not reversible once Remove is confirmed. |
| 4 | Consistency and standards | 2 | Auto-refresh is a `.switch` on Keys (`:101`) and a `.check` checkbox on Audit (`audit-ui.ts:35`) and Overview (`admin-ui.ts:25`); it defaults OFF on Keys and ON on Overview. `Fails` vs `Failures`. Plan label on the list, plan code on detail. |
| 5 | Error prevention | 2 | Dead Plan filter + "Select all" over all filtered keys = a destructive action whose scope the operator cannot see. Confirm dialog and disabled states are the only guards. |
| 6 | Recognition over recall | 2 | Three icon-only row actions need hover titles; the help dialog defines ready/cooling/dead/429/ring/rollup/memory/masked key but never defines Validate vs Test. |
| 7 | Flexibility and efficiency | 4 | Command palette, `/` filter, `r` refresh, `?` help, URL state for q/status/page, bulk validate/remove, per-page 10-100. Genuinely fast for a returning operator. |
| 8 | Aesthetic and minimalist design | 3 | Dense and disciplined, but 6 hues in one row, and "Storage" is a word rendered in a 27px numeric slot (`:446`). |
| 9 | Error recovery | 2 | List error state is excellent (868-885); detail error is painted into a hidden panel (P1); Test-all failure is written to a hidden node (P1). |
| 10 | Help and documentation | 3 | 6 shortcuts + 10 defined words, honest empty states, inline hints — but the three row verbs and the word "plan" are undefined. |

**Total: 26/40.**

## 6. Strengths

1. **The honest count line** (`keys-ui.ts:474-479`). Three numbers — enrolled, hidden, matching —
   instead of one. It is the difference between a filter and a filter the operator can audit, and it
   exists because someone measured 964 dead rows.
2. **The list error state that keeps the table header** (`:868-885`). Columns stay legible, the
   failure is announced inside the table's own footprint, and Try again is in the same place the
   data would be. Most consoles replace the whole panel with a red box and lose the context.
3. **The bulk-remove confirmation** (`:801-818`). It names the first three keys, states the count,
   states the gateway consequence, and states why undo is impossible ("the raw key never reaches the
   browser"). That is the correct amount of friction for an irreversible destructive action.

## 7. Priority issues

### P0 — The Plan filter is dead, and it sits next to a destructive bulk action
`keys-ui.ts:131-139` renders `<select id="keyPlan">` with four options. There is no `keyPlan` entry
in the `el` map (`:203-232`), no listener, and no `plan` field in `state` (`:234`).
`visibleKeys()` (`:405-425`) filters on query, status and hideDead only. So Plan does nothing.
Worse, "Select all" (`:937-939`) selects **every filtered key across all pages**, so an operator who
sets Plan = "Pay as you go", sees the row count unchanged (they won't notice), and clicks Select all →
Remove selected is now holding the whole ready pool. **Fix**: either wire `state.plan` into
`visibleKeys()` (one predicate, matching `rowPlan(k).text` and the code) or delete the select. Until
then, gate `bulkRemove` behind an explicit scope line: "Removing N keys — the current filter, not the
current page."

### P1 — Every list render fetches 25 raw credentials and writes 25 audit rows
`keys-ui.ts:548` calls `fetchRaw(k.id)` for every visible row to paint the full key. Each call hits
`GET /pengatur/keys/:id/raw`, which unconditionally writes an audit record (`app.ts:719-724`,
`auditRecordNow("keys.raw", …)`). With auto-refresh on (`:915`, 15s) that is ~100 audit rows per
minute of pure page-view noise, and the audit trail — the thing that is supposed to record who
revealed what — becomes unreadable. It also makes the file's own contract false: `:11` still claims
"no raw credential ever reaches the browser". **Fix**: return the full key in `/pengatur/keys/list`
once, per request, and log a single `keys.list` audit row instead of N `keys.raw` rows; or make the
audit write conditional on an explicit reveal gesture.

### P1 — A failed key-detail load renders nothing
`keys-ui.ts:1262-1264` paints the error into `el.dailyBars`, which lives inside `#dailyPanel`. That
panel carries `hidden` in the markup (`:1046`) and is only unhidden inside `renderDaily()` (`:1167`),
which never runs on the error path. `el.console.hidden = false` un-hides an empty shell. The operator
gets a blank page after the header. **Fix**: render into `#keyPath`/a dedicated state block at the top
of the console, the way `drawListError` does on the list.

### P1 — "Test all" failure is written into a hidden node
`keys-ui.ts:769` → `GX.say(el.bulkMsg, "Test all failed: …")`. `#bulkMsg` lives inside `#bulkBar`
(`:166`), which is `hidden` in markup (`:158`) and re-hidden by `paintBulk()` whenever nothing is
selected (`:436`). With no selection — the normal case for Test all — the error is invisible.
**Fix**: `GX.notice(…, "err")`, matching every other failure on the page.

### P1 — Probing a row destroys its icon permanently
`testKey` sets `btn.textContent = "Testing"` (`:721`) then `btn.textContent = "Test"` (`:735`) on a
button whose entire content is `PULSE_ICON` (`:599`). After one probe the actions column contains two
glyphs and the word "Test", in a column measured at 172px holding three controls. Row height and
column width churn on first use, and the button no longer matches its siblings. **Fix**: `GX.busy`/
`GX.idle` (which save and restore `textContent` in `dataset.label`, `ui.ts:2208-2226`) or swap
`aria-busy` + a spinner class without touching content.

## 8. Persona red flags

**Alex (power user)**
- `keys-ui.ts:622-626` + `:506-616` — every auto-refresh (15s) rebuilds the whole `<tbody>`. Focus
  inside a row (checkbox or one of the three action buttons) is destroyed mid-task, every 15 seconds.
- `keys-ui.ts:111` vs `:454` — two "select everything" affordances with different scopes and no
  visible statement of which is which.
- Three icon-only actions (`:586-609`) with no keyboard-visible labels; `title` is mouse-only.
- The help dialog promises "Tab — move through the table, row by row" (`ui.ts:1761`), but the actual
  tab order is 4–5 stops per row (~110 stops for a 25-row page) with no roving tabindex and no
  arrow-key row navigation.

**Sam (accessibility-dependent)**
- `th[scope]=0 of 9` and no `<caption>` on the keys table (`tableHead`, `:449-465`). A screen reader
  announces "column 5" instead of "Status". This is the single cheapest fix on the page.
- 1 input with no label (measured). The thead checkbox has `aria-label` but its wrapping
  `<label class="pickbox">` is empty (`:451-455`).
- `ui.ts:810-812` — at ≤1180px, `Fails` and `Last used` are `display:none`. Not visually hidden:
  removed from the accessibility tree. At the measured 1024px viewport Sam cannot obtain those two
  facts at all, and nothing announces that they were dropped.
- Two `#toasts` nodes exist in the document: `consolePage` appends `toastMount()` (`ui.ts:1543`) and
  `KEYS_BODY` injects `noticeBand()` (`:92`), which returns the same `<div id="toasts" role="status"
  aria-live="polite">`. Duplicate id, duplicate live region. `GX.toast` only ever populates the first.
- The detail page's `Enabled` row (`:1145`) reports state the operator cannot change — no toggle, no
  control anywhere in the console calls `setEnabled`.

## 9. Minor observations

- `keys-ui.ts:1143` renders the plan **code** on detail (`k.plan` → "paid") while the list renders
  the **label** (`tierLabel`, `:332` → "Pay as you go"). Same fact, two vocabularies.
- `.defs` is a 3-column grid for 7 items (`ui.ts:704`) — the last row has one item and two empty cells.
- `keySize` and `hideDead` are not written to the URL (`:966-970`), while q/status/page are (`:385-396`).
  A shared link does not reproduce the view.
- `fetchRaw` caches forever (`:339`); a rotated key keeps its old value until reload.
- Detail page has no Test / Validate / Remove action — all three exist only in the list. Investigating
  a dead key means going back to find its row.
- `admin-ui.ts:349-355` — a failed overview load leaves `#console` hidden, so the operator gets a
  blank page plus a toast, with no retry affordance.
- `renderKpis` (`:446`) prints `pool.storage` through `GX.stat`, which does `String(value)`
  (`ui.ts:1988`) with no guard: a missing field renders the literal word "undefined" at 27px.
- `audit-ui.ts:149` renders `r.actor` in a second `.what` span with no label; the feed reads as two
  consecutive values.
- `audit-ui.ts:116-119` dumps `JSON.stringify(r.detail)` straight into the trail.

## 10. Provocative questions

1. If the raw key is now shown in full in the list (`:548`, `keyDisplay`), what is the masked form
   still protecting — and why does `/raw` remain a separate, individually audited endpoint?
2. The console hides 964 dead rows to protect the operator from scrolling. What else in this pool is
   being hidden rather than decided — and is "Remove selected" the decision that was supposed to
   happen to those 964 keys a long time ago?
3. Every page in this shell answers "what is the state". None answers "what changed since I last
   looked". For an operator who opens this console twice a day, is the 15s auto-refresh buying
   anything, or is it just destroying focus?
