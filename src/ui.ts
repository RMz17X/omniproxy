/**
 * Shared design system for the operator console.
 *
 * One stylesheet, one shell, one set of primitives. The three console pages
 * import BASE_CSS and interpolate it into their document head, so the tokens,
 * the reset and the control shapes can only drift in one place.
 *
 * Rules that hold everywhere:
 * - no gradients, no shadows, no blur, no coloured surface fills
 * - status is a dot or short coloured text, never a painted block
 * - three radii only (4 chips, 6 controls, 8 panels)
 * - five type sizes only (11, 12, 13, 14, 18)
 * - --accent is reserved for the focus ring, the active nav underline and links
 */

export const BASE_CSS = `
:root {
  --bg: #0c0e11;
  --surface: #12151a;
  --surface-2: #171b21;
  --line: #232932;
  --line-strong: #2f3742;
  --text: #e3e7ec;
  --text-2: #9aa4b2;
  --text-3: #6b7684;
  --accent: #6f93ad;
  --ok: #4f9e6a;
  --warn: #c08b3e;
  --danger: #c05c5c;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --tap: 30px;
  --tap-sm: 26px;
  color-scheme: dark;
}

*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; padding: 0; }
html { background: var(--bg); }
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
h1 { font-size: 14px; }
h2 { font-size: 14px; }
p { margin: 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
b, strong { font-weight: 600; }
hr { border: 0; border-top: 1px solid var(--line); margin: 0; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* shell ------------------------------------------------------------------ */

.topbar {
  display: flex;
  align-items: center;
  gap: 24px;
  height: 48px;
  padding: 0 24px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.wordmark {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
  text-decoration: none;
}
.wordmark:hover { text-decoration: none; color: var(--text); }
.nav { display: flex; gap: 16px; height: 100%; }
.nav a {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--text-2);
  border-bottom: 2px solid transparent;
  text-decoration: none;
}
.nav a:hover { color: var(--text); text-decoration: none; }
.nav a.active { color: var(--text); border-bottom-color: var(--accent); }
.topbar .meta {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}
.page-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}
.page-head .meta { font-size: 12px; color: var(--text-2); }

/* instrument strip ------------------------------------------------------- */

.strip {
  display: flex;
  align-items: center;
  gap: 0;
  min-height: 52px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  overflow: hidden;
}
.strip .kv {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 16px;
  border-left: 1px solid var(--line);
}
.strip .kv:first-child { border-left: 0; padding-left: 8px; }
.strip .kv .k {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-3);
}
.strip .kv b {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.strip .kv.ready b { color: var(--ok); }
.strip .kv.cooling b { color: var(--warn); }
.strip .kv.dead b { color: var(--danger); }
.strip .spacer { flex: 1; }
.strip .meta {
  padding: 0 8px 0 16px;
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* panels ----------------------------------------------------------------- */

.panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  overflow: hidden;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
}
.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.panel-title .meta { font-size: 12px; color: var(--text-2); font-weight: 400; }
.panel-body { padding: 16px; }
.panel-body.tight { padding: 0; }
.panel .foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-top: 1px solid var(--line);
}
.tablewrap { overflow-x: auto; }
.dialog {
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--surface);
  padding: 16px;
  color: var(--text);
}

/* layout helpers --------------------------------------------------------- */

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.row.tight { gap: 4px; }
.grow { flex: 1; min-width: 160px; }
.spacer { flex: 1; }
.stack { display: flex; flex-direction: column; gap: 24px; }
.muted { color: var(--text-2); }
.dimtext { color: var(--text-3); }
.mono { font-family: var(--mono); font-size: 12px; }
.num { font-variant-numeric: tabular-nums; text-align: right; }
.right { text-align: right; }
.nowrap { white-space: nowrap; }
.field {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-2);
}

/* tables ----------------------------------------------------------------- */

.table, table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.table thead th, table thead th {
  padding: 8px;
  text-align: left;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-3);
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.table tbody td, table tbody td {
  padding: 8px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}
.table tbody tr:last-child td, table tbody tr:last-child td { border-bottom: 0; }
.table tbody tr:hover, table tbody tr:hover { background: var(--surface-2); }
.key {
  font-family: var(--mono);
  font-size: 12px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mid { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { white-space: nowrap; text-align: right; }

/* controls --------------------------------------------------------------- */

.btn, button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover, button:hover { border-color: var(--text-3); }
.btn:active, button:active { background: var(--surface); }
.btn[disabled], button[disabled] { color: var(--text-3); cursor: default; }
.btn-primary {
  background: var(--surface-2);
  border-color: var(--text-3);
  color: var(--text);
  font-weight: 600;
}
.btn-danger { background: transparent; border-color: var(--line-strong); color: var(--danger); }
.btn-danger:hover { border-color: var(--danger); }
.small, .act {
  height: var(--tap-sm);
  padding: 0 8px;
  font-size: 12px;
}
.tier { height: var(--tap-sm); font-size: 12px; width: auto; }

.input, input[type="text"], input[type="password"], input[type="search"], textarea, select {
  width: 100%;
  height: var(--tap);
  padding: 0 8px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
}
textarea {
  height: auto;
  min-height: 96px;
  padding: 8px;
  resize: vertical;
  font-family: var(--mono);
  font-size: 12px;
}
.select, select { cursor: pointer; }
.input::placeholder, input::placeholder, textarea::placeholder { color: var(--text-3); }
.check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}
.check input[type="checkbox"] {
  width: auto;
  height: auto;
  margin: 0;
  accent-color: var(--accent);
}

/* status ----------------------------------------------------------------- */

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 6px;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.badge.ok, .probe.ok { color: var(--ok); }
.badge.warn, .probe.warn { color: var(--warn); }
.badge.bad, .badge.dead, .probe.bad { color: var(--danger); }
.badge.free { color: var(--ok); }
.badge.paid { color: var(--warn); }
.badge.unknown { color: var(--text-3); }
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 4px;
  background: var(--text-3);
  vertical-align: middle;
}
.dot.ok { background: var(--ok); }
.dot.warn { background: var(--warn); }
.dot.bad, .dot.dead { background: var(--danger); }
.cool { font-family: var(--mono); font-size: 12px; color: var(--warn); }

/* messages and states ---------------------------------------------------- */

.msg, .notice {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 8px;
}
.msg:empty, .notice:empty { display: none; }
.msg.ok, .notice.ok { color: var(--ok); }
.msg.warn, .notice.warn { color: var(--warn); }
.msg.err, .notice.err { color: var(--danger); }
.msg.show { display: block; }

.state, .empty {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--text-2);
}
.state.loading { color: var(--text-2); }
.state.error { color: var(--danger); }
.state .retry { margin-top: 12px; }

/* pager ------------------------------------------------------------------ */

.pager {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-2);
}
.pager .pages { display: flex; gap: 4px; flex-wrap: wrap; }
.pager button {
  min-width: var(--tap-sm);
  padding: 0 8px;
  font-size: 12px;
}
.pager button.active {
  background: var(--surface-2);
  border-color: var(--text-3);
  color: var(--text);
  font-weight: 600;
}

/* responsive ------------------------------------------------------------- */

@media (max-width: 767px) {
  .page { padding: 16px; gap: 16px; }
  .topbar { padding: 0 16px; gap: 16px; }
  .topbar .meta { display: none; }
  .strip { display: none; }
  .panel-head { flex-wrap: wrap; }
  .panel .foot { flex-wrap: wrap; }

  .table thead, .table thead th, table thead th { display: none; }
  .table, .table tbody, .table tr, .table td,
  table, table tbody, table tr, table td { display: block; width: auto; }
  .table tbody tr, table tbody tr {
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .table tbody tr:last-child, table tbody tr:last-child { border-bottom: 0; }
  .table tbody td, table tbody td {
    display: grid;
    grid-template-columns: 104px 1fr;
    gap: 8px;
    padding: 4px 12px;
    border-bottom: 0;
  }
  .table tbody td::before, table tbody td::before {
    content: attr(data-l);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-3);
  }
  .table tbody td:not([data-l])::before, table tbody td:not([data-l])::before { content: none; }
  .table td.key, .table td.mid, .table td.actions,
  table td.key, table td.mid, table td.actions {
    grid-template-columns: 1fr;
    max-width: none;
  }
  .actions { text-align: left; }
}

/* heat grid -------------------------------------------------------------- */

.heatgrid {
  display: grid;
  grid-template-columns: 34px repeat(24, minmax(18px, 1fr));
  gap: 2px;
  font-size: 11px;
  color: var(--text-3);
}
.heatgrid .h { text-align: center; }
.heatgrid .cell {
  height: 18px;
  border-radius: 4px;
  background: var(--surface-2);
}

@media (pointer: coarse) {
  :root { --tap: 44px; --tap-sm: 44px; }
}
`;

export type StateKind = "empty" | "loading" | "error";

/**
 * Loading, empty or error placeholder. Same markup shape on every page so the
 * three states look identical wherever they appear.
 */
export function stateBlock(kind: StateKind, message: string): string {
  return '<div class="state ' + kind + '">' + message + "</div>";
}

export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/pengatur", label: "Overview" },
  { href: "/pengatur/logs", label: "Logs" },
  { href: "/pengatur/stats", label: "Statistics" },
  { href: "/pengatur/keys", label: "Keys" },
  { href: "/pengatur/models", label: "Models" },
  { href: "/pengatur/settings", label: "Settings" },
  { href: "/pengatur/audit", label: "Audit" },
];

/**
 * Top bar for every console page. `active` is matched against the href; the
 * alias /pengatur/usage belongs to /pengatur/logs.
 */
export function navBar(active: string): string {
  const current = active === "/pengatur/usage" ? "/pengatur/logs" : active;
  const links = NAV_ITEMS.map((item) => {
    const on = item.href === current;
    return '<a href="' + item.href + '"' + (on ? ' class="active" aria-current="page"' : "") + ">" + item.label + "</a>";
  }).join("\n    ");
  return '<header class="topbar">\n' +
    '  <a class="wordmark" href="/pengatur">geminesx</a>\n' +
    '  <nav class="nav">\n    ' + links + "\n  </nav>\n" +
    "</header>";
}