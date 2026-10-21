/**
 * Overview console shell, served at GET /pengatur.
 *
 * The page is a product dashboard, not a table with a header. It answers three
 * questions in this order: is the pool healthy, what needs my attention, and
 * what is the traffic doing. Everything else is one click away.
 *
 * The shell carries no data. It asks for the admin token, stores it in
 * localStorage, and renders from /pengatur/keys/list, /pengatur/stats/data
 * and /pengatur/audit/data. Every mutation addresses a key by its sha256 id,
 * so the browser never holds a raw credential.
 */

import { authGate, confirmDialog, consolePage, icon, noticeBand, stateBlock } from "./ui.ts";

const OVERVIEW_BODY = `
${authGate()}

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Deployment</span>
      <h1 class="page-title">Overview</h1>
      <p class="page-lede">Whether the pool can serve right now, what is blocking it, and what the traffic is doing.</p>
    </div>
    <div class="page-head-side">
      <label class="check"><input id="auto" type="checkbox" checked> Refresh every 15s</label>
      <span class="meta" id="updated">-</span>
    </div>
  </header>

  <div id="storageNote" class="panel-note" style="border:1px solid var(--line);border-radius:var(--r-surface);margin-bottom:var(--sp-4)" hidden></div>

  <div class="split">
    <section class="panel">
      <div class="panel-head">
        <h2>Pool health</h2>
        <span class="meta" id="healthMeta">-</span>
      </div>
      <div class="panel-body">
        <div id="poolBar" class="u-mb-4"></div>
        <div class="figures" id="facts"></div>
        <div class="row u-mt-4" id="chips"></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Needs attention</h2>
        <span class="meta" id="attnMeta">-</span>
      </div>
      <div class="feed" id="attn"></div>
      <div class="panel-foot">
        <button id="testAllBtn" class="btn btn-sm" type="button">${icon("test")}Test all live keys</button>
        <span class="meta" id="testAllNote">one live call per key, four at a time</span>
      </div>
    </section>
  </div>

  <section class="zone">
    <div class="panel">
      <div class="panel-head">
        <h2>Last 30 days</h2>
        <span class="meta">from the request ledger</span>
      </div>
      <div class="panel-body">
        <div class="figures" id="kpis"></div>
      </div>
    </div>
  </section>

  <div class="zone split">
    <section class="panel">
      <div class="panel-head">
        <h2>Keys</h2>
        <span class="meta" id="poolMeta"></span>
      </div>
      <div class="panel-body" style="padding-bottom:0">
        <div class="toolbar u-mb-4">
          <div class="grow search">
            ${icon("search")}
            <input id="keyFilter" class="input" type="search" spellcheck="false" placeholder="key, id or status" aria-label="Filter keys">
          </div>
          <select id="keyStatus" class="select" aria-label="Status">
            <option value="">any status</option>
            <option value="ready">ready</option>
            <option value="cooling">cooling</option>
            <option value="dead">dead</option>
          </select>
          <select id="keySize" class="select" aria-label="Rows per page">
            <option value="10">10 rows</option>
            <option value="25" selected>25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
          </select>
        </div>
      </div>
      <div id="keysBody" class="table-wrap">${stateBlock("loading", "Loading the pool")}</div>
      <div class="panel-foot">
        <div id="keyPager" class="pager"></div>
      </div>
    </section>

    <div class="grid" style="gap:var(--sp-4)">
      <section class="panel">
        <div class="panel-head">
          <h2>Plan mix</h2>
          <span class="meta">declared per key</span>
        </div>
        <div class="panel-body">
          <div class="bars" id="planMix"></div>
          <p class="hint u-mt-4">Google never reports a project plan over the API. Declare it here; the models page prices a test run against it.</p>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Recent activity</h2>
          <a class="meta" href="/pengatur/audit">audit log</a>
        </div>
        <div class="feed" id="activity"></div>
      </section>
    </div>
  </div>
</div>

${confirmDialog()}

<dialog id="addDialog" aria-labelledby="addTitle">
  <form id="addForm" method="dialog">
    <div class="panel-head">
      <h2 id="addTitle">Add keys</h2>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm icon-btn" type="button" id="addClose" aria-label="Close">${icon("close")}</button>
    </div>
    <div class="panel-body">
      <label class="field" for="newKeys">One key per line, or separated by commas</label>
      <textarea id="newKeys" class="textarea" spellcheck="false" placeholder="key one&#10;key two"></textarea>
      <div class="row u-mt-4">
        <button id="addSubmit" class="btn btn-primary" type="submit">Add to pool</button>
        <span id="addCount" class="hint"></span>
      </div>
      <div id="addMsg" class="hint u-mt-2" role="status" aria-live="polite"></div>
    </div>
  </form>
</dialog>
`;

const OVERVIEW_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    updated: document.getElementById("updated"),
    facts: document.getElementById("facts"),
    chips: document.getElementById("chips"),
    healthMeta: document.getElementById("healthMeta"),
    attn: document.getElementById("attn"),
    attnMeta: document.getElementById("attnMeta"),
    testAllBtn: document.getElementById("testAllBtn"),
    auto: document.getElementById("auto"),
    testAllNote: document.getElementById("testAllNote"),
    kpis: document.getElementById("kpis"),
    poolMeta: document.getElementById("poolMeta"),
    planMix: document.getElementById("planMix"),
    activity: document.getElementById("activity"),
    keysBody: document.getElementById("keysBody"),
    keyFilter: document.getElementById("keyFilter"),
    keyStatus: document.getElementById("keyStatus"),
    keySize: document.getElementById("keySize"),
    keyPager: document.getElementById("keyPager"),
    addDialog: document.getElementById("addDialog"),
    addClose: document.getElementById("addClose"),
    addForm: document.getElementById("addForm"),
    addSubmit: document.getElementById("addSubmit"),
    addBtn: document.getElementById("addBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    newKeys: document.getElementById("newKeys"),
    addCount: document.getElementById("addCount"),
    addMsg: document.getElementById("addMsg")
  };

  var state = { keys: [], tiers: null, testing: {}, page: 1, size: 25, query: "", status: "", timer: null };

  var TIERS = [
    { value: "unknown", label: "Unspecified" },
    { value: "free", label: "Free tier" },
    { value: "paid", label: "Pay as you go" },
    { value: "pro", label: "AI Pro / Ultra" }
  ];

  function tierLabel(value) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].value === value) return TIERS[i].label;
    return value;
  }

  function safe(promise) {
    return promise.catch(function () { return null; });
  }

  function renderHero(pool, tiers, stats) {
    var declared = (tiers ? (tiers.free || 0) + (tiers.paid || 0) + (tiers.pro || 0) : 0);

    if (el.poolBar) {
      el.poolBar.textContent = "";
      el.poolBar.appendChild(GX.poolBar([
        { label: "ready", value: pool.ready, tone: "ok" },
        { label: "cooling", value: pool.cooling, tone: "warn" },
        { label: "dead", value: pool.dead, tone: "bad" }
      ]));
    }

    el.facts.textContent = "";
    el.facts.appendChild(GX.stat("Ready now", String(pool.ready), pool.total ? "of " + pool.total + " in the pool" : "the pool is empty", pool.ready ? "ok" : "bad"));
    el.facts.appendChild(GX.stat("Cooling", String(pool.cooling), pool.cooling ? "next free in " + GX.fmt.left(pool.soonestReadyMs) : "none parked", pool.cooling ? "warn" : ""));
    el.facts.appendChild(GX.stat("Dead", String(pool.dead), pool.dead ? "revoked or out of quota" : "none retired", pool.dead ? "bad" : ""));
    el.facts.appendChild(GX.stat("Plans declared", declared + " of " + pool.total, "pricing stays unknown for the rest"));

    el.chips.textContent = "";
    if (stats) {
      el.chips.appendChild(GX.chip("p95", GX.fmt.num(stats.totals.p95Ms) + " ms"));
      el.chips.appendChild(GX.chip("30 day cost", GX.fmt.money(stats.totals.costUsd)));
      el.chips.appendChild(GX.chip("projected per 30 days", GX.fmt.money(stats.projectedMonthlyUsd)));
    }
    el.healthMeta.textContent = pool.degraded ? "degraded, serving from memory" : pool.storage + " storage";
    GX.storage(pool.storage + (pool.degraded ? " degraded" : ""), pool.degraded ? "warn" : "");

    var note = document.getElementById("storageNote");
    if (note) {
      note.textContent = "";
      if (pool.storage === "memory") {
        note.appendChild(GX.el("b", { text: "In memory." }));
        note.appendChild(document.createTextNode(
          " The key pool and the request ledger live in this process. A restart empties them."
        ));
        note.hidden = false;
      } else if (pool.degraded) {
        note.appendChild(GX.el("b", { text: "Storage degraded." }));
        note.appendChild(document.createTextNode(
          " The database is not reachable, so the gateway is serving from memory only."
        ));
        note.hidden = false;
      } else {
        note.hidden = true;
      }
    }
  }

  function renderAttention(pool, tiers) {
    var items = [];
    if (pool.dead > 0) {
      items.push({
        tone: "bad",
        title: pool.dead + (pool.dead === 1 ? " key is dead" : " keys are dead"),
        detail: "Revoked or out of quota. Remove them to shrink the pool.",
        href: "/pengatur/keys"
      });
    }
    if (pool.cooling > 0) {
      items.push({
        tone: "warn",
        title: pool.cooling + (pool.cooling === 1 ? " key is cooling" : " keys are cooling"),
        detail: "Free tier quota is exhausted. Longest wait is " + GX.fmt.left(pool.soonestReadyMs) + ".",
        href: "/pengatur/keys"
      });
    }
    var unset = tiers ? tiers.unknown || 0 : 0;
    if (unset > 0) {
      items.push({
        tone: "info",
        title: unset + (unset === 1 ? " key has no plan" : " keys have no plan"),
        detail: "Pricing on the models page stays unknown for these.",
        href: "/pengatur/keys"
      });
    }

    el.attn.textContent = "";
    el.attnMeta.textContent = items.length ? items.length + (items.length === 1 ? " item" : " items") : "nothing";
    if (!items.length) {
      el.attn.appendChild(GX.state("empty", "Nothing needs attention", "Every key is ready and every plan is declared."));
      return;
    }
    items.forEach(function (item) {
      var link = GX.el("a", { class: "attn-item", href: item.href }, [
        GX.el("span", { class: "dot", style: "background:var(--" + item.tone + ")" }),
        GX.el("span", null, [
          GX.el("span", { class: "t", text: item.title }),
          GX.el("span", { class: "d", text: item.detail })
        ]),
        GX.el("span", { class: "go", text: "Open" })
      ]);
      el.attn.appendChild(link);
    });
  }

  function renderKpis(stats) {
    el.kpis.textContent = "";
    if (!stats) {
      el.kpis.appendChild(GX.kpi("Requests", "-", "statistics unavailable"));
      el.kpis.appendChild(GX.kpi("Errors", "-", "statistics unavailable"));
      el.kpis.appendChild(GX.kpi("Tokens", "-", "statistics unavailable"));
      el.kpis.appendChild(GX.kpi("Estimated cost", "-", "statistics unavailable"));
      return;
    }
    var t = stats.totals || {};
    var requests = t.requests || 0;
    var errors = t.errors || 0;
    var share = requests > 0 ? ((errors / requests) * 100).toFixed(1) + "% of traffic" : "no traffic in range";
    el.kpis.appendChild(GX.kpi("Requests", GX.fmt.num(requests), "last 30 days"));
    el.kpis.appendChild(GX.kpi("Errors", GX.fmt.num(errors), share));
    el.kpis.appendChild(GX.kpi("Tokens", GX.fmt.compact(t.totalTokens), "prompt, output and cached"));
    el.kpis.appendChild(GX.kpi("Estimated cost", GX.fmt.money(t.costUsd), "projected " + GX.fmt.money(stats.projectedMonthlyUsd) + " per 30 days"));
  }

  function renderPlanMix(tiers) {
    el.planMix.textContent = "";
    var t = tiers || { free: 0, paid: 0, pro: 0, unknown: 0 };
    var total = (t.free || 0) + (t.paid || 0) + (t.pro || 0) + (t.unknown || 0);
    el.planMix.appendChild(GX.meter("Free tier", t.free || 0, total, "ok"));
    el.planMix.appendChild(GX.meter("Pay as you go", t.paid || 0, total, "info"));
    el.planMix.appendChild(GX.meter("AI Pro", t.pro || 0, total, "info"));
    el.planMix.appendChild(GX.meter("Unspecified", t.unknown || 0, total, "warn"));
  }

  function renderActivity(payload) {
    el.activity.textContent = "";
    var rows = payload && payload.rows ? payload.rows : [];
    if (!rows.length) {
      el.activity.appendChild(GX.state("empty", "No admin action yet", "Key changes and exports land here the moment they happen."));
      return;
    }
    rows.slice(0, 6).forEach(function (r) {
      var what = r.target ? r.target : "";
      if (r.detail && r.detail.updated !== undefined) what += " (" + r.detail.updated + " updated)";
      el.activity.appendChild(GX.el("div", { class: "feed-item" }, [
        GX.el("span", { class: "act", text: r.action }),
        GX.el("span", { class: "what", text: what }),
        GX.el("time", { text: GX.fmt.time(r.ts) })
      ]));
    });
  }

  function probeClass(status) {
    if (status === "ok") return "ok";
    if (status === "rate_limited" || status === "zero_quota" || status === "server_error") return "warn";
    return "bad";
  }

  function probeText(res) {
    if (!res) return "-";
    var label = String(res.status).replace(/_/g, " ");
    if (res.status === "ok") label = "serving";
    if (res.status === "rate_limited") label = "429, free in " + GX.fmt.left(res.retryAfterMs);
    return label + " (" + res.latencyMs + "ms)";
  }

  function writeUrl() {
    GX.url.write({ q: state.query, status: state.status, page: state.page > 1 ? state.page : "" });
  }

  function readUrl() {
    var params = GX.url.read();
    state.query = (params.q || "").toLowerCase();
    state.status = params.status || "";
    state.page = Number(params.page) || 1;
    if (el.keyFilter) el.keyFilter.value = params.q || "";
    if (el.keyStatus) el.keyStatus.value = params.status || "";
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
    el.poolMeta.textContent = state.keys.length + " keys · " + filtered.length + " shown";

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
      GX.el("th", { text: "Key" }),
      GX.el("th", { text: "Status" }),
      GX.el("th", { text: "Plan" }),
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
      var link = GX.el("a", { class: "link", href: "/pengatur/keys/" + encodeURIComponent(k.id), text: k.key });
      link.title = "id " + k.id;
      keyCell.appendChild(link);
      tr.appendChild(keyCell);

      var statusCell = GX.el("td", { "data-l": "status" });
      statusCell.appendChild(GX.tag(k.status, k.status === "ready" ? "ok" : k.status === "cooling" ? "warn" : "bad"));
      tr.appendChild(statusCell);

      var tierCell = GX.el("td", { "data-l": "plan" });
      tierCell.appendChild(GX.tag(tierLabel(k.tier || "unknown"), k.tier === "free" ? "ok" : k.tier === "unknown" ? "plain" : "info"));
      tr.appendChild(tierCell);

      GX.cell(tr, GX.fmt.left(k.cooldownLeftMs), "num", "cooldown");
      GX.cell(tr, GX.fmt.age(k.lastUsed), "", "last used");

      var probeCell = GX.el("td", { "data-l": "probe" });
      var known = state.testing[k.id];
      probeCell.appendChild(GX.el("span", { class: "mono", text: known ? probeText(known) : "-" }));
      tr.appendChild(probeCell);

      var actions = GX.el("td", { class: "actions" });
      var testBtn = GX.el("button", { class: "btn btn-sm", type: "button", text: "Test" });
      testBtn.addEventListener("click", function () { testKey(k, testBtn); });
      var delBtn = GX.el("button", { class: "btn btn-sm btn-danger", type: "button", text: "Remove" });
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
    el.keyPager.appendChild(GX.el("span", {
      text: "showing " + ((state.page - 1) * state.size + 1) + "-" +
        Math.min(total, state.page * state.size) + " of " + total
    }));

    var box = GX.el("div", { class: "pages" });
    function mk(label, page, disabled, active) {
      var b = GX.el("button", {
        class: active ? "active" : "",
        type: "button",
        text: label,
        disabled: disabled ? true : null
      });
      if (active) b.setAttribute("aria-current", "page");
      b.addEventListener("click", function () { state.page = page; writeUrl(); drawTable(); });
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
    if (!ids.length) return;
    if (control) control.disabled = true;
    GX.api("/pengatur/keys/tier", { method: "POST", body: { ids: ids, tier: tier } })
      .then(function (data) {
        GX.notice("Plan set to " + tierLabel(tier) + " for " + data.updated + " key(s).", "ok");
        return reload();
      })
      .catch(function (err) {
        GX.notice("Plan update failed: " + err.message, "err");
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
        GX.notice(k.key + ": " + data.probe.message + note, data.probe.status === "ok" ? "ok" : "");
        return reload();
      })
      .catch(function (err) {
        GX.notice("Test failed: " + err.message, "err");
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Test";
      });
  }

  function testAll() {
    GX.busy(el.testAllBtn, "Testing");
    el.testAllNote.textContent = "one live call per key, four at a time";
    GX.api("/pengatur/keys/test-all", { method: "POST" })
      .then(function (data) {
        var results = data.results || [];
        results.forEach(function (r) { state.testing[r.id] = r.probe; });
        var ok = results.filter(function (r) { return r.probe.status === "ok"; }).length;
        GX.notice("Probed " + data.tested + " keys, " + ok + " serving.", ok ? "ok" : "");
        return reload();
      })
      .catch(function (err) {
        GX.notice("Test all failed: " + err.message, "err");
      })
      .then(function () {
        GX.idle(el.testAllBtn);
        el.testAllNote.textContent = "one live call per key, four at a time";
      });
  }

  function removeKey(k, btn) {
    GX.confirm({
      title: "Remove this key?",
      message:
        "Remove " + k.key + " from the pool. The gateway stops serving with it. " +
        "It cannot be restored from this console, because the raw key never reaches the browser.",
      confirmLabel: "Remove key"
    }).then(function (ok) {
      if (!ok) return;
      removeKeyNow(k, btn);
    });
  }

  function removeKeyNow(k, btn) {
    btn.disabled = true;
    GX.api("/pengatur/keys", { method: "DELETE", body: { id: k.id } })
      .then(function (data) {
        GX.notice("Removed " + k.key + ". Pool total " + data.pool.total + ".", "ok");
        delete state.testing[k.id];
        return reload();
      })
      .catch(function (err) {
        btn.disabled = false;
        GX.notice("Remove failed: " + err.message, "err");
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
        GX.closeDialog(el.addDialog);
        GX.notice(
          data.added ? "Added " + data.added + " key(s) to the pool." : "No key was added.",
          data.added ? "ok" : "warn"
        );
        return reload();
      })
      .catch(function (err) {
        GX.say(el.addMsg, "Add failed: " + err.message, "err");
        GX.notice("Add failed: " + err.message, "err");
      })
      .then(function () { GX.idle(el.addSubmit); });
  }

  function refresh() {
    return Promise.all([
      GX.api("/pengatur/keys/list"),
      safe(GX.api("/pengatur/stats/data?range=30d")),
      safe(GX.api("/pengatur/audit/data?limit=6"))
    ]).then(function (res) {
      var pool = res[0].pool || {};
      state.keys = res[0].keys || [];
      state.tiers = res[0].tiers;
      renderHero(pool, state.tiers, res[1]);
      renderAttention(pool, state.tiers);
      renderKpis(res[1]);
      renderPlanMix(state.tiers);
      renderActivity(res[2]);
      drawTable();
      el.updated.textContent = "updated " + new Date().toLocaleTimeString("en-GB", { hour12: false });
      el.console.hidden = false;
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403) {
        GX.lock(err.message + " Re-enter the token.");
        throw err;
      }
      GX.notice("Refresh failed: " + err.message, "err");
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
  el.refreshBtn.addEventListener("click", function () { reload(); });
  el.addClose.addEventListener("click", function () { GX.closeDialog(el.addDialog); });
  el.addForm.addEventListener("submit", function (event) { event.preventDefault(); addKeys(); });
  el.newKeys.addEventListener("input", function () {
    var n = el.newKeys.value.split(/[\\s,]+/).filter(function (s) { return s.trim(); }).length;
    el.addCount.textContent = n ? n + " key" + (n === 1 ? "" : "s") + " detected" : "";
  });
  el.testAllBtn.addEventListener("click", testAll);
  el.auto.addEventListener("change", function () {
    if (el.auto.checked) startAuto(); else stopAuto();
  });
  el.keyFilter.addEventListener("input", GX.debounce(function () {
    state.query = el.keyFilter.value.trim().toLowerCase();
    state.page = 1;
    writeUrl();
    drawTable();
  }, 140));
  el.keyStatus.addEventListener("change", function () {
    state.status = el.keyStatus.value;
    state.page = 1;
    writeUrl();
    drawTable();
  });
  el.keySize.addEventListener("change", function () {
    state.size = Number(el.keySize.value) || 25;
    state.page = 1;
    drawTable();
  });

  GX.shortcuts({
    filter: "keyFilter",
    refresh: "refreshBtn",
    onEscape: function () {
      if (!state.query && !state.status) return;
      state.query = "";
      state.status = "";
      state.page = 1;
      el.keyFilter.value = "";
      el.keyStatus.value = "";
      writeUrl();
      drawTable();
    }
  });

  GX.gate({
    onSuccess: function () {
      readUrl();
      return refresh().then(function () { startAuto(); });
    }
  });
})();
`;

export const ADMIN_HTML = consolePage({
  title: "Overview",
  active: "/pengatur",
  actions:
    '<button id="refreshBtn" class="btn btn-sm" type="button">' +
    icon("refresh") +
    "Refresh</button>" +
    '<button id="addBtn" class="btn btn-sm btn-primary" type="button">' +
    icon("plus") +
    "Add keys</button>",
  body: OVERVIEW_BODY,
  script: OVERVIEW_SCRIPT,
});
