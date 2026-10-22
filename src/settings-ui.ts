/**
 * Settings console, served at GET /pengatur/settings.
 *
 * Read only by design: cooldowns and tokens are deploy time values on the
 * host, so the page reports them and says so, and never renders a token
 * value, only set or unset. The shell carries no data; it reads
 * /pengatur/settings/data with the pasted admin token.
 *
 * Layout: the counts first, then the configuration groups side by side, then
 * the environment table and the caveat line.
 */

import { consolePage, icon, noticeBand } from "./ui.ts";

const SETTINGS_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Govern</span>
      <h1 class="page-title">Settings</h1>
      <p class="page-lede">The effective configuration of this deployment. Read only.</p>
    </div>
    <div class="page-head-side">
      <span class="meta" id="sStorage">-</span>
      <button id="refreshBtn" class="btn btn-sm" type="button">${icon("refresh")}Refresh</button>
      <button id="exportBtn" class="btn btn-sm" type="button">${icon("download")}Export</button>
    </div>
  </header>

  ${noticeBand()}

  <div class="figures" id="kpis"></div>

  <div class="grid grid-2 u-mt-6">
    <section class="panel">
      <div class="panel-head"><h2>Defaults</h2></div>
      <div class="panel-body"><dl class="defs" id="defaults"></dl></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Limits</h2></div>
      <div class="panel-body"><dl class="defs" id="limits"></dl></div>
    </section>
  </div>

  <div class="grid grid-2 u-mt-4">
    <section class="panel">
      <div class="panel-head"><h2>Ledger and storage</h2></div>
      <div class="panel-body">
        <dl class="defs" id="ledger"></dl>
        <div class="sep u-rule-gap"></div>
        <dl class="defs" id="storage"></dl>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Environment</h2>
        <span class="meta">values are never shown</span>
      </div>
      <div class="table-wrap scroll-y">
        <table class="table" id="envTable">
          <thead><tr><th>Name</th><th>State</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </section>
  </div>

  <section class="panel u-mt-4">
    <div class="panel-head"><h2>Caveats</h2></div>
    <div class="panel-body">
      <p class="hint" id="note"></p>
      <div id="msg" class="notice u-mt-2" role="status" aria-live="polite"></div>
    </div>
  </section>
</div>
`;

const SETTINGS_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    sStorage: document.getElementById("sStorage"),
    defaults: document.getElementById("defaults"),
    limits: document.getElementById("limits"),
    ledger: document.getElementById("ledger"),
    storage: document.getElementById("storage"),
    envTable: document.getElementById("envTable"),
    note: document.getElementById("note"),
    msg: document.getElementById("msg"),
    refresh: document.getElementById("refreshBtn"),
    exportBtn: document.getElementById("exportBtn")
  };

  function defs(node, obj) {
    node.textContent = "";
    var keys = Object.keys(obj || {});
    if (!keys.length) {
      node.appendChild(GX.state("empty", "Nothing reported", "This group is empty in the current configuration."));
      return 0;
    }
    keys.forEach(function (key) {
      node.appendChild(GX.el("div", { class: "def" }, [
        GX.el("dt", { text: key }),
        GX.el("dd", { text: obj[key] === null || obj[key] === undefined ? "-" : String(obj[key]) })
      ]));
    });
    return keys.length;
  }

  function renderEnv(rows) {
    var body = el.envTable.querySelector("tbody");
    body.textContent = "";
    (rows || []).forEach(function (row) {
      var tr = GX.el("tr");
      GX.cell(tr, row.name, "mono", "name");
      var stateCell = GX.el("td", { "data-l": "state" });
      stateCell.appendChild(GX.tag(row.state === "set" ? "set" : "unset", row.state === "set" ? "ok" : "plain"));
      tr.appendChild(stateCell);
      body.appendChild(tr);
    });
  }

  function render(d) {
    var nDefaults = defs(el.defaults, d.defaults);
    var nLimits = defs(el.limits, d.limits);
    var nLedger = defs(el.ledger, d.ledger);
    defs(el.storage, d.storage);
    renderEnv(d.env);

    el.kpis.textContent = "";
    el.kpis.appendChild(GX.kpi("Defaults", String(nDefaults), "model, voice and search model"));
    el.kpis.appendChild(GX.kpi("Limits", String(nLimits), "cooldown, attempts and timeouts"));
    el.kpis.appendChild(GX.kpi("Ledger", String(nLedger), "batch size, flush and retention"));
    el.kpis.appendChild(GX.kpi("Environment", String((d.env || []).length), "variables read by the process"));
    el.kpis.appendChild(GX.kpi("Storage", d.storage ? d.storage.mode : "-", d.storage && d.storage.regionHostSuffix ? d.storage.regionHostSuffix : "no database configured"));

    el.sStorage.textContent = d.storage ? d.storage.mode + " storage" : "-";
    el.note.textContent = d.note || "";
  }

  function refresh() {
    return GX.api("/pengatur/settings/data")
      .then(function (d) {
        render(d);
        GX.say(el.msg, "");
        el.console.hidden = false;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        GX.say(el.msg, err.message, "err");
      });
  }

  function reload() {
    return refresh().catch(function () {});
  }

  el.refresh.addEventListener("click", function () { reload(); });
  el.exportBtn.addEventListener("click", function () {
    GX.busy(el.exportBtn, "Exporting");
    GX.download("/pengatur/settings/export", "geminesx-config.json")
      .catch(function (err) { GX.say(el.msg, err.message, "err"); })
      .then(function () { GX.idle(el.exportBtn); });
  });

  GX.shortcuts({ refresh: "refreshBtn" });
  GX.gate({ onSuccess: refresh });
})();
`;

export const SETTINGS_HTML = consolePage({
  title: "Settings",
  active: "/pengatur/settings",
  actions:
    '<button id="exportBtn" class="btn btn-sm" type="button">' +
    icon("download") +
    "Export JSON</button>" +
    '<button id="refreshBtn" class="btn btn-sm" type="button">' +
    icon("refresh") +
    "Refresh</button>",
  body: SETTINGS_BODY,
  script: SETTINGS_SCRIPT,
});
