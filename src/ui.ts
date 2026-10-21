/**
 * Shared design system for the operator console.
 *
 * One stylesheet, one shell, one client runtime. Every console page is built
 * from `consolePage`, so the tokens, the reset, the navigation and the control
 * shapes can only drift in one place.
 *
 * Rules that hold everywhere:
 * - no gradients, no shadows, no blur, no coloured surface fills
 * - status is a dot plus a word, never a painted block
 * - three radii only (4 chips, 6 controls, 8 panels)
 * - five type sizes only (11, 12, 13, 14, 18)
 * - --accent is reserved for the focus ring, the active nav item, links and
 *   the primary action
 * - every colour comes from a custom property, never from a literal
 */

export const BASE_CSS = `
:root {
  color-scheme: dark;

  --bg: #0a0c0f;
  --surface: #101317;
  --surface-2: #161a20;
  --surface-3: #1c212a;
  --line: #21262e;
  --line-2: #2e343d;

  --text: #e8ebef;
  --text-2: #9aa3ae;
  --text-3: #7b8490;

  --accent: #4fb0c4;
  --accent-wash: rgba(79, 176, 196, 0.12);
  --accent-line: rgba(79, 176, 196, 0.42);
  --accent-ink: #06222a;

  --ok: #5fae7d;
  --warn: #cb9440;
  --danger: #c96464;

  --heat-1: rgba(79, 176, 196, 0.18);
  --heat-2: rgba(79, 176, 196, 0.34);
  --heat-3: rgba(79, 176, 196, 0.52);
  --heat-4: rgba(79, 176, 196, 0.74);
  --heat-5: rgba(79, 176, 196, 0.95);

  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  --tap: 30px;
  --tap-sm: 26px;
  --rail: 236px;
}

*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; padding: 0; }
html { background: var(--bg); -webkit-text-size-adjust: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
h1, h2, h3 { margin: 0; line-height: 1.25; font-weight: 600; }
p { margin: 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
b, strong { font-weight: 600; }
hr { border: 0; border-top: 1px solid var(--line); margin: 0; }
button, input, select, textarea { font: inherit; color: inherit; }
svg { display: block; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

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
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
.skip:focus { left: 8px; top: 8px; }

.app {
  display: grid;
  grid-template-columns: var(--rail) minmax(0, 1fr);
  min-height: 100vh;
}

.rail {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--line);
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
  color: var(--text);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.brand:hover { text-decoration: none; color: var(--text); }
.brand .mark { width: 20px; height: 20px; color: var(--accent); flex: 0 0 20px; }

.nav { display: flex; flex-direction: column; gap: 2px; padding: 12px 8px; overflow-y: auto; }
.nav a {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 32px;
  padding: 0 10px;
  border-left: 2px solid transparent;
  border-radius: 6px;
  color: var(--text-2);
  font-size: 13px;
}
.nav a:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
.nav a[aria-current="page"] {
  background: var(--accent-wash);
  border-left-color: var(--accent);
  color: var(--text);
}
.nav .icon { width: 16px; height: 16px; flex: 0 0 16px; color: var(--text-3); }
.nav a[aria-current="page"] .icon { color: var(--accent); }

.rail-foot {
  margin-top: auto;
  display: grid;
  gap: 3px;
  padding: 12px 16px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--text-3);
}
.rail-foot .row { display: flex; justify-content: space-between; gap: 8px; }
.rail-foot .k { text-transform: uppercase; letter-spacing: 0.05em; }
.rail-foot .v { color: var(--text-2); font-family: var(--mono); }

.main { min-width: 0; display: flex; flex-direction: column; }
.pagebar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 8px 24px;
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}
.pagebar h1 { font-size: 18px; letter-spacing: -0.01em; }
.pagebar .sub { font-size: 12px; color: var(--text-2); }
.pagebar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  width: 100%;
  max-width: 1320px;
}

/* instrument strip -------------------------------------------------------- */

.strip {
  display: flex;
  align-items: center;
  gap: 0;
  min-height: 48px;
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  overflow-x: auto;
  scrollbar-width: thin;
}
.strip .kv {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 16px;
  border-left: 1px solid var(--line);
  white-space: nowrap;
}
.strip .kv:first-child { border-left: 0; padding-left: 12px; }
.strip .kv b { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.strip .kv .k {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-3);
}
.strip .kv.ok b { color: var(--ok); }
.strip .kv.warn b { color: var(--warn); }
.strip .kv.bad b { color: var(--danger); }
.strip .spacer { flex: 1; }
.strip .meta {
  padding: 0 12px 0 16px;
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* panels ------------------------------------------------------------------ */

.panel { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
}
.panel-title { font-size: 14px; font-weight: 600; }
.panel-title .meta { margin-left: 8px; font-size: 12px; font-weight: 400; color: var(--text-2); }
.panel-body { padding: 16px; }
.panel-body.tight { padding: 0; }
.panel-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}
.panel-foot .meta { font-size: 12px; color: var(--text-2); }

/* stat grid --------------------------------------------------------------- */

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.stat { background: var(--surface); padding: 12px 16px; }
.stat b {
  display: block;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.stat span {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-3);
}

/* definition grid --------------------------------------------------------- */

.defs { display: grid; grid-template-columns: minmax(0, 1fr); }
.def {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}
.def dt { color: var(--text-2); }
.def dd {
  margin: 0;
  font-family: var(--mono);
  font-size: 12px;
  text-align: right;
  overflow-wrap: anywhere;
}

/* layout helpers ---------------------------------------------------------- */

.grid { display: grid; gap: 16px; align-items: start; }
.grid.split { grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1080px) { .grid.split { grid-template-columns: minmax(0, 2.4fr) minmax(260px, 1fr); } }
.grid.cols2 { grid-template-columns: minmax(0, 1fr); }
@media (min-width: 860px) { .grid.cols2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.row.tight { gap: 4px; }
.row.end { justify-content: flex-end; }
.grow { flex: 1 1 180px; min-width: 0; }
.spacer { flex: 1; }
.stack { display: flex; flex-direction: column; gap: 16px; }
.muted { color: var(--text-2); }
.dimtext { color: var(--text-3); }
.hint { font-size: 12px; color: var(--text-2); }
.mono { font-family: var(--mono); font-size: 12px; }
.num { font-variant-numeric: tabular-nums; text-align: right; }
.right { text-align: right; }
.nowrap { white-space: nowrap; }
.truncate { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field { display: block; margin-bottom: 6px; font-size: 12px; color: var(--text-2); }
.sep { height: 1px; background: var(--line); border: 0; margin: 0; }

/* tables ------------------------------------------------------------------ */

.tablewrap { overflow-x: auto; }
.scroll-y { max-height: 420px; overflow-y: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table thead th {
  padding: 8px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-3);
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.table tbody td { padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.table tbody tr:last-child td { border-bottom: 0; }
.table tbody tr:hover { background: var(--surface-2); }
.table .key {
  font-family: var(--mono);
  font-size: 12px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table .actions { text-align: right; white-space: nowrap; }
.table .actions .btn + .btn { margin-left: 6px; }
.table .sub { font-size: 11px; color: var(--text-3); }
.table tr.is-selected td { background: var(--accent-wash); }

/* controls ---------------------------------------------------------------- */

.btn, button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  text-decoration: none;
}
.btn:hover, button:hover { background: var(--surface-3); border-color: var(--text-3); text-decoration: none; }
.btn:active, button:active { background: var(--surface); }
.btn[disabled], button[disabled] { opacity: 0.45; cursor: not-allowed; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
.btn-primary:hover { background: var(--accent); border-color: var(--text); }
.btn-danger { background: transparent; border-color: var(--line-2); color: var(--danger); }
.btn-danger:hover { background: var(--surface-2); border-color: var(--danger); }
.btn-ghost { background: transparent; border-color: transparent; color: var(--text-2); }
.btn-ghost:hover { background: var(--surface-2); color: var(--text); border-color: transparent; }
.btn .icon { width: 14px; height: 14px; flex: 0 0 14px; }
.small { height: var(--tap-sm); padding: 0 8px; font-size: 12px; }
.icon-btn { width: var(--tap-sm); padding: 0; }
.tier { width: auto; height: var(--tap-sm); font-size: 12px; padding: 0 6px; }

.input, input[type="text"], input[type="password"], input[type="search"],
input[type="number"], input[type="datetime-local"], select, textarea {
  width: 100%;
  height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
}
textarea {
  height: auto;
  min-height: 104px;
  padding: 10px;
  resize: vertical;
  font-family: var(--mono);
  font-size: 12px;
}
select {
  cursor: pointer;
  appearance: none;
  padding-right: 28px;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%237b8490' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 14px 14px;
}
.input::placeholder, input::placeholder, textarea::placeholder { color: var(--text-3); }
.check { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-2); cursor: pointer; }
.check input[type="checkbox"] { width: 14px; height: 14px; margin: 0; accent-color: var(--accent); }

.seg {
  display: inline-flex;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-2);
}
.seg button {
  height: var(--tap);
  padding: 0 12px;
  border: 0;
  border-right: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  color: var(--text-2);
  font-size: 12px;
}
.seg button:last-child { border-right: 0; }
.seg button:hover { background: var(--surface-3); color: var(--text); }
.seg button[aria-pressed="true"] { background: var(--accent-wash); color: var(--text); font-weight: 600; }

/* status ------------------------------------------------------------------ */

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.badge.ok, .probe.ok { color: var(--ok); }
.badge.warn, .probe.warn { color: var(--warn); }
.badge.bad, .badge.err, .badge.dead, .probe.bad { color: var(--danger); }
.badge.info { color: var(--accent); }
.badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); }
.badge.ok .dot, .dot.ok { background: var(--ok); }
.badge.warn .dot, .dot.warn { background: var(--warn); }
.badge.bad .dot, .dot.err, .dot.dead { background: var(--danger); }
.badge.info .dot, .dot.info { background: var(--accent); }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); vertical-align: middle; }
.probe { font-family: var(--mono); font-size: 12px; color: var(--text-2); }
.cool { font-family: var(--mono); font-size: 12px; color: var(--warn); font-variant-numeric: tabular-nums; }

/* messages and states ----------------------------------------------------- */

.notice { font-size: 12px; color: var(--text-2); }
.notice:empty { display: none; }
.notice.ok { color: var(--ok); }
.notice.warn { color: var(--warn); }
.notice.err { color: var(--danger); }

.state { padding: 32px 16px; text-align: center; font-size: 13px; color: var(--text-2); }
.state b { display: block; margin-bottom: 4px; font-size: 14px; color: var(--text); }
.state.error { color: var(--danger); }
.state.error b { color: var(--danger); }
.state .retry { margin-top: 12px; }
.state .hint { margin-top: 4px; }

/* pager ------------------------------------------------------------------- */

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-2);
}
.pager .pages { display: flex; gap: 4px; flex-wrap: wrap; }
.pager button { min-width: var(--tap-sm); padding: 0 8px; font-size: 12px; }
.pager button.active { border-color: var(--accent); color: var(--accent); font-weight: 600; }

/* heatmap ----------------------------------------------------------------- */

.heat-scroll { overflow-x: auto; padding-bottom: 4px; }
.heat {
  display: grid;
  grid-template-columns: 30px repeat(24, minmax(14px, 1fr));
  gap: 2px;
  min-width: 420px;
  font-size: 11px;
  color: var(--text-3);
}
.heat .h { text-align: center; }
.heat .cell { height: 20px; border-radius: 4px; background: var(--surface-2); }
.heat .cell[data-level="1"] { background: var(--heat-1); }
.heat .cell[data-level="2"] { background: var(--heat-2); }
.heat .cell[data-level="3"] { background: var(--heat-3); }
.heat .cell[data-level="4"] { background: var(--heat-4); }
.heat .cell[data-level="5"] { background: var(--heat-5); }
.heat.values .cell { display: flex; align-items: center; justify-content: center; }
.heat.values .cell::after { content: attr(data-v); font-size: 11px; color: var(--text); }
.heat.values .cell[data-level="4"]::after,
.heat.values .cell[data-level="5"]::after { color: var(--accent-ink); }
.heat-legend { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-3); }
.heat-legend i { width: 12px; height: 12px; border-radius: 4px; display: inline-block; }

/* bars -------------------------------------------------------------------- */

.bars { display: flex; flex-direction: column; gap: 6px; }
.bar-row { display: grid; grid-template-columns: 92px minmax(0, 1fr) 64px; align-items: center; gap: 12px; font-size: 12px; }
.bar-row .label { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
.bar-row .value { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-2); }

/* dialog ------------------------------------------------------------------ */

dialog {
  width: calc(100% - 32px);
  max-width: 520px;
  padding: 0;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
}
dialog::backdrop { background: rgba(4, 6, 8, 0.72); }
dialog .panel-head { border-radius: 8px 8px 0 0; }
dialog .panel-foot { border-radius: 0 0 8px 8px; }

/* responsive -------------------------------------------------------------- */

@media (max-width: 1023px) {
  .app { grid-template-columns: minmax(0, 1fr); }
  .rail {
    position: sticky;
    top: 0;
    z-index: 20;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .brand { height: 48px; }
  .nav {
    flex-direction: row;
    gap: 4px;
    padding: 6px 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .nav::-webkit-scrollbar { display: none; }
  .nav a {
    height: 30px;
    border-left: 0;
    border-bottom: 2px solid transparent;
    border-radius: 4px;
    white-space: nowrap;
  }
  .nav a[aria-current="page"] { background: transparent; border-bottom-color: var(--accent); }
  .rail-foot { display: none; }
  .pagebar { position: static; flex-wrap: wrap; padding: 12px 16px; }
  .content { padding: 16px; gap: 12px; }
}

@media (max-width: 767px) {
  .table thead { display: none; }
  .table, .table tbody, .table tr, .table td { display: block; width: auto; }
  .table tbody tr { padding: 8px 12px; border-bottom: 1px solid var(--line); }
  .table tbody tr:last-child { border-bottom: 0; }
  .table tbody td {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 12px;
    padding: 3px 0;
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
  .table td.pick { display: block; padding: 2px 0 6px; }
  .table td.actions { grid-template-columns: minmax(0, 1fr); max-width: none; }
  .table td.actions { text-align: left; display: flex; gap: 6px; padding-top: 8px; }
  .table td.actions .btn + .btn { margin-left: 0; }
  .panel-head { flex-wrap: wrap; }
  .pagebar-actions { width: 100%; }
}

@media (pointer: coarse) {
  :root { --tap: 44px; --tap-sm: 44px; }
  .nav a { height: 40px; }
}
`;

/* ---------- icons ---------- */

/**
 * Inline SVG icons. One 20 by 20 viewBox, 1.5 stroke, currentColor. No icon
 * font, no Unicode glyph, no external sprite.
 */
const ICON_PATHS: Record<string, string> = {
  overview: '<path d="M3 11h3.5l2.5-6 3.5 12 2.5-8 1.5 2H17"/>',
  logs: '<path d="M8 5h9"/><path d="M8 10h9"/><path d="M8 15h6"/><path d="M4 5h.01"/><path d="M4 10h.01"/><path d="M4 15h.01"/>',
  stats: '<path d="M3 16.5h14"/><path d="M5.5 16V10"/><path d="M10 16V5.5"/><path d="M14.5 16v-4.5"/>',
  keys: '<circle cx="7" cy="10" r="3.5"/><path d="M10.5 10H17"/><path d="M13.5 10v3"/><path d="M17 10v2.5"/>',
  models: '<path d="M10 3 3 7l7 4 7-4-7-4Z"/><path d="M3 11l7 4 7-4"/>',
  settings: '<path d="M3.5 6.5h13"/><path d="M3.5 13.5h13"/><circle cx="8" cy="6.5" r="2"/><circle cx="13" cy="13.5" r="2"/>',
  audit: '<path d="M10 3 4.5 5v4.5c0 3.4 2.3 5.9 5.5 7 3.2-1.1 5.5-3.6 5.5-7V5L10 3Z"/><path d="M7.6 9.9 9.5 12l3-3.6"/>',
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
  mark: '<path d="M4 7h12l-6 11L4 7Z"/><path d="M10 2 4 7h12L10 2Z"/>',
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

export type NavItem = { href: string; label: string; icon: string };

export const NAV_ITEMS: NavItem[] = [
  { href: "/pengatur", label: "Overview", icon: "overview" },
  { href: "/pengatur/logs", label: "Logs", icon: "logs" },
  { href: "/pengatur/stats", label: "Statistics", icon: "stats" },
  { href: "/pengatur/keys", label: "Keys", icon: "keys" },
  { href: "/pengatur/models", label: "Models", icon: "models" },
  { href: "/pengatur/settings", label: "Settings", icon: "settings" },
  { href: "/pengatur/audit", label: "Audit", icon: "audit" },
];

/** `/pengatur/usage` is the same page as `/pengatur/logs`. */
function normaliseActive(active: string): string {
  if (active === "/pengatur/usage") return "/pengatur/logs";
  return active;
}

/** The left rail: brand, section links and the session footer. */
export function navBar(active: string): string {
  const current = normaliseActive(active);
  const links = NAV_ITEMS.map((item) => {
    const isActive = item.href === current;
    return (
      '<a href="' +
      item.href +
      '"' +
      (isActive ? ' aria-current="page"' : "") +
      ">" +
      icon(item.icon) +
      "<span>" +
      item.label +
      "</span></a>"
    );
  }).join("");

  return (
    '<aside class="rail">' +
    '<a class="brand" href="/pengatur">' +
    icon("mark", "mark") +
    "<span>geminesx</span></a>" +
    '<nav class="nav" aria-label="Console sections">' +
    links +
    "</nav>" +
    '<div class="rail-foot">' +
    '<div class="row"><span class="k">storage</span><span class="v" id="railStorage">-</span></div>' +
    '<div class="row"><span class="k">session</span><span class="v" id="railSession">locked</span></div>' +
    "</div>" +
    "</aside>"
  );
}

/* ---------- page scaffolding ---------- */

export type PageOptions = {
  /** Page title, used for the document title and the page heading. */
  title: string;
  /** One line under the page heading. */
  subtitle?: string;
  /** Nav href of the active section. */
  active: string;
  /** Markup for the buttons on the right of the page header. */
  actions?: string;
  /** Markup of the main content. */
  body: string;
  /** Page script, without the script tags. */
  script?: string;
};

/**
 * The whole document. Every console page goes through this function so the
 * head, the landmarks, the skip link and the rail can never drift.
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
    '<div class="app">\n' +
    navBar(o.active) +
    '<div class="main">\n' +
    '<header class="pagebar">\n' +
    '<div class="pagebar-head"><h1>' +
    escapeHtml(o.title) +
    "</h1>" +
    (o.subtitle ? '<p class="sub">' + escapeHtml(o.subtitle) + "</p>" : "") +
    "</div>\n" +
    '<div class="pagebar-actions">' +
    (o.actions ?? "") +
    "</div>\n</header>\n" +
    '<main id="main" class="content">\n' +
    o.body +
    "\n</main>\n</div>\n</div>\n" +
    "<script>" +
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
 * The admin token gate. Every console page opens with the same panel so the
 * operator always knows what the console wants and where the token goes.
 */
export function authGate(): string {
  return (
    '<section id="gate" class="panel">' +
    '<div class="panel-head"><div class="panel-title">Admin token</div></div>' +
    '<div class="panel-body">' +
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
 * behaviour, one set of formatters. Pages add their own render code on top.
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
            /* Upstream bodies can be a paragraph of JSON. Keep one line and
               cap it, so a failure reads as a message and not as a dump. */
            message = String(message).split("\\n")[0];
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
      GX.session("locked");
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

    session: function (text) {
      var node = document.getElementById("railSession");
      if (node) node.textContent = text;
    },
    storage: function (text) {
      var node = document.getElementById("railStorage");
      if (node) node.textContent = text;
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

    badge: function (text, kind) {
      var span = GX.el("span", { class: "badge " + (kind || "") });
      span.appendChild(GX.el("span", { class: "dot" }));
      span.appendChild(document.createTextNode(text));
      return span;
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
      money: function (value) {
        if (value === null || value === undefined) return "-";
        var n = Number(value);
        if (!isFinite(n)) return "-";
        if (n === 0) return "$0";
        if (Math.abs(n) < 0.000001) return "<$0.000001";
        return "$" + n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
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

    /* Toggle a button between busy and idle. The label is replaced for the
       duration and the original markup comes back afterwards. */
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
    }
  };

  window.GX = GX;
})();
`;
