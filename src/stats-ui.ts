/**
 * Statistics console, served at GET /pengatur/stats.
 *
 * Range breakdowns, an hour by weekday heatmap and the cost projection. The
 * shell carries no data: the browser picks a range, then reads
 * /pengatur/stats/data with the admin token it holds in localStorage.
 *
 * Layout: a segmented range control in the page header, the totals strip, the
 * heatmap with a legend and a readable peak line, then the four breakdowns.
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
    <div class="kv"><b id="sTokens">0</b><span class="k">tokens</span></div>
    <div class="kv"><b id="sCost">$0</b><span class="k">cost</span></div>
    <div class="kv"><b id="sP50">0</b><span class="k">p50 ms</span></div>
    <div class="kv"><b id="sP95">0</b><span class="k">p95 ms</span></div>
    <div class="kv"><b id="sProj">$0</b><span class="k">per 30d</span></div>
  </div>

  <div class="row" style="justify-content:space-between">
    <p class="hint" id="meta"></p>
    <div id="dataErr" class="notice err" role="status" aria-live="polite"></div>
  </div>

  <section class="panel">
    <div class="panel-head">
      <div class="panel-title">Hour and weekday heatmap <span class="meta">WIB</span></div>
      <div class="row">
        <label class="check"><input id="heatValues" type="checkbox"> show values</label>
        <div class="heat-legend">
          <span>low</span>
          <i style="background:var(--heat-1)"></i>
          <i style="background:var(--heat-2)"></i>
          <i style="background:var(--heat-3)"></i>
          <i style="background:var(--heat-4)"></i>
          <i style="background:var(--heat-5)"></i>
          <span>high</span>
        </div>
      </div>
    </div>
    <div class="panel-body">
      <div class="heat-scroll"><div id="heat" class="heat" role="img" aria-label="Requests by hour and weekday"></div></div>
      <p class="hint" id="heatNote" style="margin-top:12px"></p>
      <div id="heatEmpty"></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><div class="panel-title">By model</div></div>
    <div class="tablewrap">
      <table class="table" id="byModel">
        <thead><tr><th>Model</th><th class="num">Req</th><th class="num">Err</th><th class="num">Tokens</th><th class="num">Cost</th><th class="num">Avg ms</th></tr></thead>
        <tbody></tbody>
      </table>
      <div id="byModelEmpty"></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><div class="panel-title">By key</div></div>
    <div class="tablewrap">
      <table class="table" id="byKey">
        <thead><tr><th>Key id</th><th class="num">Req</th><th class="num">Err</th><th class="num">Rot</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
        <tbody></tbody>
      </table>
      <div id="byKeyEmpty"></div>
    </div>
  </section>

  <div class="grid split">
    <section class="panel">
      <div class="panel-head"><div class="panel-title">By route</div></div>
      <div class="tablewrap">
        <table class="table" id="byRoute">
          <thead><tr><th>Route</th><th class="num">Req</th><th class="num">Err</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
          <tbody></tbody>
        </table>
        <div id="byRouteEmpty"></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><div class="panel-title">By status</div></div>
      <div class="tablewrap">
        <table class="table" id="byStatus">
          <thead><tr><th>Status</th><th class="num">Req</th></tr></thead>
          <tbody></tbody>
        </table>
        <div id="byStatusEmpty"></div>
      </div>
    </section>
  </div>
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
    sTokens: document.getElementById("sTokens"),
    sCost: document.getElementById("sCost"),
    sP50: document.getElementById("sP50"),
    sP95: document.getElementById("sP95"),
    sProj: document.getElementById("sProj"),
    heat: document.getElementById("heat"),
    heatNote: document.getElementById("heatNote"),
    heatEmpty: document.getElementById("heatEmpty"),
    heatValues: document.getElementById("heatValues"),
    err: document.getElementById("dataErr"),
    meta: document.getElementById("meta")
  };

  var RANGES = [
    { value: "1h", label: "1h" },
    { value: "24h", label: "24h" },
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" }
  ];

  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var state = { range: "24h" };

  function fillBucket(tableId, emptyId, rows, cols) {
    var table = document.getElementById(tableId);
    var body = table.querySelector("tbody");
    body.textContent = "";
    var empty = document.getElementById(emptyId);
    empty.textContent = "";
    if (!rows || !rows.length) {
      empty.appendChild(GX.state("empty", "Nothing in this range", "No request matched the selected window."));
      return;
    }
    rows.forEach(function (r) {
      var tr = GX.el("tr");
      cols.forEach(function (c, index) {
        var td = GX.el("td", { class: index > 0 ? "num" : null, "data-l": c.label || null });
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
    empty.textContent = "";
    if (!rows || !rows.length) {
      empty.appendChild(GX.state("empty", "Nothing in this range", "No request matched the selected window."));
      return;
    }
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
        var cell = GX.el("div", {
          class: "cell",
          "data-level": level,
          "data-v": value,
          title: DAYS[d] + " " + (hour < 10 ? "0" + hour : hour) + ":00, " + value + " requests"
        });
        el.heat.appendChild(cell);
      }
    }

    el.heatNote.textContent = peak
      ? "Peak: " + DAYS[peak.weekday] + " " + (peak.hour < 10 ? "0" + peak.hour : peak.hour) +
        ":00 with " + GX.fmt.num(peak.requests) + " requests. " + GX.fmt.num(cells.length) + " cells carry traffic."
      : "";
  }

  function paint(d) {
    var t = d.totals || {};
    el.sReq.textContent = GX.fmt.num(t.requests);
    el.sOk.textContent = GX.fmt.num((t.requests || 0) - (t.errors || 0));
    el.sErr.textContent = GX.fmt.num(t.errors);
    el.sRot.textContent = GX.fmt.num(t.rotated);
    el.sTokens.textContent = GX.fmt.num(t.totalTokens);
    el.sCost.textContent = GX.fmt.money(t.costUsd);
    el.sP50.textContent = GX.fmt.num(t.p50Ms);
    el.sP95.textContent = GX.fmt.num(t.p95Ms);
    el.sProj.textContent = GX.fmt.money(d.projectedMonthlyUsd);

    el.meta.textContent = (d.source === "ring" ? "Source: in-memory ring. " : "Source: usage_daily. ") + (d.note || "");
    fillHeat(d.heatmap);
    fillBucket("byModel", "byModelEmpty", d.byModel, [
      { label: "model", value: function (r) { return r.key; } },
      { label: "req", value: function (r) { return GX.fmt.num(r.requests); } },
      { label: "err", value: function (r) { return GX.fmt.num(r.errors); } },
      { label: "tokens", value: function (r) { return GX.fmt.num(r.totalTokens); } },
      { label: "cost", value: function (r) { return GX.fmt.money(r.costUsd); } },
      { label: "ms", value: function (r) { return GX.fmt.num(r.avgLatencyMs); } }
    ]);
    fillBucket("byKey", "byKeyEmpty", d.byKey, [
      { label: "key", value: function (r) { return r.key; } },
      { label: "req", value: function (r) { return GX.fmt.num(r.requests); } },
      { label: "err", value: function (r) { return GX.fmt.num(r.errors); } },
      { label: "rot", value: function (r) { return GX.fmt.num(r.rotated); } },
      { label: "tokens", value: function (r) { return GX.fmt.num(r.totalTokens); } },
      { label: "cost", value: function (r) { return GX.fmt.money(r.costUsd); } }
    ]);
    fillBucket("byRoute", "byRouteEmpty", d.byRoute, [
      { label: "route", value: function (r) { return r.key; } },
      { label: "req", value: function (r) { return GX.fmt.num(r.requests); } },
      { label: "err", value: function (r) { return GX.fmt.num(r.errors); } },
      { label: "tokens", value: function (r) { return GX.fmt.num(r.totalTokens); } },
      { label: "cost", value: function (r) { return GX.fmt.money(r.costUsd); } }
    ]);
    fillStatus(d.byStatus);
  }

  function load() {
    return GX.api("/pengatur/stats/data?range=" + encodeURIComponent(state.range))
      .then(function (d) {
        if (d.ok === false) throw new Error(d.error && d.error.message ? d.error.message : "Statistics unavailable.");
        GX.say(el.err, "");
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
        load();
      });
      box.appendChild(b);
    });
  }

  el.heatValues.addEventListener("change", function () {
    el.heat.classList.toggle("values", el.heatValues.checked);
  });

  buildRange();
  GX.gate({ onSuccess: load });
})();`;

export const STATS_HTML = consolePage({
  title: "Statistics",
  subtitle: "Range breakdowns, heatmap and cost projection",
  active: "/pengatur/stats",
  actions: `<div class="seg" id="range" role="group" aria-label="Time range">`,
  body: PAGE_BODY,
  script: PAGE_SCRIPT,
});
