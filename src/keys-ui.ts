/**
 * Keys console, served at GET /pengatur/keys, plus the per-key detail shell
 * at GET /pengatur/keys/:id.
 *
 * Both shells carry no data: the browser pastes the admin token once, then
 * reads /pengatur/keys/list and /pengatur/keys/:id/data. Every mutation
 * addresses a key by its sha256 id, so no raw credential ever reaches the
 * browser.
 *
 * The list is the bulk console: pick rows, declare a plan for the whole
 * selection, probe, remove. The detail page is the single key view: counters,
 * the daily request chart, the cooldown timeline and the recent requests.
 */

import { authGate, consolePage, stateBlock } from "./ui.ts";

const PAGE_BODY = `

${authGate()}

<section id="console" hidden>
  <div class="strip">
    <div class="kv"><b id="sTotal">0</b><span class="k">keys</span></div>
    <div class="kv ok"><b id="sReady">0</b><span class="k">ready</span></div>
    <div class="kv warn"><b id="sCooling">0</b><span class="k">cooling</span></div>
    <div class="kv bad"><b id="sDead">0</b><span class="k">dead</span></div>
    <div class="kv"><b id="sStorage">-</b><span class="k">storage</span></div>
    <div class="spacer"></div>
    <div class="meta" id="poolMeta">-</div>
  </div>

  <section class="panel">
    <div class="panel-head">
      <div class="panel-title">Pool <span class="meta" id="listMeta"></span></div>
      <div class="row">
        <button id="testAllBtn" class="btn small" type="button">Test all</button>
        <button id="refreshBtn" class="btn small" type="button">Refresh</button>
      </div>
    </div>

    <div class="panel-body">
      <div class="row">
        <div class="grow">
          <label class="field" for="keyFilter">Filter</label>
          <input id="keyFilter" type="search" spellcheck="false" placeholder="masked key, id or plan">
        </div>
        <div class="grow">
          <label class="field" for="keyStatus">Status</label>
          <select id="keyStatus">
            <option value="">all</option>
            <option value="ready">ready</option>
            <option value="cooling">cooling</option>
            <option value="dead">dead</option>
          </select>
        </div>
        <div class="grow">
          <label class="field" for="keySize">Per page</label>
          <select id="keySize">
            <option value="10">10</option>
            <option value="25" selected>25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>
    </div>

    <div id="bulkBar" class="panel-body" hidden style="border-top:1px solid var(--line)">
      <div class="row">
        <b id="selCount" style="font-variant-numeric:tabular-nums">0 selected</b>
        <select id="bulkTier" class="tier" aria-label="Billing plan for the selected keys"></select>
        <button id="bulkApply" class="btn small" type="button">Apply plan</button>
        <button id="bulkRemove" class="btn small btn-danger" type="button">Remove selected</button>
        <span class="spacer"></span>
        <button id="bulkClear" class="btn btn-ghost small" type="button">Clear</button>
      </div>
      <div id="bulkMsg" class="notice" role="status" aria-live="polite" style="margin-top:8px"></div>
    </div>

    <div id="keysBody" class="tablewrap">stateBlock("loading", "Loading the pool")</div>

    <div class="panel-foot">
      <div id="keyPager" class="pager"></div>
      <label class="check"><input id="auto" type="checkbox"> Auto refresh every 15s</label>
    </div>
  </section>
</section>

<dialog id="addDialog" aria-labelledby="addTitle">
  <form id="addForm" method="dialog">
    <div class="panel-head">
      <div class="panel-title" id="addTitle">Add keys</div>
      <button class="btn btn-ghost small" type="button" id="addClose" aria-label="Close"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 5l10 10"/><path d="M15 5 5 15"/></svg></button>
    </div>
    <div class="panel-body">
      <label class="field" for="newKeys">One key per line, or separated by commas</label>
      <textarea id="newKeys" spellcheck="false" placeholder="key one&#10;key two"></textarea>
      <div class="row" style="margin-top:12px">
        <button id="addSubmit" class="btn btn-primary" type="submit">Add to pool</button>
        <span id="addCount" class="hint"></span>
      </div>
      <div id="addMsg" class="notice" role="status" aria-live="polite" style="margin-top:8px"></div>
      <p class="hint" style="margin-top:12px">Raw values are never returned by the API. The console only ever holds the id and the masked form.</p>
    </div>
  </form>
</dialog>
`;

const PAGE_SCRIPT = `(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    sTotal: document.getElementById("sTotal"),
    sReady: document.getElementById("sReady"),
    sCooling: document.getElementById("sCooling"),
    sDead: document.getElementById("sDead"),
    sStorage: document.getElementById("sStorage"),
    poolMeta: document.getElementById("poolMeta"),
    listMeta: document.getElementById("listMeta"),
    keysBody: document.getElementById("keysBody"),
    keyFilter: document.getElementById("keyFilter"),
    keyStatus: document.getElementById("keyStatus"),
    keySize: document.getElementById("keySize"),
    keyPager: document.getElementById("keyPager"),
    testAllBtn: document.getElementById("testAllBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    auto: document.getElementById("auto"),
    bulkBar: document.getElementById("bulkBar"),
    bulkTier: document.getElementById("bulkTier"),
    bulkApply: document.getElementById("bulkApply"),
    bulkRemove: document.getElementById("bulkRemove"),
    bulkClear: document.getElementById("bulkClear"),
    selCount: document.getElementById("selCount"),
    bulkMsg: document.getElementById("bulkMsg"),
    addBtn: document.getElementById("addBtn"),
    addDialog: document.getElementById("addDialog"),
    addClose: document.getElementById("addClose"),
    addForm: document.getElementById("addForm"),
    addSubmit: document.getElementById("addSubmit"),
    newKeys: document.getElementById("newKeys"),
    addCount: document.getElementById("addCount"),
    addMsg: document.getElementById("addMsg")
  };

  var state = { keys: [], knownTiers: [], page: 1, size: 25, query: "", status: "", selected: {}, timer: null };

  var TIERS = [
    { value: "unknown", label: "Unspecified" },
    { value: "free", label: "Free tier" },
    { value: "paid", label: "Pay-as-you-go" },
    { value: "pro", label: "AI Pro / Ultra" }
  ];

  function tierLabel(value) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].value === value) return TIERS[i].label;
    return value;
  }

  function statusKind(status) {
    if (status === "ready") return "ok";
    if (status === "cooling") return "warn";
    return "bad";
  }

  function visibleKeys() {
    var query = state.query;
    return state.keys.filter(function (k) {
      if (state.status && k.status !== state.status) return false;
      if (!query) return true;
      return (k.key + " " + k.id + " " + k.status + " " + (k.tier || "unknown")).toLowerCase().indexOf(query) >= 0;
    });
  }

  function selectedIds() {
    var out = [];
    for (var id in state.selected) if (state.selected[id]) out.push(id);
    return out;
  }

  function paintBulk() {
    var ids = selectedIds();
    el.bulkBar.hidden = ids.length === 0;
    el.selCount.textContent = ids.length + " selected";
  }

  function drawTable() {
    var filtered = visibleKeys();
    el.listMeta.textContent = state.keys.length + " in pool, " + filtered.length + " shown";

    if (!filtered.length) {
      el.keysBody.textContent = "";
      el.keysBody.appendChild(GX.state(
        "empty",
        state.keys.length ? "No key matches this filter" : "Pool is empty",
        state.keys.length
          ? "Clear the filter box to see the whole pool."
          : "Add keys with the button above, or set GEMINI_API_KEYS on the deployment."
      ));
      renderPager(0, 1);
      return;
    }

    var pages = Math.max(1, Math.ceil(filtered.length / state.size));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var slice = filtered.slice((state.page - 1) * state.size, state.page * state.size);

    var table = GX.el("table", { class: "table" });
    var head = GX.el("thead", null, GX.el("tr", null, [
      GX.el("th", { class: "num" }, GX.el("input", {
        type: "checkbox",
        id: "selectAll",
        "aria-label": "Select every key on this page"
      })),
      GX.el("th", { text: "Id" }),
      GX.el("th", { text: "Key" }),
      GX.el("th", { text: "Plan" }),
      GX.el("th", { text: "Status" }),
      GX.el("th", { class: "num", text: "Fails" }),
      GX.el("th", { class: "num", text: "Cooldown" }),
      GX.el("th", { text: "Last used" }),
      GX.el("th", { class: "num", text: "" })
    ]));
    table.appendChild(head);

    var body = GX.el("tbody");
    slice.forEach(function (k) {
      var tr = GX.el("tr");

      var pick = GX.el("td", { class: "num pick" });
      var box = GX.el("input", { type: "checkbox", "aria-label": "Select key " + k.key });
      box.checked = Boolean(state.selected[k.id]);
      box.addEventListener("change", function () {
        state.selected[k.id] = box.checked;
        paintBulk();
      });
      pick.appendChild(box);
      tr.appendChild(pick);

      var idCell = GX.el("td", { "data-l": "id" });
      idCell.appendChild(GX.el("a", {
        class: "mono",
        href: "/pengatur/keys/" + encodeURIComponent(k.id),
        text: k.id
      }));
      tr.appendChild(idCell);

      var keyCell = GX.el("td", { class: "key", "data-l": "key" });
      keyCell.textContent = k.key;
      tr.appendChild(keyCell);

      var tierCell = GX.el("td", { "data-l": "plan" });
      var select = GX.el("select", { class: "tier", "aria-label": "Billing plan for " + k.key });
      TIERS.forEach(function (t) {
        var option = GX.el("option", { value: t.value, text: t.label });
        if ((k.tier || "unknown") === t.value) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener("change", function () { setTier([k.id], select.value, select); });
      tierCell.appendChild(select);
      tr.appendChild(tierCell);

      var statusCell = GX.el("td", { "data-l": "status" });
      statusCell.appendChild(GX.badge(k.status, statusKind(k.status)));
      tr.appendChild(statusCell);

      GX.cell(tr, k.failures, "num", "fails");
      GX.cell(tr, GX.fmt.left(k.cooldownLeftMs), "num cool", "cooldown");
      GX.cell(tr, GX.fmt.age(k.lastUsed), "", "last used");

      var actions = GX.el("td", { class: "actions" });
      var testBtn = GX.el("button", { class: "small", type: "button", text: "Test" });
      testBtn.addEventListener("click", function () { testKey(k, testBtn); });
      var delBtn = GX.el("button", { class: "small btn-danger", type: "button", text: "Remove" });
      delBtn.addEventListener("click", function () { removeKey(k, delBtn); });
      actions.appendChild(testBtn);
      actions.appendChild(delBtn);
      tr.appendChild(actions);

      body.appendChild(tr);
    });

    table.appendChild(body);
    el.keysBody.textContent = "";
    el.keysBody.appendChild(table);

    var all = document.getElementById("selectAll");
    all.addEventListener("change", function () {
      slice.forEach(function (k) { state.selected[k.id] = all.checked; });
      drawTable();
    });

    renderPager(filtered.length, pages);
    paintBulk();
  }

  function renderPager(total, pages) {
    el.keyPager.textContent = "";
    if (!total) return;
    el.keyPager.appendChild(GX.el("span", {
      text: "showing " + ((state.page - 1) * state.size + 1) + "-" +
        Math.min(total, state.page * state.size) + " of " + total
    }));

    var box = GX.el("div", { class: "pages" });
    function mk(label, page, disabled, active) {
      var b = GX.el("button", {
        class: "small" + (active ? " active" : ""),
        type: "button",
        text: label,
        disabled: disabled ? true : null
      });
      if (active) b.setAttribute("aria-current", "page");
      b.addEventListener("click", function () { state.page = page; drawTable(); });
      return b;
    }
    box.appendChild(mk("Prev", state.page - 1, state.page === 1, false));
    var win = 5;
    var from = Math.max(1, state.page - Math.floor(win / 2));
    var to = Math.min(pages, from + win - 1);
    from = Math.max(1, to - win + 1);
    if (from > 1) {
      box.appendChild(mk("1", 1, false, state.page === 1));
      if (from > 2) box.appendChild(GX.el("span", { text: "..." }));
    }
    for (var p = from; p <= to; p++) box.appendChild(mk(String(p), p, false, p === state.page));
    if (to < pages) {
      if (to < pages - 1) box.appendChild(GX.el("span", { text: "..." }));
      box.appendChild(mk(String(pages), pages, false, state.page === pages));
    }
    box.appendChild(mk("Next", state.page + 1, state.page === pages, false));
    el.keyPager.appendChild(box);
  }

  function setTier(ids, tier, control) {
    if (!ids.length) { GX.say(el.bulkMsg, "Select at least one key.", "err"); return; }
    if (control) control.disabled = true;
    GX.api("/pengatur/keys/tier", { method: "POST", body: { ids: ids, tier: tier } })
      .then(function (data) {
        GX.say(el.bulkMsg, "Plan set to " + tierLabel(tier) + " for " + data.updated + " key(s).", "ok");
        return reload();
      })
      .catch(function (err) {
        GX.say(el.bulkMsg, "Plan update failed: " + err.message, "err");
      })
      .then(function () { if (control) control.disabled = false; });
  }

  function testKey(k, btn) {
    btn.disabled = true;
    btn.textContent = "Testing";
    GX.api("/pengatur/keys/test", { method: "POST", body: { id: k.id } })
      .then(function (data) {
        GX.say(el.bulkMsg, k.key + ": " + data.probe.status + " (" + data.applied + ")", data.probe.status === "ok" ? "ok" : "");
        return reload();
      })
      .catch(function (err) {
        GX.say(el.bulkMsg, "Test failed: " + err.message, "err");
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Test";
      });
  }

  function testAll() {
    GX.busy(el.testAllBtn, "Testing");
    GX.api("/pengatur/keys/test-all", { method: "POST" })
      .then(function (data) {
        GX.say(el.bulkMsg, "Tested " + data.tested + " keys.", "ok");
        return reload();
      })
      .catch(function (err) {
        GX.say(el.bulkMsg, "Test all failed: " + err.message, "err");
      })
      .then(function () { GX.idle(el.testAllBtn); });
  }

  function removeKey(k, btn) {
    if (!window.confirm("Remove key " + k.key + " from the pool? This cannot be undone.")) return;
    btn.disabled = true;
    GX.api("/pengatur/keys", { method: "DELETE", body: { id: k.id } })
      .then(function (data) {
        GX.say(el.bulkMsg, "Removed " + k.key + ". Pool total " + data.pool.total + ".", "ok");
        delete state.selected[k.id];
        return reload();
      })
      .catch(function (err) {
        btn.disabled = false;
        GX.say(el.bulkMsg, "Remove failed: " + err.message, "err");
      });
  }

  function removeSelected() {
    var ids = selectedIds();
    if (!ids.length) return;
    if (!window.confirm("Remove " + ids.length + " key(s) from the pool? This cannot be undone.")) return;
    GX.busy(el.bulkRemove, "Removing");
    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        return GX.api("/pengatur/keys", { method: "DELETE", body: { id: id } });
      });
    });
    chain
      .then(function () {
        GX.say(el.bulkMsg, "Removed " + ids.length + " key(s).", "ok");
        state.selected = {};
        return reload();
      })
      .catch(function (err) {
        GX.say(el.bulkMsg, "Remove failed: " + err.message, "err");
      })
      .then(function () { GX.idle(el.bulkRemove); });
  }

  function addKeys() {
    var raw = el.newKeys.value;
    var keys = raw.split(/[\\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!keys.length) { GX.say(el.addMsg, "Nothing to add.", "err"); return; }
    GX.busy(el.addSubmit, "Adding");
    GX.api("/pengatur/keys", { method: "POST", body: { keys: keys } })
      .then(function (data) {
        el.newKeys.value = "";
        el.addCount.textContent = "";
        GX.say(el.addMsg, "Sent " + data.received + ", added " + data.added + ".", data.added ? "ok" : "");
        return reload();
      })
      .catch(function (err) {
        GX.say(el.addMsg, "Add failed: " + err.message, "err");
      })
      .then(function () { GX.idle(el.addSubmit); });
  }

  function refresh() {
    return GX.api("/pengatur/keys/list")
      .then(function (data) {
        state.keys = data.keys || [];
        state.knownTiers = data.knownTiers || [];
        var pool = data.pool || {};
        el.sTotal.textContent = pool.total;
        el.sReady.textContent = pool.ready;
        el.sCooling.textContent = pool.cooling;
        el.sDead.textContent = pool.dead;
        el.sStorage.textContent = pool.storage;
        GX.storage(pool.storage + (pool.degraded ? " degraded" : ""));
        el.poolMeta.textContent = (pool.degraded ? "storage degraded, serving from memory · " : "") +
          "updated " + new Date().toLocaleTimeString("en-GB", { hour12: false });
        var keep = el.bulkTier.value;
        el.bulkTier.textContent = "";
        state.knownTiers.forEach(function (t) {
          el.bulkTier.appendChild(GX.el("option", { value: t, text: tierLabel(t) }));
        });
        if (keep) el.bulkTier.value = keep;
        drawTable();
        el.console.hidden = false;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        GX.say(el.bulkMsg, "Refresh failed: " + err.message, "err");
      });
  }

  function reload() {
    return refresh().catch(function () {});
  }

  function startAuto() {
    if (state.timer || !el.auto.checked) return;
    state.timer = GX.every(15000, reload);
  }
  function stopAuto() {
    if (state.timer) { state.timer(); state.timer = null; }
  }

  el.addBtn.addEventListener("click", function () {
    GX.say(el.addMsg, "");
    GX.openDialog(el.addDialog);
    if (el.newKeys) el.newKeys.focus();
  });
  el.addClose.addEventListener("click", function () { GX.closeDialog(el.addDialog); });
  el.addForm.addEventListener("submit", function (event) { event.preventDefault(); addKeys(); });
  el.newKeys.addEventListener("input", function () {
    var n = el.newKeys.value.split(/[\\s,]+/).filter(function (s) { return s.trim(); }).length;
    el.addCount.textContent = n ? n + " key" + (n === 1 ? "" : "s") + " detected" : "";
  });
  el.refreshBtn.addEventListener("click", function () { reload(); });
  el.testAllBtn.addEventListener("click", testAll);
  el.auto.addEventListener("change", function () {
    if (el.auto.checked) startAuto(); else stopAuto();
  });
  el.bulkApply.addEventListener("click", function () { setTier(selectedIds(), el.bulkTier.value, el.bulkApply); });
  el.bulkRemove.addEventListener("click", removeSelected);
  el.bulkClear.addEventListener("click", function () {
    state.selected = {};
    drawTable();
  });
  el.keyFilter.addEventListener("input", GX.debounce(function () {
    state.query = el.keyFilter.value.trim().toLowerCase();
    state.page = 1;
    drawTable();
  }, 140));
  el.keyStatus.addEventListener("change", function () {
    state.status = el.keyStatus.value;
    state.page = 1;
    drawTable();
  });
  el.keySize.addEventListener("change", function () {
    state.size = Number(el.keySize.value) || 25;
    state.page = 1;
    drawTable();
  });

  GX.gate({
    onSuccess: function () {
      return refresh().then(function () { startAuto(); });
    }
  });
})();`;

export const KEYS_HTML = consolePage({
  title: "Keys",
  subtitle: "Every pooled key, its plan and its health",
  active: "/pengatur/keys",
  actions: `<button id="addBtn" class="btn btn-primary" type="button"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 4.5v11"/><path d="M4.5 10h11"/></svg>Add keys</button>`,
  body: PAGE_BODY,
  script: PAGE_SCRIPT,
});

/**
 * Key detail shell, served at GET /pengatur/keys/:id.
 *
 * One key: its counters, the daily request chart, the cooldown timeline and
 * the requests still in the live ring. Carries no data, the browser reads
 * /pengatur/keys/:id/data with the admin token.
 */

const DETAIL_BODY = `

<section id="gate" class="panel"><div class="panel-head"><div class="panel-title">Admin token</div></div><div class="panel-body"><form id="gateForm" autocomplete="off"><label class="field" for="token">Paste the deployment admin token</label><div class="row"><div class="grow"><input id="token" class="input" type="password" spellcheck="false" placeholder="ADMIN_TOKEN"></div><button id="connect" class="btn btn-primary" type="submit">Connect</button></div><p class="hint" style="margin-top:12px">The token is kept in this browser and sent only to this deployment as a bearer token.</p></form><div id="gateMsg" class="notice" role="status" aria-live="polite" style="margin-top:8px"></div></div></section>

<section id="console" hidden>
  <div class="row" style="margin-bottom:4px">
    <a class="btn btn-ghost small" href="/pengatur/keys"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 4 6 10l6 6"/></svg>All keys</a>
    <span class="hint" id="keyPath"></span>
  </div>

  <div class="stats" id="summary"></div>

  <section class="panel">
    <div class="panel-head">
      <div class="panel-title">Daily requests <span class="meta" id="dailyNote"></span></div>
    </div>
    <div class="panel-body">
      <div id="dailyBars" class="bars"></div>
    </div>
    <div class="tablewrap">
      <table class="table" id="dailyTable">
        <thead><tr><th>Day</th><th class="num">Requests</th><th class="num">Errors</th><th class="num">Cost</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </section>

  <div class="grid split">
    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">Cooldown timeline</div>
        <span class="meta" id="cooldownNote"></span>
      </div>
      <div class="tablewrap">
        <table class="table" id="eventTable">
          <thead><tr><th>When</th><th>Status</th><th>Error</th><th>Rotated</th></tr></thead>
          <tbody></tbody>
        </table>
        <div id="eventEmpty"></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">Recent requests</div>
        <span class="meta" id="recentNote"></span>
      </div>
      <div class="tablewrap">
        <table class="table" id="recentTable">
          <thead><tr><th>When</th><th>Route</th><th>Model</th><th>Status</th><th class="num">ms</th><th class="num">Tokens</th></tr></thead>
          <tbody></tbody>
        </table>
        <div id="recentEmpty"></div>
      </div>
    </section>
  </div>
</section>
`;

const DETAIL_SCRIPT = `(function () {
  "use strict";

  var keyId = location.pathname.split("/").filter(Boolean).pop();

  var el = {
    console: document.getElementById("console"),
    summary: document.getElementById("summary"),
    keyPath: document.getElementById("keyPath"),
    dailyNote: document.getElementById("dailyNote"),
    dailyBars: document.getElementById("dailyBars"),
    dailyTable: document.getElementById("dailyTable"),
    cooldownNote: document.getElementById("cooldownNote"),
    eventTable: document.getElementById("eventTable"),
    eventEmpty: document.getElementById("eventEmpty"),
    recentNote: document.getElementById("recentNote"),
    recentTable: document.getElementById("recentTable"),
    recentEmpty: document.getElementById("recentEmpty")
  };

  function stat(label, value) {
    return GX.el("div", { class: "stat" }, [
      GX.el("b", { text: value === null || value === undefined ? "-" : String(value) }),
      GX.el("span", { text: label })
    ]);
  }

  function statusKind(status) {
    if (status === "ready") return "ok";
    if (status === "cooling") return "warn";
    return "bad";
  }

  function renderSummary(k) {
    el.summary.textContent = "";
    el.summary.appendChild(stat("plan", k.plan));
    el.summary.appendChild(stat("state", k.status));
    el.summary.appendChild(stat("enabled", k.enabled === false ? "no" : "yes"));
    el.summary.appendChild(stat("failures", k.failures));
    el.summary.appendChild(stat("invalidations", k.invalidations));
    el.summary.appendChild(stat("last used", k.lastUsed ? GX.fmt.age(k.lastUsed) : "never"));
    el.summary.appendChild(stat("cooldown left", GX.fmt.left(k.cooldownLeftMs)));
    el.summary.appendChild(stat("cooldown until", k.cooldownUntil ? GX.fmt.stamp(k.cooldownUntil) : "-"));
  }

  function renderDaily(daily) {
    el.dailyNote.textContent = daily.length ? "last " + daily.length + " days" : "";
    el.dailyBars.textContent = "";
    el.dailyTable.querySelector("tbody").textContent = "";
    el.dailyTable.hidden = !daily.length;

    if (!daily.length) {
      el.dailyBars.appendChild(GX.state("empty", "No daily history", "The rollup keeps one bucket per day for this key."));
      return;
    }

    var max = 0;
    daily.forEach(function (d) { max = Math.max(max, Number(d.requests) || 0); });

    daily.forEach(function (d) {
      var requests = Number(d.requests) || 0;
      var width = max > 0 ? Math.round((requests / max) * 100) : 0;
      var row = GX.el("div", { class: "bar-row" }, [
        GX.el("span", { class: "label", text: d.day }),
        GX.el("div", { class: "bar-track" }, GX.el("div", { class: "bar-fill", style: "width:" + width + "%" })),
        GX.el("span", { class: "value", text: GX.fmt.num(requests) })
      ]);
      el.dailyBars.appendChild(row);
    });

    daily.forEach(function (d) {
      var tr = GX.el("tr");
      GX.cell(tr, d.day, "", "day");
      GX.cell(tr, GX.fmt.num(d.requests), "num", "requests");
      GX.cell(tr, GX.fmt.num(d.errors), "num", "errors");
      GX.cell(tr, d.costUsd === null || d.costUsd === undefined ? "-" : GX.fmt.money(d.costUsd), "num", "cost");
      el.dailyTable.querySelector("tbody").appendChild(tr);
    });
  }

  function renderEvents(events) {
    var body = el.eventTable.querySelector("tbody");
    body.textContent = "";
    el.eventEmpty.textContent = "";
    el.eventTable.hidden = !events.length;
    el.cooldownNote.textContent = events.length ? events.length + " events" : "";
    if (!events.length) {
      el.eventEmpty.appendChild(GX.state("empty", "No failures recorded", "Every request this key served succeeded."));
      return;
    }
    events.forEach(function (e) {
      var tr = GX.el("tr");
      GX.cell(tr, GX.fmt.stamp(e.ts), "mono", "when");
      var statusCell = GX.el("td", { "data-l": "status" });
      statusCell.appendChild(GX.badge(String(e.status), e.ok ? "ok" : e.status === 429 ? "warn" : "bad"));
      tr.appendChild(statusCell);
      GX.cell(tr, e.errorCode || "-", "", "error");
      GX.cell(tr, e.rotated ? "yes" : "no", "", "rotated");
      body.appendChild(tr);
    });
  }

  function renderRecent(recent) {
    var body = el.recentTable.querySelector("tbody");
    body.textContent = "";
    el.recentEmpty.textContent = "";
    el.recentTable.hidden = !recent.length;
    el.recentNote.textContent = recent.length ? recent.length + " rows" : "";
    if (!recent.length) {
      el.recentEmpty.appendChild(GX.state("empty", "No request in the ring", "The live ring keeps the last requests that passed through the gateway."));
      return;
    }
    recent.forEach(function (r) {
      var tr = GX.el("tr");
      GX.cell(tr, GX.fmt.clock(r.ts), "mono", "when");
      GX.cell(tr, r.route, "mono", "route");
      GX.cell(tr, r.model || "-", "mono", "model");
      var statusCell = GX.el("td", { "data-l": "status" });
      statusCell.appendChild(GX.badge(String(r.status), r.ok ? "ok" : "bad"));
      tr.appendChild(statusCell);
      GX.cell(tr, GX.fmt.num(r.latencyMs), "num", "ms");
      GX.cell(tr, GX.fmt.num(r.totalTokens), "num", "tokens");
      body.appendChild(tr);
    });
  }

  function render(d) {
    var k = d.key;
    el.keyPath.textContent = k.masked + " · id " + k.id;
    var head = document.querySelector(".pagebar h1");
    if (head) head.textContent = k.masked;
    renderSummary(k);
    renderDaily(d.daily || []);
    renderEvents(d.events || []);
    renderRecent(d.recent || []);
    el.dailyNote.textContent = d.dailyNote || el.dailyNote.textContent;
    el.console.hidden = false;
  }

  function refresh() {
    return GX.api("/pengatur/keys/" + encodeURIComponent(keyId) + "/data")
      .then(render)
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        if (err.status === 404) {
          GX.lock("No key with that id.");
          throw err;
        }
        el.console.hidden = false;
        el.dailyBars.textContent = "";
        el.dailyBars.appendChild(GX.state("error", "Could not load this key", err.message));
      });
  }

  GX.gate({ onSuccess: refresh });
})();`;

export const KEY_DETAIL_HTML = consolePage({
  title: "Key detail",
  subtitle: "One key, its counters, its history",
  active: "/pengatur/keys",
  body: DETAIL_BODY,
  script: DETAIL_SCRIPT,
});
