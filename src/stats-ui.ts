/**
 * Stats console shell, served at GET /pengatur/stats.
 *
 * Same visual language as the other /pengatur shells. Carries no data: the
 * browser picks a range, then reads /pengatur/stats/data with the admin token
 * it holds in localStorage.
 *
 * Dials: ENERGY calm-utilitarian, RHYTHM tabular numbers, MOTION none.
 */

export const STATS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Statistics</title>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root {
    --bg: #0d1014;
    --panel: #12161b;
    --panel-2: #171c22;
    --line: #242b34;
    --text: #e6eaf0;
    --muted: #8c96a5;
    --accent: #e8a33d;
    --ready: #57c98a;
    --dead: #e8737b;
    --focus: #7fb4ff;
    --radius: 8px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 28px 20px 64px; }
  header.top { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand h1 { font-size: 16px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
  .brand .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
  .brand .sub { font-size: 12px; color: var(--muted); }
  .top-right { display: flex; align-items: center; gap: 14px; font-size: 12px; color: var(--muted); }
  .top-right a { color: var(--accent); text-decoration: none; min-height: 32px; display: inline-flex; align-items: center; }
  h2.sec { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; margin: 26px 0 10px; }
  .strip { display: flex; flex-wrap: wrap; gap: 0 20px; padding: 12px 0; border-bottom: 1px solid var(--line); }
  .strip .kv { display: flex; align-items: baseline; gap: 6px; }
  .strip .kv b { font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .strip .kv span { font-size: 12px; color: var(--muted); }
  .strip .kv.dead b { color: var(--dead); }
  .strip .kv.ready b { color: var(--ready); }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; }
  .card + .card { margin-top: 12px; }
  label.field { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  input[type=password], select {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--text);
    padding: 9px 11px;
    font-size: 13px;
    font-family: inherit;
    min-height: 40px;
  }
  input:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  button {
    background: var(--accent);
    color: #1a1206;
    border: 1px solid var(--accent);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 650;
    padding: 0 14px;
    min-height: 40px;
    cursor: pointer;
    font-family: inherit;
  }
  button.ghost { background: transparent; color: var(--text); border-color: var(--line); }
  button:disabled { opacity: 0.45; cursor: default; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
  .row .grow { flex: 1 1 220px; }
  .muted { color: var(--muted); font-size: 12.5px; }
  .err { color: var(--dead); font-size: 12.5px; margin: 10px 0 0; min-height: 1em; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  thead th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  tbody td { padding: 7px 10px; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
  tbody tr:last-child td { border-bottom: 0; }
  th.num, td.num { text-align: right; }
  .heat { display: grid; grid-template-columns: 34px repeat(24, minmax(18px, 1fr)); gap: 2px; font-size: 10px; color: var(--muted); }
  .heat .h { text-align: center; }
  .heat .cell { height: 18px; border-radius: 3px; background: var(--panel-2); }
  .note { margin: 12px 0 0; color: var(--muted); font-size: 12.5px; }
  .empty { padding: 22px 16px; text-align: center; color: var(--muted); }
  .empty b { display: block; color: var(--text); margin-bottom: 4px; }
</style>
</head>
<body>
<div class="wrap">

  <header class="top">
    <div class="brand">
      <span class="dot"></span>
      <div>
        <h1>Statistics</h1>
        <div class="sub">Range breakdowns, heatmap and cost projection</div>
      </div>
    </div>
    <div class="top-right">
      <a href="/pengatur">overview &rarr;</a>
      <a href="/pengatur/logs">logs &rarr;</a>
      <a href="/pengatur/keys">keys &rarr;</a>
      <a href="/pengatur/settings">settings &rarr;</a>
      <a href="/pengatur/audit">audit &rarr;</a>
    </div>
  </header>

  <div class="card" id="gate">
    <label class="field" for="token">Admin token</label>
    <div class="row">
      <div class="grow">
        <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="ADMIN_TOKEN">
      </div>
      <button id="connect" type="button">Connect</button>
    </div>
    <p class="muted" style="margin:12px 0 0">The token stays in this browser. It is only sent to this deployment.</p>
    <div id="gateErr" class="err"></div>
  </div>

  <div id="console" hidden>

    <div class="strip">
      <div class="kv"><b id="sReq">0</b><span>requests</span></div>
      <div class="kv ready"><b id="sOk">0</b><span>ok</span></div>
      <div class="kv dead"><b id="sErr">0</b><span>errors</span></div>
      <div class="kv"><b id="sRot">0</b><span>rotated</span></div>
      <div class="kv"><b id="sTokens">0</b><span>tokens</span></div>
      <div class="kv"><b id="sCost">$0</b><span>cost</span></div>
      <div class="kv"><b id="sP50">0</b><span>p50 ms</span></div>
      <div class="kv"><b id="sP95">0</b><span>p95 ms</span></div>
      <div class="kv"><b id="sProj">$0</b><span>projected / 30d</span></div>
    </div>

    <h2 class="sec">Range</h2>
    <div class="card">
      <div class="row">
        <div>
          <label class="field" for="range">Window</label>
          <select id="range">
            <option value="1h">last hour</option>
            <option value="24h" selected>last 24 hours</option>
            <option value="7d">last 7 days</option>
            <option value="30d">last 30 days</option>
          </select>
        </div>
        <button id="apply" type="button">Apply</button>
      </div>
      <p class="note" id="meta"></p>
      <div id="dataErr" class="err"></div>
    </div>

    <h2 class="sec">Hour &times; weekday heatmap (WIB)</h2>
    <div class="card">
      <div id="heat" class="heat"></div>
      <div class="empty" id="heatEmpty" hidden><b>No hourly data</b>This range has no events with hourly granularity.</div>
    </div>

    <h2 class="sec">By model</h2>
    <div class="card" style="padding:0;overflow-x:auto">
      <table id="byModel">
        <thead><tr><th>Model</th><th class="num">Req</th><th class="num">Err</th><th class="num">Tokens</th><th class="num">Cost</th><th class="num">Avg ms</th></tr></thead>
        <tbody></tbody>
      </table>
      <div class="empty" data-empty hidden><b>Nothing in range</b>No requests matched this window.</div>
    </div>

    <h2 class="sec">By key</h2>
    <div class="card" style="padding:0;overflow-x:auto">
      <table id="byKey">
        <thead><tr><th>Key id</th><th class="num">Req</th><th class="num">Err</th><th class="num">Rot</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
        <tbody></tbody>
      </table>
      <div class="empty" data-empty hidden><b>Nothing in range</b>No requests matched this window.</div>
    </div>

    <h2 class="sec">By route</h2>
    <div class="card" style="padding:0;overflow-x:auto">
      <table id="byRoute">
        <thead><tr><th>Route</th><th class="num">Req</th><th class="num">Err</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
        <tbody></tbody>
      </table>
      <div class="empty" data-empty hidden><b>Nothing in range</b>No requests matched this window.</div>
    </div>

    <h2 class="sec">By status</h2>
    <div class="card" style="padding:0;overflow-x:auto">
      <table id="byStatus">
        <thead><tr><th>Status</th><th class="num">Req</th></tr></thead>
        <tbody></tbody>
      </table>
      <div class="empty" data-empty hidden><b>Nothing in range</b>No requests matched this window.</div>
    </div>

  </div>
</div>
<script>
(function () {
  var STORE = "geminesx.admin.token";
  var state = { token: "", range: "24h" };

  function el(id) { return document.getElementById(id); }
  var gate = el("gate"), box = el("console"), tokenIn = el("token");

  function err(id, msg) { el(id).textContent = msg || ""; }

  function money(n) {
    return "$" + (Number(n) || 0).toFixed(6).replace(/0+$/, "").replace(/\\.$/, "");
  }

  function int(n) {
    return String(Number(n) || 0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
  }

  function api(path) {
    return fetch(path, { headers: { authorization: "Bearer " + state.token } }).then(function (r) {
      if (r.status === 401) throw new Error("Unauthorized. Re-enter the admin token.");
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = t;
          try { msg = JSON.parse(t).error.message || t; } catch (e) {}
          throw new Error(msg || ("HTTP " + r.status));
        });
      }
      return r.json();
    });
  }

  function fillBucket(tableId, rows, cols) {
    var table = el(tableId);
    var body = table.querySelector("tbody");
    body.textContent = "";
    var empty = table.querySelector("[data-empty]");
    if (!rows || !rows.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var tr = document.createElement("tr");
      for (var c = 0; c < cols.length; c++) {
        var td = document.createElement("td");
        if (c > 0) td.className = "num";
        td.textContent = cols[c](r);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
  }

  function fillStatus(rows) {
    var body = el("byStatus").querySelector("tbody");
    body.textContent = "";
    var empty = el("byStatus").querySelector("[data-empty]");
    if (!rows || !rows.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    for (var i = 0; i < rows.length; i++) {
      var tr = document.createElement("tr");
      var a = document.createElement("td");
      a.textContent = rows[i].key;
      var b = document.createElement("td");
      b.className = "num";
      b.textContent = int(rows[i].requests);
      tr.appendChild(a);
      tr.appendChild(b);
      body.appendChild(tr);
    }
  }

  function fillHeat(cells) {
    var heat = el("heat");
    heat.textContent = "";
    if (!cells || !cells.length) { el("heatEmpty").hidden = false; return; }
    el("heatEmpty").hidden = true;
    var max = 0;
    for (var i = 0; i < cells.length; i++) max = Math.max(max, cells[i].requests);
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var grid = {};
    for (var j = 0; j < cells.length; j++) grid[cells[j].weekday + ":" + cells[j].hour] = cells[j].requests;
    for (var d = 0; d < 7; d++) {
      var lbl = document.createElement("div");
      lbl.textContent = days[d];
      heat.appendChild(lbl);
      for (var h = 0; h < 24; h++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        var v = grid[d + ":" + h] || 0;
        if (v > 0) {
          var alpha = 0.25 + 0.75 * (v / max);
          cell.style.background = "rgba(232, 163, 61, " + alpha.toFixed(3) + ")";
          cell.title = days[d] + " " + (h < 10 ? "0" + h : h) + ":00 — " + v + " req";
        }
        heat.appendChild(cell);
      }
    }
  }

  function paint(d) {
    var t = d.totals || {};
    el("sReq").textContent = int(t.requests);
    el("sOk").textContent = int((t.requests || 0) - (t.errors || 0));
    el("sErr").textContent = int(t.errors);
    el("sRot").textContent = int(t.rotated);
    el("sTokens").textContent = int(t.totalTokens);
    el("sCost").textContent = money(t.costUsd);
    el("sP50").textContent = int(t.p50Ms);
    el("sP95").textContent = int(t.p95Ms);
    el("sProj").textContent = money(d.projectedMonthlyUsd);
    el("meta").textContent = (d.source === "ring" ? "Source: in-memory ring. " : "Source: usage_daily. ") + (d.note || "");
    fillHeat(d.heatmap);
    fillBucket("byModel", d.byModel, [
      function (r) { return r.key; },
      function (r) { return int(r.requests); },
      function (r) { return int(r.errors); },
      function (r) { return int(r.totalTokens); },
      function (r) { return money(r.costUsd); },
      function (r) { return int(r.avgLatencyMs); }
    ]);
    fillBucket("byKey", d.byKey, [
      function (r) { return r.key; },
      function (r) { return int(r.requests); },
      function (r) { return int(r.errors); },
      function (r) { return int(r.rotated); },
      function (r) { return int(r.totalTokens); },
      function (r) { return money(r.costUsd); }
    ]);
    fillBucket("byRoute", d.byRoute, [
      function (r) { return r.key; },
      function (r) { return int(r.requests); },
      function (r) { return int(r.errors); },
      function (r) { return int(r.totalTokens); },
      function (r) { return money(r.costUsd); }
    ]);
    fillStatus(d.byStatus);
  }

  function load() {
    err("dataErr", "");
    api("/pengatur/stats/data?range=" + encodeURIComponent(state.range)).then(paint).catch(function (e) {
      err("dataErr", e.message);
    });
  }

  function connect() {
    var t = tokenIn.value.trim();
    if (!t) { err("gateErr", "Enter the admin token."); return; }
    state.token = t;
    api("/pengatur/stats/data?range=" + encodeURIComponent(state.range)).then(function (d) {
      try { localStorage.setItem(STORE, t); } catch (e) {}
      err("gateErr", "");
      gate.hidden = true;
      box.hidden = false;
      paint(d);
    }).catch(function (e) {
      state.token = "";
      err("gateErr", e.message);
    });
  }

  el("connect").addEventListener("click", connect);
  tokenIn.addEventListener("keydown", function (e) { if (e.key === "Enter") connect(); });
  el("apply").addEventListener("click", function () {
    state.range = el("range").value;
    load();
  });

  var saved = "";
  try { saved = localStorage.getItem(STORE) || ""; } catch (e) {}
  if (saved) { tokenIn.value = saved; connect(); }
})();
</script>
</body>
</html>`;
