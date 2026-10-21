/**
 * /models console: live Gemini model inventory with pricing, free-tier
 * verdict and a real per-model probe.
 *
 * Data is never hardcoded in the client: /pengatur/models/list returns the live list
 * fetched from the Generative Language API, and every Test button performs an
 * actual generateContent call against the selected model.
 */

import { BASE_CSS, stateBlock } from "./ui.ts";

export const MODELS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Models · GeminesX</title>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/favicon.svg">
<style>${BASE_CSS}</style>
</head>
<body>

<header class="topbar">
  <a class="wordmark" href="/pengatur">GeminesX</a>
  <nav class="nav">
    <a href="/pengatur">Keys</a>
    <a href="/pengatur/usage">Usage</a>
    <a href="/pengatur/models" class="active" aria-current="page">Models</a>
  </nav>
  <div class="meta">
    <span id="asOf">pricing: -</span>
    <span id="synced">-</span>
  </div>
</header>

<main class="page">

  <div class="page-head">
    <h1>Models</h1>
    <span class="meta">Live inventory from the Generative Language API, joined with published pricing</span>
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
      <div id="authHint" class="notice err"></div>
      <p class="dimtext" style="margin-top:12px">The token stays in this browser and is only sent to this deployment.</p>
    </div>
  </section>

  <section id="main" class="stack" hidden>

    <div class="strip">
      <div class="kv"><b id="cTotal">0</b><span class="k">models</span></div>
      <div class="kv ready"><b id="cFree">0</b><span class="k">free tier</span></div>
      <div class="kv cooling"><b id="cPaid">0</b><span class="k">paid only</span></div>
      <div class="kv"><b id="cTested">0</b><span class="k">tested</span></div>
      <div class="spacer"></div>
      <div class="kv"><b id="cTier">-</b><span class="k">your tier</span></div>
    </div>

    <!-- controls -->
    <section class="panel">
      <div class="panel-body">
        <div class="row">
          <div class="grow">
            <label class="field" for="tier">Your plan</label>
            <select id="tier">
              <option value="free">Free tier (no billing)</option>
              <option value="paid">Pay-as-you-go (billing enabled)</option>
              <option value="pro">Google AI Pro / Ultra</option>
              <option value="any">Show everything</option>
            </select>
          </div>
          <div class="grow">
            <label class="field" for="q">Search</label>
            <input id="q" type="text" spellcheck="false" placeholder="gemini, tts, image, embedding...">
          </div>
          <div class="grow">
            <label class="field" for="kind">Capability</label>
            <select id="kind">
              <option value="">All</option>
              <option value="text">Text</option>
              <option value="tts">TTS</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="live">Live</option>
              <option value="transcribe">Transcribe</option>
              <option value="embedding">Embedding</option>
              <option value="omni">Omni</option>
              <option value="robotics">Robotics</option>
            </select>
          </div>
          <div class="grow">
            <label class="field" for="size">Per page</label>
            <select id="size"><option>10</option><option selected>25</option><option>50</option><option>100</option></select>
          </div>
        </div>
        <div class="row" style="margin-top:12px">
          <button id="reload" class="btn" type="button">Refresh live list</button>
        </div>
        <div id="msg" class="notice"></div>
        <div id="tierNote" class="dimtext" style="margin-top:8px"></div>
      </div>
    </section>

    <!-- inventory -->
    <section class="panel">
      <div id="body" class="tablewrap">${stateBlock("loading", "Loading model list...")}</div>
      <div class="panel-body">
        <div id="pager" class="pager"></div>
        <div id="rowMsg" class="notice"></div>
      </div>
    </section>

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
    main: document.getElementById("main"),
    asOf: document.getElementById("asOf"),
    synced: document.getElementById("synced"),
    cTotal: document.getElementById("cTotal"),
    cFree: document.getElementById("cFree"),
    cPaid: document.getElementById("cPaid"),
    cTested: document.getElementById("cTested"),
    cTier: document.getElementById("cTier"),
    tier: document.getElementById("tier"),
    tierNote: document.getElementById("tierNote"),
    q: document.getElementById("q"),
    kind: document.getElementById("kind"),
    size: document.getElementById("size"),
    reload: document.getElementById("reload"),
    body: document.getElementById("body"),
    pager: document.getElementById("pager"),
    msg: document.getElementById("msg"),
    rowMsg: document.getElementById("rowMsg")
  };

  var state = {
    token: "", models: [], page: 1, size: 25, testing: {}, fetchedAt: 0
  };

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

  function money(v) {
    if (v === null || v === undefined) return null;
    return "$" + (v >= 1 ? v.toFixed(2) : v.toFixed(3));
  }

  function tierMatches(m) {
    var tier = el.tier.value;
    if (tier === "any") return true;
    if (m.free === true) return true;
    if (m.free === false) return tier !== "free";
    return true;
  }

  function visible() {
    var q = el.q.value.trim().toLowerCase();
    var kind = el.kind.value;
    return state.models.filter(function (m) {
      if (kind && m.kind !== kind) return false;
      if (!tierMatches(m)) return false;
      if (!q) return true;
      return (m.id + " " + m.displayName + " " + m.description).toLowerCase().indexOf(q) >= 0;
    });
  }

  function stats() {
    el.cTotal.textContent = state.models.length;
    el.cFree.textContent = state.models.filter(function (m) { return m.free === true; }).length;
    el.cPaid.textContent = state.models.filter(function (m) { return m.free === false; }).length;
    el.cTested.textContent = Object.keys(state.testing).length;
  }

  function badgeFor(m) {
    var b = document.createElement("span");
    if (m.free === true) { b.className = "badge free"; b.textContent = "free tier"; }
    else if (m.free === false) { b.className = "badge paid"; b.textContent = "paid only"; }
    else { b.className = "badge unknown"; b.textContent = "unlisted"; }
    b.title = m.freeLabel;
    return b;
  }

  function cell(label, cls) {
    var td = document.createElement("td");
    if (cls) td.className = cls;
    if (label) td.setAttribute("data-l", label);
    return td;
  }

  function probeText(r) {
    if (!r) return "-";
    if (r.status === "ok") return "ok " + r.latencyMs + "ms";
    if (r.status === "unsupported") return "n/a";
    return r.status.replace(/_/g, " ") + " " + r.httpStatus;
  }
  function probeClass(r) {
    if (!r) return "";
    if (r.status === "ok") return "ok";
    if (r.status === "rate_limited" || r.status === "zero_quota") return "warn";
    return "bad";
  }

  function render() {
    var rows = visible();
    var pages = Math.max(1, Math.ceil(rows.length / state.size));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * state.size;
    var slice = rows.slice(start, start + state.size);

    stats();

    if (!rows.length) {
      el.body.innerHTML = "";
      var box = document.createElement("div");
      box.className = "empty";
      var b = document.createElement("b");
      b.textContent = "No model matches these filters";
      box.appendChild(b);
      box.appendChild(document.createTextNode("Clear the search box or switch your plan to Show everything."));
      el.body.appendChild(box);
      renderPager(0, 1);
      return;
    }

    var table = document.createElement("table");
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Model</th><th>Tier</th><th class='right'>Input /1M</th><th class='right'>Output /1M</th><th class='right'>Ctx</th><th>Test</th><th></th></tr>";
    table.appendChild(thead);
    var tbody = document.createElement("tbody");

    slice.forEach(function (m) {
      var tr = document.createElement("tr");

      var cId = cell(null, "mid");
      cId.textContent = m.id;
      var sub = document.createElement("div");
      sub.className = "dimtext";
      var bits = [m.displayName];
      if (m.kind && m.kind !== "text") bits.push(m.kind);
      if (m.methods && m.methods.length) bits.push(m.methods.join("/"));
      sub.textContent = bits.join(" · ");
      cId.appendChild(sub);

      var cTier = cell("Tier");
      cTier.appendChild(badgeFor(m));

      var cIn = cell("Input /1M", "right");
      var inV = money(m.inUsd);
      if (inV) { cIn.textContent = inV; }
      else if (m.inRaw) { cIn.innerHTML = "<span class='dimtext'>unit</span>"; }
      else { cIn.innerHTML = "<span class='dimtext'>-</span>"; }
      if (m.inRaw) cIn.title = m.inRaw;

      var cOut = cell("Output /1M", "right");
      var outV = money(m.outUsd);
      if (outV) { cOut.textContent = outV; }
      else if (m.outRaw) { cOut.innerHTML = "<span class='dimtext'>unit</span>"; }
      else { cOut.innerHTML = "<span class='dimtext'>-</span>"; }
      if (m.outRaw) cOut.title = m.outRaw;

      var cCtx = cell("Ctx", "right");
      if (m.inputTokenLimit) {
        cCtx.textContent = (m.inputTokenLimit >= 1000 ? Math.round(m.inputTokenLimit / 1000) + "k" : String(m.inputTokenLimit));
      } else { cCtx.innerHTML = "<span class='dimtext'>-</span>"; }

      var cProbe = cell("Test");
      var pv = document.createElement("span");
      var known = state.testing[m.id];
      pv.className = "probe " + probeClass(known);
      pv.textContent = probeText(known);
      if (known && known.message) pv.title = known.message;
      cProbe.appendChild(pv);

      var cAct = cell(null, "act");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "small";
      btn.textContent = "Test model";
      btn.addEventListener("click", function () { testModel(m, btn, pv); });
      cAct.appendChild(btn);

      tr.appendChild(cId); tr.appendChild(cTier); tr.appendChild(cIn); tr.appendChild(cOut);
      tr.appendChild(cCtx); tr.appendChild(cProbe); tr.appendChild(cAct);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    el.body.innerHTML = "";
    el.body.appendChild(table);
    renderPager(rows.length, pages);
  }

  function renderPager(total, pages) {
    el.pager.innerHTML = "";
    if (!total) return;
    var start = (state.page - 1) * state.size + 1;
    var end = Math.min(total, state.page * state.size);

    var info = document.createElement("span");
    info.textContent = "Showing " + start + "-" + end + " of " + total;
    el.pager.appendChild(info);

    var box = document.createElement("div");
    box.className = "pages";

    function mk(label, page, disabled, active) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "small" + (active ? " active" : "");
      b.textContent = label;
      b.disabled = Boolean(disabled);
      if (active) b.setAttribute("aria-current", "page");
      b.addEventListener("click", function () { state.page = page; render(); });
      return b;
    }

    box.appendChild(mk("Prev", state.page - 1, state.page === 1, false));

    var windowSize = 5;
    var from = Math.max(1, state.page - Math.floor(windowSize / 2));
    var to = Math.min(pages, from + windowSize - 1);
    from = Math.max(1, to - windowSize + 1);
    if (from > 1) {
      box.appendChild(mk("1", 1, false, state.page === 1));
      if (from > 2) { var dots = document.createElement("span"); dots.textContent = "..."; box.appendChild(dots); }
    }
    for (var p = from; p <= to; p++) box.appendChild(mk(String(p), p, false, p === state.page));
    if (to < pages) {
      if (to < pages - 1) { var d2 = document.createElement("span"); d2.textContent = "..."; box.appendChild(d2); }
      box.appendChild(mk(String(pages), pages, false, state.page === pages));
    }

    box.appendChild(mk("Next", state.page + 1, state.page === pages, false));
    el.pager.appendChild(box);
  }

  function load(force) {
    el.reload.disabled = true;
    say(el.msg, force ? "Re-querying the live model list..." : "Loading live model list...", "info");
    var url = "/pengatur/models/list" + (force ? "?refresh=1" : "");
    api(url).then(function (data) {
      state.models = data.models || [];
      state.fetchedAt = Date.now();
      el.asOf.textContent = "pricing: " + (data.pricing && data.pricing.asOf ? data.pricing.asOf : "-");
      el.synced.textContent = "synced " + new Date().toLocaleTimeString();
      var live = data.source || "upstream";
      say(el.msg, state.models.length + " models from " + live + (data.cached ? " (cached)" : ""), "ok");
      setTimeout(function () { hide(el.msg); }, 4000);
      el.main.hidden = false;
      el.authPanel.hidden = true;
      render();
    }).catch(function (err) {
      if (err.status === 401) { lock("Token rejected. Enter the admin token."); return; }
      say(el.msg, "Could not load models: " + err.message, "err");
      el.main.hidden = false;
      el.body.innerHTML = "";
      var box = document.createElement("div");
      box.className = "empty";
      box.innerHTML = "<b>Live list unavailable</b>";
      box.appendChild(document.createTextNode("The pool has no key that can answer the model list right now. Add or revive a key in /pengatur."));
      el.body.appendChild(box);
    }).then(function () { el.reload.disabled = false; });
  }

  function lock(reason) {
    state.token = "";
    try { localStorage.removeItem(STORE); } catch (e) {}
    el.authPanel.hidden = false;
    el.main.hidden = true;
    el.token.value = "";
    if (reason) say(el.authHint, reason, "err");
    el.token.focus();
  }

  function connect() {
    var token = el.token.value.trim();
    if (!token) { say(el.authHint, "Enter the admin token.", "err"); return; }
    state.token = token;
    el.connect.disabled = true;
    hide(el.authHint);
    api("/pengatur/models/list").then(function () {
      try { localStorage.setItem(STORE, token); } catch (e) {}
      el.main.hidden = false;
      el.authPanel.hidden = true;
      load(false);
    }).catch(function (err) {
      if (err.status === 401) say(el.authHint, "Token rejected.", "err");
      else say(el.authHint, "Connection failed: " + err.message, "err");
    }).then(function () { el.connect.disabled = false; });
  }

  function testModel(m, btn, node) {
    btn.disabled = true;
    node.className = "probe";
    node.textContent = "testing...";
    say(el.rowMsg, "Calling " + m.id + " with a pooled key...", "info");
    api("/pengatur/models/test", { method: "POST", body: { model: m.id } }).then(function (data) {
      var r = data.result;
      state.testing[m.id] = r;
      node.className = "probe " + probeClass(r);
      node.textContent = probeText(r);
      node.title = r.message || "";
      if (r.status === "ok") {
        say(el.rowMsg, m.id + " served in " + r.latencyMs + "ms: " + (r.reply || "(empty reply)"), "ok");
      } else {
        say(el.rowMsg, m.id + " -> " + r.status + " (HTTP " + r.httpStatus + "): " + r.message, r.status === "rate_limited" ? "info" : "err");
      }
      stats();
    }).catch(function (err) {
      node.className = "probe bad";
      node.textContent = "error";
      say(el.rowMsg, "Test failed: " + err.message, "err");
      if (err.status === 401) lock("Token rejected.");
    }).then(function () { btn.disabled = false; });
  }

  el.token.addEventListener("keydown", function (e) { if (e.key === "Enter") connect(); });
  el.connect.addEventListener("click", connect);
  el.reload.addEventListener("click", function () { load(true); });

  el.size.addEventListener("change", function () {
    state.size = Number(el.size.value) || 25;
    state.page = 1;
    render();
  });

  var debounce = null;
  el.q.addEventListener("input", function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { state.page = 1; render(); }, 140);
  });

  el.kind.addEventListener("change", function () { state.page = 1; render(); });

  el.tier.addEventListener("change", function () {
    var t = el.tier.value;
    try { localStorage.setItem("geminesx.tier", t); } catch (e) {}
    var label = { free: "Free tier", paid: "Pay-as-you-go", pro: "Google AI Pro/Ultra", any: "All models" }[t];
    el.cTier.textContent = label;
    if (t === "free") el.tierNote.textContent = "Models marked paid only need billing enabled on the Google Cloud project behind the key.";
    else if (t === "pro") el.tierNote.textContent = "AI Pro/Ultra quotas apply inside the Google AI Studio / Gemini app, not to raw API keys. API keys bill through Cloud.";
    else if (t === "paid") el.tierNote.textContent = "Paid tier prices below are per 1M tokens in USD, from Google's published table.";
    else el.tierNote.textContent = "Showing every model Google returns, regardless of billing.";
    state.page = 1;
    render();
  });

  var saved = null;
  try { saved = localStorage.getItem(STORE); } catch (e) {}
  var savedTier = null;
  try { savedTier = localStorage.getItem("geminesx.tier"); } catch (e) {}
  if (savedTier) el.tier.value = savedTier;
  if (saved) {
    state.token = saved;
    el.token.value = saved;
    api("/pengatur/models/list").then(function () {
      el.main.hidden = false;
      el.authPanel.hidden = true;
      load(false);
    }).catch(function () { lock("Saved token is no longer valid."); });
  } else {
    el.token.focus();
  }
  el.tier.dispatchEvent(new Event("change"));
})();
</script>
</body>
</html>`;
