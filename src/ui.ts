/**
 * Shared design system for the operator console.
 *
 * One stylesheet, one shell, one client runtime. Every console page is built
 * from `consolePage`, so the tokens, the reset, the navigation and the control
 * shapes can only drift in one place.
 *
 * The direction is a product console, not a control panel:
 * - the surface is near-monochrome, the only saturated colours are status
 * - one near-white accent marks the active section and the primary action
 * - hierarchy comes from type size and space, never from painted boxes
 * - every page gets a purpose built layout instead of the same panel stack
 *
 * Rules that hold everywhere:
 * - no decorative gradient, no shadow, no blur, no glow
 * - status is a dot plus a word, never a painted block
 * - radii: 8 controls, 12 cards, pills for tags and chips
 * - type: 11 / 12 / 13 / 14 / 16 / 20 / 28
 * - every colour comes from a custom property, never from a literal
 */

export const BASE_CSS = `
:root {
  color-scheme: dark;

  --bg: #0b0d12;
  --card: #12151c;
  --card-2: #171b24;
  --card-3: #1d2230;
  --line: #232936;
  --line-2: #2f3646;

  --text: #eef1f6;
  --text-2: #9aa4b6;
  --text-3: #808a9c;

  --accent: #eef1f6;
  --accent-ink: #0b0d12;
  --ok: #41c98a;
  --warn: #e8a33d;
  --bad: #ef6b6b;
  --info: #4fd1c5;

  --wash-ok: rgba(65, 201, 138, 0.14);
  --wash-warn: rgba(232, 163, 61, 0.14);
  --wash-bad: rgba(239, 107, 107, 0.14);
  --wash-info: rgba(79, 209, 197, 0.14);

  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  --r-card: 12px;
  --r-ctl: 8px;
  --r-pill: 999px;

  /* One spacing scale. 4px base, and one horizontal inset that the card
     padding, the table cells and the page padding all share, so nothing
     steps by a pixel against its neighbour. */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-7: 32px;
  --inset: 16px;

  --tap: 34px;
  --tap-sm: 30px;
}

*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; padding: 0; }
html { background: var(--bg); -webkit-text-size-adjust: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
h1, h2, h3 { margin: 0; line-height: 1.3; font-weight: 620; letter-spacing: -0.01em; }
p { margin: 0; }
a { color: var(--text); text-decoration: none; }
a:hover { text-decoration: underline; }
b, strong { font-weight: 620; }
hr { border: 0; border-top: 1px solid var(--line); margin: 0; }
button, input, select, textarea { font: inherit; color: inherit; }
svg { display: block; }

:focus-visible { outline: 2px solid var(--info); outline-offset: 2px; border-radius: 4px; }
/* The main landmark takes the focus after the gate closes. It is a container,
   not a control, so it must not draw a ring around the whole page. */
#main:focus, #main:focus-visible { outline: none; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* shell ------------------------------------------------------------------- */

.skip {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 100;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-ctl);
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 620;
}
.skip:focus { left: 12px; top: 12px; }

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  min-height: 58px;
  padding: 0 var(--inset);
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}
.brand { display: flex; align-items: center; gap: var(--sp-2); font-size: 16px; font-weight: 650; letter-spacing: -0.015em; }
.brand:hover { text-decoration: none; }
.logo {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 800;
}

.nav { display: flex; gap: var(--sp-1); padding: var(--sp-1); border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
.nav a {
  padding: var(--sp-1) var(--sp-3);
  border-radius: 7px;
  color: var(--text-2);
  font-size: 13.5px;
  font-weight: 500;
  white-space: nowrap;
}
.nav a:hover { color: var(--text); background: var(--card-2); text-decoration: none; }
.nav a[aria-current="page"] { background: var(--accent); color: var(--accent-ink); font-weight: 620; }

.topbar-right { margin-left: auto; display: flex; align-items: center; gap: var(--sp-3); }
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--card);
  color: var(--text-2);
  font-size: 12.5px;
  white-space: nowrap;
}
.status-pill i { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); flex: 0 0 7px; }
.status-pill.warn i { background: var(--warn); }
.status-pill.bad i { background: var(--bad); }

.page { max-width: 1320px; margin: 0 auto; padding: var(--sp-6) var(--inset) var(--sp-7); display: grid; gap: var(--sp-6); }
#console { display: grid; gap: var(--sp-6); align-content: start; }
.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.page-head h1 { font-size: 24px; letter-spacing: -0.02em; }
.page-head .sub { margin-top: 2px; color: var(--text-2); font-size: 13.5px; }
.page-head .meta { color: var(--text-3); font-size: 12.5px; }

/* grids ------------------------------------------------------------------- */

.grid { display: grid; gap: var(--sp-5); align-items: stretch; }
.hero { grid-template-columns: minmax(0, 1fr); }
.kpis { align-items: stretch; }
.split { grid-template-columns: minmax(0, 1fr); }
.kpis { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.stack { display: grid; gap: var(--sp-5); align-content: start; align-items: stretch; }
@media (min-width: 1000px) {
  .hero { grid-template-columns: minmax(0, 1.35fr) minmax(320px, 1fr); }
  .split { grid-template-columns: minmax(0, 2.1fr) minmax(300px, 1fr); }
}

/* cards ------------------------------------------------------------------- */

.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-card); min-width: 0; }
.card-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--inset);
  border-bottom: 1px solid var(--line);
}
.card-head h2, .card-head h3 { font-size: 14.5px; font-weight: 620; }
.card-head .meta { margin-left: auto; color: var(--text-3); font-size: 12.5px; white-space: nowrap; }
.card-head .actions { display: flex; align-items: center; gap: var(--sp-2); }
.card-body { padding: var(--sp-4) var(--inset); }
.card-head + .card-body { padding-top: 0; }
.card-body.tight { padding: 0; }
.card-foot {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--inset);
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}
.card-foot .meta { margin-left: auto; color: var(--text-3); font-size: 12.5px; }

/* key figures ------------------------------------------------------------- */

.kpi { display: flex; flex-direction: column; gap: var(--sp-1); padding: var(--sp-4) var(--inset); background: var(--card); border: 1px solid var(--line); border-radius: var(--r-card); }
.kpi .l { display: flex; align-items: center; gap: var(--sp-1); color: var(--text-3); font-size: 12.5px; }
.kpi .v { font-size: 24px; font-weight: 680; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.2; }
.kpi .d { color: var(--text-3); font-size: 12.5px; }
.kpi .d.up { color: var(--ok); }
.kpi .d.down { color: var(--bad); }
.kpi .v.text { font-size: 18px; letter-spacing: -0.01em; }
.kpi .v.ok { color: var(--ok); }
.kpi .v.warn { color: var(--warn); }
.kpi .v.bad { color: var(--bad); }

.hero-row { display: flex; align-items: center; gap: var(--sp-6); }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(108px, 1fr)); gap: var(--sp-3) var(--sp-4); flex: 1; min-width: 0; width: 100%; }
.fact .l { color: var(--text-3); font-size: 12.5px; }
.fact .v { font-size: 20px; font-weight: 650; letter-spacing: -0.015em; font-variant-numeric: tabular-nums; }
.fact .l { margin-bottom: 2px; }
.fact .v.ok { color: var(--ok); }
.fact .v.warn { color: var(--warn); }
.fact .v.bad { color: var(--bad); }

.donut { position: relative; width: 108px; height: 108px; flex: 0 0 108px; display: grid; place-items: center; border-radius: 50%; }
.donut::after { content: ""; position: absolute; inset: 11px; border-radius: 50%; background: var(--card); }
.donut b { position: relative; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
.donut small { position: relative; display: block; margin-top: -4px; color: var(--text-3); font-size: 11.5px; text-align: center; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: var(--sp-1) var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--card-2);
  color: var(--text-2);
  font-size: 12.5px;
}
.chip b { color: var(--text); font-variant-numeric: tabular-nums; }

.meters { display: grid; gap: var(--sp-3); }
.meter-row { display: flex; align-items: center; gap: var(--sp-3); font-size: 13.5px; }
.meter-row .name { color: var(--text-2); }
.meter-row .value { margin-left: auto; color: var(--text-2); font-variant-numeric: tabular-nums; }
.meter { flex: 1; height: 7px; border-radius: var(--r-pill); background: var(--card-3); overflow: hidden; min-width: 40px; }
.meter i { display: block; height: 100%; border-radius: var(--r-pill); background: var(--accent); }
.meter i.ok { background: var(--ok); }
.meter i.warn { background: var(--warn); }
.meter i.bad { background: var(--bad); }
.meter i.info { background: var(--info); }

/* attention and feed ------------------------------------------------------ */

.attn { display: grid; }
.attn-item { display: flex; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-3) var(--inset); border-bottom: 1px solid var(--line); }
.attn-item:last-child { border-bottom: 0; }
.attn-item:hover { background: var(--card-2); text-decoration: none; }
.attn-item .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: 0 0 8px; }
.attn-item .t { display: block; font-size: 13.5px; font-weight: 580; }
.attn-item .d { display: block; color: var(--text-3); font-size: 12.5px; }
.attn-item .go { margin-left: auto; align-self: center; color: var(--text-3); font-size: 12.5px; white-space: nowrap; }

.feed { display: grid; }
.feed-item { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--inset); border-bottom: 1px solid var(--line); font-size: 13px; }
.feed-item:last-child { border-bottom: 0; }
.feed-item .act { font-family: var(--mono); font-size: 12.5px; color: var(--text); }
.feed-item .what { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed-item time { margin-left: auto; color: var(--text-3); font-size: 12px; font-variant-numeric: tabular-nums; flex: 0 0 auto; }

/* tables ------------------------------------------------------------------ */

.tablewrap { overflow-x: auto; }
.scroll-y { max-height: 420px; overflow-y: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.table thead th {
  padding: var(--sp-3) var(--inset);
  text-align: left;
  font-size: 11.5px;
  font-weight: 620;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-3);
  background: var(--card);
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.table tbody td { padding: var(--sp-3) var(--inset); border-bottom: 1px solid var(--line); vertical-align: middle; }
.table tbody tr:last-child td { border-bottom: 0; }
.table tbody tr:hover td { background: var(--card-2); }
.table .num { text-align: right; font-variant-numeric: tabular-nums; }
.table .key { font-family: var(--mono); font-size: 12.5px; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.table .actions { text-align: right; white-space: nowrap; }
.table .actions .btn + .btn { margin-left: 6px; }
.table .sub { color: var(--text-3); font-size: 12px; }
.table select { width: auto; min-width: 118px; height: 30px; padding: 0 var(--sp-6) 0 var(--sp-2); font-size: 12.5px; }
.table .link { color: var(--text); }
.table .link:hover { color: var(--info); }

.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-pill);
  font-size: 12.5px;
  font-weight: 550;
  white-space: nowrap;
}
.tag i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: 0 0 6px; }
.tag.ok { color: var(--ok); background: var(--wash-ok); }
.tag.warn { color: var(--warn); background: var(--wash-warn); }
.tag.bad { color: var(--bad); background: var(--wash-bad); }
.tag.info { color: var(--info); background: var(--wash-info); }
.tag.plain { color: var(--text-2); background: var(--card-2); }
.tag.mono { font-family: var(--mono); font-weight: 400; }

/* controls ---------------------------------------------------------------- */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  height: var(--tap);
  padding: 0 var(--sp-3);
  border: 1px solid var(--line-2);
  border-radius: var(--r-ctl);
  background: var(--card-2);
  color: var(--text);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 550;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover { background: var(--card-3); border-color: var(--text-3); text-decoration: none; }
.btn:active { background: var(--card); }
.btn[disabled] { opacity: 0.45; cursor: not-allowed; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 620; }
.btn-primary:hover { background: #fff; border-color: #fff; }
.btn-ghost { background: transparent; border-color: transparent; color: var(--text-2); }
.btn-ghost:hover { background: var(--card-2); color: var(--text); border-color: transparent; }
.btn-danger { background: transparent; border-color: var(--line-2); color: var(--bad); }
.btn-danger:hover { background: var(--wash-bad); border-color: var(--bad); }
.btn-sm { height: var(--tap-sm); padding: 0 var(--sp-2); font-size: 12.5px; }
.btn .icon { width: 15px; height: 15px; flex: 0 0 15px; }
.icon-btn { width: var(--tap-sm); padding: 0; }

.input, input[type="text"], input[type="password"], input[type="search"],
input[type="number"], input[type="datetime-local"], select, textarea {
  width: 100%;
  height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-ctl);
  background: var(--card-2);
  color: var(--text);
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.45;
}
textarea {
  height: auto;
  min-height: 110px;
  padding: var(--sp-3);
  resize: vertical;
  font-family: var(--mono);
  font-size: 12.5px;
}
select {
  cursor: pointer;
  appearance: none;
  padding-right: var(--sp-6);
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23808a9c' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 9px center;
  background-size: 15px 15px;
}
.input::placeholder, input::placeholder, textarea::placeholder { color: var(--text-3); }
.field { display: block; margin-bottom: 6px; color: var(--text-3); font-size: 12.5px; }
.check { display: inline-flex; align-items: center; gap: 8px; color: var(--text-2); font-size: 12.5px; cursor: pointer; }
.check { min-height: 24px; }
.check input[type="checkbox"] { width: 18px; height: 18px; margin: 0; accent-color: var(--info); }
.tablewrap :focus-visible { outline-offset: -2px; }

.toolbar { display: flex; align-items: flex-end; gap: var(--sp-3); flex-wrap: wrap; }
.toolbar .grow { flex: 1 1 180px; min-width: 0; }

.seg { display: inline-flex; padding: var(--sp-1); gap: var(--sp-1); border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
.seg button {
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 550;
  cursor: pointer;
}
.seg button:hover { background: var(--card-2); color: var(--text); }
.seg button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); font-weight: 620; }

/* messages and states ----------------------------------------------------- */

.notice { font-size: 12.5px; color: var(--text-2); }
.notice:empty { display: none; }
.notice.ok { color: var(--ok); }
.notice.warn { color: var(--warn); }
.notice.err { color: var(--bad); }

.state { padding: var(--sp-7) var(--inset); text-align: center; color: var(--text-2); font-size: 13.5px; }
.tablewrap .state, .feed .state { padding: var(--sp-6) var(--inset); }
.tablewrap .state b, .feed .state b { font-size: 13.5px; }
.state b { display: block; margin-bottom: 4px; color: var(--text); font-size: 14.5px; }
.state.error, .state.error b { color: var(--bad); }
.state .hint { margin-top: 4px; color: var(--text-3); font-size: 12.5px; }
.state .retry { margin-top: 14px; }

/* pager ------------------------------------------------------------------- */

.pager { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 12.5px; color: var(--text-3); }
.pager .pages { display: flex; gap: 4px; flex-wrap: wrap; }
.pager button {
  min-width: var(--tap-sm);
  height: var(--tap-sm);
  padding: 0 var(--sp-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-ctl);
  background: var(--card-2);
  color: var(--text-2);
  font-size: 12.5px;
  cursor: pointer;
}
.pager button:hover:not([disabled]) { border-color: var(--text-3); color: var(--text); }
.pager button[disabled] { opacity: 0.4; cursor: not-allowed; }
.pager button.active { border-color: var(--accent); color: var(--text); font-weight: 620; }

/* charts ------------------------------------------------------------------ */

.bars { display: grid; gap: var(--sp-2); }
.bar-row { display: grid; grid-template-columns: 96px minmax(0, 1fr) 68px; align-items: center; gap: var(--sp-4); font-size: 13px; }
.bar-row .label { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-row .value { text-align: right; color: var(--text-2); font-variant-numeric: tabular-nums; }
.bar-track { height: 8px; border-radius: var(--r-pill); background: var(--card-3); overflow: hidden; }
.bar-fill { height: 100%; border-radius: var(--r-pill); background: var(--info); }
.bar-fill.ok { background: var(--ok); }
.bar-fill.warn { background: var(--warn); }
.bar-fill.bad { background: var(--bad); }

.spark { display: inline-flex; align-items: flex-end; gap: 2px; height: 22px; }
.spark i { width: 3px; border-radius: 2px; background: var(--line-2); display: block; }
.spark i.hi { background: var(--info); }

.heat-scroll { overflow-x: auto; padding-bottom: var(--sp-2); }
.heat { display: grid; grid-template-columns: 34px repeat(24, minmax(15px, 1fr)); gap: var(--sp-1); min-width: 480px; font-size: 11px; color: var(--text-3); }
.heat .h { text-align: center; }
.heat .cell { height: 20px; border-radius: 4px; background: var(--card-2); }
.heat .cell[data-level="1"] { background: rgba(79, 209, 197, 0.18); }
.heat .cell[data-level="2"] { background: rgba(79, 209, 197, 0.36); }
.heat .cell[data-level="3"] { background: rgba(79, 209, 197, 0.56); }
.heat .cell[data-level="4"] { background: rgba(79, 209, 197, 0.78); }
.heat .cell[data-level="5"] { background: rgba(79, 209, 197, 0.96); }
.heat.values .cell { display: flex; align-items: center; justify-content: center; }
.heat.values .cell::after { content: attr(data-v); font-size: 11px; color: var(--text); }
.heat.values .cell[data-level="4"]::after, .heat.values .cell[data-level="5"]::after { color: var(--accent-ink); }
.heat-legend { display: flex; align-items: center; gap: var(--sp-1); color: var(--text-3); font-size: 11.5px; }
.heat-legend i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }

/* dialog ------------------------------------------------------------------ */

dialog {
  width: calc(100% - 32px);
  max-width: 520px;
  padding: 0;
  border: 1px solid var(--line-2);
  border-radius: var(--r-card);
  background: var(--card);
  color: var(--text);
}
dialog::backdrop { background: rgba(4, 6, 10, 0.72); }
dialog .card-head { border-radius: var(--r-card) var(--r-card) 0 0; }
dialog .card-foot { border-radius: 0 0 var(--r-card) var(--r-card); }

/* page notice and page note ---------------------------------------------- */

.page-notice {
  display: none;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--inset);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--card);
  color: var(--text-2);
  font-size: 13px;
}
.page-notice.show { display: flex; }
.page-notice.ok { color: var(--ok); border-color: var(--line); }
.page-notice.warn { color: var(--warn); }
.page-notice.err { color: var(--bad); }
.page-note {
  display: none;
  padding: var(--sp-3) var(--inset);
  border: 1px solid var(--line);
  border-left: 2px solid var(--warn);
  border-radius: var(--r-ctl);
  background: var(--card);
  color: var(--text-2);
  font-size: 13px;
}
.page-note.show { display: block; }
.page-note b { color: var(--text); font-weight: 620; }

.donut-legend { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-top: var(--sp-3); }
.donut-legend span { display: inline-flex; align-items: center; gap: var(--sp-1); color: var(--text-2); font-size: 12.5px; }
.donut-legend i { width: 7px; height: 7px; border-radius: 50%; }
.donut-legend i.ok { background: var(--ok); }
.donut-legend i.warn { background: var(--warn); }
.donut-legend i.bad { background: var(--bad); }

.pickbox { display: inline-grid; place-items: center; width: 24px; height: 24px; }

/* utilities --------------------------------------------------------------- */

.row { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.row.tight { gap: 6px; }
.row.end { justify-content: flex-end; }
.grow { flex: 1 1 180px; min-width: 0; }
.spacer { flex: 1; }
.muted { color: var(--text-2); }
.dimtext { color: var(--text-3); }
.hint { color: var(--text-3); font-size: 12.5px; }
.mono { font-family: var(--mono); font-size: 12.5px; }
.num { font-variant-numeric: tabular-nums; text-align: right; }
.right { text-align: right; }
.nowrap { white-space: nowrap; }
.sep { height: 1px; background: var(--line); border: 0; margin: 0; }
.u-mt-2 { margin-top: var(--sp-2); }
.u-mt-3 { margin-top: var(--sp-3); }
.u-mt-4 { margin-top: var(--sp-4); }
.u-mb-2 { margin-bottom: var(--sp-2); }
.u-mb-3 { margin-bottom: var(--sp-3); }
.u-gap-2 { gap: var(--sp-2); }
.u-full { width: 100%; }
.u-auto { width: auto; }
.u-grow { flex: 1; }
.u-mb-0 { margin-bottom: 0; }
.u-tnum { font-variant-numeric: tabular-nums; }
.u-rule-top { border-top: 1px solid var(--line); }
.u-rule-gap { margin: var(--sp-4) 0; }
.defs { display: grid; grid-template-columns: minmax(0, 1fr); }
.def { display: flex; justify-content: space-between; gap: var(--sp-4); padding: var(--sp-2) 0; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.def dt { color: var(--text-2); }
.def dd { margin: 0; font-family: var(--mono); font-size: 12.5px; text-align: right; overflow-wrap: anywhere; }
.backlink { display: inline-flex; align-items: center; gap: 6px; color: var(--text-2); font-size: 13px; }
.backlink:hover { color: var(--text); text-decoration: none; }

/* responsive -------------------------------------------------------------- */

@media (max-width: 900px) {
  .topbar { flex-wrap: wrap; gap: 12px; padding: 12px 16px; }
  .topbar-right { flex-wrap: wrap; }
  #railStorage { display: none; }
  .nav { order: 3; width: 100%; overflow-x: auto; scrollbar-width: none; }
  .nav::-webkit-scrollbar { display: none; }
  .topbar-right { margin-left: auto; }
  .page { padding: 16px 16px 48px; gap: 16px; }
}

@media (max-width: 720px) {
  /* The header row leaves the flow but stays in the accessibility tree, so a
     screen reader still hears which column a cell belongs to. */
  .table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .table, .table tbody, .table tr, .table td { display: block; width: auto; }
  .table tbody tr { padding: 10px 16px; border-bottom: 1px solid var(--line); }
  .table tbody tr:last-child { border-bottom: 0; }
  .table tbody td {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr);
    gap: 12px;
    padding: 4px 0;
    border-bottom: 0;
    text-align: left;
  }
  .table tbody td::before {
    content: attr(data-l);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
  }
  .table tbody td:not([data-l])::before { content: none; }
  .table td.key { max-width: none; white-space: normal; overflow-wrap: anywhere; }
  .table td.pick { display: block; padding: 2px 0 6px; text-align: left; }
  .table tbody td.num { text-align: left; }
  .table td.actions { grid-template-columns: minmax(0, 1fr); text-align: left; display: flex; gap: 6px; padding-top: 10px; }
  .table td.actions .btn + .btn { margin-left: 0; }
  .card-head { flex-wrap: wrap; }
  .kpi .v { font-size: 24px; }
  .hero-row { flex-direction: column; align-items: stretch; gap: 18px; }
  .donut { width: 96px; height: 96px; flex-basis: 96px; }
  .bar-row { grid-template-columns: 76px minmax(0, 1fr) 56px; gap: 10px; }
}

@media (pointer: coarse) {
  :root { --tap: 44px; --tap-sm: 44px; }
  .nav a { padding: 8px 13px; }
}
`;

/* ---------- icons ---------- */

/**
 * Inline SVG icons. One 20 by 20 viewBox, 1.5 stroke, currentColor. No icon
 * font, no Unicode glyph, no external sprite.
 */
const ICON_PATHS: Record<string, string> = {
  refresh: '<path d="M16.5 8A6.5 6.5 0 1 0 17 12"/><path d="M16.5 3.5V8H12"/>',
  plus: '<path d="M10 4.5v11"/><path d="M4.5 10h11"/>',
  close: '<path d="M5 5l10 10"/><path d="M15 5 5 15"/>',
  check: '<path d="M4.5 10.5 8 14l7.5-8"/>',
  warning: '<path d="M10 3.5 18 17H2l8-13.5Z"/><path d="M10 8.5V12"/><path d="M10 14.5h.01"/>',
  search: '<circle cx="9" cy="9" r="4.5"/><path d="M12.5 12.5 17 17"/>',
  download: '<path d="M10 3.5V12"/><path d="M6.5 8.5 10 12l3.5-3.5"/><path d="M4 16h12"/>',
  trash: '<path d="M4 6h12"/><path d="M6.5 6l.8 10h5.4l.8-10"/><path d="M8.5 6V4h3v2"/>',
  test: '<path d="M11 3 5.5 11H9.5l-1 6 5.5-8H10l1-6Z"/>',
  copy: '<path d="M8 8h8v9H8z"/><path d="M12 8V4H4v9h4"/>',
  clock: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4.5l3 1.5"/>',
  back: '<path d="M12 4 6 10l6 6"/>',
  external: '<path d="M8 4h8v8"/><path d="M16 4 7 13"/>',
  filter: '<path d="M3 5h14l-5.5 6.5V16l-3 1.5v-6L3 5Z"/>',
};

export function icon(name: string, cls = "icon"): string {
  const path = ICON_PATHS[name];
  if (!path) return "";
  return (
    '<svg class="' +
    cls +
    '" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    path +
    "</svg>"
  );
}

/* ---------- navigation ---------- */

export type NavItem = { href: string; label: string };

export const NAV_ITEMS: NavItem[] = [
  { href: "/pengatur", label: "Overview" },
  { href: "/pengatur/logs", label: "Logs" },
  { href: "/pengatur/stats", label: "Statistics" },
  { href: "/pengatur/keys", label: "Keys" },
  { href: "/pengatur/models", label: "Models" },
  { href: "/pengatur/settings", label: "Settings" },
  { href: "/pengatur/audit", label: "Audit" },
];

/** `/pengatur/usage` is the same page as `/pengatur/logs`. */
function normaliseActive(active: string): string {
  if (active === "/pengatur/usage") return "/pengatur/logs";
  return active;
}

/** The top bar: brand, section switcher, session state and page actions. */
export function navBar(active: string, actions = ""): string {
  const current = normaliseActive(active);
  const links = NAV_ITEMS.map((item) => {
    const isActive = item.href === current;
    return (
      '<a href="' +
      item.href +
      '"' +
      (isActive ? ' aria-current="page"' : "") +
      ">" +
      item.label +
      "</a>"
    );
  }).join("");

  return (
    '<header class="topbar">' +
    '<a class="brand" href="/pengatur"><span class="logo" aria-hidden="true">G</span>GeminesX</a>' +
    '<nav class="nav" aria-label="Console sections">' +
    links +
    "</nav>" +
    '<div class="topbar-right">' +
    '<span class="status-pill warn" id="railSession"><i></i>no token</span>' +
    '<span class="status-pill" id="railStorage" hidden><i></i></span>' +
    actions +
    "</div>" +
    "</header>"
  );
}

/* ---------- page scaffolding ---------- */

export type PageOptions = {
  /** Page title, used for the document title. */
  title: string;
  /** Nav href of the active section. */
  active: string;
  /** Markup for the buttons on the right of the top bar. */
  actions?: string;
  /** Markup of the main content. */
  body: string;
  /** Page script, without the script tags. */
  script?: string;
};

/**
 * The whole document. Every console page goes through this function so the
 * head, the landmarks, the skip link and the top bar can never drift.
 */
export function consolePage(o: PageOptions): string {
  return (
    "<!doctype html>\n" +
    '<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="robots" content="noindex, nofollow">\n' +
    '<meta name="color-scheme" content="dark">\n' +
    "<title>" +
    escapeHtml(o.title) +
    " · GeminesX</title>\n" +
    '<link rel="icon" href="/favicon.ico" sizes="32x32">\n' +
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n' +
    '<link rel="apple-touch-icon" href="/favicon.svg">\n' +
    "<style>" +
    BASE_CSS +
    "</style>\n</head>\n<body>\n" +
    '<a class="skip" href="#main">Skip to content</a>\n' +
    navBar(o.active, o.actions ?? "") +
    '<main id="main" class="page">\n' +
    o.body +
    "\n</main>\n" +    "<script>" +
    CLIENT_JS +
    "</script>\n" +
    (o.script ? "<script>\n" + o.script + "\n</script>\n" : "") +
    "</body>\n</html>"
  );
}

/* ---------- shared markup helpers ---------- */

export function escapeHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export type StateKind = "empty" | "loading" | "error";

/**
 * Loading, empty or error placeholder. Same markup shape on every page so the
 * three states look identical wherever they appear.
 */
export function stateBlock(kind: StateKind, message: string, detail?: string, action?: string): string {
  const cls = kind === "error" ? "state error" : "state";
  return (
    '<div class="' +
    cls +
    '"><b>' +
    escapeHtml(message) +
    "</b>" +
    (detail ? '<p class="hint">' + escapeHtml(detail) + "</p>" : "") +
    (action ? '<div class="retry">' + action + "</div>" : "") +
    "</div>"
  );
}

/**
 * The page notice band. It sits under the page head on every page and is
 * always mounted, so a message that lands here is seen and announced. A
 * message written into a closed dialog or a hidden panel is a message nobody
 * ever reads.
 */
export function noticeBand(): string {
  return '<div id="pageNotice" class="page-notice" role="status" aria-live="polite"></div>';
}

/**
 * The admin token gate. Every console page opens with the same panel so the
 * operator always knows what the console wants and where the token goes.
 */
export function authGate(): string {
  return (
    '<section class="card" id="gate">' +
    '<div class="card-head"><h2>Admin token</h2></div>' +
    '<div class="card-body">' +
    '<form id="gateForm" autocomplete="off">' +
    '<label class="field" for="token">Paste the deployment admin token</label>' +
    '<div class="row">' +
    '<div class="grow"><input id="token" class="input" type="password" spellcheck="false" placeholder="ADMIN_TOKEN"></div>' +
    '<button id="connect" class="btn btn-primary" type="submit">Connect</button>' +
    "</div>" +
    '<p class="hint" style="margin-top:12px">The token is kept in this browser and sent only to this deployment as a bearer token.</p>' +
    "</form>" +
    '<div id="gateMsg" class="notice" role="status" aria-live="polite" style="margin-top:8px"></div>' +
    "</div>" +
    "</section>"
  );
}

/* ---------- client runtime ---------- */

/**
 * Shared browser runtime. One token store, one fetch helper, one gate
 * behaviour, one set of formatters and one set of component builders. Pages
 * add their own render code on top.
 */
export const CLIENT_JS = `
(function () {
  "use strict";

  var STORE = "geminesx.admin.token";

  var GX = {
    store: STORE,

    token: function () {
      try { return localStorage.getItem(STORE) || ""; } catch (e) { return ""; }
    },
    setToken: function (value) {
      try { localStorage.setItem(STORE, value); } catch (e) {}
    },
    clearToken: function () {
      try { localStorage.removeItem(STORE); } catch (e) {}
    },

    /* One fetch helper for the whole console. Errors carry the server
       message and the status code, so a page can tell "wrong token" from
       "server is down". */
    api: function (path, opts) {
      opts = opts || {};
      var headers = { authorization: "Bearer " + GX.token() };
      var body;
      if (opts.body !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(opts.body);
      }
      return fetch(path, {
        method: opts.method || "GET",
        headers: headers,
        body: body
      }).then(function (res) {
        return res.text().then(function (raw) {
          var data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
          if (!res.ok) {
            var message = (data && data.error && data.error.message) || ("HTTP " + res.status);
            message = String(message);
            /* An upstream body can be a JSON paragraph wrapped in a status.
               Dig out the sentence, then keep one line and cap it, so a
               failure reads as a message and not as a dump. */
            var brace = message.indexOf("{");
            if (brace >= 0) {
              try {
                var parsed = JSON.parse(message.slice(brace));
                if (parsed && parsed.error && parsed.error.message) message = parsed.error.message;
                else if (parsed && parsed.message) message = parsed.message;
              } catch (e) {}
            }
            message = message.split("\\n")[0];
            if (message.length > 160) message = message.slice(0, 157) + "...";
            var err = new Error(message);
            err.status = res.status;
            throw err;
          }
          return data;
        });
      });
    },

    /* Download helper for the CSV and JSON exports. */
    download: function (path, filename) {
      return fetch(path, { headers: { authorization: "Bearer " + GX.token() } })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          var name = filename;
          var disposition = res.headers.get("content-disposition");
          if (disposition) {
            var match = disposition.match(/filename="([^"]+)"/);
            if (match) name = match[1];
          }
          return res.blob().then(function (blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          });
        });
    },

    /* The token gate. Restores a stored token, submits on Enter, and shows
       the server message when the token is refused. */
    gate: function (opts) {
      opts = opts || {};
      var form = document.getElementById("gateForm");
      var input = document.getElementById("token");
      var msg = document.getElementById("gateMsg");
      var button = document.getElementById("connect");
      var panel = document.getElementById("gate");

      function fail(text) {
        if (!msg) return;
        msg.textContent = text;
        msg.className = "notice err";
      }

      function run(value) {
        if (!value) { fail("Enter the admin token."); return; }
        if (button) button.disabled = true;
        return Promise.resolve()
          .then(function () { return opts.onSuccess(value); })
          .then(function () {
            GX.setToken(value);
            if (msg) { msg.textContent = ""; msg.className = "notice"; }
            if (panel) panel.hidden = true;
            GX.session("connected");
            /* The gate owned the focus and is now gone, so hand it to the
               content instead of dropping it on the body. */
            var main = document.getElementById("main");
            if (main) {
              main.setAttribute("tabindex", "-1");
              main.focus({ preventScroll: true });
            }
          })
          .catch(function (err) {
            GX.clearToken();
            fail(err && err.message ? err.message : "Connection failed.");
          })
          .then(function () { if (button) button.disabled = false; });
      }

      if (form) {
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          run(input ? input.value.trim() : "");
        });
      }

      var saved = GX.token();
      if (saved) {
        if (input) input.value = saved;
        return run(saved);
      }
      if (input) input.focus();
    },

    /* Drop back to the token gate, for example after a 401. */
    lock: function (reason) {
      GX.clearToken();
      GX.session("locked", "bad");
      var panel = document.getElementById("gate");
      var msg = document.getElementById("gateMsg");
      if (panel) panel.hidden = false;
      if (msg) {
        msg.textContent = reason || "Token required.";
        msg.className = "notice err";
      }
      var input = document.getElementById("token");
      if (input) { input.value = ""; input.focus(); }
    },

    session: function (text, tone) {
      var node = document.getElementById("railSession");
      if (!node) return;
      node.textContent = text;
      node.className = "status-pill" + (tone ? " " + tone : "");
    },
    storage: function (text, tone) {
      var node = document.getElementById("railStorage");
      if (!node) return;
      node.textContent = text;
      node.hidden = !text;
      node.className = "status-pill" + (tone ? " " + tone : "");
    },

    /* Small DOM helper. Text goes through textContent, so no value is ever
       parsed as markup. */
    el: function (tag, attrs, kids) {
      var node = document.createElement(tag);
      attrs = attrs || {};
      for (var key in attrs) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2).toLowerCase(), value);
        else node.setAttribute(key, value === true ? "" : String(value));
      }
      if (kids !== undefined && kids !== null) {
        var list = Array.isArray(kids) ? kids : [kids];
        for (var i = 0; i < list.length; i++) {
          var kid = list[i];
          if (kid === null || kid === undefined || kid === false) continue;
          node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
        }
      }
      return node;
    },

    tag: function (text, tone, mono) {
      var span = GX.el("span", { class: "tag " + (tone || "plain") + (mono ? " mono" : "") });
      span.appendChild(GX.el("i"));
      span.appendChild(document.createTextNode(text));
      return span;
    },

    kpi: function (label, value, sub, tone, subTone) {
      var text = typeof value === "string" && !/^[-0-9.,%$ ]+$/.test(value);
      return GX.el("div", { class: "kpi" }, [
        GX.el("div", { class: "l", text: label }),
        GX.el("div", {
          class: "v" + (tone ? " " + tone : "") + (text ? " text" : ""),
          text: value === null || value === undefined ? "-" : String(value)
        }),
        sub ? GX.el("div", { class: "d" + (subTone ? " " + subTone : ""), text: sub }) : null
      ]);
    },

    chip: function (label, value) {
      var chip = GX.el("span", { class: "chip" }, [document.createTextNode(label)]);
      if (value !== undefined && value !== null) chip.appendChild(GX.el("b", { text: String(value) }));
      return chip;
    },

    meter: function (label, value, total, tone) {
      var row = GX.el("div", { class: "meter-row" }, [
        GX.el("span", { class: "name", text: label }),
        GX.el("span", { class: "meter" }, GX.el("i", {
          class: tone || "",
          style: "width:" + (total > 0 ? Math.round((value / total) * 100) : 0) + "%"
        })),
        GX.el("span", { class: "value", text: String(value) })
      ]);
      return row;
    },

    /* The pool ring: a conic split of ready, cooling and dead. */
    donut: function (ready, cooling, dead) {
      var total = ready + cooling + dead;
      var ok = total > 0 ? (ready / total) * 100 : 0;
      var warn = total > 0 ? (cooling / total) * 100 : 0;
      var ring = GX.el("div", { class: "donut" });
      ring.style.background = total > 0
        ? "conic-gradient(var(--ok) 0 " + ok + "%, var(--warn) " + ok + "% " + (ok + warn) + "%, var(--bad) " + (ok + warn) + "% 100%)"
        : "var(--card-3)";
      ring.appendChild(GX.el("b", { text: String(ready) }));
      ring.appendChild(GX.el("small", { text: "of " + total + " ready" }));
      return ring;
    },

    /* A tiny inline trend, built from numbers. */
    spark: function (values) {
      var box = GX.el("span", { class: "spark" });
      var max = 0;
      values.forEach(function (v) { if (v > max) max = v; });
      values.forEach(function (v, index) {
        var height = max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 2;
        box.appendChild(GX.el("i", {
          class: index === values.length - 1 ? "hi" : "",
          style: "height:" + height + "%"
        }));
      });
      return box;
    },

    state: function (kind, message, detail, action) {
      var box = GX.el("div", { class: kind === "error" ? "state error" : "state" });
      box.appendChild(GX.el("b", { text: message }));
      if (detail) box.appendChild(GX.el("p", { class: "hint", text: detail }));
      if (action) {
        var retry = GX.el("div", { class: "retry" });
        retry.appendChild(action);
        box.appendChild(retry);
      }
      return box;
    },

    /* Table cell. The label is kept for the stacked phone layout. */
    cell: function (row, text, cls, label) {
      var td = GX.el("td", { class: cls || null, "data-l": label || null });
      td.textContent = text === null || text === undefined ? "-" : String(text);
      row.appendChild(td);
      return td;
    },

    fmt: {
      num: function (value) {
        if (value === null || value === undefined || value === "") return "-";
        var n = Number(value);
        if (!isFinite(n)) return String(value);
        return n.toLocaleString("en-US");
      },
      compact: function (value) {
        if (value === null || value === undefined) return "-";
        var n = Number(value);
        if (!isFinite(n)) return String(value);
        if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace(/\\.0$/, "") + "B";
        if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\\.0$/, "") + "M";
        if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\\.0$/, "") + "k";
        return n.toLocaleString("en-US");
      },
      money: function (value) {
        if (value === null || value === undefined) return "-";
        var n = Number(value);
        if (!isFinite(n)) return "-";
        if (n === 0) return "$0";
        if (Math.abs(n) < 0.000001) return "<$0.000001";
        return "$" + n.toFixed(6).replace(/0+$/, "").replace(/\\.$/, "");
      },
      age: function (ms) {
        if (!ms) return "never";
        var d = Math.max(0, Date.now() - ms);
        var s = Math.floor(d / 1000);
        if (s < 60) return s + "s ago";
        var m = Math.floor(s / 60);
        if (m < 60) return m + "m ago";
        var h = Math.floor(m / 60);
        if (h < 24) return h + "h ago";
        return Math.floor(h / 24) + "d ago";
      },
      left: function (ms) {
        if (!ms || ms <= 0) return "0s";
        var s = Math.ceil(ms / 1000);
        if (s < 60) return s + "s";
        var m = Math.floor(s / 60), r = s % 60;
        if (m < 60) return r ? m + "m " + r + "s" : m + "m";
        var h = Math.floor(m / 60);
        return h + "h " + (m % 60) + "m";
      },
      clock: function (ts) {
        var d = new Date(ts);
        if (isNaN(d.getTime())) return "-";
        return d.toLocaleTimeString("en-GB", { hour12: false }) + "." +
          String(d.getMilliseconds()).padStart(3, "0");
      },
      time: function (ts) {
        var d = new Date(ts);
        if (isNaN(d.getTime())) return "-";
        return d.toLocaleTimeString("en-GB", { hour12: false });
      },
      stamp: function (ts) {
        var d = new Date(ts);
        if (isNaN(d.getTime())) return "-";
        return d.toLocaleString("en-GB", { hour12: false });
      }
    },

    debounce: function (fn, ms) {
      var timer = null;
      return function () {
        clearTimeout(timer);
        timer = setTimeout(fn, ms);
      };
    },

    /* Repeat a task, but never while the tab is in the background. */
    every: function (ms, fn) {
      var id = setInterval(function () {
        if (document.visibilityState === "visible") fn();
      }, ms);
      return function () { clearInterval(id); };
    },

    /* Open a dialog, with a fallback for engines without showModal. */
    openDialog: function (node) {
      if (!node) return;
      if (typeof node.showModal === "function") {
        if (!node.open) node.showModal();
        return;
      }
      node.setAttribute("open", "");
    },
    closeDialog: function (node) {
      if (!node) return;
      if (typeof node.close === "function" && node.open) node.close();
      else node.removeAttribute("open");
    },

    /* Toggle a button between busy and idle. */
    busy: function (button, label) {
      if (!button) return;
      button.setAttribute("aria-busy", "true");
      button.disabled = true;
      if (label) {
        button.setAttribute("data-label", button.innerHTML);
        button.textContent = label;
      }
    },
    idle: function (button) {
      if (!button) return;
      button.removeAttribute("aria-busy");
      button.disabled = false;
      var restore = button.getAttribute("data-label");
      if (restore) {
        button.innerHTML = restore;
        button.removeAttribute("data-label");
      }
    },

    say: function (node, text, kind) {
      if (!node) return;
      node.textContent = text || "";
      node.className = "notice" + (kind ? " " + kind : "");
    },

    /* The page level notice band. Always mounted, so every outcome the
       operator triggers is seen and announced. */
    notice: function (text, kind) {
      var node = document.getElementById("pageNotice");
      if (!node) return;
      node.textContent = text || "";
      node.className = "page-notice" + (text ? " show" : "") + (kind ? " " + kind : "");
    },
  };

  window.GX = GX;
})();
`;
