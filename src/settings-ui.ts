/**
 * Settings console, served at GET /pengatur/settings.
 *
 * Read only by design: cooldowns and tokens are deploy time values on the
 * host, so the page reports them and says so, and never renders a token
 * value, only set or unset. The shell carries no data; it reads
 * /pengatur/settings/data with the pasted admin token.
 *
 * Layout: one panel per configuration group, each a two column definition
 * grid, then the environment table and the caveat note.
 */

import { authGate, consolePage } from "./ui.ts";

const PAGE_BODY = `

${authGate()}

<section id="console" hidden>
  <div class="strip">
    <div class="kv"><b id="sDefaults">0</b><span class="k">defaults</span></div>
    <div class="kv"><b id="sLimits">0</b><span class="k">limits</span></div>
    <div class="kv"><b id="sLedger">0</b><span class="k">ledger</span></div>
    <div class="kv"><b id="sEnv">0</b><span class="k">env vars</span></div>
    <div class="spacer"></div>
    <div class="meta" id="sStorage">-</div>
  </div>

  <div class="grid cols2">
    <section class="panel">
      <div class="panel-head"><div class="panel-title">Defaults</div></div>
      <div class="panel-body"><div class="defs" id="defaults"></div></div>
    </section>

    <section class="panel">
      <div class="panel-head"><div class="panel-title">Limits</div></div>
      <div class="panel-body"><div class="defs" id="limits"></div></div>
    </section>
  </div>

  <div class="grid cols2">
    <section class="panel">
      <div class="panel-head"><div class="panel-title">Ledger and storage</div></div>
      <div class="panel-body">
        <div class="defs" id="ledger"></div>
        <div class="sep" style="margin:12px 0"></div>
        <div class="defs" id="storage"></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">Environment</div>
        <span class="meta">values are never shown</span>
      </div>
      <div class="tablewrap scroll-y">
        <table class="table" id="envTable">
          <thead><tr><th>Name</th><th>State</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </section>
  </div>

  <section class="panel">
    <div class="panel-head">
      <div class="panel-title">Caveats</div>
    </div>
    <div class="panel-body">
      <p class="hint" id="note"></p>
      <div id="msg" class="notice" role="status" aria-live="polite" style="margin-top:8px"></div>
    </div>
  </section>
</section>
`;

const PAGE_SCRIPT = `(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    sDefaults: document.getElementById("sDefaults"),
    sLimits: document.getElementById("sLimits"),
    sLedger: document.getElementById("sLedger"),
    sEnv: document.getElementById("sEnv"),
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
        GX.el("dd", { class: "mono", text: obj[key] === null || obj[key] === undefined ? "-" : String(obj[key]) })
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
      stateCell.appendChild(GX.badge(row.state === "set" ? "set" : "unset", row.state === "set" ? "ok" : ""));
      tr.appendChild(stateCell);
      body.appendChild(tr);
    });
  }

  function render(d) {
    el.sDefaults.textContent = defs(el.defaults, d.defaults);
    el.sLimits.textContent = defs(el.limits, d.limits);
    el.sLedger.textContent = defs(el.ledger, d.ledger);
    defs(el.storage, d.storage);
    renderEnv(d.env);
    el.sEnv.textContent = (d.env || []).length;
    el.sStorage.textContent = (d.storage && d.storage.mode) ? d.storage.mode : "-";
    GX.storage((d.storage && d.storage.mode) ? d.storage.mode : "-");
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
      .catch(function (err) {
        GX.say(el.msg, err.message, "err");
      })
      .then(function () { GX.idle(el.exportBtn); });
  });

  GX.gate({ onSuccess: refresh });
})();`;

export const SETTINGS_HTML = consolePage({
  title: "Settings",
  subtitle: "The effective configuration of this deployment",
  active: "/pengatur/settings",
  actions: `<button id="exportBtn" class="btn" type="button"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 3.5V12"/><path d="M6.5 8.5 10 12l3.5-3.5"/><path d="M4 16h12"/></svg>Export JSON</button><button id="refreshBtn" class="btn" type="button"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M16.5 8A6.5 6.5 0 1 0 17 12"/><path d="M16.5 3.5V8H12"/></svg>Refresh</button>`,
  body: PAGE_BODY,
  script: PAGE_SCRIPT,
});
