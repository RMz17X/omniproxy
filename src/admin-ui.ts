/**
 * Overview console shell, served at GET /pengatur.
 *
 * The shell carries no data. It asks for the admin token, stores it in
 * localStorage, and renders from /pengatur/keys/list. Every mutation addresses
 * a key by its sha256 id, so the browser never holds a raw credential.
 *
 * Layout: a left rail with the console sections, a page header with the two
 * actions that apply to the whole view, an instrument strip with the pool
 * counters, then the pool table next to a narrow column that holds the plan
 * breakdown and the pool level actions.
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
    <div class="kv"><b id="sTier">-</b><span class="k">plans</span></div>
    <div class="spacer"></div>
    <div class="meta" id="nextReady">-</div>
  </div>

  <div class="grid split">
    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">Pool <span class="meta" id="poolMeta"></span></div>
        <a class="btn small" href="/pengatur/keys">Keys console</a>
      </div>
      <div class="panel-body">
        <div class="row">
          <div class="grow">
            <label class="field" for="keyFilter">Filter</label>
            <input id="keyFilter" type="search" spellcheck="false" placeholder="key, id or status">
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
      <div id="keysBody" class="tablewrap">stateBlock("loading", "Loading the pool")</div>
      <div class="panel-foot"><div id="keyPager" class="pager"></div></div>
    </section>

    <div class="stack">
      <section class="panel">
        <div class="panel-head"><div class="panel-title">Plans</div></div>
        <div class="panel-body">
          <div class="stats" id="planStats"></div>
          <p class="hint" style="margin-top:12px">Google never reports a project plan over the API. The plan is declared here and the models page prices a test run against it.</p>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="panel-title">Pool actions</div></div>
        <div class="panel-body">
          <div class="row">
            <button id="testAllBtn" class="btn" type="button"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11 3 5.5 11H9.5l-1 6 5.5-8H10l1-6Z"/></svg>Test all live keys</button>
          </div>
          <p class="hint" style="margin-top:8px" id="testAllNote">One live call per key, four at a time.</p>
          <div class="sep" style="margin:12px 0"></div>
          <label class="check"><input id="auto" type="checkbox" checked> Auto refresh every 5s</label>
          <div class="row" style="margin-top:12px">
            <button id="forget" class="btn btn-ghost small" type="button">Forget token</button>
          </div>
          <div id="keyMsg" class="notice" role="status" aria-live="polite" style="margin-top:12px"></div>
        </div>
      </section>
    </div>
  </div>
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
    sTier: document.getElementById("sTier"),
    nextReady: document.getElementById("nextReady"),
    poolMeta: document.getElementById("poolMeta"),
    planStats: document.getElementById("planStats"),
    keysBody: document.getElementById("keysBody"),
    keyFilter: document.getElementById("keyFilter"),
    keyStatus: document.getElementById("keyStatus"),
    keySize: document.getElementById("keySize"),
    keyPager: document.getElementById("keyPager"),
    keyMsg: document.getElementById("keyMsg"),
    testAllBtn: document.getElementById("testAllBtn"),
    testAllNote: document.getElementById("testAllNote"),
    auto: document.getElementById("auto"),
    forget: document.getElementById("forget"),
    refreshBtn: document.getElementById("refreshBtn"),
    addBtn: document.getElementById("addBtn"),
    addDialog: document.getElementById("addDialog"),
    addClose: document.getElementById("addClose"),
    addForm: document.getElementById("addForm"),
    addSubmit: document.getElementById("addSubmit"),
    newKeys: document.getElementById("newKeys"),
    addCount: document.getElementById("addCount"),
    addMsg: document.getElementById("addMsg")
  };

  var state = { keys: [], tiers: null, testing: {}, page: 1, size: 25, query: "", status: "", timer: null };

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

  function probeClass(status) {
    if (status === "ok") return "ok";
    if (status === "rate_limited" || status === "zero_quota" || status === "server_error") return "warn";
    return "bad";
  }

  function probeText(res) {
    if (!res) return "not tested";
    var label = String(res.status).replace(/_/g, " ");
    if (res.status === "ok") label = "serving";
    if (res.status === "rate_limited") label = "429, free in " + GX.fmt.left(res.retryAfterMs);
    return label + " (" + res.latencyMs + "ms)";
  }

  function renderStrip(pool) {
    el.sTotal.textContent = pool.total;
    el.sReady.textContent = pool.ready;
    el.sCooling.textContent = pool.cooling;
    el.sDead.textContent = pool.dead;
    GX.storage(pool.storage + (pool.degraded ? " degraded" : ""));
    el.nextReady.textContent = pool.cooling > 0
      ? "next key free in " + GX.fmt.left(pool.soonestReadyMs)
      : pool.ready > 0
        ? "every key selectable"
        : "no key can serve right now";
  }

  function renderPlans(tiers) {
    state.tiers = tiers || {};
    var t = state.tiers;
    var parts = [];
    if (t.free) parts.push(t.free + " free");
    if (t.paid) parts.push(t.paid + " paid");
    if (t.pro) parts.push(t.pro + " pro");
    if (t.unknown) parts.push(t.unknown + " unset");
    el.sTier.textContent = parts.length ? parts.join(" / ") : "-";

    el.planStats.textContent = "";
    var rows = [
      ["free", t.free || 0],
      ["paid", t.paid || 0],
      ["pro", t.pro || 0],
      ["unknown", t.unknown || 0]
    ];
    for (var i = 0; i < rows.length; i++) {
      var box = GX.el("div", { class: "stat" }, [
        GX.el("b", { text: String(rows[i][1]) }),
        GX.el("span", { text: rows[i][0] })
      ]);
      el.planStats.appendChild(box);
    }
  }

  function statusBadge(status) {
    var kind = status === "ready" ? "ok" : status === "cooling" ? "warn" : "bad";
    return GX.badge(status, kind);
  }

  function visibleKeys() {
    var query = state.query;
    return state.keys.filter(function (k) {
      if (state.status && k.status !== state.status) return false;
      if (!query) return true;
      return (k.key + " " + k.id + " " + k.status).toLowerCase().indexOf(query) >= 0;
    });
  }

  function drawTable() {
    var filtered = visibleKeys();
    el.poolMeta.textContent = state.keys.length + " in pool, " + filtered.length + " shown";

    if (!filtered.length) {
      el.keysBody.textContent = "";
      var empty = GX.state(
        "empty",
        state.keys.length ? "No key matches this filter" : "Pool is empty",
        state.keys.length
          ? "Clear the filter box to see the whole pool."
          : "Add keys from the button above, or set GEMINI_API_KEYS on the deployment."
      );
      el.keysBody.appendChild(empty);
      renderPager(0, 1);
      return;
    }

    var pages = Math.max(1, Math.ceil(filtered.length / state.size));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * state.size;
    var slice = filtered.slice(start, start + state.size);

    var table = GX.el("table", { class: "table" });
    var head = GX.el("thead", null, GX.el("tr", null, [
      GX.el("th", { text: "Key" }),
      GX.el("th", { text: "Status" }),
      GX.el("th", { text: "Plan" }),
      GX.el("th", { class: "num", text: "Fails" }),
      GX.el("th", { class: "num", text: "Cooldown" }),
      GX.el("th", { text: "Last used" }),
      GX.el("th", { text: "Probe" }),
      GX.el("th", { class: "num", text: "" })
    ]));
    table.appendChild(head);

    var body = GX.el("tbody");
    slice.forEach(function (k) {
      var tr = GX.el("tr");

      var keyCell = GX.el("td", { class: "key", "data-l": "key" });
      var link = GX.el("a", { href: "/pengatur/keys/" + encodeURIComponent(k.id), text: k.key });
      link.title = "id " + k.id;
      keyCell.appendChild(link);
      tr.appendChild(keyCell);

      var statusCell = GX.el("td", { "data-l": "status" });
      statusCell.appendChild(statusBadge(k.status));
      tr.appendChild(statusCell);

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

      GX.cell(tr, k.failures, "num", "fails");
      GX.cell(tr, GX.fmt.left(k.cooldownLeftMs), "num cool", "cooldown");
      GX.cell(tr, GX.fmt.age(k.lastUsed), "", "last used");

      var probeCell = GX.el("td", { "data-l": "probe" });
      var known = state.testing[k.id];
      probeCell.appendChild(GX.el("span", {
        class: "probe " + (known ? probeClass(known.status) : ""),
        text: known ? probeText(known) : "-"
      }));
      tr.appendChild(probeCell);

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
    renderPager(filtered.length, pages);
  }

  function renderPager(total, pages) {
    el.keyPager.textContent = "";
    if (!total) return;

    var info = GX.el("span", {
      text: "showing " + ((state.page - 1) * state.size + 1) + "-" +
        Math.min(total, state.page * state.size) + " of " + total
    });
    el.keyPager.appendChild(info);

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
    if (!ids.length) { GX.say(el.keyMsg, "Nothing to update.", "err"); return; }
    if (control) control.disabled = true;
    GX.api("/pengatur/keys/tier", { method: "POST", body: { ids: ids, tier: tier } })
      .then(function (data) {
        GX.say(el.keyMsg, "Plan set to " + tierLabel(tier) + " for " + data.updated + " key(s).", "ok");
        return reload();
      })
      .catch(function (err) {
        GX.say(el.keyMsg, "Plan update failed: " + err.message, "err");
      })
      .then(function () { if (control) control.disabled = false; });
  }

  function testKey(k, btn) {
    btn.disabled = true;
    btn.textContent = "Testing";
    GX.api("/pengatur/keys/test", { method: "POST", body: { id: k.id } })
      .then(function (data) {
        state.testing[k.id] = data.probe;
        var note = data.applied === "revived" ? " back in rotation"
          : data.applied === "cooling" ? " parked again"
          : data.applied === "retired" ? " retired from the pool" : "";
        GX.say(el.keyMsg, k.key + ": " + data.probe.message + note, data.probe.status === "ok" ? "ok" : "");
        return reload();
      })
      .catch(function (err) {
        GX.say(el.keyMsg, "Test failed: " + err.message, "err");
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Test";
      });
  }

  function testAll() {
    GX.busy(el.testAllBtn, "Testing");
    el.testAllNote.textContent = "One live call per key, four at a time.";
    GX.api("/pengatur/keys/test-all", { method: "POST" })
      .then(function (data) {
        var results = data.results || [];
        results.forEach(function (r) { state.testing[r.id] = r.probe; });
        var ok = results.filter(function (r) { return r.probe.status === "ok"; }).length;
        GX.say(
          el.keyMsg,
          "Probed " + data.tested + " keys, " + ok + " serving. Pool: " +
            data.pool.ready + " ready, " + data.pool.cooling + " cooling, " + data.pool.dead + " dead.",
          ok ? "ok" : ""
        );
        return reload();
      })
      .catch(function (err) {
        GX.say(el.keyMsg, "Test all failed: " + err.message, "err");
      })
      .then(function () {
        GX.idle(el.testAllBtn);
        el.testAllNote.textContent = "One live call per key, four at a time.";
      });
  }

  function removeKey(k, btn) {
    if (!window.confirm("Remove key " + k.key + " from the pool? This cannot be undone.")) return;
    btn.disabled = true;
    GX.api("/pengatur/keys", { method: "DELETE", body: { id: k.id } })
      .then(function (data) {
        GX.say(el.keyMsg, "Removed " + k.key + ". Pool total " + data.pool.total + ".", "ok");
        delete state.testing[k.id];
        return reload();
      })
      .catch(function (err) {
        btn.disabled = false;
        GX.say(el.keyMsg, "Remove failed: " + err.message, "err");
      });
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
      .then(function () {
        GX.idle(el.addSubmit);
      });
  }

  function refresh() {
    return GX.api("/pengatur/keys/list")
      .then(function (data) {
        state.keys = data.keys || [];
        renderStrip(data.pool || {});
        renderPlans(data.tiers);
        drawTable();
        el.console.hidden = false;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        GX.say(el.keyMsg, "Refresh failed: " + err.message, "err");
      });
  }

  /* Same refresh, but a failure must not break the caller chain. */
  function reload() {
    return refresh().catch(function () {});
  }

  function startAuto() {
    if (state.timer) return;
    if (!el.auto.checked) return;
    state.timer = GX.every(5000, reload);
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
  el.addForm.addEventListener("submit", function (event) {
    event.preventDefault();
    addKeys();
  });
  el.newKeys.addEventListener("input", function () {
    var n = el.newKeys.value.split(/[\\s,]+/).filter(function (s) { return s.trim(); }).length;
    el.addCount.textContent = n ? n + " key" + (n === 1 ? "" : "s") + " detected" : "";
  });
  el.refreshBtn.addEventListener("click", function () { refresh(); });
  el.testAllBtn.addEventListener("click", testAll);
  el.auto.addEventListener("change", function () {
    if (el.auto.checked) startAuto(); else stopAuto();
  });
  el.forget.addEventListener("click", function () {
    stopAuto();
    GX.lock("Token cleared from this browser.");
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
      return refresh().then(function () {
        startAuto();
      });
    }
  });
})();`;

export const ADMIN_HTML = consolePage({
  title: "Overview",
  subtitle: "Pool health, key intake and live probe",
  active: "/pengatur",
  actions: `<button id="addBtn" class="btn btn-primary" type="button"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 4.5v11"/><path d="M4.5 10h11"/></svg>Add keys</button><button id="refreshBtn" class="btn" type="button"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M16.5 8A6.5 6.5 0 1 0 17 12"/><path d="M16.5 3.5V8H12"/></svg>Refresh</button>`,
  body: PAGE_BODY,
  script: PAGE_SCRIPT,
});
