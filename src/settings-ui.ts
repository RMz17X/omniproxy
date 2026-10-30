/**
 * Settings console, served at GET /pengatur/settings.
 *
 * One knob is editable at runtime — the key rotation cap — because the
 * operator asked for it in the web UI; everything else (cooldowns, tokens,
 * timeouts) is a deploy-time value on the host, so the page reports those and
 * says so, and never renders a token value, only set or unset. The shell
 * carries no data; it reads /pengatur/settings/data with the pasted admin
 * token.
 *
 * Layout: the counts first, then the configuration groups side by side, the
 * rotation editor, then the environment table and the caveat line.
 */

import { consolePage, icon, noticeBand } from "./ui.ts";

const SETTINGS_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Govern</span>
      <h1 class="page-title">Settings</h1>
      <p class="page-lede">The effective configuration of this deployment. The rotation cap is editable; the rest is deploy-time.</p>
    </div>
  </header>

  ${noticeBand()}

  <div class="figures" id="kpis"></div>

  <div class="grid grid-3">
    <section class="panel">
      <div class="panel-head"><h2>Defaults</h2></div>
      <div class="panel-body"><dl class="defs" id="defaults"></dl></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Limits</h2></div>
      <div class="panel-body"><dl class="defs" id="limits"></dl></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Ledger</h2></div>
      <div class="panel-body"><dl class="defs" id="ledger"></dl></div>
    </section>
  </div>

  <section class="panel">
    <div class="panel-head">
      <h2>Key rotation</h2>
      <span class="meta" id="rotationMeta"></span>
    </div>
    <div class="panel-body">
      <p class="hint">
        How many keys one request may try before the pool gives up. A 429 rotates to the next
        still-valid key and parks the throttled one until its rate-limit window ends, so a
        bigger cap survives more simultaneous throttles at the cost of more upstream calls.
      </p>
      <div class="inline-form u-mt-2">
        <input class="text-input" id="rotationCap" type="number" min="1" max="50" step="1" inputmode="numeric" aria-label="Max key rotation" />
        <button id="rotationSave" class="btn btn-sm btn-primary" type="button">Save</button>
      </div>
      <div id="rotationMsg" class="notice u-mt-2" role="status" aria-live="polite"></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <h2>Client API keys</h2>
      <span class="meta" id="clientKeysMeta"></span>
    </div>
    <div class="panel-body">
      <p class="hint">
        The credential a client sends to <code>/v1</code>. Each key can be revoked on its own, so a
        consumer does not need the deployment-wide token. A key is shown once, when it is created.
      </p>
      <div class="inline-form u-mt-2">
        <input class="text-input" id="clientKeyLabel" type="text" maxlength="80" placeholder="Label (who is it for?)" aria-label="Client key label" />
        <button id="clientKeyCreate" class="btn btn-sm btn-primary" type="button">Create key</button>
      </div>
      <div id="clientKeyMsg" class="notice u-mt-2" role="status" aria-live="polite"></div>

      <div id="clientKeySecret" class="notice u-mt-2" role="status" aria-live="polite" hidden>
        <div class="defs"><div class="def"><dt>New key</dt><dd class="mono" id="clientKeySecretValue"></dd></div></div>
        <div class="inline-form u-mt-2">
          <button id="clientKeyCopy" class="btn btn-sm" type="button">Copy</button>
          <button id="clientKeyDismiss" class="btn btn-sm" type="button">Done</button>
        </div>
      </div>

      <div class="table-wrap scroll-y u-mt-2">
        <table class="table" id="clientKeysTable">
          <thead><tr><th>Key</th><th>Label</th><th>Created</th><th>Last used</th><th>Actions</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
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

  <section class="panel">
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
    defaults: document.getElementById("defaults"),
    limits: document.getElementById("limits"),
    ledger: document.getElementById("ledger"),
    envTable: document.getElementById("envTable"),
    note: document.getElementById("note"),
    msg: document.getElementById("msg"),
    rotationCap: document.getElementById("rotationCap"),
    rotationSave: document.getElementById("rotationSave"),
    rotationMeta: document.getElementById("rotationMeta"),
    rotationMsg: document.getElementById("rotationMsg"),
    clientKeysMeta: document.getElementById("clientKeysMeta"),
    clientKeysTable: document.getElementById("clientKeysTable"),
    clientKeyLabel: document.getElementById("clientKeyLabel"),
    clientKeyCreate: document.getElementById("clientKeyCreate"),
    clientKeyMsg: document.getElementById("clientKeyMsg"),
    clientKeySecret: document.getElementById("clientKeySecret"),
    clientKeySecretValue: document.getElementById("clientKeySecretValue"),
    clientKeyCopy: document.getElementById("clientKeyCopy"),
    clientKeyDismiss: document.getElementById("clientKeyDismiss"),
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

  function rotationMeta(r) {
    el.rotationMeta.textContent = r.stored
      ? "operator override (env default " + r.envDefault + ")"
      : "env default " + r.envDefault;
  }

  function when(ms) {
    if (!ms) return "never";
    return new Date(ms).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function renderClientKeys(d) {
    var body = el.clientKeysTable.querySelector("tbody");
    body.textContent = "";

    var keys = d.keys || [];
    el.clientKeysMeta.textContent = keys.length
      ? keys.length + " key" + (keys.length === 1 ? "" : "s")
      : "none yet";

    if (!keys.length) {
      var tr = GX.el("tr");
      var td = GX.el("td", { colspan: "5" });
      td.appendChild(GX.state(
        "empty",
        "No client keys",
        d.storage
          ? "Create one above, then send it as Authorization: Bearer <key>."
          : "Storage is disabled (no DATABASE_URL), so keys cannot be stored."
      ));
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    keys.forEach(function (k) {
      var row = GX.el("tr");
      GX.cell(row, k.prefix + "…", "mono", "key");
      GX.cell(row, k.label || "-", "", "label");
      GX.cell(row, when(k.createdAt), "", "created");
      GX.cell(row, when(k.lastUsedAt), "", "last used");

      var actions = GX.el("td", { "data-l": "actions" });
      var btn = GX.el("button", { class: "btn btn-sm btn-danger", type: "button", text: "Revoke" });
      btn.addEventListener("click", function () {
        GX.confirm({
          title: "Revoke this key?",
          message: "Any client still using " + k.prefix + "… will be refused on /v1 immediately.",
          confirmLabel: "Revoke"
        }).then(function (ok) {
          if (!ok) return;
          GX.busy(btn, "Revoking…");
          GX.api("/pengatur/settings/client-keys/" + k.id, { method: "DELETE" })
            .then(function () {
              GX.say(el.clientKeyMsg, "Key " + k.prefix + "… revoked.", "ok");
              return loadClientKeys();
            })
            .catch(function (err) { GX.say(el.clientKeyMsg, err.message, "err"); })
            .then(function () { GX.idle(btn); });
        });
      });
      actions.appendChild(btn);
      row.appendChild(actions);
      body.appendChild(row);
    });
  }

  function loadClientKeys() {
    return GX.api("/pengatur/settings/client-keys")
      .then(renderClientKeys)
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) return;
        GX.say(el.clientKeyMsg, err.message, "err");
      });
  }

  el.clientKeyCreate.addEventListener("click", function () {
    var label = (el.clientKeyLabel.value || "").trim();
    GX.busy(el.clientKeyCreate, "Creating…");
    GX.api("/pengatur/settings/client-keys", { method: "POST", body: { label: label } })
      .then(function (r) {
        el.clientKeyLabel.value = "";
        el.clientKeySecretValue.textContent = r.raw;
        el.clientKeySecret.hidden = false;
        GX.say(el.clientKeyMsg, "Key created. Copy it now — it is not shown again.", "ok");
        return loadClientKeys();
      })
      .catch(function (err) { GX.say(el.clientKeyMsg, err.message, "err"); })
      .then(function () { GX.idle(el.clientKeyCreate); });
  });

  el.clientKeyCopy.addEventListener("click", function () {
    var text = el.clientKeySecretValue.textContent || "";
    if (!text) return;
    var done = function () { GX.toast("Key copied.", "ok"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { GX.toast("Copy failed.", "err"); });
    } else {
      GX.toast("Copy unsupported in this browser.", "err");
    }
  });

  el.clientKeyDismiss.addEventListener("click", function () {
    el.clientKeySecretValue.textContent = "";
    el.clientKeySecret.hidden = true;
  });

  function render(d) {
    var nDefaults = defs(el.defaults, d.defaults);
    var nLimits = defs(el.limits, d.limits);
    var nLedger = defs(el.ledger, d.ledger);
    renderEnv(d.env);
    loadClientKeys();

    if (d.rotation) {
      el.rotationCap.value = String(d.rotation.maxKeyAttempts);
      el.rotationCap.min = String(d.rotation.min);
      el.rotationCap.max = String(d.rotation.max);
      rotationMeta(d.rotation);
    }

    el.kpis.textContent = "";
    el.kpis.appendChild(GX.kpi("Defaults", String(nDefaults), "model, voice and search model"));
    el.kpis.appendChild(GX.kpi("Limits", String(nLimits), "cooldown, attempts and timeouts"));
    el.kpis.appendChild(GX.kpi("Ledger", String(nLedger), "batch size, flush and retention"));
    el.kpis.appendChild(GX.kpi("Environment", String((d.env || []).length), "variables read by the process"));

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
        el.console.hidden = false;
      });
  }

  function reload() {
    return refresh().catch(function () {});
  }

  el.refresh.addEventListener("click", function () { reload(); });
  el.rotationSave.addEventListener("click", function () {
    var n = Number(el.rotationCap.value);
    GX.busy(el.rotationSave, "Saving…");
    GX.api("/pengatur/settings/rotation", { method: "POST", body: { maxKeyAttempts: n } })
      .then(function (r) {
        rotationMeta(r.rotation);
        GX.say(el.rotationMsg, "Rotation cap set to " + r.rotation.maxKeyAttempts + ".", "ok");
      })
      .catch(function (err) { GX.say(el.rotationMsg, err.message, "err"); })
      .then(function () { GX.idle(el.rotationSave); });
  });
  el.exportBtn.addEventListener("click", function () {
    GX.busy(el.exportBtn, "Exporting…");
    GX.download("/pengatur/settings/export", "omniproxy-config.json")
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
