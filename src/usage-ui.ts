/**
 * Logs console, served at GET /pengatur/logs and GET /pengatur/usage.
 *
 * The request ledger, read from the in-memory ring. The shell carries no
 * data: it asks for the admin token, stores it in localStorage, and reads
 * /pengatur/usage/data. The CSV export uses the same filters.
 *
 * Layout: the totals first as figures, then the filters, then the three
 * breakdowns, then the request log itself. Every table gets the full width,
 * because a report that scrolls sideways is a report nobody reads.
 */

import { authGate, consolePage, icon, stateBlock, noticeBand } from "./ui.ts";

const USAGE_BODY = `
${authGate()}

<div id="console" hidden>
  <div class="page-head">
    <div>
      <h1>Logs</h1>
      <p class="sub">Every request that passed through the gateway.</p>
    </div>
    <span class="meta" id="stamp">-</span>
  </div>

  ${noticeBand()}

  <div class="grid kpis" id="kpis"></div>

  <section class="card">
    <div class="card-head">
      <h2>Filters</h2>
      <div class="actions">
        <label class="check"><input id="auto" type="checkbox"> Auto refresh every 60s</label>
      </div>
    </div>
    <div class="card-body">
      <div class="toolbar">
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
        <div class="row u-gap-2" >
          <button id="apply" class="btn btn-primary" type="button">Apply</button>
          <button id="reset" class="btn" type="button">Reset</button>
        </div>
      </div>
      <div id="err" class="notice err u-mt-3" role="status" aria-live="polite" ></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head">
      <h2>By model</h2>
      <span class="meta" id="byModelMeta"></span>
    </div>
    <div class="tablewrap">
      <table class="table" id="byModel">
        <thead><tr>
          <th>Model</th><th class="num">Req</th><th class="num">Err</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cached</th><th class="num">Cost</th><th class="num">Avg ms</th>
        </tr></thead>
        <tbody></tbody>
      </table>
      <div id="byModelEmpty"></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head">
      <h2>By key</h2>
      <span class="meta" id="byKeyMeta"></span>
    </div>
    <div class="tablewrap">
      <table class="table" id="byKey">
        <thead><tr>
          <th>Key</th><th class="num">Req</th><th class="num">Err</th><th class="num">Rot</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cost</th><th class="num">Avg ms</th>
        </tr></thead>
        <tbody></tbody>
      </table>
      <div id="byKeyEmpty"></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head">
      <h2>By day</h2>
      <span class="meta" id="byDayMeta"></span>
    </div>
    <div class="tablewrap">
      <table class="table" id="byDay">
        <thead><tr>
          <th>Day</th><th class="num">Req</th><th class="num">Err</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cost</th>
        </tr></thead>
        <tbody></tbody>
      </table>
      <div id="byDayEmpty"></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head">
      <h2>Request log</h2>
      <span class="meta" id="logMeta"></span>
    </div>
    <div class="tablewrap">
      <table class="table" id="log">
        <thead><tr>
          <th>Time</th><th>Route</th><th>Model</th><th>Key</th><th>Status</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Total</th><th class="num">Cost</th><th class="num">ms</th>
        </tr></thead>
        <tbody></tbody>
      </table>
      <div id="logEmpty"></div>
    </div>
    <div class="card-foot">
      <div id="pager" class="pager u-full" ></div>
    </div>
  </section>
</div>
`;

const USAGE_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    stamp: document.getElementById("stamp"),
    fDay: document.getElementById("fDay"),
    fModel: document.getElementById("fModel"),
    fKey: document.getElementById("fKey"),
    fStatus: document.getElementById("fStatus"),
    apply: document.getElementById("apply"),
    reset: document.getElementById("reset"),
    byModel: document.getElementById("byModel"),
    byKey: document.getElementById("byKey"),
    byDay: document.getElementById("byDay"),
    byModelMeta: document.getElementById("byModelMeta"),
    byKeyMeta: document.getElementById("byKeyMeta"),
    byDayMeta: document.getElementById("byDayMeta"),
    log: document.getElementById("log"),
    logMeta: document.getElementById("logMeta"),
    pager: document.getElementById("pager"),
    refresh: document.getElementById("refreshBtn"),
    csv: document.getElementById("csvBtn"),
    auto: document.getElementById("auto"),
    err: document.getElementById("err")
  };

  var state = { page: 1, size: 25, filter: { day: "", model: "", key: "", status: "" }, timer: null };

  function query() {
    var q = ["page=" + state.page, "pageSize=" + state.size];
    for (var k in state.filter) {
      if (state.filter[k]) q.push(k + "=" + encodeURIComponent(state.filter[k]));
    }
    return "/pengatur/usage/data?" + q.join("&");
  }

  function filterQuery() {
    var q = [];
    for (var k in state.filter) {
      if (state.filter[k]) q.push(k + "=" + encodeURIComponent(state.filter[k]));
    }
    return q.length ? "?" + q.join("&") : "";
  }

  function fillSelect(sel, items) {
    var keep = sel.value;
    var seen = {};
    sel.textContent = "";
    sel.appendChild(GX.el("option", { value: "", text: "all" }));
    (items || []).forEach(function (item) {
      var v = item.key;
      if (!v || seen[v]) return;
      seen[v] = true;
      sel.appendChild(GX.el("option", { value: v, text: v }));
    });
    sel.value = keep;
  }

  function renderKpis(data) {
    var t = data.totals || {};
    el.kpis.textContent = "";
    el.kpis.appendChild(GX.kpi("Requests", GX.fmt.num(t.requests), data.mode + " ring, capacity " + GX.fmt.num(data.capacity)));
    el.kpis.appendChild(GX.kpi("Errors", GX.fmt.num(t.errors), t.requests ? ((t.errors / t.requests) * 100).toFixed(1) + "% of traffic" : "no traffic yet", t.errors ? "bad" : "ok"));
    el.kpis.appendChild(GX.kpi("Rotated", GX.fmt.num(t.rotated), "keys handed over"));
    el.kpis.appendChild(GX.kpi("Prompt tokens", GX.fmt.compact(t.promptTokens), "input side"));
    el.kpis.appendChild(GX.kpi("Output tokens", GX.fmt.compact(t.completionTokens), "completion side"));
    el.kpis.appendChild(GX.kpi("Estimated cost", GX.fmt.money(t.costUsd), "avg " + GX.fmt.num(t.avgLatencyMs) + " ms per request"));
  }

  function renderBuckets(table, emptyId, metaId, buckets, cols) {
    var body = table.querySelector("tbody");
    body.textContent = "";
    var empty = document.getElementById(emptyId);
    empty.textContent = "";
    document.getElementById(metaId).textContent = buckets.length + (buckets.length === 1 ? " row" : " rows");
    if (!buckets.length) {
      empty.appendChild(GX.state("empty", "No traffic in this view", "Send a request through the gateway and it shows up here."));
      return;
    }
    buckets.forEach(function (b) {
      var tr = GX.el("tr");
      cols.forEach(function (c) {
        var value = c.fmt ? c.fmt(b[c.k], b) : b[c.k];
        GX.cell(tr, value === undefined || value === null ? "-" : String(value), c.num ? "num" : "", c.label);
      });
      body.appendChild(tr);
    });
  }

  function renderLog(rows) {
    var body = el.log.querySelector("tbody");
    body.textContent = "";
    var empty = document.getElementById("logEmpty");
    empty.textContent = "";
    if (!rows.length) {
      empty.appendChild(GX.state("empty", "No request matches", "Loosen the filter or send traffic through the gateway."));
      return;
    }
    rows.forEach(function (r) {
      var tr = GX.el("tr");
      GX.cell(tr, GX.fmt.clock(r.ts), "mono nowrap", "time");
      GX.cell(tr, r.route, "mono", "route");
      GX.cell(tr, r.model || "-", "mono", "model");
      GX.cell(tr, r.keyMasked || "-", "mono", "key");
      var statusCell = GX.el("td", { "data-l": "status" });
      statusCell.appendChild(GX.tag(String(r.status) + (r.errorCode ? " " + r.errorCode : ""), r.ok ? "ok" : "bad"));
      if (r.rotated) statusCell.appendChild(GX.el("span", { class: "tag info", text: "rotated", style: "margin-left:6px" }));
      tr.appendChild(statusCell);
      GX.cell(tr, GX.fmt.num(r.promptTokens), "num", "prompt");
      GX.cell(tr, GX.fmt.num(r.completionTokens), "num", "output");
      GX.cell(tr, GX.fmt.num(r.totalTokens), "num", "total");
      GX.cell(tr, GX.fmt.money(r.costUsd), "num", "cost");
      GX.cell(tr, GX.fmt.num(r.latencyMs), "num", "ms");
      body.appendChild(tr);
    });
  }

  function renderPager(data) {
    el.pager.textContent = "";
    var total = data.totalRows;
    var pages = Math.max(1, Math.ceil(total / data.pageSize));
    el.pager.appendChild(GX.el("span", {
      text: total === 0
        ? "0 rows"
        : "rows " + ((data.page - 1) * data.pageSize + 1) + "-" + Math.min(total, data.page * data.pageSize) + " of " + total
    }));
    if (pages <= 1) return;

    var box = GX.el("div", { class: "pages" });
    function pageBtn(label, n, active, disabled) {
      var b = GX.el("button", {
        class: active ? "active" : "",
        type: "button",
        text: label,
        disabled: disabled ? true : null
      });
      if (active) b.setAttribute("aria-current", "page");
      if (!active && !disabled) b.addEventListener("click", function () { state.page = n; load(); });
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

  function paint(data) {
    renderKpis(data);
    fillSelect(el.fDay, data.byDay);
    fillSelect(el.fModel, data.byModel);
    fillSelect(el.fKey, data.byKey);

    renderBuckets(el.byModel, "byModelEmpty", "byModelMeta", data.byModel || [], [
      { k: "key", label: "model" },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "cachedTokens", num: true, label: "cached" },
      { k: "costUsd", num: true, fmt: GX.fmt.money, label: "cost" },
      { k: "avgLatencyMs", num: true, label: "ms" }
    ]);

    renderBuckets(el.byKey, "byKeyEmpty", "byKeyMeta", data.byKey || [], [
      { k: "key", label: "key" },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "rotated", num: true, label: "rot" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "costUsd", num: true, fmt: GX.fmt.money, label: "cost" },
      { k: "avgLatencyMs", num: true, label: "ms" }
    ]);

    renderBuckets(el.byDay, "byDayEmpty", "byDayMeta", data.byDay || [], [
      { k: "key", label: "day" },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "costUsd", num: true, fmt: GX.fmt.money, label: "cost" }
    ]);

    renderLog(data.rows || []);
    renderPager(data);
    el.logMeta.textContent = (data.rows || []).length + " rows on this page";
    el.stamp.textContent = "updated " + new Date().toLocaleTimeString("en-GB", { hour12: false });
  }

  function load() {
    return GX.api(query())
      .then(function (data) {
        GX.say(el.err, "");
        paint(data);
        el.console.hidden = false;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        GX.say(el.err, err.message, "err");
      });
  }

  function reload() {
    return load().catch(function () {});
  }

  function exportCsv() {
    GX.busy(el.csv, "Exporting");
    GX.download("/pengatur/usage/export.csv" + filterQuery(), "geminesx-usage.csv")
      .catch(function (err) { GX.say(el.err, err.message, "err"); })
      .then(function () { GX.idle(el.csv); });
  }

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
  el.refresh.addEventListener("click", function () { reload(); });
  el.csv.addEventListener("click", exportCsv);
  el.auto.addEventListener("change", function () {
    if (state.timer) { state.timer(); state.timer = null; }
    if (el.auto.checked) state.timer = GX.every(60000, reload);
  });

  GX.gate({ onSuccess: load });
})();
`;

export const USAGE_HTML = consolePage({
  title: "Logs",
  active: "/pengatur/logs",
  actions:
    '<button id="csvBtn" class="btn btn-sm" type="button">' +
    icon("download") +
    "Export CSV</button>" +
    '<button id="refreshBtn" class="btn btn-sm" type="button">' +
    icon("refresh") +
    "Refresh</button>",
  body: USAGE_BODY,
  script: USAGE_SCRIPT,
});
