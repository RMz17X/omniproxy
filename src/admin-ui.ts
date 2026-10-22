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

import { confirmDialog, consolePage, icon, noticeBand } from "./ui.ts";

const OVERVIEW_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
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

  <div class="split">
    <section class="panel">
      <div class="panel-head">
        <h2>Plan mix</h2>
        <span class="meta">declared per key</span>
      </div>
      <div class="panel-body">
        <div class="bars" id="planMix"></div>
        <p class="hint u-mt-4">Google never reports a project plan over the API. Declare it on the Keys page; the models page prices a test run against it.</p>
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
    addDialog: document.getElementById("addDialog"),
    addClose: document.getElementById("addClose"),
    addForm: document.getElementById("addForm"),
    addSubmit: document.getElementById("addSubmit"),
    addBtn: document.getElementById("addBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    newKeys: document.getElementById("newKeys"),
    addCount: document.getElementById("addCount"),
    addMsg: document.getElementById("addMsg"),
    planMix: document.getElementById("planMix"),
    activity: document.getElementById("activity")
  };

  var state = { tiers: null, timer: null };


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
    el.facts.appendChild(GX.stat("Plans declared", String(declared), pool.total ? "of " + pool.total + " keys" : "the pool is empty"));

    el.chips.textContent = "";
    if (stats) {
      el.chips.appendChild(GX.chip("p95", GX.fmt.num(stats.totals.p95Ms) + " ms"));
      el.chips.appendChild(GX.chip("30 day cost", GX.fmt.money(stats.totals.costUsd)));
      el.chips.appendChild(GX.chip("projected per 30 days", GX.fmt.money(stats.projectedMonthlyUsd)));
    }
    el.healthMeta.textContent = pool.degraded ? "degraded, serving from memory" : pool.storage + " storage";

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

  function testAll() {
    GX.busy(el.testAllBtn, "Testing");
    el.testAllNote.textContent = "one live call per key, four at a time";
    GX.api("/pengatur/keys/test-all", { method: "POST" })
      .then(function (data) {
        var results = data.results || [];
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
      state.tiers = res[0].tiers;
      renderHero(pool, state.tiers, res[1]);
      renderAttention(pool, state.tiers);
      renderKpis(res[1]);
      renderPlanMix(state.tiers);
      renderActivity(res[2]);
      el.updated.textContent = "updated " + new Date().toLocaleTimeString("en-GB", { hour12: false });
      el.console.hidden = false;
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403) {
        GX.lock(err.message + " Re-enter the token.");
        throw err;
      }
      /* A failed load left #console hidden, so the operator got a blank page
         plus a toast and no way to retry except reloading the whole app.
         Paint the failure into the console footprint, like the list page does,
         and offer the retry where the data would be. */
      el.console.hidden = false;
      el.console.textContent = "";
      var box = GX.el("div", { class: "panel-body" }, [
        GX.state("error", "Could not load the overview", err.message),
        GX.el("div", { class: "u-mt-3" }, [
          GX.el("button", { class: "btn btn-sm", type: "button", text: "Try again", onclick: function () { reload(); } })
        ])
      ]);
      el.console.appendChild(box);
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

  GX.shortcuts({
    refresh: "refreshBtn"
  });

  GX.gate({
    onSuccess: function () {
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
