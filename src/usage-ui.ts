/**
 * Logs console, served at GET /pengatur/logs and GET /pengatur/usage.
 *
 * The request ledger, read from the in-memory ring. The shell carries no
 * data: it asks for the admin token, stores it in localStorage, and reads
 * /pengatur/usage/data. The CSV export uses the same filters.
 *
 * Layout: instrument strip with the totals, a filter toolbar, the three
 * breakdowns side by side, then the request log with its pager.
 */

import { authGate, consolePage } from "./ui.ts";

const PAGE_BODY = `

${authGate()}

<section id="console" hidden>
  <div class="strip">
    <div class="kv"><b id="sReq">0</b><span class="k">requests</span></div>
    <div class="kv ok"><b id="sOk">0</b><span class="k">ok</span></div>
    <div class="kv bad"><b id="sErr">0</b><span class="k">errors</span></div>
    <div class="kv"><b id="sRot">0</b><span class="k">rotated</span></div>
    <div class="kv"><b id="sPrompt">0</b><span class="k">prompt tok</span></div>
    <div class="kv"><b id="sCompletion">0</b><span class="k">output tok</span></div>
    <div class="kv"><b id="sCached">0</b><span class="k">cached</span></div>
    <div class="kv"><b id="sCost">-</b><span class="k">est. usd</span></div>
    <div class="spacer"></div>
    <div class="meta" id="sLatency">-</div>
  </div>

  <section class="panel">
    <div class="panel-head">
      <div class="panel-title">Filters</div>
      <div class="row">
        <label class="check"><input id="auto" type="checkbox"> Auto refresh every 60s</label>
      </div>
    </div>
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
      <div id="err" class="notice err" role="status" aria-live="polite" style="margin-top:8px"></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><div class="panel-title">By model</div></div>
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

  <section class="panel">
    <div class="panel-head"><div class="panel-title">By key</div></div>
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

  <section class="panel">
    <div class="panel-head"><div class="panel-title">By day</div></div>
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

  <section class="panel">
    <div class="panel-head">
      <div class="panel-title">Request log</div>
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
    <div class="panel-foot"><div id="pager" class="pager"></div></div>
  </section>
</section>
`;

const PAGE_SCRIPT = `(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
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

  function renderBuckets(table, emptyId, buckets, cols) {
    var body = table.querySelector("tbody");
    body.textContent = "";
    var empty = document.getElementById(emptyId);
    empty.textContent = "";
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
      statusCell.appendChild(GX.badge(String(r.status) + (r.errorCode ? " " + r.errorCode : ""), r.ok ? "ok" : "bad"));
      if (r.rotated) {
        statusCell.appendChild(GX.el("span", { class: "badge info", text: "rotated", style: "margin-left:6px" }));
      }
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
        class: "small" + (active ? " active" : ""),
        type: "button",
        text: label,
        disabled: disabled ? true : null
      });
      if (active) b.setAttribute("aria-current", "page");
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

  function paint(data) {
    var t = data.totals || {};
    el.sReq.textContent = GX.fmt.num(t.requests);
    el.sOk.textContent = GX.fmt.num(t.ok);
    el.sErr.textContent = GX.fmt.num(t.errors);
    el.sRot.textContent = GX.fmt.num(t.rotated);
    el.sPrompt.textContent = GX.fmt.num(t.promptTokens);
    el.sCompletion.textContent = GX.fmt.num(t.completionTokens);
    el.sCached.textContent = GX.fmt.num(t.cachedTokens);
    el.sCost.textContent = GX.fmt.money(t.costUsd);
    el.sLatency.textContent = "avg " + GX.fmt.num(t.avgLatencyMs) + " ms" +
      (data.since ? " · oldest " + new Date(data.since).toLocaleString() : "");
    el.logMeta.textContent = data.mode + " ring, capacity " + GX.fmt.num(data.capacity);

    fillSelect(el.fDay, data.byDay);
    fillSelect(el.fModel, data.byModel);
    fillSelect(el.fKey, data.byKey);

    renderBuckets(el.byModel, "byModelEmpty", data.byModel || [], [
      { k: "key", label: "model" },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "cachedTokens", num: true, label: "cached" },
      { k: "costUsd", num: true, fmt: GX.fmt.money, label: "cost" },
      { k: "avgLatencyMs", num: true, label: "ms" }
    ]);

    renderBuckets(el.byKey, "byKeyEmpty", data.byKey || [], [
      { k: "key", label: "key" },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "rotated", num: true, label: "rot" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "costUsd", num: true, fmt: GX.fmt.money, label: "cost" },
      { k: "avgLatencyMs", num: true, label: "ms" }
    ]);

    renderBuckets(el.byDay, "byDayEmpty", data.byDay || [], [
      { k: "key", label: "day" },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "costUsd", num: true, fmt: GX.fmt.money, label: "cost" }
    ]);

    renderLog(data.rows || []);
    renderPager(data);
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
      .catch(function (err) {
        GX.say(el.err, err.message, "err");
      })
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
})();`;

export const USAGE_HTML = consolePage({
  title: "Logs",
  subtitle: "Every request that passed through the gateway",
  active: "/pengatur/logs",
  actions: `<button id="csvBtn" class="btn" type="button"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 3.5V12"/><path d="M6.5 8.5 10 12l3.5-3.5"/><path d="M4 16h12"/></svg>Export CSV</button><button id="refreshBtn" class="btn" type="button"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M16.5 8A6.5 6.5 0 1 0 17 12"/><path d="M16.5 3.5V8H12"/></svg>Refresh</button>`,
  body: PAGE_BODY,
  script: PAGE_SCRIPT,
});
