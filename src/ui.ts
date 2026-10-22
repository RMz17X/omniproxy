/**
 * Shared design system for the operator console.
 *
 * One stylesheet, one shell, one client runtime. Every console page is built
 * from `consolePage`, so the tokens, the reset, the navigation and the control
 * shapes can only drift in one place.
 *
 * The direction is a ledger, not a dashboard:
 * - a paper surface carries the data; an ink rail carries the navigation
 * - structure comes from hairlines and eyebrows, never from boxed cards
 * - one cobalt accent marks the active section and the primary action
 * - numerals are tabular and monospaced, so columns line up down the page
 * - light is the default; the dark theme is the same system, inverted
 *
 * Rules that hold everywhere:
 * - no decorative gradient, no shadow, no blur, no glow
 * - status is a dot plus a word, never a painted block
 * - radii: 6 controls, 12 surfaces, pills for tags
 * - type: 11 / 12 / 13 / 14 / 16 / 20 / 26 / 34
 * - every colour comes from a custom property, never from a literal
 */

import { storageMode } from "./pool.ts";

export const BASE_CSS = `
:root {
  color-scheme: light;

  /* paper ------------------------------------------------------------- */
  --bg: #f5f5f2;
  --surface: #ffffff;
  --surface-2: #f1f1ec;
  --surface-3: #e8e8e2;
  --line: #e2e1db;
  --line-2: #cbc9c1;

  --text: #14161a;
  --text-2: #4f5560;
  --text-3: #636974;

  --accent: #2646c9;
  --accent-hover: #1d39a8;
  --accent-ink: #ffffff;
  --accent-wash: rgba(38, 70, 201, 0.09);

  --ok: #0f7a4a;
  --warn: #8a5200;
  --bad: #b3261e;
  --neutral: #5a6270;

  --wash-ok: rgba(15, 122, 74, 0.10);
  --wash-warn: rgba(138, 82, 0, 0.10);
  --wash-bad: rgba(179, 38, 30, 0.09);
  --wash-neutral: rgba(90, 98, 112, 0.09);

  /* ink rail, identical in both themes --------------------------------- */
  --rail-bg: #101319;
  --rail-bg-2: #171b23;
  --rail-line: #262c37;
  --rail-text: #e9edf4;
  --rail-muted: #8d97a8;
  --rail-active: #232a36;

  --sans: "Inter", "Inter var", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  --r-surface: 12px;
  --r-ctl: 6px;
  --r-pill: 999px;

  /* One spacing scale. 4px base, and one horizontal inset that the panel
     padding, the table cells and the page padding all share. */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-7: 32px;
  --sp-8: 48px;
  --inset: 20px;

  --tap: 36px;
  --tap-sm: 30px;

  --rail: 236px;
  --page-max: 1240px;
}

:root[data-theme="dark"] {
  color-scheme: dark;

  --bg: #0c0e12;
  --surface: #13161c;
  --surface-2: #191d25;
  --surface-3: #212630;
  --line: #242932;
  --line-2: #363d49;

  --text: #eef1f6;
  --text-2: #a6aebc;
  --text-3: #8c94a2;

  --accent: #8ea2ff;
  --accent-hover: #a6b6ff;
  --accent-ink: #0b0d12;
  --accent-wash: rgba(142, 162, 255, 0.14);

  --ok: #45cf91;
  --warn: #f0b054;
  --bad: #ff7f76;
  --neutral: #9aa4b4;

  --wash-ok: rgba(69, 207, 145, 0.14);
  --wash-warn: rgba(240, 176, 84, 0.14);
  --wash-bad: rgba(255, 127, 118, 0.13);
  --wash-neutral: rgba(154, 164, 180, 0.12);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;

    --bg: #0c0e12;
    --surface: #13161c;
    --surface-2: #191d25;
    --surface-3: #212630;
    --line: #242932;
    --line-2: #363d49;

    --text: #eef1f6;
    --text-2: #a6aebc;
    --text-3: #8c94a2;

    --accent: #8ea2ff;
    --accent-hover: #a6b6ff;
    --accent-ink: #0b0d12;
    --accent-wash: rgba(142, 162, 255, 0.14);

    --ok: #45cf91;
    --warn: #f0b054;
    --bad: #ff7f76;
    --neutral: #9aa4b4;

    --wash-ok: rgba(69, 207, 145, 0.14);
    --wash-warn: rgba(240, 176, 84, 0.14);
    --wash-bad: rgba(255, 127, 118, 0.13);
    --wash-neutral: rgba(154, 164, 180, 0.12);
  }
}

/* compact density: the same page, one notch tighter ---------------------- */
:root[data-density="compact"] {
  --tap: 30px;
  --tap-sm: 26px;
  --sp-6: 18px;
  --sp-7: 24px;
  --inset: 14px;
  --page-max: 1440px;
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
  line-height: 1.55;
  font-feature-settings: "cv05" 1, "ss01" 1;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
h1, h2, h3, h4 { margin: 0; line-height: 1.25; font-weight: 640; letter-spacing: -0.018em; }
p { margin: 0; }
a { color: inherit; text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 2px; }
b, strong { font-weight: 640; }
hr { border: 0; border-top: 1px solid var(--line); margin: 0; }
button, input, select, textarea { font: inherit; color: inherit; }
svg { display: block; }
code, kbd, samp { font-family: var(--mono); font-size: 0.92em; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
#main:focus, #main:focus-visible { outline: none; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* shell ------------------------------------------------------------------ */

.skip {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 200;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-ctl);
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 620;
}
.skip:focus { left: 12px; top: 12px; }

.shell {
  display: grid;
  grid-template-columns: var(--rail) minmax(0, 1fr);
  min-height: 100dvh;
}

/* the rail --------------------------------------------------------------- */

.rail {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  height: 100dvh;
  padding: var(--sp-5) var(--sp-3);
  overflow-y: auto;
  background: var(--rail-bg);
  color: var(--rail-text);
  border-right: 1px solid var(--rail-line);
}

.rail-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 var(--sp-2);
  min-height: var(--tap);
}
.rail-brand:hover { text-decoration: none; }
.rail-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--rail-text);
  color: var(--rail-bg);
  flex: none;
}
.rail-name { display: flex; flex-direction: column; line-height: 1.15; }
.rail-name b { font-size: 15px; font-weight: 660; letter-spacing: -0.02em; }
.rail-name span { font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--rail-muted); }

.rail-nav { display: flex; flex-direction: column; gap: var(--sp-4); }
.rail-group { display: flex; flex-direction: column; gap: 2px; }
.rail-label {
  padding: 0 var(--sp-2) 6px;
  font-size: 10px;
  font-weight: 620;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--rail-muted);
}
.rail-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  padding: 0 10px;
  border-left: 2px solid transparent;
  border-radius: 7px;
  color: var(--rail-muted);
  font-size: 13.5px;
  font-weight: 520;
  transition: background-color 140ms ease, color 140ms ease;
}
.rail-item svg { flex: none; opacity: 0.85; }
.rail-item:hover { background: var(--rail-bg-2); color: var(--rail-text); text-decoration: none; }
.rail-item[aria-current="page"] {
  background: var(--rail-active);
  color: var(--rail-text);
  border-left-color: var(--accent);
}
.rail-item[aria-current="page"] svg { opacity: 1; color: var(--accent); }

.rail-foot { margin-top: auto; display: flex; flex-direction: column; gap: 2px; }
.rail-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 11.5px;
  color: var(--rail-muted);
}
.rail-state b { color: var(--rail-text); font-weight: 560; font-family: var(--mono); font-size: 11px; }
.rail-tools { display: flex; gap: 4px; padding: 4px var(--sp-2) 0; }
.rail-tool {
  display: grid;
  place-items: center;
  width: var(--tap-sm);
  height: var(--tap-sm);
  border: 1px solid var(--rail-line);
  border-radius: 6px;
  background: transparent;
  color: var(--rail-muted);
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
}
.rail-tool:hover { color: var(--rail-text); border-color: var(--rail-muted); }
.rail-tool[aria-pressed="true"] { color: var(--rail-text); border-color: var(--accent); }

.rail-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px var(--sp-2) 0; }
.rail-state[data-tone="warn"] b { color: var(--warn); }
.rail-state[data-tone="bad"] b { color: var(--bad); }

/* the canvas ------------------------------------------------------------- */

.canvas { display: flex; flex-direction: column; min-width: 0; }

.canvas-head {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 56px;
  padding: 0 var(--sp-6);
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}
.canvas-crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-3);
}
.canvas-crumb b { color: var(--text); font-weight: 600; font-size: 13px; }
.head-actions { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }

.menu-btn { display: none; flex: none; }

.page {
  width: 100%;
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--sp-7) var(--sp-6) var(--sp-8);
  min-width: 0;
}

/* page head -------------------------------------------------------------- */

.eyebrow {
  display: block;
  margin-bottom: 6px;
  font-size: 10.5px;
  font-weight: 640;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-3);
}
.page-head { display: flex; align-items: flex-end; gap: var(--sp-5); flex-wrap: wrap; margin-bottom: var(--sp-6); }
.page-head-main { min-width: 0; flex: 1 1 320px; }
.page-title { font-size: clamp(24px, 1.6vw + 18px, 34px); letter-spacing: -0.03em; font-weight: 660; }
.page-lede { margin-top: 6px; max-width: 68ch; color: var(--text-2); font-size: 13.5px; }
.page-head-side { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }

/* surfaces --------------------------------------------------------------- */

.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-surface);
  min-width: 0;
  overflow: hidden;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 14px var(--inset);
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}
.panel-head h2, .panel-head h3 { font-size: 13.5px; font-weight: 620; letter-spacing: -0.01em; }
.panel-head .meta { margin-left: auto; font-size: 12px; color: var(--text-3); }
.panel-body { padding: var(--inset); }
.panel-body.flush { padding: 0; }
.panel-foot { display: flex; align-items: center; gap: var(--sp-2); padding: 12px var(--inset); border-top: 1px solid var(--line); flex-wrap: wrap; }
.panel-note { padding: 10px var(--inset); border-top: 1px solid var(--line); font-size: 12px; color: var(--text-3); }

/* a zone: hairline header, no box */
.zone { border-top: 1px solid var(--line); padding-top: var(--sp-4); margin-top: var(--sp-6); }
.zone:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
.zone-head { display: flex; align-items: baseline; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-3); }
.zone-head h2 { font-size: 12px; font-weight: 640; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.zone-head .meta { margin-left: auto; font-size: 12px; color: var(--text-3); }

.grid { display: grid; gap: var(--sp-4); min-width: 0; }
.grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.split { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }

/* figures ---------------------------------------------------------------- */

.figures {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-surface);
  overflow: hidden;
}
.fig {
  padding: 16px var(--inset) 18px;
  border-left: 1px solid var(--line);
  min-width: 0;
}
.fig:first-child { border-left: 0; }
.fig-label { display: block; font-size: 10.5px; font-weight: 620; letter-spacing: 0.13em; text-transform: uppercase; color: var(--text-3); }
.fig-value {
  display: block;
  margin-top: 6px;
  font-family: var(--mono);
  font-size: 27px;
  font-weight: 550;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
  word-break: break-word;
}
.fig-sub { display: block; margin-top: 6px; font-size: 12px; color: var(--text-2); }
.fig[data-tone="ok"] .fig-value { color: var(--ok); }
.fig[data-tone="warn"] .fig-value { color: var(--warn); }
.fig[data-tone="bad"] .fig-value { color: var(--bad); }

.kpi { padding: 14px var(--inset); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-surface); }

/* controls --------------------------------------------------------------- */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 560;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}
.btn:hover { background: var(--surface-2); border-color: var(--text-3); }
.btn:active { background: var(--surface-3); }
.btn[disabled], .btn[aria-busy="true"] { opacity: 0.55; cursor: default; }
.btn svg { flex: none; opacity: 0.8; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn-primary svg { opacity: 1; }
.btn-danger { color: var(--bad); border-color: var(--line-2); }
.btn-danger:hover { background: var(--wash-bad); border-color: var(--bad); }
.btn-ghost { background: transparent; border-color: transparent; color: var(--text-2); }
.btn-ghost:hover { background: var(--surface-2); border-color: transparent; color: var(--text); }
.btn-sm { min-height: var(--tap-sm); padding: 0 9px; font-size: 12.5px; }
.btn-block { width: 100%; }
.icon-btn { width: var(--tap); padding: 0; }
.icon-btn.btn-sm { width: var(--tap-sm); }

.field { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 580; color: var(--text-2); }
.input, .select, .textarea {
  width: 100%;
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  transition: border-color 140ms ease;
}
.textarea { padding: 9px 10px; min-height: 96px; resize: vertical; line-height: 1.5; }
.input::placeholder, .textarea::placeholder { color: var(--text-3); }
.input:hover, .select:hover, .textarea:hover { border-color: var(--text-3); }
.input:focus, .select:focus, .textarea:focus { outline: none; border-color: var(--accent); }
.select {
  appearance: none;
  padding-right: 28px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23636974' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 9px center;
}

.search { position: relative; min-width: 0; }
.search svg { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--text-3); pointer-events: none; }
.search .input { padding-left: 30px; }

.toolbar { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.toolbar .grow { flex: 1 1 200px; min-width: 0; }
.row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.grow { flex: 1 1 auto; min-width: 0; }
.spacer { flex: 1 1 auto; }
.hint { font-size: 12.5px; color: var(--text-2); line-height: 1.5; }
.muted { color: var(--text-3); }
.mono, .num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.num { text-align: right; }

.check { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-2); cursor: pointer; }
.check input[type="checkbox"] {
  appearance: none;
  width: 17px;
  height: 17px;
  margin: 0;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  background: var(--surface);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease;
}
.check input[type="checkbox"]:checked { background: var(--accent); border-color: var(--accent); }
.check input[type="checkbox"]:checked::after {
  content: "";
  width: 9px;
  height: 5px;
  border-left: 2px solid var(--accent-ink);
  border-bottom: 2px solid var(--accent-ink);
  transform: translateY(-1px) rotate(-45deg);
}
.check input[type="checkbox"]:indeterminate { background: var(--accent); border-color: var(--accent); }
.check input[type="checkbox"]:indeterminate::after {
  content: "";
  width: 9px;
  height: 2px;
  background: var(--accent-ink);
}

/* bare controls emitted by tables and toolbars get the same skin */
select:not(.select), td select {
  min-height: var(--tap-sm);
  padding: 0 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-ctl);
  background-color: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
}
select:not(.select):hover, td select:hover { border-color: var(--text-3); }
select:not(.select):focus-visible, td select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

td input[type=checkbox] {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
  vertical-align: middle;
}
td input[type=checkbox]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (pointer: coarse), (hover: none) {
  td input[type=checkbox] { width: 22px; height: 22px; }
}
.pickbox { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; cursor: pointer; }
.pickbox input[type=checkbox] { width: 18px; height: 18px; margin: 0; cursor: pointer; }
@media (pointer: coarse), (hover: none) {
  .pickbox { min-width: var(--tap); min-height: var(--tap); }
  .pickbox input[type=checkbox] { width: 22px; height: 22px; }
}

.seg { display: inline-flex; padding: 2px; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--surface); gap: 2px; }
.seg button {
  min-height: calc(var(--tap) - 8px);
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 560;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}
.seg button:hover { color: var(--text); background: var(--surface-2); }
.seg button[aria-pressed="true"] { background: var(--text); color: var(--bg); }

/* tags ------------------------------------------------------------------- */

.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 1px 9px 1px 7px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 560;
  line-height: 1.7;
  white-space: nowrap;
}
.tag .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
.tag[data-tone="ok"] { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 40%, var(--line)); background: var(--wash-ok); }
.tag[data-tone="warn"] { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, var(--line)); background: var(--wash-warn); }
.tag[data-tone="bad"] { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 40%, var(--line)); background: var(--wash-bad); }
.tag[data-tone="neutral"] { color: var(--text-2); background: var(--wash-neutral); }
.tag[data-tone="accent"] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); background: var(--accent-wash); }
.tag-mono { font-family: var(--mono); font-size: 11px; letter-spacing: -0.01em; }

.chip { display: inline-flex; align-items: baseline; gap: 8px; }
.chip + .chip { margin-left: var(--sp-4); padding-left: var(--sp-4); border-left: 1px solid var(--line); }
.chip-k { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-3); }
.chip-v { font-family: var(--mono); font-size: 13px; font-variant-numeric: tabular-nums; }

/* tables ----------------------------------------------------------------- */

.table-wrap { width: 100%; overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 9px var(--inset);
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 640;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
}
.table td {
  padding: 10px var(--inset);
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
  min-width: 0;
}
.table tbody tr:last-child td { border-bottom: 0; }
.table tbody tr { transition: background-color 120ms ease; }
.table tbody tr:hover { background: var(--surface-2); }
.table th.num, .table td.num { text-align: right; }
.table td.mono { font-family: var(--mono); font-size: 12.5px; }
.table .id-cell { font-family: var(--mono); font-size: 12px; color: var(--text-2); }
.table tbody tr[aria-selected="true"] { background: var(--accent-wash); }
.table .actions-cell { text-align: right; white-space: nowrap; }

/* Inline links. A table cell is often nothing but a link, so the link owns
   the cell's height and gives a full-width row of tap surface on touch. */
.link {
  color: var(--accent);
  text-decoration: none;
  border-radius: 3px;
  overflow-wrap: anywhere;
}
.link:hover { text-decoration: underline; text-underline-offset: 2px; }
.link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.table td > .link { display: inline-flex; align-items: center; min-height: 24px; }

.pager { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.pager .meta { font-size: 12px; color: var(--text-3); }

/* states ----------------------------------------------------------------- */

.state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: var(--sp-6) var(--inset);
  color: var(--text-2);
  font-size: 13px;
}
.state b { color: var(--text); font-size: 13.5px; font-weight: 620; }
.state.error b { color: var(--bad); }
.state .retry { margin-top: var(--sp-3); }
.state-center { align-items: center; text-align: center; }

.sk { position: relative; overflow: hidden; background: var(--surface-2); border-radius: 4px; height: 12px; }
.sk-line { height: 10px; margin: 7px 0; }
.sk-block { height: 84px; border-radius: 8px; }
@media (prefers-reduced-motion: no-preference) {
  .sk::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--surface-3);
    opacity: 0;
    animation: sk 1.2s ease-in-out infinite;
  }
  @keyframes sk {
    0%, 100% { opacity: 0; }
    50% { opacity: 0.55; }
  }
}

/* charts ----------------------------------------------------------------- */

.poolbar { display: flex; flex-direction: column; gap: 10px; }
.poolbar-track { display: flex; height: 10px; border-radius: var(--r-pill); overflow: hidden; background: var(--surface-3); }
.poolbar-track span { display: block; height: 100%; }
.poolbar-track .ok { background: var(--ok); }
.poolbar-track .warn { background: var(--warn); }
.poolbar-track .bad { background: var(--bad); }
.poolbar-track .neutral { background: var(--line-2); }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.legend-item { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text-2); }
.legend-item .dot { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.legend-item .dot.ok { background: var(--ok); }
.legend-item .dot.warn { background: var(--warn); }
.legend-item .dot.bad { background: var(--bad); }
.legend-item .dot.neutral { background: var(--line-2); }
.legend-item b { font-family: var(--mono); font-variant-numeric: tabular-nums; color: var(--text); font-weight: 560; }

.meter { display: flex; flex-direction: column; gap: 5px; }
.meter-head { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; }
.meter-head .v { margin-left: auto; font-family: var(--mono); font-variant-numeric: tabular-nums; color: var(--text-2); }
.meter-track { height: 6px; border-radius: var(--r-pill); background: var(--surface-3); overflow: hidden; }
.meter-fill { height: 100%; border-radius: var(--r-pill); background: var(--text-2); }
.meter-fill.ok { background: var(--ok); }
.meter-fill.warn { background: var(--warn); }
.meter-fill.bad { background: var(--bad); }
.meter-fill.info { background: var(--accent); }

.bars { display: flex; flex-direction: column; gap: 6px; }
.bar-row { display: grid; grid-template-columns: 88px minmax(0, 1fr) 64px; align-items: center; gap: 10px; font-size: 12px; }
.bar-row .label { font-family: var(--mono); color: var(--text-2); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-track { height: 7px; border-radius: var(--r-pill); background: var(--surface-3); overflow: hidden; }
.bar-fill { height: 100%; border-radius: var(--r-pill); background: var(--accent); min-width: 2px; }
.bar-fill.ok { background: var(--ok); }
.bar-fill.warn { background: var(--warn); }
.bar-fill.bad { background: var(--bad); }
.bar-fill.neutral { background: var(--line-2); }
.bar-row .value { font-family: var(--mono); font-variant-numeric: tabular-nums; text-align: right; color: var(--text-2); }

.spark { width: 100%; height: 40px; overflow: visible; }
.spark polyline { fill: none; stroke: var(--accent); stroke-width: 1.6; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
.spark .base { stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.spark .fill { fill: var(--accent-wash); stroke: none; }

.heat { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 3px; }
.heat-cell { aspect-ratio: 1 / 1; border-radius: 2px; background: var(--surface-3); }
.heat-cell[data-l="1"] { background: color-mix(in srgb, var(--accent) 22%, var(--surface-3)); }
.heat-cell[data-l="2"] { background: color-mix(in srgb, var(--accent) 45%, var(--surface-3)); }
.heat-cell[data-l="3"] { background: color-mix(in srgb, var(--accent) 70%, var(--surface-3)); }
.heat-cell[data-l="4"] { background: var(--accent); }
.heat-axis { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 3px; margin-top: 6px; font-size: 10px; color: var(--text-3); font-family: var(--mono); }
.heat-axis span { text-align: left; overflow: hidden; }

/* feed ------------------------------------------------------------------- */

.feed { display: flex; flex-direction: column; }

/* Attention items live inside a .feed but are links with two text lines and
   a CTA. Without this block the browser stacks title, detail and "Open" as
   bare inline text with zero spacing. */
.attn-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  text-decoration: none;
  min-width: 0;
}
.attn-item:last-child { border-bottom: 0; }
.attn-item .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 8px; }
.attn-item > span:nth-child(2) { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.attn-item .t { color: var(--text); font-size: 13px; font-weight: 600; }
.attn-item .d { color: var(--text-2); font-size: 12.5px; }
.attn-item .go {
  margin-left: auto;
  flex: 0 0 auto;
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}
.attn-item:hover .go { text-decoration: underline; }
.feed-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
  min-width: 0;
}
.feed-item:last-child { border-bottom: 0; }
.feed-item .act { font-family: var(--mono); font-size: 11.5px; color: var(--text); white-space: nowrap; }
.feed-item .what { color: var(--text-2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed-item time { margin-left: auto; color: var(--text-3); font-size: 11.5px; font-family: var(--mono); white-space: nowrap; }

/* dialogs ---------------------------------------------------------------- */

dialog {
  width: min(560px, calc(100vw - 32px));
  max-height: min(88dvh, 780px);
  padding: 0;
  border: 1px solid var(--line-2);
  border-radius: var(--r-surface);
  background: var(--surface);
  color: var(--text);
  overflow: hidden;
}
dialog[open] { display: flex; flex-direction: column; }
dialog::backdrop { background: rgba(8, 10, 14, 0.55); }
dialog.wide { width: min(880px, calc(100vw - 32px)); }
.card-head { display: flex; align-items: center; gap: var(--sp-3); padding: 14px var(--inset); border-bottom: 1px solid var(--line); }
.card-head h2 { font-size: 15px; font-weight: 620; }
.card-head .spacer { flex: 1 1 auto; }
.card-body { padding: var(--inset); overflow-y: auto; }
.card-foot { display: flex; align-items: center; gap: var(--sp-2); padding: 12px var(--inset); border-top: 1px solid var(--line); flex-wrap: wrap; }

.help-h { margin: 0 0 var(--sp-2); font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.help-h + .help-list { margin-bottom: var(--sp-5); }
.help-list { display: grid; grid-template-columns: minmax(80px, auto) 1fr; gap: 6px var(--sp-4); margin: 0; font-size: 12.5px; }
.help-list dt { color: var(--text); font-weight: 560; }
.help-list dd { margin: 0; color: var(--text-2); }
.help-list kbd {
  display: inline-block;
  min-width: 22px;
  padding: 0 6px;
  border: 1px solid var(--line-2);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--surface-2);
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.7;
  text-align: center;
}

/* toasts ----------------------------------------------------------------- */

.toasts {
  position: fixed;
  right: var(--sp-5);
  bottom: var(--sp-5);
  z-index: 120;
  display: flex;
  flex-direction: column-reverse;
  gap: var(--sp-2);
  width: min(400px, calc(100vw - 24px));
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--text-3);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.45;
  pointer-events: auto;
}
.toast[data-tone="ok"] { border-left-color: var(--ok); }
.toast[data-tone="warn"] { border-left-color: var(--warn); }
.toast[data-tone="err"] { border-left-color: var(--bad); }
.toast-text { min-width: 0; flex: 1 1 auto; word-break: break-word; }
.toast-act {
  flex: none;
  padding: 0 8px;
  min-height: 24px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 560;
  cursor: pointer;
}
.toast-act:hover { background: var(--surface-3); }
.toast-x {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}
.toast-x:hover { background: var(--surface-2); color: var(--text); }

/* the inline notice strip, for a message that belongs beside a control ---- */
.notice {
  display: block;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.5;
}
.notice:empty { display: none; }

/* ---- legacy vocabulary mapped onto the new surfaces ---------------------
   Older pages still emit these names. Each one resolves to the same token as
   its modern counterpart, so a page written before the redesign lands on the
   new visual language instead of unstyled markup. */

.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-surface); min-width: 0; overflow: hidden; }
.card > .tablewrap:last-child, .card > .card-body:last-child { border-bottom: 0; }
.kpis { display: grid; gap: 0; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.tablewrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.sub { margin-top: 6px; max-width: 68ch; color: var(--text-2); font-size: 13.5px; }
.actions { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-left: auto; }
.sep { border-top: 1px solid var(--line); }
.scroll-y { max-height: 420px; overflow-y: auto; }
.defs { display: grid; gap: 0; }
.def { display: flex; align-items: baseline; gap: var(--sp-3); padding: 8px 0; border-top: 1px solid var(--line); min-width: 0; }
.def:first-child { border-top: 0; padding-top: 0; }
.def dt { flex: 0 0 42%; min-width: 0; font-size: 12.5px; color: var(--text-3); overflow-wrap: anywhere; }
.def dd { flex: 1 1 auto; min-width: 0; font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 12.5px; color: var(--text); overflow-wrap: anywhere; }
.heat-legend { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--text-3); }
.heat-legend i { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
.heat-scroll { overflow-x: auto; }
.u-full { width: 100%; }
.u-auto { width: auto; }
.u-tnum { font-variant-numeric: tabular-nums; }
.u-mb-0 { margin-bottom: 0; }
.u-gap-2 { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.u-rule-top { border-top: 1px solid var(--line); padding-top: var(--sp-4); }
.u-rule-gap { padding-top: var(--sp-4); }
.notice.err { border-color: color-mix(in srgb, var(--bad) 45%, var(--line)); color: var(--bad); }
.notice.ok { border-color: color-mix(in srgb, var(--ok) 45%, var(--line)); color: var(--ok); }

/* command palette -------------------------------------------------------- */

.palette { width: min(600px, calc(100vw - 24px)); }
.palette-top { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
.palette-top svg { color: var(--text-3); flex: none; }
.palette-input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: transparent;
  font-size: 14.5px;
  padding: 4px 0;
}
.palette-input:focus { outline: none; }
.palette-kbd { flex: none; font-family: var(--mono); font-size: 10.5px; color: var(--text-3); border: 1px solid var(--line-2); border-radius: 4px; padding: 1px 5px; }
.palette-list { padding: 6px; overflow-y: auto; max-height: min(60dvh, 480px); }
.palette-group { padding: 8px 10px 4px; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.palette-item svg { color: var(--text-3); flex: none; }
.palette-item .hint { margin-left: auto; color: var(--text-3); font-size: 11.5px; }
.palette-item[aria-selected="true"], .palette-item:hover { background: var(--accent-wash); }
.palette-item[aria-selected="true"] svg { color: var(--accent); }
.palette-empty { padding: 18px 10px; color: var(--text-3); font-size: 13px; }

/* drawer ----------------------------------------------------------------- */

.drawer-backdrop { position: fixed; inset: 0; z-index: 90; background: rgba(8, 10, 14, 0.5); }
.drawer {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  width: min(280px, 84vw);
  padding: var(--sp-5) var(--sp-3);
  background: var(--rail-bg);
  color: var(--rail-text);
  border-right: 1px solid var(--rail-line);
  overflow-y: auto;
}

/* gate ------------------------------------------------------------------- */

.gate-wrap { display: grid; place-items: center; min-height: 62dvh; }
.gate { width: min(440px, 100%); }
.gate-mark { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: var(--text); color: var(--bg); margin-bottom: var(--sp-4); }
.gate h1 { font-size: 22px; letter-spacing: -0.03em; }
.gate .lede { margin-top: 6px; color: var(--text-2); font-size: 13.5px; }

/* hero ------------------------------------------------------------------- */

.hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--sp-6); align-items: center; }
.hero-main { min-width: 0; }
.hero-title { font-size: 26px; letter-spacing: -0.03em; font-weight: 660; }
.hero-figure { font-family: var(--mono); font-size: 40px; font-weight: 550; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }

/* utility ---------------------------------------------------------------- */

.u-mt-2 { margin-top: var(--sp-2); }
.u-mt-3 { margin-top: var(--sp-3); }
.u-mt-4 { margin-top: var(--sp-4); }
.u-mt-5 { margin-top: var(--sp-5); }
.u-mt-6 { margin-top: var(--sp-6); }
.u-mb-2 { margin-bottom: var(--sp-2); }
.u-mb-4 { margin-bottom: var(--sp-4); }
.u-warn { color: var(--warn); }
.u-bad { color: var(--bad); }
.u-ok { color: var(--ok); }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* responsive ------------------------------------------------------------- */

@media (max-width: 1180px) {
  .split { grid-template-columns: minmax(0, 1fr); }
  .grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 1023px) {
  .shell { grid-template-columns: minmax(0, 1fr); }
  .rail { display: none; }
  .menu-btn { display: inline-flex; }
  .canvas-head { padding: 0 var(--sp-4); }
  .page { padding: var(--sp-5) var(--sp-4) var(--sp-7); }
  .grid-3, .grid-2 { grid-template-columns: minmax(0, 1fr); }
  .figures { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fig:nth-child(odd) { border-left: 0; }
  .fig { border-top: 1px solid var(--line); }
  .fig:nth-child(-n + 2) { border-top: 0; }
}

@media (max-width: 720px) {
  .canvas-head { min-height: 52px; gap: var(--sp-2); }
  .canvas-crumb { display: none; }
  .page-title { font-size: 24px; }
  .hero { grid-template-columns: minmax(0, 1fr); gap: var(--sp-4); }
  .hero-figure { font-size: 32px; }

  /* every table folds into labelled rows */
  .table-wrap { overflow-x: visible; }
  .table thead { display: none; }
  .table, .table tbody, .table tr, .table td { display: block; width: 100%; }
  .table tr { padding: 10px 0; border-bottom: 1px solid var(--line); }
  .table tr:last-child { border-bottom: 0; }
  .table td {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: 2px 0;
    border: 0;
    text-align: left;
  }
  .table td.num { text-align: right; }
  .table td::before {
    content: attr(data-l);
    flex: none;
    font-size: 10px;
    font-weight: 620;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .table td:not([data-l])::before { content: none; }
  .table .actions-cell { justify-content: flex-end; }
  .heat { gap: 2px; }
  .heat-axis { display: none; }
  .toasts { right: 12px; left: 12px; bottom: 12px; width: auto; }
  .bar-row { grid-template-columns: 74px minmax(0, 1fr) 52px; }
  .panel-body { padding: var(--sp-3) var(--inset); }
}

@media (max-width: 400px) {
  .figures { grid-template-columns: minmax(0, 1fr); }
  .fig, .fig:nth-child(odd), .fig:nth-child(-n + 2) { border-left: 0; border-top: 1px solid var(--line); }
  .fig:first-child { border-top: 0; }
  .toolbar .grow { flex-basis: 100%; }
}

@media (pointer: coarse), (hover: none) {
  :root, :root[data-density="compact"] { --tap: 44px; --tap-sm: 40px; }
  .rail-item { min-height: 44px; }
  .rail-tool { width: var(--tap); height: var(--tap); }
  .toast-x, .toast-act { min-height: 40px; min-width: 40px; }
  .btn, .btn-sm, .seg button { min-height: var(--tap-sm); }
  .icon-btn, .icon-btn.btn-sm { width: var(--tap); height: var(--tap); }
  input:not([type="checkbox"]):not([type="radio"]),
  select,
  textarea { min-height: var(--tap-sm); }
  select { font-size: 16px; }
  .check { min-height: var(--tap-sm); padding-block: 6px; }
  .check input[type="checkbox"] { width: 22px; height: 22px; }
  .table td select, .table td .btn-sm { min-height: var(--tap-sm); }
  .seg button { min-width: var(--tap-sm); }
  .table td > .link, .table td a.link, .feed-item a { min-height: var(--tap-sm); }
  td > label:has(input[type=checkbox]) { display: inline-flex; align-items: center; justify-content: center; min-width: var(--tap); min-height: var(--tap); }
  .table td input[type=checkbox] { width: 22px; height: 22px; }
}

@media print {
  .rail, .canvas-head, .toasts, .menu-btn { display: none; }
  .shell { display: block; }
  .page { max-width: none; padding: 0; }
  .panel, .figures { border-color: #bbb; }
}
`;

/* ---------- icons ---------- */

const ICON_PATHS: Record<string, string> = {
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  key: '<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M17 17l2-2M14 20l2-2"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>',
  command: '<path d="M9 6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 103 3V6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>',
  density: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3"/>',
  check: '<path d="M4 12.5l5 5L20 6"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4L3 5z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 118 0v3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
};

export function icon(name: string, cls = "icon", size = 16): string {
  const path = ICON_PATHS[name] ?? ICON_PATHS.arrow;
  return (
    '<svg class="' +
    cls +
    '" width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    path +
    "</svg>"
  );
}

/* ---------- navigation ---------- */

export type NavItem = { href: string; label: string; icon: string };

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Observe",
    items: [
      { href: "/pengatur", label: "Overview", icon: "pulse" },
      { href: "/pengatur/logs", label: "Logs", icon: "list" },
      { href: "/pengatur/stats", label: "Statistics", icon: "chart" },
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/pengatur/keys", label: "Keys", icon: "key" },
      { href: "/pengatur/models", label: "Models", icon: "cube" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/pengatur/settings", label: "Settings", icon: "sliders" },
      { href: "/pengatur/audit", label: "Audit", icon: "shield" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

const SECTION_LABELS: Record<string, string> = {
  "/pengatur": "Overview",
  "/pengatur/logs": "Logs",
  "/pengatur/usage": "Logs",
  "/pengatur/stats": "Statistics",
  "/pengatur/keys": "Keys",
  "/pengatur/models": "Models",
  "/pengatur/settings": "Settings",
  "/pengatur/audit": "Audit",
};

function normaliseActive(active: string): string {
  if (active.startsWith("/pengatur/keys/")) return "/pengatur/keys";
  return SECTION_LABELS[active] ? active : "/pengatur";
}

function navMarkup(active: string, idPrefix: string): string {
  const current = normaliseActive(active);
  return NAV_GROUPS.map((group) => {
    const items = group.items
      .map((item) => {
        const on = item.href === current;
        return (
          '<a class="rail-item" href="' +
          item.href +
          '"' +
          (on ? ' aria-current="page"' : "") +
          ">" +
          icon(item.icon, "icon", 17) +
          "<span>" +
          escapeHtml(item.label) +
          "</span></a>"
        );
      })
      .join("");
    return (
      '<div class="rail-group" role="group" aria-labelledby="' +
      idPrefix +
      "-" +
      group.label.toLowerCase() +
      '">' +
      '<span class="rail-label" id="' +
      idPrefix +
      "-" +
      group.label.toLowerCase() +
      '">' +
      group.label +
      "</span>" +
      items +
      "</div>"
    );
  }).join("");
}

/**
 * The navigation rail. Ink in both themes: the console always has one edge
 * that never moves, and the operator always knows where they are.
 */
export function navRail(active: string, actions = ""): string {
  return (
    '<aside class="rail" aria-label="Sections">' +
    '<a class="rail-brand" href="/pengatur">' +
    '<span class="rail-mark">' +
    icon("command", "icon", 17) +
    "</span>" +
    '<span class="rail-name"><b>GeminesX</b><span>Console</span></span>' +
    "</a>" +
    '<nav class="rail-nav" aria-label="Console sections">' +
    navMarkup(active, "nav") +
    "</nav>" +
    '<div class="rail-foot">' +
    '<div class="rail-state" title="Where the pool and the ledger live">' +
    icon("lock", "icon", 13) +
    "<span>store</span><b>" +
    escapeHtml(safeStorage()) +
    "</b></div>" +
    '<div class="rail-tools">' +
    '<button class="rail-tool" type="button" id="themeBtn" aria-label="Switch light and dark theme" title="Theme">' +
    icon("sun", "icon", 15) +
    "</button>" +
    '<button class="rail-tool" type="button" id="densityBtn" aria-label="Switch compact and comfortable density" title="Density">' +
    icon("density", "icon", 15) +
    "</button>" +
    '<button class="rail-tool" type="button" id="helpBtn" aria-label="Shortcuts and words" title="Help (?)">' +
    icon("help", "icon", 15) +
    "</button>" +
    '<span class="spacer"></span>' +
    "</div>" +
    (actions ? '<div class="rail-actions">' + actions + "</div>" : "") +
    "</div>" +
    "</aside>"
  );
}

function safeStorage(): string {
  return storageMode;
}

/* ---------- the page ---------- */

export type PageOptions = {
  title: string;
  active: string;
  actions?: string;
  body: string;
  script?: string;
  /** One line under the page title. Optional; pages may render their own head. */
  lede?: string;
  eyebrow?: string;
};

export function consolePage(o: PageOptions): string {
  const section = SECTION_LABELS[normaliseActive(o.active)] ?? o.title;
  const head = (
    '<header class="canvas-head">' +
    '<button class="btn btn-ghost btn-sm icon-btn menu-btn" type="button" id="menuBtn" aria-label="Open sections" aria-expanded="false" aria-controls="drawer">' +
    icon("menu", "icon", 18) +
    "</button>" +
    '<div class="canvas-crumb">' +
    '<span class="rail-mark" style="width:20px;height:20px;border-radius:5px;background:var(--text);color:var(--bg)">' +
    icon("command", "icon", 12) +
    "</span>" +
    "<span>GeminesX</span><span aria-hidden=\"true\">/</span><b>" +
    escapeHtml(section) +
    "</b></div>" +
    '<div class="head-actions">' +
    '<button class="btn btn-ghost btn-sm" type="button" id="paletteBtn" aria-keyshortcuts="Control+K">' +
    icon("search", "icon", 14) +
    '<span class="palette-kbd">Ctrl K</span>' +
    "</button>" +
    (o.actions ?? "") +
    "</div>" +
    "</header>"
  );

  return (
    "<!doctype html>\n" +
    '<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    '<meta name="robots" content="noindex, nofollow">\n' +
    '<meta name="color-scheme" content="light dark">\n' +
    "<title>" +
    escapeHtml(o.title) +
    " · GeminesX</title>\n" +
    '<link rel="icon" href="/favicon.ico" sizes="32x32">\n' +
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n' +
    '<link rel="apple-touch-icon" href="/favicon.svg">\n' +
    '<script>try{var t=localStorage.getItem("geminesx.theme");if(t)document.documentElement.setAttribute("data-theme",t);var d=localStorage.getItem("geminesx.density");if(d)document.documentElement.setAttribute("data-density",d);}catch(e){}</script>\n' +
    "<style>" +
    BASE_CSS +
    "</style>\n</head>\n<body>\n" +
    '<a class="skip" href="#main">Skip to content</a>\n' +
    '<div class="shell">\n' +
    navRail(o.active) +
    '<div class="canvas">\n' +
    head +
    '<main id="main" class="page" tabindex="-1">\n' +
    o.body +
    "\n</main>\n</div>\n</div>\n" +
    drawerMarkup(o.active) +
    helpDialog() +
    confirmDialog() +
    paletteDialog() +
    toastMount() +
    "<script>" +
    CLIENT_JS +
    "</script>\n" +
    (o.script ? "<script>\n" + o.script + "\n</script>\n" : "") +
    "</body>\n</html>"
  );
}

function drawerMarkup(active: string): string {
  return (
    '<div class="drawer-backdrop" id="drawerBackdrop" hidden></div>' +
    '<div class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Sections" hidden>' +
    '<div class="rail-brand" style="padding:0 8px">' +
    '<span class="rail-mark">' +
    icon("command", "icon", 17) +
    "</span>" +
    '<span class="rail-name"><b>GeminesX</b><span>Console</span></span>' +
    "</div>" +
    '<nav class="rail-nav" aria-label="Console sections">' +
    navMarkup(active, "drawer") +
    "</nav>" +
    '<div class="rail-foot">' +
    '<div class="rail-tools">' +
    '<button class="rail-tool" type="button" id="drawerTheme" aria-label="Switch light and dark theme">' +
    icon("sun", "icon", 15) +
    "</button>" +
    '<button class="rail-tool" type="button" id="drawerDensity" aria-label="Switch density">' +
    icon("density", "icon", 15) +
    "</button>" +
    '<button class="rail-tool" type="button" id="drawerHelp" aria-label="Shortcuts and words">' +
    icon("help", "icon", 15) +
    "</button>" +
    "</div></div>" +
    "</div>"
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
 * The toast stack. Fixed to the viewport, so a message never pushes the page
 * down and never lands inside a closed dialog. Every outcome the operator
 * triggers is written here and announced.
 */
export function toastMount(): string {
  return '<div id="toasts" class="toasts" role="status" aria-live="polite" aria-atomic="false"></div>';
}

/** Kept for callers that still mount an inline notice node. */
export function noticeBand(): string {
  return toastMount();
}

/**
 * The admin token gate. Every console page opens with the same panel so the
 * operator always knows what the console wants and where the token goes.
 */
export function authGate(): string {
  return (
    '<section class="gate-wrap" id="gate">' +
    '<div class="panel gate">' +
    '<div class="card-body">' +
    '<span class="gate-mark">' +
    icon("lock", "icon", 20) +
    "</span>" +
    "<h1>Admin token</h1>" +
    '<p class="lede">This console reads the pool, the ledger and the settings of this deployment. The token stays in this browser.</p>' +
    '<form id="gateForm" autocomplete="off" class="u-mt-5">' +
    '<label class="field" for="token">Deployment admin token</label>' +
    '<div class="row">' +
    '<div class="grow"><input id="token" class="input mono" type="password" spellcheck="false" placeholder="ADMIN_TOKEN" autocomplete="off"></div>' +
    '<button id="connect" class="btn btn-primary" type="submit">Connect</button>' +
    "</div>" +
    '<p class="hint u-mt-3">Sent only to this deployment, as a bearer token over HTTPS.</p>' +
    "</form>" +
    '<div id="gateMsg" class="hint u-mt-3" role="status" aria-live="polite"></div>' +
    "</div></div></section>"
  );
}

/**
 * The help dialog. Every page carries it, so the words this console uses are
 * always one key away.
 */
export function helpDialog(): string {
  const keys: [string, string][] = [
    ["Ctrl K", "Open the command palette"],
    ["/", "Focus the filter of this page"],
    ["r", "Refresh the data on this page"],
    ["?", "Open this help"],
    ["Esc", "Clear the filter, or close a dialog"],
    ["Tab", "Move through the table, row by row"],
  ];
  const words: [string, string][] = [
    ["ready", "The key can serve a request right now"],
    ["cooling", "The key hit its quota and is parked until the cooldown ends"],
    ["dead", "The key was revoked or has no quota left"],
    ["rotated", "The gateway handed the request to another key"],
    ["429", "The upstream rate limit answered"],
    ["WIB", "The timezone the daily rollup and the heatmap use"],
    ["ring", "1h and 24h read the live ring: the last requests in this process"],
    ["rollup", "7d and 30d read the daily rollup in Postgres"],
    ["memory", "The pool and the ledger live in this process. A restart empties them"],
    ["masked key", "The raw key never reaches the browser, only its masked form and its sha256 id"],
  ];

  const keyRows = keys
    .map(([k, v]) => "<dt><kbd>" + escapeHtml(k) + "</kbd></dt><dd>" + escapeHtml(v) + "</dd>")
    .join("");
  const wordRows = words
    .map(([k, v]) => "<dt>" + escapeHtml(k) + "</dt><dd>" + escapeHtml(v) + "</dd>")
    .join("");

  return (
    '<dialog id="helpDialog" aria-labelledby="helpTitle">' +
    '<div class="card-head">' +
    '<h2 id="helpTitle">Shortcuts and words</h2>' +
    '<span class="spacer"></span>' +
    '<button class="btn btn-ghost btn-sm icon-btn" type="button" id="helpClose" aria-label="Close">' +
    icon("close") +
    "</button>" +
    "</div>" +
    '<div class="card-body">' +
    '<h3 class="help-h">Keyboard</h3>' +
    '<dl class="help-list">' +
    keyRows +
    "</dl>" +
    '<h3 class="help-h">What the words mean</h3>' +
    '<dl class="help-list help-words">' +
    wordRows +
    "</dl>" +
    "</div>" +
    "</dialog>"
  );
}

/**
 * The confirmation dialog. It replaces the browser's own confirm box, which
 * belongs to another product and cannot name the action.
 */
export function confirmDialog(): string {
  return (
    '<dialog id="confirmDialog" aria-labelledby="confirmTitle" aria-describedby="confirmMessage">' +
    '<div class="card-head"><h2 id="confirmTitle">Are you sure?</h2></div>' +
    '<div class="card-body"><p id="confirmMessage" class="hint"></p></div>' +
    '<div class="card-foot">' +
    '<span class="spacer"></span>' +
    '<button id="confirmCancel" class="btn" type="button">Cancel</button>' +
    '<button id="confirmOk" class="btn btn-danger" type="button">Confirm</button>' +
    "</div>" +
    "</dialog>"
  );
}

/**
 * The command palette. One keystroke reaches every section and every action a
 * page registers, without a trip through the rail.
 */
export function paletteDialog(): string {
  return (
    '<dialog id="palette" class="palette" aria-label="Command palette">' +
    '<div class="palette-top">' +
    icon("search", "icon", 16) +
    '<input id="paletteInput" class="palette-input" type="text" role="combobox" aria-expanded="true" ' +
    'aria-controls="paletteList" aria-autocomplete="list" placeholder="Jump to a section or run an action" autocomplete="off" spellcheck="false">' +
    '<span class="palette-kbd">Esc</span>' +
    "</div>" +
    '<div id="paletteList" class="palette-list" role="listbox" aria-label="Commands"></div>' +
    "</dialog>"
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
  var THEME = "geminesx.theme";
  var DENSITY = "geminesx.density";

  var ICON = {
    close: ${JSON.stringify(icon("close", "icon", 14))},
    arrow: ${JSON.stringify(icon("arrow", "icon", 14))},
    check: ${JSON.stringify(icon("check", "icon", 14))},
    copy: ${JSON.stringify(icon("copy", "icon", 14))}
  };

  var GX = {
    token: function () {
      try { return localStorage.getItem(STORE) || ""; } catch (e) { return ""; }
    },
    setToken: function (value) {
      try { localStorage.setItem(STORE, value); } catch (e) {}
    },
    clearToken: function () {
      try { localStorage.removeItem(STORE); } catch (e) {}
    },

    /* One fetch helper. It attaches the bearer token, parses JSON, and turns
       every failure into an Error with a status and one readable sentence. */
    api: function (path, opts) {
      opts = opts || {};
      var headers = { "Accept": "application/json" };
      var token = GX.token();
      if (token) headers["Authorization"] = "Bearer " + token;
      var init = { method: opts.method || "GET", headers: headers, cache: "no-store" };
      if (opts.body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(opts.body);
      }
      return fetch(path, init).then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          if (text) {
            try { data = JSON.parse(text); } catch (e) { data = null; }
          }
          if (!res.ok) {
            var message = "Request failed (" + res.status + ").";
            if (data && data.error && data.error.message) message = data.error.message;
            else if (text) message = text.split("\\n")[0].slice(0, 200);
            var err = new Error(message);
            err.status = res.status;
            err.data = data;
            throw err;
          }
          return data;
        });
      });
    },

    download: function (path, filename) {
      var headers = {};
      var token = GX.token();
      if (token) headers["Authorization"] = "Bearer " + token;
      return fetch(path, { headers: headers, cache: "no-store" }).then(function (res) {
        if (!res.ok) throw new Error("Export failed (" + res.status + ").");
        return res.blob();
      }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        GX.toast("Exported " + filename + ".", "ok");
      });
    },

    /* The gate. On load it hides the page and shows the token panel unless a
       token is already stored; after a successful connect it reveals the page
       and hands control to the caller. */
    gate: function (opts) {
      opts = opts || {};
      var gate = document.getElementById("gate");
      var main = document.getElementById("main");
      var form = document.getElementById("gateForm");
      var input = document.getElementById("token");
      var button = document.getElementById("connect");
      var msg = document.getElementById("gateMsg");
      var page = opts.page ? document.getElementById(opts.page) : null;

      function reveal() {
        if (gate) gate.hidden = true;
        if (page) page.hidden = false;
        if (main) main.focus();
      }
      function showGate(reason) {
        if (gate) gate.hidden = false;
        if (page) page.hidden = true;
        if (msg && reason) { msg.textContent = reason; msg.className = "hint u-mt-3 u-bad"; }
        if (input) { input.value = ""; input.focus(); }
      }

      GX._showGate = showGate;

      if (!form) return;
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var value = input ? input.value.trim() : "";
        if (!value) { if (msg) { msg.textContent = "Paste the token first."; msg.className = "hint u-mt-3 u-bad"; } return; }
        GX.setToken(value);
        GX.busy(button, "Checking");
        GX.api("/pengatur/keys/list").then(function () {
          if (msg) { msg.textContent = ""; msg.className = "hint u-mt-3"; }
          reveal();
          if (opts.onSuccess) opts.onSuccess();
        }).catch(function (err) {
          GX.clearToken();
          showGate(err.status === 401 || err.status === 403 ? "That token was rejected." : "Could not reach the deployment: " + err.message);
        }).then(function () { GX.idle(button); });
      });

      if (!GX.token()) { showGate(""); return; }
      reveal();
      var result = opts.onSuccess ? opts.onSuccess() : null;
      if (result && result.catch) {
        result.catch(function (err) {
          if (err && (err.status === 401 || err.status === 403)) {
            GX.clearToken();
            showGate("That token was rejected. Paste the current one.");
          }
        });
      }
    },

    /* Force the gate back open, e.g. after a 401 on a refresh. */
    lock: function (reason) {
      GX.clearToken();
      if (GX._showGate) GX._showGate(reason || "Session expired. Paste the token again.");
      GX.toast(reason || "Session expired. Paste the token again.", "err");
    },

    el: function (tag, attrs, kids) {
      var node = document.createElement(tag);
      if (attrs) {
        Object.keys(attrs).forEach(function (key) {
          var value = attrs[key];
          if (value === null || value === undefined || value === false) return;
          if (key === "text") node.textContent = value;
          else if (key === "class") node.className = value;
          else if (key === "html") node.innerHTML = value;
          else if (key === "style") node.setAttribute("style", value);
          else if (key.slice(0, 2) === "on" && typeof value === "function") node.addEventListener(key.slice(2), value);
          else node.setAttribute(key, value === true ? "" : String(value));
        });
      }
      (Array.isArray(kids) ? kids : kids ? [kids] : []).forEach(function (kid) {
        if (kid === null || kid === undefined || kid === false) return;
        node.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
      });
      return node;
    },

    /* status pill: a dot plus a word, never a painted block */
    tag: function (text, tone, mono) {
      return GX.el("span", { class: "tag" + (mono ? " tag-mono" : ""), "data-tone": tone || "neutral" }, [
        GX.el("span", { class: "dot" }),
        GX.el("span", { text: text })
      ]);
    },

    /* one figure: label, tabular value, one line of context */
    stat: function (label, value, sub, tone) {
      return GX.el("div", { class: "fig", "data-tone": tone || "" }, [
        GX.el("span", { class: "fig-label", text: label }),
        GX.el("span", { class: "fig-value", text: String(value) }),
        sub ? GX.el("span", { class: "fig-sub", text: sub }) : null
      ]);
    },
    kpi: function (label, value, sub, tone) { return GX.stat(label, value, sub, tone); },

    chip: function (label, value) {
      return GX.el("span", { class: "chip" }, [
        GX.el("span", { class: "chip-k", text: label }),
        GX.el("span", { class: "chip-v", text: value })
      ]);
    },

    meter: function (label, value, total, tone) {
      var pct = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
      return GX.el("div", { class: "meter" }, [
        GX.el("div", { class: "meter-head" }, [
          GX.el("span", { text: label }),
          GX.el("span", { class: "v", text: GX.fmt.num(value) })
        ]),
        GX.el("div", { class: "meter-track", role: "presentation" }, [
          GX.el("div", { class: "meter-fill " + (tone || ""), style: "width:" + pct.toFixed(1) + "%" })
        ])
      ]);
    },

    /* the pool as one proportional bar plus a legend: the shape of the pool
       is readable in one glance and every count is still written out */
    poolBar: function (parts) {
      var total = 0;
      parts.forEach(function (p) { total += Math.max(0, p.value); });
      var track = GX.el("div", { class: "poolbar-track", role: "img", "aria-label": parts.map(function (p) { return p.value + " " + p.label; }).join(", ") });
      var legend = GX.el("div", { class: "legend" });
      parts.forEach(function (p) {
        if (p.value > 0) track.appendChild(GX.el("span", { class: p.tone, style: "width:" + ((p.value / total) * 100).toFixed(2) + "%" }));
        legend.appendChild(GX.el("span", { class: "legend-item" }, [
          GX.el("span", { class: "dot " + p.tone }),
          GX.el("span", { text: p.label }),
          GX.el("b", { text: GX.fmt.num(p.value) })
        ]));
      });
      return GX.el("div", { class: "poolbar" }, [track, legend]);
    },

    spark: function (values, width, height) {
      width = width || 240; height = height || 40;
      var max = 0;
      values.forEach(function (v) { if (v > max) max = v; });
      if (!max) max = 1;
      var step = values.length > 1 ? width / (values.length - 1) : width;
      var pts = values.map(function (v, i) {
        var x = i * step;
        var y = height - (v / max) * (height - 2) - 1;
        return x.toFixed(1) + "," + y.toFixed(1);
      });
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "spark");
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "series of " + values.length + " points, peak " + max);
      var base = document.createElementNS("http://www.w3.org/2000/svg", "line");
      base.setAttribute("class", "base");
      base.setAttribute("x1", "0"); base.setAttribute("x2", String(width));
      base.setAttribute("y1", String(height - 1)); base.setAttribute("y2", String(height - 1));
      svg.appendChild(base);
      if (pts.length > 1) {
        var fill = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        fill.setAttribute("class", "fill");
        fill.setAttribute("points", "0," + (height - 1) + " " + pts.join(" ") + " " + width + "," + (height - 1));
        svg.appendChild(fill);
      }
      var line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      line.setAttribute("points", pts.join(" "));
      svg.appendChild(line);
      return svg;
    },

    state: function (kind, message, detail, action) {
      var node = GX.el("div", { class: "state" + (kind === "error" ? " error" : "") }, [
        GX.el("b", { text: message }),
        detail ? GX.el("p", { class: "hint", text: detail }) : null
      ]);
      if (action) node.appendChild(GX.el("div", { class: "retry", html: action }));
      return node;
    },

    /* a table cell. The label rides along so the row folds into a labelled
       list on a narrow screen. */
    cell: function (row, text, cls, label) {
      var td = GX.el("td", { class: cls || "", "data-l": label || null });
      td.textContent = text === null || text === undefined ? "" : String(text);
      row.appendChild(td);
      return td;
    },

    fmt: {
      num: function (n) {
        if (n === null || n === undefined || isNaN(n)) return "-";
        return Number(n).toLocaleString("en-GB");
      },
      compact: function (n) {
        if (n === null || n === undefined || isNaN(n)) return "-";
        var v = Number(n);
        if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1).replace(/\\.0$/, "") + "B";
        if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\\.0$/, "") + "M";
        if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(1).replace(/\\.0$/, "") + "k";
        return v.toLocaleString("en-GB");
      },
      money: function (n) {
        if (n === null || n === undefined || isNaN(n)) return "-";
        var v = Number(n);
        if (v === 0) return "$0.00";
        if (Math.abs(v) < 0.01) return "$" + v.toFixed(4);
        if (Math.abs(v) < 1) return "$" + v.toFixed(3);
        return "$" + v.toFixed(2);
      },
      pct: function (part, whole, digits) {
        if (!whole) return "-";
        return ((part / whole) * 100).toFixed(digits === undefined ? 1 : digits) + "%";
      },
      left: function (ms) {
        if (ms === null || ms === undefined) return "-";
        var v = Number(ms);
        if (v <= 0) return "now";
        var s = Math.ceil(v / 1000);
        if (s < 60) return s + "s";
        var m = Math.floor(s / 60);
        if (m < 60) return m + "m " + (s % 60) + "s";
        var h = Math.floor(m / 60);
        if (h < 48) return h + "h " + (m % 60) + "m";
        var d = Math.floor(h / 24);
        if (d < 365) return d + "d " + (h % 24) + "h";
        return Math.floor(d / 365) + "y";
      },
      time: function (ts) {
        if (!ts) return "-";
        return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
      },
      clock: function (ts) {
        if (!ts) return "-";
        var d = new Date(ts);
        return d.toLocaleTimeString("en-GB", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
      },
      date: function (ts) {
        if (!ts) return "-";
        return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      },
      day: function (day) {
        if (!day) return "-";
        var parts = String(day).split("-");
        if (parts.length !== 3) return String(day);
        return parts[2] + "/" + parts[1];
      },
      /* how long ago, in the unit a person would say it in */
      age: function (ts) {
        if (!ts) return "never";
        var delta = Date.now() - Number(ts);
        if (delta < 0) delta = 0;
        var s = Math.floor(delta / 1000);
        if (s < 45) return "just now";
        if (s < 90) return "1m ago";
        var m = Math.floor(s / 60);
        if (m < 60) return m + "m ago";
        var h = Math.floor(m / 60);
        if (h < 24) return h + "h ago";
        var d = Math.floor(h / 24);
        if (d < 30) return d + "d ago";
        return GX.fmt.date(ts);
      },
      /* a full timestamp for a log line: date, then time to the second */
      stamp: function (ts) {
        if (!ts) return "-";
        var d = new Date(ts);
        var day = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
        return day + " " + d.toLocaleTimeString("en-GB", { hour12: false });
      }
    },

    /* The rail states where the pool lives. The shell renders it server side;
       this keeps it true after a reload that changed the storage mode. */
    storage: function (text, tone) {
      var node = document.querySelector(".rail-state b");
      if (!node) return;
      node.textContent = text || "-";
      var row = node.parentNode;
      if (row) row.setAttribute("data-tone", tone || "");
    },

    debounce: function (fn, ms) {
      var t = null;
      return function () {
        var args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, ms || 150);
      };
    },

    every: function (ms, fn) {
      var id = setInterval(fn, ms);
      return function () { clearInterval(id); };
    },

    openDialog: function (node) {
      if (!node) return;
      if (typeof node.showModal === "function") { if (!node.open) node.showModal(); }
      else node.setAttribute("open", "");
    },
    closeDialog: function (node) {
      if (!node) return;
      if (typeof node.close === "function") { if (node.open) node.close(); }
      else node.removeAttribute("open");
    },

    busy: function (button, label) {
      if (!button) return;
      button.setAttribute("aria-busy", "true");
      button.disabled = true;
      if (label) {
        if (!button.dataset.label) button.dataset.label = button.textContent;
        button.textContent = label;
      }
    },
    idle: function (button) {
      if (!button) return;
      button.removeAttribute("aria-busy");
      button.disabled = false;
      if (button.dataset.label) {
        button.textContent = button.dataset.label;
        delete button.dataset.label;
      }
    },

    /* an inline message, next to the control that produced it */
    say: function (node, text, kind) {
      if (!node) return;
      node.textContent = text || "";
      node.className = "hint" + (kind === "ok" ? " u-ok" : kind === "err" ? " u-bad" : kind === "warn" ? " u-warn" : "");
    },

    confirm: function (opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var dialog = document.getElementById("confirmDialog");
        if (!dialog) { resolve(window.confirm(opts.message || "Are you sure?")); return; }
        var title = document.getElementById("confirmTitle");
        var message = document.getElementById("confirmMessage");
        var ok = document.getElementById("confirmOk");
        var cancel = document.getElementById("confirmCancel");
        if (title) title.textContent = opts.title || "Are you sure?";
        if (message) message.textContent = opts.message || "";
        if (ok) ok.textContent = opts.confirmLabel || "Confirm";
        var done = false;
        function finish(value) {
          if (done) return;
          done = true;
          ok.removeEventListener("click", onOk);
          cancel.removeEventListener("click", onCancel);
          dialog.removeEventListener("close", onClose);
          GX.closeDialog(dialog);
          resolve(value);
        }
        function onOk() { finish(true); }
        function onCancel() { finish(false); }
        function onClose() { finish(false); }
        ok.addEventListener("click", onOk);
        cancel.addEventListener("click", onCancel);
        dialog.addEventListener("close", onClose);
        GX.openDialog(dialog);
        ok.focus();
      });
    },

    /* A table with no rows must not draw a frame. The state takes its place. */
    tableState: function (table, emptyNode, isEmpty, stateNode) {
      if (table) table.hidden = isEmpty;
      if (emptyNode) {
        emptyNode.textContent = "";
        if (isEmpty && stateNode) emptyNode.appendChild(stateNode);
      }
    },

    /* URL state. A filtered view is a link the operator can share, and a
       reload lands on the same view. */
    url: {
      read: function () {
        var out = {};
        var q = new URLSearchParams(location.search);
        q.forEach(function (value, key) { out[key] = value; });
        return out;
      },
      write: function (values) {
        var q = new URLSearchParams();
        Object.keys(values).forEach(function (key) {
          var value = values[key];
          if (value !== undefined && value !== null && value !== "") q.set(key, value);
        });
        var next = q.toString();
        history.replaceState(null, "", location.pathname + (next ? "?" + next : ""));
      }
    },

    /* Toasts. Fixed to the viewport; they never move the page. A failure
       stays until dismissed, because a failure that vanishes was never read. */
    toast: function (text, kind, action) {
      var host = document.getElementById("toasts");
      if (!host) return;
      var node = GX.el("div", { class: "toast", "data-tone": kind || "neutral", role: "status" });
      node.appendChild(GX.el("span", { class: "toast-text", text: text }));
      if (action && action.label) {
        var act = GX.el("button", { class: "toast-act", type: "button", text: action.label });
        act.addEventListener("click", function () { try { action.run(); } finally { node.remove(); } });
        node.appendChild(act);
      }
      var x = GX.el("button", { class: "toast-x", type: "button", "aria-label": "Dismiss", html: ICON.close });
      x.addEventListener("click", function () { node.remove(); });
      node.appendChild(x);
      host.appendChild(node);
      while (host.children.length > 4) host.removeChild(host.firstChild);
      if (kind !== "err" && kind !== "warn") {
        setTimeout(function () { node.remove(); }, 5200);
      }
      return node;
    },

    /* GX.notice keeps the old call shape: every outcome is a toast. */
    notice: function (text, kind) {
      if (!text) return;
      var tone = kind === "err" || kind === "bad" ? "err" : kind === "ok" ? "ok" : kind === "warn" ? "warn" : "neutral";
      GX.toast(text, tone);
    },

    copy: function (text, label) {
      var done = function () { GX.toast((label || "Value") + " copied.", "ok"); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { GX.toast("Could not copy.", "err"); });
        return;
      }
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); done(); } catch (e) { GX.toast("Could not copy.", "err"); }
      area.remove();
    },

    /* Theme and density. Both survive a reload. */
    theme: {
      get: function () {
        var set = document.documentElement.getAttribute("data-theme");
        if (set) return set;
        return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      },
      set: function (value) {
        document.documentElement.setAttribute("data-theme", value);
        try { localStorage.setItem(THEME, value); } catch (e) {}
        GX._syncTools();
      },
      toggle: function () {
        var next = GX.theme.get() === "dark" ? "light" : "dark";
        GX.theme.set(next);
        GX.toast(next === "dark" ? "Dark theme." : "Light theme.", "neutral");
      }
    },

    density: {
      get: function () { return document.documentElement.getAttribute("data-density") === "compact" ? "compact" : "comfortable"; },
      set: function (value) {
        if (value === "compact") document.documentElement.setAttribute("data-density", "compact");
        else document.documentElement.removeAttribute("data-density");
        try {
          if (value === "compact") localStorage.setItem(DENSITY, "compact");
          else localStorage.removeItem(DENSITY);
        } catch (e) {}
        GX._syncTools();
      },
      toggle: function () {
        var next = GX.density.get() === "compact" ? "comfortable" : "compact";
        GX.density.set(next);
        GX.toast(next === "compact" ? "Compact rows." : "Comfortable rows.", "neutral");
      }
    },

    /* the command palette */
    palette: {
      items: [],
      register: function (list) { GX.palette.items = GX.palette.items.concat(list || []); },
      open: function () {
        var dialog = document.getElementById("palette");
        if (!dialog) return;
        GX.palette.render("");
        GX.openDialog(dialog);
        var input = document.getElementById("paletteInput");
        if (input) { input.value = ""; input.focus(); }
      },
      close: function () { GX.closeDialog(document.getElementById("palette")); },
      all: function () {
        var nav = ${JSON.stringify(NAV_ITEMS)}.map(function (item) {
          return { group: "Go to", label: item.label, hint: item.href, run: function () { location.href = item.href; } };
        });
        var tools = [
          { group: "Tools", label: "Refresh this page", hint: "r", run: function () { var b = document.getElementById("refreshBtn"); if (b) b.click(); else location.reload(); } },
          { group: "Tools", label: "Copy this link", hint: "", run: function () { GX.copy(location.href, "Link"); } },
          { group: "Tools", label: "Switch theme", hint: "", run: function () { GX.theme.toggle(); } },
          { group: "Tools", label: "Switch density", hint: "", run: function () { GX.density.toggle(); } },
          { group: "Tools", label: "Shortcuts and words", hint: "?", run: function () { GX.openDialog(document.getElementById("helpDialog")); } }
        ];
        return tools.concat(nav).concat(GX.palette.items);
      },
      render: function (query) {
        var list = document.getElementById("paletteList");
        if (!list) return;
        var q = String(query || "").trim().toLowerCase();
        var items = GX.palette.all().filter(function (item) {
          if (!q) return true;
          return (item.label + " " + (item.group || "")).toLowerCase().indexOf(q) >= 0;
        });
        list.textContent = "";
        GX._paletteItems = items;
        GX._paletteIndex = 0;
        if (!items.length) {
          list.appendChild(GX.el("div", { class: "palette-empty", text: "Nothing matches that." }));
          return;
        }
        var lastGroup = "";
        items.forEach(function (item, index) {
          if (item.group && item.group !== lastGroup) {
            lastGroup = item.group;
            list.appendChild(GX.el("div", { class: "palette-group", text: item.group }));
          }
          var button = GX.el("button", {
            class: "palette-item",
            type: "button",
            role: "option",
            "aria-selected": index === 0 ? "true" : "false",
            "data-index": index
          }, [
            GX.el("span", { html: ICON.arrow }),
            GX.el("span", { text: item.label }),
            item.hint ? GX.el("span", { class: "hint", text: item.hint }) : null
          ]);
          button.addEventListener("click", function () { GX.palette.run(index); });
          list.appendChild(button);
        });
      },
      run: function (index) {
        var item = (GX._paletteItems || [])[index];
        if (!item) return;
        GX.palette.close();
        setTimeout(function () { item.run(); }, 0);
      },
      move: function (delta) {
        var items = GX._paletteItems || [];
        if (!items.length) return;
        GX._paletteIndex = (GX._paletteIndex + delta + items.length) % items.length;
        var list = document.getElementById("paletteList");
        if (!list) return;
        Array.prototype.forEach.call(list.querySelectorAll(".palette-item"), function (node) {
          var on = Number(node.getAttribute("data-index")) === GX._paletteIndex;
          node.setAttribute("aria-selected", on ? "true" : "false");
          if (on && node.scrollIntoView) node.scrollIntoView({ block: "nearest" });
        });
      }
    },

    /* Keyboard shortcuts. They never fire while the operator is typing. */
    shortcuts: function (opts) {
      opts = opts || {};
      var filter = opts.filter ? document.getElementById(opts.filter) : null;
      var refresh = opts.refresh ? document.getElementById(opts.refresh) : null;
      document.addEventListener("keydown", function (event) {
        var target = event.target;
        var typing = target && (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        );
        if ((event.metaKey || event.ctrlKey) && !event.altKey && (event.key === "k" || event.key === "K")) {
          event.preventDefault();
          GX.palette.open();
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === "Escape") {
          var palette = document.getElementById("palette");
          if (palette && palette.open) { GX.palette.close(); return; }
          if (opts.onEscape) opts.onEscape();
          return;
        }
        if (typing) return;
        if (event.key === "/") {
          if (!filter) return;
          event.preventDefault();
          filter.focus();
          filter.select();
          return;
        }
        if (event.key === "r" || event.key === "R") {
          if (!refresh) return;
          event.preventDefault();
          refresh.click();
          return;
        }
        if (event.key === "?") {
          event.preventDefault();
          GX.openDialog(document.getElementById("helpDialog"));
          return;
        }
        if (event.key === "c" || event.key === "C") {
          return;
        }
      });

      var help = document.getElementById("helpBtn");
      if (help) help.addEventListener("click", function () { GX.openDialog(document.getElementById("helpDialog")); });
      var close = document.getElementById("helpClose");
      if (close) close.addEventListener("click", function () { GX.closeDialog(document.getElementById("helpDialog")); });

      var paletteBtn = document.getElementById("paletteBtn");
      if (paletteBtn) paletteBtn.addEventListener("click", function () { GX.palette.open(); });
      var paletteInput = document.getElementById("paletteInput");
      if (paletteInput) {
        paletteInput.addEventListener("input", function () { GX.palette.render(paletteInput.value); });
        paletteInput.addEventListener("keydown", function (event) {
          if (event.key === "ArrowDown") { event.preventDefault(); GX.palette.move(1); }
          else if (event.key === "ArrowUp") { event.preventDefault(); GX.palette.move(-1); }
          else if (event.key === "Enter") { event.preventDefault(); GX.palette.run(GX._paletteIndex || 0); }
        });
      }
      var paletteDialogNode = document.getElementById("palette");
      if (paletteDialogNode) {
        paletteDialogNode.addEventListener("click", function (event) {
          if (event.target === paletteDialogNode) GX.palette.close();
        });
      }
    },

    _syncTools: function () {
      var dark = GX.theme.get() === "dark";
      ["themeBtn", "drawerTheme"].forEach(function (id) {
        var node = document.getElementById(id);
        if (node) node.innerHTML = dark
          ? '<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/></svg>'
          : '<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
      });
      var compact = GX.density.get() === "compact";
      ["densityBtn", "drawerDensity"].forEach(function (id) {
        var node = document.getElementById(id);
        if (node) node.setAttribute("aria-pressed", compact ? "true" : "false");
      });
    }
  };

  window.GX = GX;

  function wireChrome() {
    var themeBtn = document.getElementById("themeBtn");
    if (themeBtn) themeBtn.addEventListener("click", function () { GX.theme.toggle(); });
    var densityBtn = document.getElementById("densityBtn");
    if (densityBtn) densityBtn.addEventListener("click", function () { GX.density.toggle(); });
    var drawerTheme = document.getElementById("drawerTheme");
    if (drawerTheme) drawerTheme.addEventListener("click", function () { GX.theme.toggle(); });
    var drawerDensity = document.getElementById("drawerDensity");
    if (drawerDensity) drawerDensity.addEventListener("click", function () { GX.density.toggle(); });
    var drawerHelp = document.getElementById("drawerHelp");
    if (drawerHelp) drawerHelp.addEventListener("click", function () { GX.openDialog(document.getElementById("helpDialog")); });

    var drawer = document.getElementById("drawer");
    var backdrop = document.getElementById("drawerBackdrop");
    var menuBtn = document.getElementById("menuBtn");
    function openDrawer() {
      if (!drawer || !backdrop) return;
      drawer.hidden = false;
      backdrop.hidden = false;
      if (menuBtn) menuBtn.setAttribute("aria-expanded", "true");
      var first = drawer.querySelector(".rail-item");
      if (first) first.focus();
    }
    function closeDrawer() {
      if (!drawer || !backdrop) return;
      drawer.hidden = true;
      backdrop.hidden = true;
      if (menuBtn) { menuBtn.setAttribute("aria-expanded", "false"); menuBtn.focus(); }
    }
    if (menuBtn) menuBtn.addEventListener("click", openDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && drawer && !drawer.hidden) closeDrawer();
    });

    GX._syncTools();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireChrome);
  else wireChrome();
})();
`;