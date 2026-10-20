/**
 * Usage console shell, served at GET /pengatur/usage.
 *
 * Same visual language as /pengatur (dark, dense, one accent) because they are
 * two views of the same deployment. The shell carries no data: it asks for the
 * admin token, stores it in localStorage, and reads /pengatur/usage.
 *
 * Dials: ENERGY calm-utilitarian, RHYTHM tabular numbers over generous section
 * padding, MOTION none except a single fade on row arrival — this is a report,
 * not a dashboard toy. Refresh is manual plus a 60s opt-in tick, because a tab
 * left open must not hammer the API.
 */

export const USAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Usage ledger</title>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/favicon.svg">
<style>
  :root {
    --bg: #0d1014;
    --panel: #12161b;
    --panel-2: #171c22;
    --line: #242b34;
    --line-soft: #1c222a;
    --text: #e6eaf0;
    --muted: #8c96a5;
    --accent: #e8a33d;
    --ready: #57c98a;
    --cool: #e0b64a;
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
  .top-right .mono { font-size: 12px; }

  h2.sec { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; margin: 26px 0 10px; }

  .strip { display: flex; flex-wrap: wrap; align-items: center; gap: 0 20px; padding: 12px 0; border-bottom: 1px solid var(--line-soft); }
  .strip .kv { display: flex; align-items: baseline; gap: 6px; }
  .strip .kv b { font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .strip .kv span { font-size: 12px; color: var(--muted); }
  .strip .kv.ready b { color: var(--ready); }
  .strip .kv.dead b { color: var(--dead); }
  .strip .spacer { flex: 1; }
  .strip .meta { font-size: 12px; color: var(--muted); }

  .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; }
  .card + .card { margin-top: 12px; }

  label.field { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  input[type=password], input[type=text], select {
    width: 100%;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--text);
    padding: 9px 11px;
    font-size: 13px;
    font-family: inherit;
    min-height: 40px;
  }
  input:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
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
  button.small { min-height: 32px; padding: 0 10px; font-size: 12px; font-weight: 600; }
  button.ghost { background: transparent; color: var(--text); border-color: var(--line); }
  button:disabled { opacity: 0.45; cursor: default; }

  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
  .row > * { flex: 0 1 auto; }
  .row .grow { flex: 1 1 200px; }

  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  thead th {
    text-align: left;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  thead th.num, tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody td { padding: 9px 10px; border-bottom: 1px solid var(--line-soft); vertical-align: top; }
  tbody tr { transition: background 120ms ease; }
  tbody tr:hover { background: #161b21; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; }
  .dim { color: var(--muted); }
  .nowrap { white-space: nowrap; }

  .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid; }
  .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .badge.ok { color: var(--ready); border-color: #1f4c36; background: #101f18; }
  .badge.err { color: var(--dead); border-color: #4a2b30; background: #211416; }
  .badge.rot { color: var(--cool); border-color: #4d3d12; background: #221d0c; }

  .empty { padding: 30px 12px; text-align: center; color: var(--muted); font-size: 13.5px; }
  .empty b { display: block; color: var(--text); font-size: 14px; margin-bottom: 4px; font-weight: 600; }

  .pager { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-top: 12px; font-size: 12.5px; color: var(--muted); }
  .pager:empty { display: none; }
  .pager .pages { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .pager button.small { min-width: 36px; font-variant-numeric: tabular-nums; }
  .pager button.active { background: var(--accent); border-color: var(--accent); color: #1a1206; font-weight: 700; }

  .err-box { border: 1px solid #4a2b30; background: #211416; color: var(--dead); border-radius: 6px; padding: 10px 12px; font-size: 13px; margin-top: 12px; }
  .err-box:empty { display: none; }

  .foot { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-top: 14px; }
  .muted { color: var(--muted); font-size: 12px; }
  .check { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); cursor: pointer; min-height: 44px; }
  .check input { width: 17px; height: 17px; accent-color: var(--accent); }

  @media (max-width: 820px) {
    .wrap { padding: 20px 14px 56px; }
    thead { display: none; }
    tbody tr { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 12px 0; border-bottom: 1px solid var(--line-soft); }
    tbody td { border: 0; padding: 0; }
    tbody td::before { content: attr(data-l); display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    tbody td.wide { grid-column: 1 / -1; }
    tbody td.num { text-align: left; }
  }
</style>
</head>
<body>
<div class="wrap">

  <header class="top">
    <div class="brand">
      <span class="dot"></span>
      <div>
        <h1>Usage ledger</h1>
        <div class="sub">Requests, tokens, cost &mdash; in-memory, reset on redeploy</div>
      </div>
    </div>
    <div class="top-right">
      <a href="/pengatur">keys &rarr;</a>
      <a href="/pengatur/models">models &rarr;</a>
      <span id="mode" class="mono">-</span>
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
    <div id="gateErr" class="err-box"></div>
  </div>

  <div id="console" hidden>

    <div class="strip">
      <div class="kv"><b id="sReq">0</b><span>requests</span></div>
      <div class="kv ready"><b id="sOk">0</b><span>ok</span></div>
      <div class="kv dead"><b id="sErr">0</b><span>errors</span></div>
      <div class="kv"><b id="sRot">0</b><span>rotated</span></div>
      <div class="kv"><b id="sPrompt">0</b><span>prompt tok</span></div>
      <div class="kv"><b id="sCompletion">0</b><span>output tok</span></div>
      <div class="kv"><b id="sCached">0</b><span>cached</span></div>
      <div class="kv"><b id="sCost">-</b><span>est. USD</span></div>
      <div class="spacer"></div>
      <div class="meta" id="sLatency">-</div>
    </div>

    <h2 class="sec">Filter</h2>
    <div class="card">
      <div class="row">
        <div style="flex:1 1 140px">
          <label class="field" for="fDay">Day</label>
          <select id="fDay"><option value="">all</option></select>
        </div>
        <div style="flex:1 1 160px">
          <label class="field" for="fModel">Model</label>
          <select id="fModel"><option value="">all</option></select>
        </div>
        <div style="flex:1 1 160px">
          <label class="field" for="fKey">Key</label>
          <select id="fKey"><option value="">all</option></select>
        </div>
        <div style="flex:1 1 130px">
          <label class="field" for="fStatus">Status</label>
          <select id="fStatus">
            <option value="">all</option>
            <option value="ok">ok</option>
            <option value="error">error</option>
            <option value="rotated">rotated</option>
          </select>
        </div>
        <button id="apply" type="button">Apply</button>
        <button id="reset" class="ghost" type="button">Reset</button>
      </div>
    </div>

    <h2 class="sec">By model</h2>
    <div class="card" style="padding:0;overflow-x:auto">
      <table id="byModel">
        <thead><tr>
          <th>Model</th><th class="num">Req</th><th class="num">Err</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cached</th><th class="num">Cost</th><th class="num">Avg ms</th>
        </tr></thead>
        <tbody></tbody>
      </table>
      <div class="empty" data-empty hidden><b>No traffic yet</b>Send a request through the gateway and it shows up here.</div>
    </div>

    <h2 class="sec">By key</h2>
    <div class="card" style="padding:0;overflow-x:auto">
      <table id="byKey">
        <thead><tr>
          <th>Key</th><th class="num">Req</th><th class="num">Err</th><th class="num">Rot</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cost</th><th class="num">Avg ms</th>
        </tr></thead>
        <tbody></tbody>
      </table>
      <div class="empty" data-empty hidden><b>No key attributed yet</b>A request that reached a key is listed here by its masked form.</div>
    </div>

    <h2 class="sec">By day</h2>
    <div class="card" style="padding:0;overflow-x:auto">
      <table id="byDay">
        <thead><tr>
          <th>Day</th><th class="num">Req</th><th class="num">Err</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cost</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <h2 class="sec">Request log</h2>
    <div class="card" style="padding:0;overflow-x:auto">
      <table id="log">
        <thead><tr>
          <th>Time</th><th>Route</th><th>Model</th><th>Key</th><th>Status</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Total</th><th class="num">Cost</th><th class="num">ms</th>
        </tr></thead>
        <tbody></tbody>
      </table>
      <div class="empty" data-empty hidden><b>No requests match</b>Loosen the filter or send traffic through the gateway.</div>
    </div>

    <div class="pager" id="pager"></div>

    <div class="foot">
      <div class="row" style="gap:10px">
        <button id="refresh" type="button" class="small">Refresh</button>
        <button id="csv" type="button" class="small ghost">Export CSV</button>
        <label class="check"><input id="auto" type="checkbox"> auto-refresh 60s</label>
      </div>
      <div class="muted" id="stamp">-</div>
    </div>

    <div id="err" class="err-box"></div>
  </div>
</div>

<script>
(function () {
  "use strict";

  var STORE = "geminesx.admin.token";
  var el = {
    gate: document.getElementById("gate"),
    gateErr: document.getElementById("gateErr"),
    token: document.getElementById("token"),
    connect: document.getElementById("connect"),
    console: document.getElementById("console"),
    mode: document.getElementById("mode"),
    sReq: document.getElementById("sReq"),
    sOk: document.getElementById("sOk"),
    sErr: document.getElementById("sErr"),
    sRot: document.getElementById("sRot"),
    sPrompt: document.getElementById("sPrompt"),
    sCompletion: document.getElementById("sCompletion"),
    sCached: document.getElementById("sCached"),
    sCost: document.getElementById("sCost"),
    sLatency: document.getElementById("sLatency"),
    fDay: document.getElementById("fDay"),
    fModel: document.getElementById("fModel"),
    fKey: document.getElementById("fKey"),
    fStatus: document.getElementById("fStatus"),
    apply: document.getElementById("apply"),
    reset: document.getElementById("reset"),
    byModel: document.getElementById("byModel"),
    byKey: document.getElementById("byKey"),
    byDay: document.getElementById("byDay"),
    log: document.getElementById("log"),
    pager: document.getElementById("pager"),
    refresh: document.getElementById("refresh"),
    csv: document.getElementById("csv"),
    auto: document.getElementById("auto"),
    stamp: document.getElementById("stamp"),
    err: document.getElementById("err")
  };

  var state = {
    token: "",
    page: 1,
    size: 25,
    filter: { day: "", model: "", key: "", status: "" },
    timer: null,
    last: null
  };

  function fmt(n) {
    if (n === null || n === undefined) return "-";
    if (typeof n !== "number") return String(n);
    return n.toLocaleString("en-US");
  }

  function money(n) {
    if (n === null || n === undefined) return "-";
    if (n === 0) return "$0";
    if (n < 0.000001) return "<$0.000001";
    return "$" + n.toFixed(6).replace(/0+$/, "").replace(/\\.$/, "");
  }

  function clock(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString("en-GB", { hour12: false }) + "." +
      String(d.getMilliseconds()).padStart(3, "0");
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { authorization: "Bearer " + state.token };
    if (opts.body) headers["content-type"] = "application/json";
    return fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
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

  function setErr(msg) {
    el.err.textContent = msg || "";
    el.gateErr.textContent = msg || "";
  }

  function cell(tr, text, cls, label) {
    var td = document.createElement("td");
    if (cls) td.className = cls;
    if (label) td.setAttribute("data-l", label);
    td.textContent = text;
    tr.appendChild(td);
    return td;
  }

  function renderBuckets(table, buckets, cols) {
    var body = table.querySelector("tbody");
    body.textContent = "";
    var empty = table.parentNode.querySelector("[data-empty]");
    if (empty) empty.hidden = buckets.length > 0;
    for (var i = 0; i < buckets.length; i++) {
      var b = buckets[i];
      var tr = document.createElement("tr");
      for (var j = 0; j < cols.length; j++) {
        var c = cols[j];
        var v = c.fmt ? c.fmt(b[c.k], b) : b[c.k];
        cell(tr, v === undefined || v === null ? "-" : String(v), c.num ? "num" : "", c.label);
      }
      body.appendChild(tr);
    }
  }

  function renderLog(rows) {
    var body = el.log.querySelector("tbody");
    body.textContent = "";
    var empty = el.log.parentNode.querySelector("[data-empty]");
    if (empty) empty.hidden = rows.length > 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var tr = document.createElement("tr");
      cell(tr, clock(r.ts), "mono nowrap", "time");
      cell(tr, r.route, "mono", "route");
      cell(tr, r.model, "mono", "model");
      cell(tr, r.keyMasked || "-", "mono", "key");
      var st = document.createElement("td");
      st.setAttribute("data-l", "status");
      var badge = document.createElement("span");
      badge.className = "badge " + (r.ok ? "ok" : "err");
      badge.textContent = r.status + (r.errorCode ? " " + r.errorCode : "");
      st.appendChild(badge);
      if (r.rotated) {
        var rb = document.createElement("span");
        rb.className = "badge rot";
        rb.style.marginLeft = "6px";
        rb.textContent = "rot";
        st.appendChild(rb);
      }
      tr.appendChild(st);
      cell(tr, fmt(r.promptTokens), "num", "prompt");
      cell(tr, fmt(r.completionTokens), "num", "output");
      cell(tr, fmt(r.totalTokens), "num", "total");
      cell(tr, money(r.costUsd), "num", "cost");
      cell(tr, fmt(r.latencyMs), "num", "ms");
      body.appendChild(tr);
    }
  }

  function renderPager(data) {
    el.pager.textContent = "";
    var total = data.totalRows;
    var pages = Math.max(1, Math.ceil(total / data.pageSize));
    var info = document.createElement("div");
    info.textContent = total === 0
      ? "0 rows"
      : "rows " + ((data.page - 1) * data.pageSize + 1) + "-" +
        Math.min(total, data.page * data.pageSize) + " of " + total;
    el.pager.appendChild(info);

    if (pages <= 1) return;
    var box = document.createElement("div");
    box.className = "pages";

    function pageBtn(label, n, active, disabled) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "small" + (active ? " active" : "");
      b.textContent = label;
      b.disabled = !!disabled;
      if (!active && !disabled) {
        b.addEventListener("click", function () { state.page = n; load(); });
      }
      box.appendChild(b);
    }

    pageBtn("first", 1, false, data.page === 1);
    pageBtn("prev", data.page - 1, false, data.page === 1);
    var lo = Math.max(1, data.page - 2);
    var hi = Math.min(pages, lo + 4);
    lo = Math.max(1, hi - 4);
    for (var p = lo; p <= hi; p++) pageBtn(String(p), p, p === data.page, false);
    pageBtn("next", data.page + 1, false, data.page === pages);
    pageBtn("last", pages, false, data.page === pages);
    el.pager.appendChild(box);
  }

  function fillSelect(sel, items, current) {
    var seen = {};
    var keep = sel.value;
    var opts = ['<option value="">all</option>'];
    for (var i = 0; i < items.length; i++) {
      var v = items[i].key;
      if (!v || seen[v]) continue;
      seen[v] = 1;
      opts.push('<option value="' + String(v).replace(/"/g, "&quot;") + '">' + v + "</option>");
    }
    sel.innerHTML = opts.join("");
    if (keep) sel.value = keep;
    else if (current) sel.value = current;
  }

  function paint(data) {
    state.last = data;
    el.mode.textContent = "mode: " + data.mode + " / cap " + fmt(data.capacity);
    var t = data.totals;
    el.sReq.textContent = fmt(t.requests);
    el.sOk.textContent = fmt(t.ok);
    el.sErr.textContent = fmt(t.errors);
    el.sRot.textContent = fmt(t.rotated);
    el.sPrompt.textContent = fmt(t.promptTokens);
    el.sCompletion.textContent = fmt(t.completionTokens);
    el.sCached.textContent = fmt(t.cachedTokens);
    el.sCost.textContent = money(t.costUsd);
    el.sLatency.textContent = "avg " + fmt(t.avgLatencyMs) + " ms" +
      (data.since ? " · oldest " + new Date(data.since).toLocaleString() : "");

    fillSelect(el.fDay, data.byDay, state.filter.day);
    fillSelect(el.fModel, data.byModel, state.filter.model);
    fillSelect(el.fKey, data.byKey, state.filter.key);

    renderBuckets(el.byModel, data.byModel, [
      { k: "key", label: "model" },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "cachedTokens", num: true, label: "cached" },
      { k: "costUsd", num: true, fmt: money, label: "cost" },
      { k: "avgLatencyMs", num: true, label: "ms" }
    ]);

    renderBuckets(el.byKey, data.byKey, [
      { k: "key", label: "key" },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "rotated", num: true, label: "rot" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "costUsd", num: true, fmt: money, label: "cost" },
      { k: "avgLatencyMs", num: true, label: "ms" }
    ]);

    renderBuckets(el.byDay, data.byDay, [
      { k: "key", label: "day" },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "costUsd", num: true, fmt: money, label: "cost" }
    ]);

    renderLog(data.rows);
    renderPager(data);
    el.stamp.textContent = "updated " + new Date().toLocaleTimeString("en-GB", { hour12: false });
  }

  function query() {
    var q = ["page=" + state.page, "pageSize=" + state.size];
    for (var k in state.filter) {
      if (state.filter[k]) q.push(k + "=" + encodeURIComponent(state.filter[k]));
    }
    return "/pengatur/usage/data?" + q.join("&");
  }

  function load() {
    if (!state.token) return;
    el.refresh.disabled = true;
    api(query()).then(function (data) {
      setErr("");
      paint(data);
    }).catch(function (e) {
      setErr(e.message);
    }).then(function () {
      el.refresh.disabled = false;
    });
  }

  function exportCsv() {
    if (!state.token) return;
    var q = [];
    for (var k in state.filter) {
      if (state.filter[k]) q.push(k + "=" + encodeURIComponent(state.filter[k]));
    }
    var url = "/pengatur/usage/export.csv" + (q.length ? "?" + q.join("&") : "");
    fetch(url, { headers: { authorization: "Bearer " + state.token } })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.blob();
      })
      .then(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "geminesx-usage-" + new Date().toISOString().slice(0, 10) + ".csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      })
      .catch(function (e) { setErr(e.message); });
  }

  function connect() {
    var t = el.token.value.trim();
    if (!t) { setErr("Enter the admin token."); return; }
    state.token = t;
    api("/pengatur/usage/data?page=1&pageSize=" + state.size).then(function (data) {
      try { localStorage.setItem(STORE, t); } catch (e) {}
      setErr("");
      el.gate.hidden = true;
      el.console.hidden = false;
      paint(data);
    }).catch(function (e) {
      state.token = "";
      setErr(e.message);
    });
  }

  el.connect.addEventListener("click", connect);
  el.token.addEventListener("keydown", function (e) { if (e.key === "Enter") connect(); });
  el.apply.addEventListener("click", function () {
    state.filter.day = el.fDay.value;
    state.filter.model = el.fModel.value;
    state.filter.key = el.fKey.value;
    state.filter.status = el.fStatus.value;
    state.page = 1;
    load();
  });
  el.reset.addEventListener("click", function () {
    state.filter = { day: "", model: "", key: "", status: "" };
    el.fDay.value = "";
    el.fModel.value = "";
    el.fKey.value = "";
    el.fStatus.value = "";
    state.page = 1;
    load();
  });
  el.refresh.addEventListener("click", load);
  el.csv.addEventListener("click", exportCsv);
  el.auto.addEventListener("change", function () {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    if (el.auto.checked) {
      state.timer = setInterval(function () {
        // Only poll while the tab is actually being looked at.
        if (document.visibilityState === "visible") load();
      }, 60000);
    }
  });

  var saved = "";
  try { saved = localStorage.getItem(STORE) || ""; } catch (e) {}
  if (saved) { el.token.value = saved; connect(); }
})();
</script>
</body>
</html>
`;