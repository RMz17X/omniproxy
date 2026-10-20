/**
 * /models console: live Gemini model inventory with pricing, free-tier
 * verdict and a real per-model probe.
 *
 * Data is never hardcoded in the client: /pengatur/models/list returns the live list
 * fetched from the Generative Language API, and every Test button performs an
 * actual generateContent call against the selected model.
 */

export const MODELS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Models · key rotator</title>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/favicon.svg">
<style>
:root{
  --bg:#0b0d11; --panel:#12161c; --panel-2:#161b22; --line:#232a33; --line-soft:#1b2129;
  --ink:#e6edf3; --muted:#8b98a5; --dim:#5f6b78;
  --ok:#67e8a1; --warn:#f0c04a; --bad:#f0705f; --cool:#68a8f0; --accent:#67e8a1;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
.wrap{max-width:1240px;margin:0 auto;padding:22px 18px 64px}
header.top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:14px}
h1{font-size:19px;margin:0;letter-spacing:-0.01em}
.sub{color:var(--muted);font-size:12.5px;margin-top:2px}
.top-right{display:flex;gap:12px;align-items:center;font-size:12px;color:var(--muted)}
.mono{font-family:var(--mono);font-size:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px}
label.field{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);margin-bottom:6px}
input[type=password],input[type=text],select,textarea{width:100%;background:#0d1116;border:1px solid var(--line);color:var(--ink);border-radius:7px;padding:9px 11px;font:inherit;outline:none}
input:focus,select:focus{border-color:#3a4756;box-shadow:0 0 0 3px rgba(103,232,161,.09)}
button{background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:9px 14px;font:inherit;cursor:pointer;transition:background 120ms ease,border-color 120ms ease}
button:hover:not(:disabled){background:#1d242c;border-color:#33404e}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button:disabled{opacity:.5;cursor:not-allowed}
button.primary{background:var(--accent);color:#08130c;border-color:var(--accent);font-weight:600}
button.primary:hover:not(:disabled){background:#7defb3}
button.small{padding:5px 10px;font-size:12px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.grow{flex:1;min-width:200px}
.muted{color:var(--muted)}
.msg{display:none;margin-top:10px;padding:9px 12px;border-radius:7px;font-size:12.5px;border:1px solid transparent}
.msg.show{display:block}
.msg.err{background:rgba(240,112,95,.1);border-color:rgba(240,112,95,.35);color:#ffb3a8}
.msg.ok{background:rgba(103,232,161,.1);border-color:rgba(103,232,161,.32);color:#b9f7d4}
.msg.info{background:rgba(104,168,240,.1);border-color:rgba(104,168,240,.3);color:#b6d6fb}
.strip{display:flex;gap:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel);margin:18px 0}
.kv{padding:12px 18px;border-right:1px solid var(--line);min-width:96px}
.kv:last-child{border-right:0}
.kv b{display:block;font-size:19px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.kv span{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim)}
.kv.ok b{color:var(--ok)} .kv.warn b{color:var(--warn)} .kv.bad b{color:var(--bad)} .kv.cool b{color:var(--cool)}
.spacer{flex:1;border:0}
.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0 12px}
.toolbar .grow{min-width:180px}
.tablewrap{overflow-x:auto;padding:0}
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);font-weight:600;padding:11px 12px;border-bottom:1px solid var(--line);white-space:nowrap;background:var(--panel)}
thead th.right{text-align:right}
tbody td{padding:10px 12px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
tbody tr:last-child td{border-bottom:0}
tbody tr{transition:background 120ms ease}
tbody tr:hover{background:#151a20}
td.right{text-align:right;font-variant-numeric:tabular-nums}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;border:1px solid transparent;white-space:nowrap}
.badge.free{background:rgba(103,232,161,.13);color:#8ff0bb;border-color:rgba(103,232,161,.3)}
.badge.paid{background:rgba(240,192,74,.12);color:#f3d489;border-color:rgba(240,192,74,.3)}
.badge.unknown{background:rgba(139,152,165,.12);color:#a9b5c1;border-color:rgba(139,152,165,.26)}
.tag{display:inline-block;padding:1px 7px;border-radius:5px;font-size:10.5px;background:#1a212a;color:var(--muted);border:1px solid var(--line);font-family:var(--mono)}
.mid{font-family:var(--mono);font-size:12.5px;color:var(--ink);word-break:break-all}
.dimtext{color:var(--dim);font-size:11.5px}
.probe{font-family:var(--mono);font-size:11.5px;white-space:nowrap}
.probe.ok{color:var(--ok)} .probe.warn{color:var(--warn)} .probe.bad{color:var(--bad)}
.pager{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:12px;font-size:12.5px;color:var(--muted)}
.pager .pages{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.pager button.small{min-width:34px;text-align:center}
.pager button.active{background:var(--accent);color:#08130c;border-color:var(--accent);font-weight:700}
.empty{padding:34px 18px;text-align:center;color:var(--muted)}
.empty b{display:block;color:var(--ink);margin-bottom:4px}
.foot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px;font-size:12.5px;color:var(--muted)}
.check{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--muted);cursor:pointer}
.skeleton{height:44px;background:linear-gradient(90deg,#141a21,#1b222b,#141a21);background-size:200% 100%;animation:sh 1.2s ease-in-out infinite;border-radius:6px;margin:6px 12px}
@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.skeleton{animation:none}tbody tr,button{transition:none}}
@media (max-width:860px){
  .strip{flex-wrap:wrap}
  .kv{flex:1 1 45%;border-bottom:1px solid var(--line)}
  .kv:nth-child(2n){border-right:0}
  thead{display:none}
  tbody tr{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:12px 4px;border-bottom:1px solid var(--line-soft)}
  tbody td{border:0;padding:0}
  tbody td::before{content:attr(data-l);display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);margin-top:4px}
  tbody td.mid{grid-column:1/-1}
  tbody td.mid::before{display:none}
  tbody td.act{grid-column:1/-1;text-align:left;margin-top:8px}
  tbody td.act::before{display:none}
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div>
      <h1>Models</h1>
      <div class="sub">Live inventory from the Generative Language API, joined with published pricing</div>
    </div>
    <div class="top-right">
      <a href="/pengatur" class="mono">admin</a>
      <a href="/pengatur/usage" class="mono">usage</a>
      <span id="asOf" class="mono">pricing: -</span>
      <span id="synced">-</span>
    </div>
  </header>

  <section id="authPanel" class="card" style="margin-top:18px">
    <label class="field" for="token">Admin token</label>
    <div class="row">
      <div class="grow"><input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="ADMIN_TOKEN"></div>
      <button id="connect" class="primary" type="button">Connect</button>
    </div>
    <div id="authHint" class="msg err"></div>
    <p class="muted" style="margin:12px 0 0">The token stays in this browser and is only sent to this deployment.</p>
  </section>

  <section id="main" hidden>
    <div class="strip">
      <div class="kv ok"><b id="cTotal">0</b><span>models</span></div>
      <div class="kv ok"><b id="cFree">0</b><span>free tier</span></div>
      <div class="kv warn"><b id="cPaid">0</b><span>paid only</span></div>
      <div class="kv cool"><b id="cTested">0</b><span>tested</span></div>
      <div class="spacer"></div>
      <div class="kv" style="border-right:0"><b id="cTier">-</b><span>your tier</span></div>
    </div>

    <div class="card" style="padding:14px">
      <div class="row">
        <div style="min-width:210px">
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
        <div style="min-width:150px">
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
        <div style="min-width:130px">
          <label class="field" for="size">Per page</label>
          <select id="size"><option>10</option><option selected>25</option><option>50</option><option>100</option></select>
        </div>
        <div style="align-self:flex-end">
          <button id="reload" type="button">Refresh live list</button>
        </div>
      </div>
      <div id="msg" class="msg"></div>
      <div id="tierNote" class="muted" style="margin-top:10px;font-size:12.5px"></div>
    </div>

    <div id="body" class="card tablewrap" style="margin-top:14px"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
    <div id="pager" class="pager"></div>
    <div id="rowMsg" class="msg"></div>
  </section>
</div>

<script>
(function () {
  "use strict";
  var STORE = "gkr.admin.token";
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
      if (from > 2) { var dots = document.createElement("span"); dots.textContent = "…"; box.appendChild(dots); }
    }
    for (var p = from; p <= to; p++) box.appendChild(mk(String(p), p, false, p === state.page));
    if (to < pages) {
      if (to < pages - 1) { var d2 = document.createElement("span"); d2.textContent = "…"; box.appendChild(d2); }
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
    try { localStorage.setItem("gkr.tier", t); } catch (e) {}
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
  try { savedTier = localStorage.getItem("gkr.tier"); } catch (e) {}
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
