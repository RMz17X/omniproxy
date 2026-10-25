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

import { consolePage, icon, noticeBand } from "./ui.ts";

const OVERVIEW_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <h1 class="page-title">Overview</h1>
      <p class="page-lede">Whether the pool can serve right now, what is blocking it, and what the traffic is doing.</p>
    </div>
  </header>

  <section class="panel">
    <div class="panel-body">
      <div class="verdict">
        <span class="verdict-dot" id="verdictDot" data-tone="ok"></span>
        <strong id="verdictText">-</strong>
        <span class="meta" id="verdictState">-</span>
        <span class="spacer"></span>
        <label class="check"><input id="auto" type="checkbox" checked> Refresh every 15s</label>
        <span class="meta" id="updated">-</span>
      </div>
    </div>
  </section>

  <div class="figures" id="poolKpis"></div>

  <div class="figures" id="kpis"></div>

  <section class="panel">
    <div class="panel-head">
      <h2>Needs attention</h2>
      <span class="meta" id="attnMeta">-</span>
    </div>
    <div class="feed" id="attn"></div>
    <div class="panel-foot" id="attnFoot">
      <button id="testAllBtn" class="btn btn-sm" type="button">${icon("test")}Test all live keys</button>
      <span class="meta" id="testAllNote">one live call per key, four at a time</span>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <h2>Pool health</h2>
      <span class="meta" id="healthMeta">-</span>
    </div>
    <div class="panel-body">
      <div id="poolBar" class="u-mb-3"></div>
      <div id="providerPools" class="u-mt-3"></div>
    </div>
  </section>

  <div class="split">
    <section class="panel">
      <div class="panel-head">
        <h2>Traffic trend</h2>
        <span class="meta">daily, WIB</span>
      </div>
      <div class="panel-body">
        <div id="providerDays"></div>
        <div class="bars u-mt-3" id="providerMix"></div>
        <div class="meta u-mt-2" id="providerTotal"></div>
        <p class="hint u-mt-2">Split by the provider recorded in the request ledger.</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Plan mix</h2>
        <span class="meta" id="planDeclared">-</span>
      </div>
      <div class="panel-body">
        <div class="bars" id="planMix"></div>
        <p class="hint u-mt-2" id="planPct"></p>
        <p class="hint u-mt-2">Plans are declared by the operator: no provider reports a project plan over the API, so declare it on the Keys page; the models page prices a test run against it.</p>
      </div>
    </section>
  </div>

  <section class="panel">
    <div class="panel-head">
      <h2>Recent activity</h2>
      <a class="meta" href="/pengatur/audit">audit log</a>
    </div>
    <div class="feed" id="activity"></div>
  </section>

  <section class="panel">
    <div class="panel-body">
      <div class="row">
        <button id="addBtnFoot" class="btn btn-sm btn-primary" type="button">${icon("plus")}Add keys</button>
        <a class="btn btn-sm" href="/pengatur/keys">View keys</a>
        <button id="testAllBtnFoot" class="btn btn-sm" type="button">${icon("test")}Test all live keys</button>
        <span class="meta" id="testAllNoteFoot">one live call per key, four at a time</span>
      </div>
    </div>
  </section>
</div>

<dialog id="addDialog" aria-labelledby="addTitle">
  <form id="addForm" method="dialog">
    <div class="card-head">
      <h2 id="addTitle">Add keys</h2>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm icon-btn" type="button" id="addClose" aria-label="Close">${icon("close")}</button>
    </div>
    <div class="panel-body">
      <label class="field" for="newKeys">One key per line, or separated by commas</label>
      <textarea id="newKeys" class="textarea" spellcheck="false" placeholder="key one&#10;key two"></textarea>
      <div class="row u-mt-3">
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
    verdictText: document.getElementById("verdictText"),
    verdictState: document.getElementById("verdictState"),
    verdictDot: document.getElementById("verdictDot"),
    poolKpis: document.getElementById("poolKpis"),
    healthMeta: document.getElementById("healthMeta"),
    attn: document.getElementById("attn"),
    attnMeta: document.getElementById("attnMeta"),
    attnFoot: document.getElementById("attnFoot"),
    testAllBtn: document.getElementById("testAllBtn"),
    auto: document.getElementById("auto"),
    testAllNote: document.getElementById("testAllNote"),
    kpis: document.getElementById("kpis"),
    addDialog: document.getElementById("addDialog"),
    addClose: document.getElementById("addClose"),
    addForm: document.getElementById("addForm"),
    addSubmit: document.getElementById("addSubmit"),
    addBtn: document.getElementById("addBtn"),
    addBtnFoot: document.getElementById("addBtnFoot"),
    testAllBtnFoot: document.getElementById("testAllBtnFoot"),
    testAllNoteFoot: document.getElementById("testAllNoteFoot"),
    refreshBtn: document.getElementById("refreshBtn"),
    newKeys: document.getElementById("newKeys"),
    addCount: document.getElementById("addCount"),
    addMsg: document.getElementById("addMsg"),
    planMix: document.getElementById("planMix"),
    planDeclared: document.getElementById("planDeclared"),
    planPct: document.getElementById("planPct"),
    providerMix: document.getElementById("providerMix"),
    providerDays: document.getElementById("providerDays"),
    providerTotal: document.getElementById("providerTotal"),
    providerPools: document.getElementById("providerPools"),
    activity: document.getElementById("activity")
  };

  var state = { tiers: null, timer: null };


  function safe(promise) {
    return promise.catch(function () { return null; });
  }

  function renderHero(pool, tiers, stats) {
    if (el.poolBar) {
      el.poolBar.textContent = "";
      el.poolBar.appendChild(GX.poolBar([
        { label: "ready", value: pool.ready, tone: "ok" },
        { label: "cooling", value: pool.cooling, tone: "warn" },
        { label: "dead", value: pool.dead, tone: "bad" }
      ]));
    }

    /* The verdict strip is the one-line answer: dot tone, counts, state word.
       The pool KPI cards below carry the same census as figures. */
    var ready = pool.ready || 0;
    var cooling = pool.cooling || 0;
    var dead = pool.dead || 0;
    var total = pool.total || 0;
    el.verdictText.textContent = "Ready " + ready + "/" + total + " · " + cooling + " cooling · " + dead + " dead";
    el.verdictState.textContent = pool.degraded ? "Degraded" : "Ready";
    el.verdictDot.setAttribute("data-tone", dead > 0 ? "bad" : cooling > 0 ? "warn" : "ok");
    el.healthMeta.textContent = pool.degraded
      ? "Degraded · " + dead + " dead · " + cooling + " cooling"
      : "Ready";

    /* Per-provider pool health. A multi-provider gateway is only as healthy
       as its weakest pool, so each provider gets its own bar and count. */
    el.providerPools.textContent = "";
    var byProvider = pool.byProvider || pool.providers || {};
    var provNames = Object.keys(byProvider).sort(function (a, b) {
      if (a === b) return 0;
      return a === "gemini" ? -1 : b === "gemini" ? 1 : a < b ? -1 : 1;
    });
    provNames.forEach(function (prov) {
      el.providerPools.appendChild(GX.providerPool(prov, byProvider[prov]));
    });
  }

  /* The pool as a row of figure cards: the census an operator checks first,
     each number on its own surface instead of one full-width strip. */
  function renderPoolKpis(pool, tiers) {
    el.poolKpis.textContent = "";
    var ready = pool.ready || 0;
    var cooling = pool.cooling || 0;
    var dead = pool.dead || 0;
    var total = pool.total || 0;
    el.poolKpis.appendChild(GX.stat("Ready now", String(ready), total ? "of " + total + " in the pool" : "the pool is empty", ready ? "ok" : "bad"));
    el.poolKpis.appendChild(GX.stat("Cooling", String(cooling), cooling ? "next free in " + GX.fmt.left(pool.soonestReadyMs) : "none parked", cooling ? "warn" : ""));
    el.poolKpis.appendChild(GX.stat("Dead", String(dead), dead ? "revoked or out of quota" : "none retired", dead ? "bad" : ""));
    var t = tiers || { free: 0, paid: 0, pro: 0, unknown: 0 };
    var declared = (t.free || 0) + (t.paid || 0) + (t.pro || 0);
    var keys = declared + (t.unknown || 0);
    el.poolKpis.appendChild(GX.stat(
      "Plans declared",
      declared + "/" + keys,
      t.unknown ? t.unknown + " without a plan" : "every key declares a plan",
      t.unknown ? "warn" : "ok"
    ));
  }

  function renderAttention(pool, tiers) {
    var items = [];
    /* Per provider where the census allows it: "2 gemini keys are dead" is
       actionable, "5 keys are dead" across two pools is not. */
    var byProvider = pool.byProvider || pool.providers || {};
    var provNames = Object.keys(byProvider).sort(function (a, b) {
      if (a === b) return 0;
      return a === "gemini" ? -1 : b === "gemini" ? 1 : a < b ? -1 : 1;
    });
    provNames.forEach(function (prov) {
      var p = byProvider[prov] || {};
      if (p.dead > 0) {
        items.push({
          tone: "bad",
          title: p.dead + (p.dead === 1 ? " " + prov + " key is dead" : " " + prov + " keys are dead"),
          detail: "Revoked or out of quota. Remove them to shrink the pool.",
          href: "/pengatur/keys?provider=" + encodeURIComponent(prov)
        });
      }
      if (p.cooling > 0) {
        items.push({
          tone: "warn",
          title: p.cooling + (p.cooling === 1 ? " " + prov + " key is cooling" : " " + prov + " keys are cooling"),
          detail: "Free tier quota is exhausted. Longest wait is " + GX.fmt.left(pool.soonestReadyMs) + ".",
          href: "/pengatur/keys?provider=" + encodeURIComponent(prov)
        });
      }
    });
    /* No per-provider census (older server): fall back to the global counts. */
    if (!provNames.length) {
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
    /* The head meta counts the items; the feed keeps its rows in both states.
       An all-clear panel is one row, not a header with a floating hairline
       and 16px of empty card below it — the spacing stays identical whether
       the pool needs attention or not. Test all stays reachable from the
       footer actions row, so collapsing the foot here loses no action. */
    el.attnMeta.textContent = items.length
      ? items.length + (items.length === 1 ? " item" : " items")
      : "all clear";
    el.attn.hidden = false;
    el.attnFoot.hidden = !items.length;
    if (!items.length) {
      el.attn.appendChild(GX.el("div", { class: "attn-item" }, [
        GX.el("span", { class: "dot", style: "background:var(--ok)" }),
        GX.el("span", null, [
          GX.el("span", { class: "t", text: "Nothing needs attention" }),
          GX.el("span", { class: "d", text: "Every key is ready and every plan is declared." })
        ])
      ]));
      return;
    }
    items.forEach(function (item) {
      /* "info" is a runtime tone with no CSS variable of its own; the dot
         reads it as the accent colour. */
      var dotTone = item.tone === "info" ? "accent" : item.tone;
      var link = GX.el("a", { class: "attn-item", href: item.href }, [
        GX.el("span", { class: "dot", style: "background:var(--" + dotTone + ")" }),
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
      el.kpis.appendChild(GX.kpi("p95", "-", "statistics unavailable"));
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
    /* p95 moved here from the pool chips: latency belongs with the traffic
       figures, not with the pool census. */
    el.kpis.appendChild(GX.kpi("p95", GX.fmt.num(t.p95Ms) + " ms", "95th percentile response time"));
  }

  /* Provider split: aggregate meters + one stacked bar per WIB day. Each
     provider carries its own colour, so the split reads the same everywhere
     in the console. Bars stay plain CSS so a failed stats fetch degrades to
     the "unavailable" state, never a broken canvas. Known providers get
     their registry colour; anything else falls back to the custom accent. */
  function provTone(prov) {
    if (prov === "gemini") return "prov-gemini";
    if (prov === "elevenlabs") return "prov-elevenlabs";
    if (prov === "whatstoken") return "prov-whatstoken";
    return "prov-custom";
  }

  function renderProviderMix(stats) {
    el.providerMix.textContent = "";
    el.providerDays.textContent = "";
    if (!stats) {
      el.providerMix.appendChild(GX.state("empty", "Statistics unavailable", "The stats endpoint did not answer."));
      el.providerTotal.textContent = "";
      return;
    }
    var buckets = stats.byProvider || [];
    var total = 0;
    buckets.forEach(function (b) { total += b.requests; });
    if (!total) {
      el.providerMix.appendChild(GX.state("empty", "No traffic in this range", "Nothing was routed in the last 30 days."));
      el.providerTotal.textContent = "Total 0 requests in the last 30 days";
      return;
    }
    var byProv = {};
    buckets.forEach(function (b) { byProv[b.key] = b.requests; });
    var order = Object.keys(byProv).sort(function (a, b) {
      if (a === b) return 0;
      return a === "gemini" ? -1 : b === "gemini" ? 1 : a < b ? -1 : 1;
    });
    order.forEach(function (prov) {
      el.providerMix.appendChild(GX.meter(GX.providerLabel(prov), byProv[prov] || 0, total, provTone(prov)));
    });
    el.providerTotal.textContent = "Total " + GX.fmt.num(total) + " requests in the last 30 days";

    var days = stats.byProviderDay || [];
    if (!days.length) return;
    var byDay = {};
    var maxDay = 0;
    days.forEach(function (r) {
      if (!byDay[r.day]) byDay[r.day] = {};
      byDay[r.day][r.provider] = (byDay[r.day][r.provider] || 0) + r.requests;
      var sum = 0;
      order.forEach(function (p) { sum += byDay[r.day][p] || 0; });
      if (sum > maxDay) maxDay = sum;
    });
    var chart = GX.el("div", { class: "daybars", role: "img", "aria-label": "requests per day by provider" });
    Object.keys(byDay).sort().forEach(function (day) {
      var col = GX.el("div", { class: "daybar", title: day + " · " + order.map(function (p) { return GX.providerLabel(p) + " " + (byDay[day][p] || 0); }).join(" · ") });
      order.forEach(function (p) {
        col.appendChild(GX.el("span", { class: provTone(p), style: "height:" + (maxDay ? (((byDay[day][p] || 0) / maxDay) * 100).toFixed(1) : 0) + "%" }));
      });
      col.appendChild(GX.el("span", { class: "daybar-label", text: day.slice(5) }));
      chart.appendChild(col);
    });
    el.providerDays.appendChild(chart);
    var legend = GX.el("div", { class: "legend" });
    order.forEach(function (p) {
      var n = byProv[p] || 0;
      var pct = total ? ((n / total) * 100).toFixed(1) : "0.0";
      legend.appendChild(GX.el("span", { class: "legend-item" }, [
        GX.el("span", { class: "dot " + provTone(p) }),
        GX.el("span", { text: GX.providerLabel(p) }),
        GX.el("b", { text: GX.fmt.num(n) + " (" + pct + "%)" })
      ]));
    });
    el.providerDays.appendChild(legend);
  }

  function renderPlanMix(tiers) {
    el.planMix.textContent = "";
    var t = tiers || { free: 0, paid: 0, pro: 0, unknown: 0 };
    var total = (t.free || 0) + (t.paid || 0) + (t.pro || 0) + (t.unknown || 0);
    el.planMix.appendChild(GX.meter("Free tier", t.free || 0, total, "ok"));
    el.planMix.appendChild(GX.meter("Pay as you go", t.paid || 0, total, "info"));
    el.planMix.appendChild(GX.meter("AI Pro / Ultra", t.pro || 0, total, "info"));
    el.planMix.appendChild(GX.meter("Unspecified", t.unknown || 0, total, "warn"));
    /* Plans declared moved here from the pool hero: the count belongs with
       the mix it summarises. Meters carry no % text, so the shares are
       written out in full below them. */
    var declared = (t.free || 0) + (t.paid || 0) + (t.pro || 0);
    el.planDeclared.textContent = total ? declared + " of " + total + " keys declared" : "the pool is empty";
    if (!total) {
      el.planPct.textContent = "No keys in the pool";
      return;
    }
    el.planPct.textContent = [
      ["Free tier", t.free || 0],
      ["Pay as you go", t.paid || 0],
      ["AI Pro / Ultra", t.pro || 0],
      ["Unspecified", t.unknown || 0]
    ].map(function (row) {
      return row[0] + " " + ((row[1] / total) * 100).toFixed(1) + "%";
    }).join(" · ");
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
        /* Same actor row the audit page uses: a time-only stamp hid which
           day a cross-day event happened on, so the full stamp lands here. */
        GX.el("span", { class: "what meta", text: r.actor ? "by " + r.actor : "by unknown actor" }),
        GX.el("time", { text: GX.fmt.stamp(r.ts) })
      ]));
    });
  }

  function testAll(btn, note) {
    btn = btn || el.testAllBtn;
    note = note || el.testAllNote;
    GX.busy(btn, "Testing…");
    note.textContent = "one live call per key, four at a time";
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
        GX.idle(btn);
        note.textContent = "one live call per key, four at a time";
      });
  }

  function addKeys() {
    var raw = el.newKeys.value;
    var keys = raw.split(/[\\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!keys.length) { GX.say(el.addMsg, "Nothing to add.", "err"); return; }
    GX.busy(el.addSubmit, "Adding…");
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
      renderPoolKpis(pool, state.tiers);
      renderAttention(pool, state.tiers);
      renderKpis(res[1]);
      renderProviderMix(res[1]);
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

  function openAdd() {
    GX.say(el.addMsg, "");
    GX.openDialog(el.addDialog);
    if (el.newKeys) el.newKeys.focus();
  }

  el.addBtn.addEventListener("click", openAdd);
  el.addBtnFoot.addEventListener("click", openAdd);
  el.refreshBtn.addEventListener("click", function () { reload(); });
  el.addClose.addEventListener("click", function () { GX.closeDialog(el.addDialog); });
  el.addForm.addEventListener("submit", function (event) { event.preventDefault(); addKeys(); });
  el.newKeys.addEventListener("input", function () {
    var n = el.newKeys.value.split(/[\\s,]+/).filter(function (s) { return s.trim(); }).length;
    el.addCount.textContent = n ? n + " key" + (n === 1 ? "" : "s") + " detected" : "";
  });
  el.testAllBtn.addEventListener("click", function () { testAll(); });
  el.testAllBtnFoot.addEventListener("click", function () {
    GX.confirm({
      title: "Test all live keys?",
      message: "One live call per key, four at a time.",
      confirmLabel: "Test all live keys"
    }).then(function (ok) {
      if (ok) testAll(el.testAllBtnFoot, el.testAllNoteFoot);
    });
  });
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
