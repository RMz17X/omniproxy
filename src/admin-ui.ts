/**
 * Admin console shell, served at GET /pengatur.
 *
 * Dials: ENERGY calm-utilitarian, RHYTHM dense rows over generous section
 * padding, MOTION one 120ms fade on row state change and a live cooldown
 * countdown (functional: it tells you when a key returns to the pool).
 *
 * The shell carries no data. It asks for the admin token, stores it in
 * localStorage, and renders from /pengatur/keys. Every mutation addresses a key
 * by its sha256 id, so the browser never holds a raw credential.
 */

import { BASE_CSS, stateBlock } from "./ui.ts";

export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>GeminesX control</title>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/favicon.svg">
<style>${BASE_CSS}</style>
</head>
<body>

<header class="topbar">
  <a class="wordmark" href="/pengatur">GeminesX</a>
  <nav class="nav">
    <a href="/pengatur" class="active" aria-current="page">Keys</a>
    <a href="/pengatur/usage">Usage</a>
    <a href="/pengatur/models">Models</a>
  </nav>
  <div class="meta">
    <span id="storage">storage: -</span>
    <span id="synced">-</span>
  </div>
</header>

<main class="page">

  <div class="page-head">
    <h1>Keys</h1>
    <span class="meta">Pool health, key intake, live probe</span>
  </div>

  <!-- auth -->
  <section id="authPanel" class="panel">
    <div class="panel-body">
      <label class="field" for="token">Admin token</label>
      <div class="row">
        <div class="grow">
          <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="ADMIN_TOKEN">
        </div>
        <button id="connect" class="btn btn-primary" type="button">Connect</button>
      </div>
      <div id="authHint" class="msg err"></div>
      <p class="dimtext" style="margin-top:12px">The token stays in this browser. It is never sent anywhere except this deployment.</p>
    </div>
  </section>

  <!-- health strip -->
  <section id="statsPanel" hidden>
    <div class="strip">
      <div class="kv"><b id="sTotal">0</b><span class="k">keys</span></div>
      <div class="kv ready"><b id="sReady">0</b><span class="k">ready</span></div>
      <div class="kv cooling"><b id="sCooling">0</b><span class="k">cooling</span></div>
      <div class="kv dead"><b id="sDead">0</b><span class="k">dead</span></div>
      <div class="kv" id="tierStrip" title="Declared billing plan per key. Drives the pricing column on /pengatur/models."><b id="sTier">-</b><span class="k">plans</span></div>
      <div class="spacer"></div>
      <div class="meta" id="nextReady">-</div>
    </div>
  </section>

  <!-- add -->
  <section id="addPanel" class="panel" hidden>
    <div class="panel-head"><div class="panel-title">Add keys</div></div>
    <div class="panel-body">
      <label class="field" for="newKeys">One key per line, or separated by commas</label>
      <textarea id="newKeys" spellcheck="false" placeholder="key one&#10;key two"></textarea>
      <div class="row" style="margin-top:12px">
        <button id="addBtn" class="btn btn-primary" type="button">Add to pool</button>
        <span id="addCount" class="muted"></span>
      </div>
      <div id="addMsg" class="msg"></div>
    </div>
  </section>

  <!-- keys -->
  <section id="keysPanel" class="panel" hidden>
    <div class="panel-head">
      <div class="panel-title">Pool <span class="meta" id="testAllNote"></span></div>
      <button id="testAllBtn" class="btn" type="button">Test all live keys</button>
    </div>
    <div class="panel-body">
      <div class="row">
        <div class="grow">
          <input id="keyFilter" type="text" spellcheck="false" placeholder="Filter by key, id or status...">
        </div>
        <select id="keySize" aria-label="Keys per page">
          <option value="10">10 / page</option>
          <option value="25" selected>25 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </select>
      </div>
    </div>
    <div id="keysBody" class="tablewrap">${stateBlock("loading", "Loading pool...")}</div>
    <div class="panel-body">
      <div id="keyPager" class="pager"></div>
      <div id="keyMsg" class="msg"></div>
    </div>
    <div class="foot">
      <label class="check"><input id="auto" type="checkbox" checked> Auto refresh every 5s</label>
      <button id="forget" class="small" type="button">Forget token</button>
    </div>
  </section>

</main>

<script>
(function () {
  "use strict";
  var STORE = "geminesx.admin.token";

  var el = {
    authPanel: document.getElementById("authPanel"),
    authHint: document.getElementById("authHint"),
    token: document.getElementById("token"),
    connect: document.getElementById("connect"),
    statsPanel: document.getElementById("statsPanel"),
    addPanel: document.getElementById("addPanel"),
    keysPanel: document.getElementById("keysPanel"),
    sTotal: document.getElementById("sTotal"),
    sReady: document.getElementById("sReady"),
    sCooling: document.getElementById("sCooling"),
    sDead: document.getElementById("sDead"),
    sTier: document.getElementById("sTier"),
    nextReady: document.getElementById("nextReady"),
    storage: document.getElementById("storage"),
    synced: document.getElementById("synced"),
    newKeys: document.getElementById("newKeys"),
    addBtn: document.getElementById("addBtn"),
    addCount: document.getElementById("addCount"),
    addMsg: document.getElementById("addMsg"),
    keysBody: document.getElementById("keysBody"),
    keyFilter: document.getElementById("keyFilter"),
    keySize: document.getElementById("keySize"),
    keyPager: document.getElementById("keyPager"),
    keyMsg: document.getElementById("keyMsg"),
    testAllBtn: document.getElementById("testAllBtn"),
    testAllNote: document.getElementById("testAllNote"),
    auto: document.getElementById("auto"),
    forget: document.getElementById("forget")
  };

  var state = { token: "", keys: [], busy: false, timer: null, tick: null, testing: {}, page: 1, size: 25, query: "", tiers: null };

  // Billing plan declaration. Google never reports a project's plan over the
  // API, so the operator states it here and the models page prices against it.
  var TIERS = [
    { value: "unknown", label: "Unspecified" },
    { value: "free", label: "Free tier" },
    { value: "paid", label: "Pay-as-you-go" },
    { value: "pro", label: "AI Pro / Ultra" }
  ];

  function setTier(ids, tier, control) {
    if (!ids.length) { say(el.keyMsg, "Nothing to update.", "err"); return; }
    if (control) control.disabled = true;
    api("/pengatur/keys/tier", { method: "POST", body: { ids: ids, tier: tier } })
      .then(function (data) {
        var label = (TIERS.filter(function (t) { return t.value === tier; })[0] || {}).label || tier;
        say(el.keyMsg, "Plan set to " + label + " for " + data.updated + " key(s).", "ok");
        state.tiers = data.tiers;
        if (data.tiers) paintTiers();
        return refresh();
      })
      .catch(function (err) {
        say(el.keyMsg, "Plan update failed: " + err.message, "err");
      })
      .then(function () { if (control) control.disabled = false; });
  }

  function paintTiers() {
    var t = state.tiers || {};
    var parts = [];
    if (t.free) parts.push(t.free + " free");
    if (t.paid) parts.push(t.paid + " paid");
    if (t.pro) parts.push(t.pro + " pro");
    if (t.unknown) parts.push(t.unknown + " unset");
    el.sTier.textContent = parts.length ? parts.join(" / ") : "-";
  }

  function say(node, text, kind) {
    node.className = "msg " + (kind || "info");
    node.textContent = text;
    node.classList.add("show");
  }
  function hide(node) { node.classList.remove("show"); node.textContent = ""; }

  function api(path, opts) {
    opts = opts || {};
    var headers = { "authorization": "Bearer " + state.token };
    if (opts.body) headers["content-type"] = "application/json";
    return fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (raw) {
        var data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function fmtAge(ms) {
    if (!ms) return "never";
    var d = Date.now() - ms;
    if (d < 0) d = 0;
    var s = Math.floor(d / 1000);
    if (s < 60) return s + "s ago";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }
  function fmtLeft(ms) {
    if (!ms || ms <= 0) return "0s";
    var s = Math.ceil(ms / 1000);
    if (s < 60) return s + "s";
    var m = Math.floor(s / 60), r = s % 60;
    if (m < 60) return r ? m + "m " + r + "s" : m + "m";
    var h = Math.floor(m / 60);
    return h + "h " + (m % 60) + "m";
  }

  function renderStats(pool) {
    el.sTotal.textContent = pool.total;
    el.sReady.textContent = pool.ready;
    el.sCooling.textContent = pool.cooling;
    el.sDead.textContent = pool.dead;
    el.storage.textContent = "storage: " + pool.storage + (pool.degraded ? " (degraded)" : "");
    el.synced.textContent = "synced " + new Date().toLocaleTimeString();
    el.nextReady.textContent = pool.cooling > 0
      ? "next key free in " + fmtLeft(pool.soonestReadyMs)
      : (pool.ready > 0 ? "all ready keys selectable" : "no key can serve right now");
  }

  function cell(label, cls) {
    var td = document.createElement("td");
    if (cls) td.className = cls;
    if (label) td.setAttribute("data-l", label);
    return td;
  }

  function probeClass(status) {
    if (status === "ok") return "ok";
    if (status === "rate_limited" || status === "zero_quota" || status === "server_error") return "warn";
    return "bad";
  }
  function probeText(res) {
    var label = res.status.replace(/_/g, " ");
    if (res.status === "ok") label = "serving";
    if (res.status === "rate_limited") label = "429, free in " + fmtLeft(res.retryAfterMs);
    return label + " (" + res.latencyMs + "ms)";
  }

  function renderKeys(keys) {
    state.keys = keys;
    drawTable();
  }

  /**
   * Draw one page of the pool. Pagination is client-side: the admin endpoint
   * already returns the whole pool in one request, so slicing here keeps the
   * 5s auto-refresh from re-fetching per page.
   */
  function drawTable() {
    var keys = state.keys;
    if (!keys.length) {
      el.keysBody.innerHTML = "";
      var box = document.createElement("div");
      box.className = "empty";
      var b = document.createElement("b");
      b.textContent = "Pool is empty";
      box.appendChild(b);
      box.appendChild(document.createTextNode("Add keys above, or set GEMINI_API_KEYS on the deployment."));
      el.keysBody.appendChild(box);
      return;
    }

    var filtered = keys.filter(function (k) {
      if (!state.query) return true;
      return (k.key + " " + k.id + " " + k.status).toLowerCase().indexOf(state.query) >= 0;
    });

    if (!filtered.length) {
      el.keysBody.innerHTML = "";
      var nbox = document.createElement("div");
      nbox.className = "empty";
      var nb = document.createElement("b");
      nb.textContent = "No key matches this filter";
      nbox.appendChild(nb);
      nbox.appendChild(document.createTextNode("Clear the filter box to see the whole pool."));
      el.keysBody.appendChild(nbox);
      renderPager(0, 1);
      return;
    }

    var pages = Math.max(1, Math.ceil(filtered.length / state.size));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * state.size;
    var slice = filtered.slice(start, start + state.size);

    var table = document.createElement("table");
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Key</th><th>Status</th><th>Plan</th><th class='right'>Fails</th><th class='right'>Cooldown</th><th>Last used</th><th>Probe</th><th></th></tr>";
    table.appendChild(thead);
    var tbody = document.createElement("tbody");

    slice.forEach(function (k) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-id", k.id);

      var cKey = cell("Key", "key");
      var code = document.createElement("span");
      code.className = "mono";
      code.textContent = k.key;
      code.title = "id " + k.id;
      cKey.appendChild(code);

      var cStatus = cell("Status");
      var badge = document.createElement("span");
      badge.className = "badge " + k.status;
      badge.textContent = k.status;
      cStatus.appendChild(badge);

      // Plan is an operator declaration, not an upstream fact; the select is the
      // input, the stored value is what /pengatur/models prices against.
      var cTier = cell("Plan");
      var tierSel = document.createElement("select");
      tierSel.className = "tier";
      tierSel.setAttribute("aria-label", "Billing plan for " + k.key);
      TIERS.forEach(function (t) {
        var o = document.createElement("option");
        o.value = t.value;
        o.textContent = t.label;
        if ((k.tier || "unknown") === t.value) o.selected = true;
        tierSel.appendChild(o);
      });
      tierSel.addEventListener("change", function () { setTier([k.id], tierSel.value, tierSel); });
      cTier.appendChild(tierSel);

      var cFail = cell("Fails", "right num");
      cFail.textContent = k.failures;

      var cCool = cell("Cooldown", "right");
      var wrapCool = document.createElement("span");
      wrapCool.className = "cool num";
      var left = document.createElement("span");
      left.className = "left";
      left.textContent = fmtLeft(k.cooldownLeftMs);
      var bar = document.createElement("span");
      bar.className = "bar";
      var fill = document.createElement("i");
      var totalCd = Math.max(k.cooldownLeftMs, 1);
      fill.style.width = k.cooldownLeftMs > 0 ? "100%" : "0%";
      bar.appendChild(fill);
      wrapCool.appendChild(left);
      wrapCool.appendChild(bar);
      cCool.appendChild(wrapCool);

      var cUsed = cell("Last used");
      cUsed.textContent = fmtAge(k.lastUsed);

      var cProbe = cell("Probe");
      var pv = document.createElement("span");
      pv.className = "probe";
      var known = state.testing[k.id];
      if (known) {
        pv.className = "probe " + probeClass(known.status);
        pv.textContent = probeText(known);
      } else {
        pv.textContent = "-";
      }
      cProbe.appendChild(pv);

      var cAct = cell(null, "actions");
      var testBtn = document.createElement("button");
      testBtn.type = "button";
      testBtn.className = "small";
      testBtn.textContent = "Test";
      testBtn.addEventListener("click", function () { testKey(k, testBtn, pv); });

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "small danger";
      delBtn.textContent = "Remove";
      delBtn.addEventListener("click", function () { removeKey(k, delBtn); });

      cAct.appendChild(testBtn);
      cAct.appendChild(delBtn);

      tr.appendChild(cKey); tr.appendChild(cStatus); tr.appendChild(cTier); tr.appendChild(cFail);
      tr.appendChild(cCool); tr.appendChild(cUsed); tr.appendChild(cProbe); tr.appendChild(cAct);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    el.keysBody.innerHTML = "";
    el.keysBody.appendChild(table);
    renderPager(filtered.length, pages);
    startTicker();
  }

  /** Numbered pager with a sliding window; Prev/Next never wrap around. */
  function renderPager(total, pages) {
    el.keyPager.innerHTML = "";
    if (!total) return;

    var start = (state.page - 1) * state.size + 1;
    var end = Math.min(total, state.page * state.size);

    var info = document.createElement("span");
    info.textContent = "Showing " + start + "-" + end + " of " + total + " keys";
    el.keyPager.appendChild(info);

    var box = document.createElement("div");
    box.className = "pages";

    function mk(label, page, disabled, active) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "small" + (active ? " active" : "");
      b.textContent = label;
      b.disabled = Boolean(disabled);
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
      if (from > 2) {
        var d = document.createElement("span");
        d.textContent = "...";
        box.appendChild(d);
      }
    }
    for (var p = from; p <= to; p++) box.appendChild(mk(String(p), p, false, p === state.page));
    if (to < pages) {
      if (to < pages - 1) {
        var d2 = document.createElement("span");
        d2.textContent = "...";
        box.appendChild(d2);
      }
      box.appendChild(mk(String(pages), pages, false, state.page === pages));
    }

    box.appendChild(mk("Next", state.page + 1, state.page === pages, false));
    el.keyPager.appendChild(box);
  }

  /**
   * Cooldown cells drain between polls. Recomputing from the last sync keeps
   * the display honest without extra requests.
   */
  function startTicker() {
    if (state.tick) return;
    state.tick = setInterval(function () {
      var rows = el.keysBody.querySelectorAll("tr[data-id]");
      for (var i = 0; i < rows.length; i++) {
        var id = rows[i].getAttribute("data-id");
        var k = state.keys.filter(function (x) { return x.id === id; })[0];
        if (!k || k.cooldownLeftMs <= 0) continue;
        var left = rows[i].querySelector(".cool .left");
        if (left) left.textContent = fmtLeft(k.cooldownLeftMs);
      }
    }, 1000);
  }

  function refresh() {
    if (!state.token || state.busy) return Promise.resolve();
    state.busy = true;
    return api("/pengatur/keys")
      .then(function (data) {
        renderStats(data.pool);
        state.tiers = data.tiers;
        paintTiers();
        renderKeys(data.keys || []);
        el.statsPanel.hidden = false;
        el.addPanel.hidden = false;
        el.keysPanel.hidden = false;
        el.authPanel.hidden = true;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          lock(err.message + " Re-enter the token.");
        } else {
          say(el.keyMsg, "Refresh failed: " + err.message, "err");
        }
      })
      .then(function () { state.busy = false; });
  }

  function lock(reason) {
    stopAuto();
    state.token = "";
    el.statsPanel.hidden = true;
    el.addPanel.hidden = true;
    el.keysPanel.hidden = true;
    el.authPanel.hidden = false;
    say(el.authHint, reason || "Token required.", "err");
  }

  function connect() {
    var t = el.token.value.trim();
    if (!t) { say(el.authHint, "Token is empty.", "err"); return; }
    state.token = t;
    el.connect.disabled = true;
    api("/pengatur/keys")
      .then(function (data) {
        try { localStorage.setItem(STORE, t); } catch (e) {}
        renderStats(data.pool);
        state.tiers = data.tiers;
        paintTiers();
        renderKeys(data.keys || []);
        el.statsPanel.hidden = false;
        el.addPanel.hidden = false;
        el.keysPanel.hidden = false;
        el.authPanel.hidden = true;
        hide(el.keyMsg);
        startAuto();
      })
      .catch(function (err) {
        state.token = "";
        say(el.authHint, "Connect failed: " + err.message, "err");
      })
      .then(function () { el.connect.disabled = false; });
  }

  function removeKey(k, btn) {
    if (!confirm("Remove key " + k.key + " from the pool? This cannot be undone.")) return;
    btn.disabled = true;
    api("/pengatur/keys", { method: "DELETE", body: { id: k.id } })
      .then(function (data) {
        say(el.keyMsg, "Removed " + k.key + ". Pool total " + data.pool.total + ".", "ok");
        delete state.testing[k.id];
        return refresh();
      })
      .catch(function (err) {
        btn.disabled = false;
        say(el.keyMsg, "Remove failed: " + err.message, "err");
      });
  }

  /**
   * Probe one key against Google. The server folds the verdict into the pool:
   * a serving key leaves cooldown, a 429 key re-enters it with the real wait,
   * a revoked key is retired.
   */
  function testKey(k, btn, node) {
    btn.disabled = true;
    btn.textContent = "Testing";
    node.className = "probe";
    node.textContent = "probing...";
    api("/pengatur/keys/test", { method: "POST", body: { id: k.id } })
      .then(function (data) {
        state.testing[k.id] = data.probe;
        node.className = "probe " + probeClass(data.probe.status);
        node.textContent = probeText(data.probe);
        var note = data.applied === "revived" ? " back in rotation"
          : data.applied === "cooling" ? " parked again"
          : data.applied === "retired" ? " retired from the pool" : "";
        say(el.keyMsg, k.key + ": " + data.probe.message + note, data.probe.status === "ok" ? "ok" : "info");
        return refresh();
      })
      .catch(function (err) {
        node.className = "probe bad";
        node.textContent = "probe failed";
        say(el.keyMsg, "Test failed: " + err.message, "err");
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Test";
      });
  }

  function testAll() {
    el.testAllBtn.disabled = true;
    var label = el.testAllBtn.textContent;
    el.testAllBtn.textContent = "Testing...";
    el.testAllNote.textContent = "one live call per key, 4 at a time";
    api("/pengatur/keys/test-all", { method: "POST" })
      .then(function (data) {
        (data.results || []).forEach(function (r) { state.testing[r.id] = r.probe; });
        var ok = (data.results || []).filter(function (r) { return r.probe.status === "ok"; }).length;
        say(el.keyMsg, "Probed " + data.tested + " keys, " + ok + " serving. Pool: " + data.pool.ready + " ready, " + data.pool.cooling + " cooling, " + data.pool.dead + " dead.", ok ? "ok" : "info");
        return refresh();
      })
      .catch(function (err) { say(el.keyMsg, "Test all failed: " + err.message, "err"); })
      .then(function () {
        el.testAllBtn.disabled = false;
        el.testAllBtn.textContent = label;
        el.testAllNote.textContent = "";
      });
  }

  function addKeys() {
    var raw = el.newKeys.value;
    var keys = raw.split(/[\\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!keys.length) { say(el.addMsg, "Nothing to add.", "err"); return; }
    el.addBtn.disabled = true;
    api("/pengatur/keys", { method: "POST", body: { keys: keys } })
      .then(function (data) {
        el.newKeys.value = "";
        el.addCount.textContent = "";
        say(el.addMsg, "Sent " + data.received + ", added " + data.added + ". Pool total " + data.pool.total + ".", data.added ? "ok" : "info");
        return refresh();
      })
      .catch(function (err) { say(el.addMsg, "Add failed: " + err.message, "err"); })
      .then(function () { el.addBtn.disabled = false; });
  }

  function startAuto() {
    stopAuto();
    if (!el.auto.checked) return;
    state.timer = setInterval(refresh, 5000);
  }
  function stopAuto() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  el.connect.addEventListener("click", connect);
  el.token.addEventListener("keydown", function (e) { if (e.key === "Enter") connect(); });
  el.forget.addEventListener("click", function () {
    try { localStorage.removeItem(STORE); } catch (e) {}
    el.token.value = "";
    lock("Token cleared from this browser.");
  });
  el.auto.addEventListener("change", function () { if (el.auto.checked) startAuto(); else stopAuto(); });
  el.addBtn.addEventListener("click", addKeys);
  el.testAllBtn.addEventListener("click", testAll);
  var filterTimer = null;
  el.keyFilter.addEventListener("input", function () {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(function () {
      state.query = el.keyFilter.value.trim().toLowerCase();
      state.page = 1;
      drawTable();
    }, 140);
  });

  el.keySize.addEventListener("change", function () {
    state.size = Number(el.keySize.value) || 25;
    state.page = 1;
    drawTable();
  });

  el.newKeys.addEventListener("input", function () {
    var n = el.newKeys.value.split(/[\\s,]+/).filter(function (s) { return s.trim(); }).length;
    el.addCount.textContent = n ? n + " key" + (n === 1 ? "" : "s") + " detected" : "";
  });

  // Restore a previously stored token and try it silently.
  var saved = "";
  try { saved = localStorage.getItem(STORE) || ""; } catch (e) {}
  if (saved) { el.token.value = saved; connect(); }
})();
</script>
</body>
</html>`;