/**
 * Statistics console, served at GET /pengatur/stats.
 *
 * Range breakdowns, an hour by weekday heatmap and the cost projection. The
 * shell carries no data: the browser picks a range, then reads
 * /pengatur/stats/data with the admin token it holds in localStorage.
 *
 * Layout: the range control in the page header, the totals as figures, then
 * the heatmap with its legend and peak line, then the breakdowns.
 */

import { consolePage, icon, stateBlock, noticeBand } from "./ui.ts";

const STATS_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Observe</span>
      <h1 class="page-title">Statistics</h1>
      <p class="page-lede" id="meta">-</p>
    </div>
    <div class="page-head-side">
      <div class="seg" id="range" role="group" aria-label="Time range"></div>
    </div>
  </header>

  <div id="dataErr" class="notice u-mb-4" role="status" aria-live="polite"></div>

  <div class="figures" id="kpis"></div>

  <section class="panel u-mt-6">
    <div class="panel-head">
      <h2>Hour and weekday heatmap <span class="meta">WIB</span></h2>
      <label class="check"><input id="heatValues" type="checkbox"> show values</label>
      <div class="legend" aria-hidden="true">
        <span class="meta">low</span>
        <span class="legend-item"><i class="dot neutral"></i></span>
        <span class="legend-item"><i class="dot" style="background:color-mix(in srgb,var(--accent) 30%,var(--surface-3))"></i></span>
        <span class="legend-item"><i class="dot" style="background:color-mix(in srgb,var(--accent) 55%,var(--surface-3))"></i></span>
        <span class="legend-item"><i class="dot" style="background:color-mix(in srgb,var(--accent) 78%,var(--surface-3))"></i></span>
        <span class="legend-item"><i class="dot" style="background:var(--accent)"></i></span>
        <span class="meta">high</span>
      </div>
    </div>
    <div class="panel-body">
      <div class="heat-scroll"><div id="heat" class="heat" role="img" aria-label="Requests by hour and weekday"></div></div>
      <table class="sr-only" id="heatTable"></table>
      <p class="hint u-mt-4" id="heatNote"></p>
      <div id="heatEmpty"></div>
    </div>
  </section>

  <div class="zone">
    <div class="zone-head"><h2>Breakdowns</h2><span class="meta">where the traffic went in this range</span></div>

    <div class="grid grid-2">
      <section class="panel">
        <div class="panel-head">
          <h2>By model</h2>
          <span class="meta" id="byModelMeta"></span>
        </div>
        <div class="table-wrap">
          <table class="table" id="byModel">
            <thead><tr><th>Model</th><th>Provider</th><th class="num">Req</th><th class="num">Err</th><th class="num">Tokens</th><th class="num">Cost</th><th class="num">Avg ms</th></tr></thead>
            <tbody></tbody>
          </table>
          <div id="byModelEmpty"></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>By key</h2>
          <span class="meta" id="byKeyMeta"></span>
        </div>
        <div class="table-wrap">
          <table class="table" id="byKey">
            <thead><tr><th>Key id</th><th class="num">Req</th><th class="num">Err</th><th class="num">Rot</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
            <tbody></tbody>
          </table>
          <div id="byKeyEmpty"></div>
        </div>
      </section>
    </div>

    <div class="grid grid-2 u-mt-4">
      <section class="panel">
        <div class="panel-head">
          <h2>By route</h2>
          <span class="meta" id="byRouteMeta"></span>
        </div>
        <div class="table-wrap">
          <table class="table" id="byRoute">
            <thead><tr><th>Route</th><th class="num">Req</th><th class="num">Err</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
            <tbody></tbody>
          </table>
          <div id="byRouteEmpty"></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>By status</h2>
          <span class="meta" id="byStatusMeta"></span>
        </div>
        <div class="table-wrap">
          <table class="table" id="byStatus">
            <thead><tr><th>Status</th><th class="num">Req</th></tr></thead>
            <tbody></tbody>
          </table>
          <div id="byStatusEmpty"></div>
        </div>
      </section>
    </div>
  </div>
</div>
`;

const STATS_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    meta: document.getElementById("meta"),
    heat: document.getElementById("heat"),
    heatNote: document.getElementById("heatNote"),
    heatEmpty: document.getElementById("heatEmpty"),
    heatValues: document.getElementById("heatValues"),
    err: document.getElementById("dataErr")
  };

  var RANGES = [
    { value: "1h", label: "1h" },
    { value: "24h", label: "24h" },
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" }
  ];

  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var state = { range: "24h" };

  function renderKpis(d) {
    var t = d.totals || {};
    el.kpis.textContent = "";
    el.kpis.appendChild(GX.kpi("Requests", GX.fmt.num(t.requests), d.source === "ring" ? "in-memory ring" : "usage_daily rollup"));
    el.kpis.appendChild(GX.kpi("Errors", GX.fmt.num(t.errors), t.requests ? ((t.errors / t.requests) * 100).toFixed(1) + "% of traffic" : "no traffic in range", t.errors ? "bad" : "ok"));
    el.kpis.appendChild(GX.kpi("Rotated", GX.fmt.num(t.rotated), "keys handed over"));
    el.kpis.appendChild(GX.kpi("Tokens", GX.fmt.compact(t.totalTokens), "prompt and completion"));
    el.kpis.appendChild(GX.kpi("Cost", GX.fmt.money(t.costUsd), "in this window"));
    el.kpis.appendChild(GX.kpi("Projected", GX.fmt.money(d.projectedMonthlyUsd), "per 30 days"));
  }

  function fillBucket(tableId, emptyId, metaId, rows, cols) {
    var table = document.getElementById(tableId);
    var body = table.querySelector("tbody");
    body.textContent = "";
    var empty = document.getElementById(emptyId);
    document.getElementById(metaId).textContent = rows && rows.length ? rows.length + (rows.length === 1 ? " row" : " rows") : "";
    GX.tableState(
      table,
      empty,
      !rows || !rows.length,
      GX.state("empty", "Nothing in this range", "No request matched the selected window.")
    );
    if (!rows || !rows.length) return;
    rows.forEach(function (r) {
      var tr = GX.el("tr");
      cols.forEach(function (c, index) {
        /* A column may carry a node (the provider badge) instead of text. */
        if (c.node) {
          var nodeCell = GX.el("td", { "data-l": c.label || null });
          nodeCell.appendChild(c.node(r));
          tr.appendChild(nodeCell);
          return;
        }
        var td = GX.el("td", { class: index > 0 ? "num" : "", "data-l": c.label || null });
        td.textContent = c.value(r);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function fillStatus(rows) {
    var table = document.getElementById("byStatus");
    var body = table.querySelector("tbody");
    body.textContent = "";
    var empty = document.getElementById("byStatusEmpty");
    document.getElementById("byStatusMeta").textContent = rows && rows.length ? rows.length + " codes" : "";
    GX.tableState(
      table,
      empty,
      !rows || !rows.length,
      GX.state("empty", "Nothing in this range", "No request matched the selected window.")
    );
    if (!rows || !rows.length) return;
    rows.forEach(function (r) {
      var tr = GX.el("tr");
      GX.cell(tr, r.key, "", "status");
      GX.cell(tr, GX.fmt.num(r.requests), "num", "requests");
      body.appendChild(tr);
    });
  }

  function fillHeat(cells) {
    el.heat.textContent = "";
    el.heatEmpty.textContent = "";
    if (!cells || !cells.length) {
      el.heatEmpty.appendChild(GX.state("empty", "No hourly data", "This range has no events with hourly granularity."));
      el.heatNote.textContent = "";
      return;
    }

    var max = 0;
    var peak = null;
    var grid = {};
    cells.forEach(function (c) {
      grid[c.weekday + ":" + c.hour] = c.requests;
      if (c.requests > max) {
        max = c.requests;
        peak = c;
      }
    });

    el.heat.appendChild(GX.el("div", { class: "h", text: "" }));
    for (var h = 0; h < 24; h++) {
      el.heat.appendChild(GX.el("div", { class: "h", text: h % 3 === 0 ? String(h) : "" }));
    }

    for (var d = 0; d < 7; d++) {
      el.heat.appendChild(GX.el("div", { class: "h", text: DAYS[d] }));
      for (var hour = 0; hour < 24; hour++) {
        var value = grid[d + ":" + hour] || 0;
        var level = value === 0 ? 0 : Math.max(1, Math.min(5, Math.ceil((value / max) * 5)));
        el.heat.appendChild(GX.el("div", {
          class: "cell",
          "data-level": level,
          "data-v": value,
          title: DAYS[d] + " " + (hour < 10 ? "0" + hour : hour) + ":00, " + value + " requests"
        }));
      }
    }

    el.heatNote.textContent = peak
      ? "Peak: " + DAYS[peak.weekday] + " " + (peak.hour < 10 ? "0" + peak.hour : peak.hour) +
        ":00 with " + GX.fmt.num(peak.requests) + " requests. " + GX.fmt.num(cells.length) + " cells carry traffic."
      : "";

    /* The same numbers as a table, for anyone who cannot read a colour map. */
    var sr = document.getElementById("heatTable");
    if (sr) {
      sr.textContent = "";
      sr.appendChild(GX.el("caption", { text: "Requests by hour and weekday" }));
      var head = GX.el("tr", null, [GX.el("th", { text: "Day" })]);
      for (var hr = 0; hr < 24; hr++) head.appendChild(GX.el("th", { text: (hr < 10 ? "0" + hr : hr) + ":00" }));
      sr.appendChild(GX.el("thead", null, head));
      var body = GX.el("tbody");
      for (var d = 0; d < 7; d++) {
        var row = GX.el("tr", null, [GX.el("th", { scope: "row", text: DAYS[d] })]);
        for (var h = 0; h < 24; h++) row.appendChild(GX.el("td", { text: String(grid[d + ":" + h] || 0) }));
        body.appendChild(row);
      }
      sr.appendChild(body);
    }
  }

  function paint(d) {
    renderKpis(d);
    el.meta.textContent = (d.source === "ring" ? "Source: in-memory ring. " : "Source: usage_daily. ") + (d.note || "");
    fillHeat(d.heatmap);
    fillBucket("byModel", "byModelEmpty", "byModelMeta", d.byModel, [
      { label: "model", value: function (r) { return r.key; } },
      { label: "provider", node: function (r) { return GX.providerTag(GX.providerFromModel(r.key)); } },
      { label: "req", value: function (r) { return GX.fmt.num(r.requests); } },
      { label: "err", value: function (r) { return GX.fmt.num(r.errors); } },
      { label: "tokens", value: function (r) { return GX.fmt.compact(r.totalTokens); } },
      { label: "cost", value: function (r) { return GX.fmt.money(r.costUsd); } },
      { label: "ms", value: function (r) { return GX.fmt.num(r.avgLatencyMs); } }
    ]);
    fillBucket("byKey", "byKeyEmpty", "byKeyMeta", d.byKey, [
      { label: "key", value: function (r) { return r.key; } },
      { label: "req", value: function (r) { return GX.fmt.num(r.requests); } },
      { label: "err", value: function (r) { return GX.fmt.num(r.errors); } },
      { label: "rot", value: function (r) { return GX.fmt.num(r.rotated); } },
      { label: "tokens", value: function (r) { return GX.fmt.compact(r.totalTokens); } },
      { label: "cost", value: function (r) { return GX.fmt.money(r.costUsd); } }
    ]);
    fillBucket("byRoute", "byRouteEmpty", "byRouteMeta", d.byRoute, [
      { label: "route", value: function (r) { return r.key; } },
      { label: "req", value: function (r) { return GX.fmt.num(r.requests); } },
      { label: "err", value: function (r) { return GX.fmt.num(r.errors); } },
      { label: "tokens", value: function (r) { return GX.fmt.compact(r.totalTokens); } },
      { label: "cost", value: function (r) { return GX.fmt.money(r.costUsd); } }
    ]);
    fillStatus(d.byStatus);
  }

  function load() {
    return GX.api("/pengatur/stats/data?range=" + encodeURIComponent(state.range))
      .then(function (d) {
        if (d.ok === false) throw new Error(d.error && d.error.message ? d.error.message : "Statistics unavailable.");
        paint(d);
        el.console.hidden = false;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        el.console.hidden = false;
        GX.say(el.err, err.message, "err");
      });
  }

  function reload() {
    return load().catch(function () {});
  }

  function writeUrl() {
    GX.url.write({ range: state.range });
  }

  function readUrl() {
    var params = GX.url.read();
    if (params.range && ["1h", "24h", "7d", "30d"].indexOf(params.range) >= 0) state.range = params.range;
  }

  function buildRange() {
    var box = document.getElementById("range");
    box.textContent = "";
    RANGES.forEach(function (r) {
      var b = GX.el("button", {
        type: "button",
        text: r.label,
        "aria-pressed": r.value === state.range ? "true" : "false"
      });
      b.addEventListener("click", function () {
        state.range = r.value;
        Array.prototype.forEach.call(box.querySelectorAll("button"), function (other) {
          other.setAttribute("aria-pressed", other === b ? "true" : "false");
        });
        writeUrl();
        load();
      });
      box.appendChild(b);
    });
  }

  el.heatValues.addEventListener("change", function () {
    el.heat.classList.toggle("values", el.heatValues.checked);
  });

  buildRange();
  GX.shortcuts({ refresh: "refreshBtn" });
  GX.gate({
    onSuccess: function () {
      readUrl();
      buildRange();
      return load();
    }
  });
})();
`;

export const STATS_HTML = consolePage({
  title: "Statistics",
  active: "/pengatur/stats",
  body: STATS_BODY,
  script: STATS_SCRIPT,
});
