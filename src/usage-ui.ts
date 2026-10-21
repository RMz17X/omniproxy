/**
 * Usage console shell, served at GET /pengatur/usage.
 *
 * Same visual language as /pengatur (dark, dense, one accent) because they are
 * two views of the same deployment. The shell carries no data: it asks for the
 * admin token, stores it in localStorage, and reads /pengatur/usage.
 *
 * Dials: ENERGY calm-utilitarian, RHYTHM tabular numbers over generous section
 * padding, MOTION none: this is a report, not a dashboard toy. Refresh is
 * manual plus a 60s opt-in tick, because a tab left open must not hammer the
 * API.
 */

import { BASE_CSS, stateBlock } from "./ui.ts";

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
<style>${BASE_CSS}</style>
</head>
<body>

<header class="topbar">
  <a class="wordmark" href="/pengatur">GeminesX</a>
  <nav class="nav">
    <a href="/pengatur">Keys</a>
    <a href="/pengatur/usage" class="active" aria-current="page">Usage</a>
    <a href="/pengatur/models">Models</a>
  </nav>
  <div class="meta">
    <span id="mode">-</span>
  </div>
</header>

<main class="page">

  <div class="page-head">
    <h1>Usage ledger</h1>
    <span class="meta">Requests, tokens, cost. In-memory, reset on redeploy.</span>
  </div>

  <!-- auth -->
  <section id="gate" class="panel">
    <div class="panel-body">
      <label class="field" for="token">Admin token</label>
      <div class="row">
        <div class="grow">
          <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="ADMIN_TOKEN">
        </div>
        <button id="connect" class="btn btn-primary" type="button">Connect</button>
      </div>
      <p class="dimtext" style="margin-top:12px">The token stays in this browser. It is only sent to this deployment.</p>
      <div id="gateErr" class="notice err"></div>
    </div>
  </section>

  <div id="console" class="stack" hidden>

    <div id="loadState" hidden>${stateBlock("loading", "Loading usage...")}</div>

    <div class="strip">
      <div class="kv"><b id="sReq">0</b><span class="k">requests</span></div>
      <div class="kv ready"><b id="sOk">0</b><span class="k">ok</span></div>
      <div class="kv dead"><b id="sErr">0</b><span class="k">errors</span></div>
      <div class="kv"><b id="sRot">0</b><span class="k">rotated</span></div>
      <div class="kv"><b id="sPrompt">0</b><span class="k">prompt tok</span></div>
      <div class="kv"><b id="sCompletion">0</b><span class="k">output tok</span></div>
      <div class="kv"><b id="sCached">0</b><span class="k">cached</span></div>
      <div class="kv"><b id="sCost">-</b><span class="k">est. USD</span></div>
      <div class="spacer"></div>
      <div class="meta" id="sLatency">-</div>
    </div>

    <!-- filters -->
    <section class="panel">
      <div class="panel-head"><div class="panel-title">Filters</div></div>
      <div class="panel-body">
        <div class="row">
          <div class="grow">
            <label class="field" for="fDay">Day</label>
            <select id="fDay"><option value="">all</option></select>
          </div>
          <div class="grow">
            <label class="field" for="fModel">Model</label>
            <select id="fModel"><option value="">all</option></select>
          </div>
          <div class="grow">
            <label class="field" for="fKey">Key</label>
            <select id="fKey"><option value="">all</option></select>
          </div>
          <div class="grow">
            <label class="field" for="fStatus">Status</label>
            <select id="fStatus">
              <option value="">all</option>
              <option value="ok">ok</option>
              <option value="error">error</option>
              <option value="rotated">rotated</option>
            </select>
          </div>
        </div>
        <div class="row" style="margin-top:12px">
          <button id="apply" class="btn btn-primary" type="button">Apply</button>
          <button id="reset" class="btn" type="button">Reset</button>
        </div>
      </div>
    </section>

    <!-- by model -->
    <section class="panel">
      <div class="panel-head"><div class="panel-title">By model</div></div>
      <div class="tablewrap">
        <table id="byModel">
          <thead><tr>
            <th>Model</th><th class="num">Req</th><th class="num">Err</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cached</th><th class="num">Cost</th><th class="num">Avg ms</th>
          </tr></thead>
          <tbody></tbody>
        </table>
        <div class="empty" data-empty hidden><b>No traffic yet</b><br>Send a request through the gateway and it shows up here.</div>
      </div>
    </section>

    <!-- by key -->
    <section class="panel">
      <div class="panel-head"><div class="panel-title">By key</div></div>
      <div class="tablewrap">
        <table id="byKey">
          <thead><tr>
            <th>Key</th><th class="num">Req</th><th class="num">Err</th><th class="num">Rot</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cost</th><th class="num">Avg ms</th>
          </tr></thead>
          <tbody></tbody>
        </table>
        <div class="empty" data-empty hidden><b>No key attributed yet</b><br>A request that reached a key is listed here by its masked form.</div>
      </div>
    </section>

    <!-- by day -->
    <section class="panel">
      <div class="panel-head"><div class="panel-title">By day</div></div>
      <div class="tablewrap">
        <table id="byDay">
          <thead><tr>
            <th>Day</th><th class="num">Req</th><th class="num">Err</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cost</th>
          </tr></thead>
          <tbody></tbody>
        </table>
        <div class="empty" data-empty hidden><b>No daily rollup yet</b><br>Days appear once traffic has been recorded.</div>
      </div>
    </section>

    <!-- request log -->
    <section class="panel">
      <div class="panel-head"><div class="panel-title">Request log</div></div>
      <div class="tablewrap">
        <table id="log">
          <thead><tr>
            <th>Time</th><th>Route</th><th>Model</th><th>Key</th><th>Status</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Total</th><th class="num">Cost</th><th class="num">ms</th>
          </tr></thead>
          <tbody></tbody>
        </table>
        <div class="empty" data-empty hidden><b>No requests match</b><br>Loosen the filter or send traffic through the gateway.</div>
      </div>
    </section>

    <div id="pager" class="pager"></div>

    <div class="row" style="justify-content:space-between">
      <div class="row">
        <button id="refresh" class="btn small" type="button">Refresh</button>
        <button id="csv" class="btn small" type="button">Export CSV</button>
        <label class="check"><input id="auto" type="checkbox"> auto-refresh 60s</label>
      </div>
      <span class="dimtext" id="stamp">-</span>
    </div>

    <div id="err" class="notice err"></div>
  </div>

</main>

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
    loadState: document.getElementById("loadState"),
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
    el.loadState.hidden = true;
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
    if (!state.last) el.loadState.hidden = false;
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