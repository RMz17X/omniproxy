/**
 * Admin console served at GET /admin (public shell, gated by the admin token
 * the operator pastes in). Rendered as one self-contained document: no build
 * step, no external assets, so the Vercel bundle stays a single file.
 */
export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Key Pool Console</title>
<style>
  :root {
    --bg: #0b0d10;
    --panel: #14171c;
    --panel-2: #1b1f26;
    --line: #262c35;
    --text: #e8ecf1;
    --muted: #9aa5b4;
    --ready: #3ddc84;
    --cool: #f0b429;
    --dead: #f2545b;
    --accent: #4c8dff;
    --focus: #8ab4ff;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: 20px 16px 64px;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline; justify-content: space-between; margin-bottom: 20px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -0.01em; }
  h1 span { color: var(--muted); font-weight: 400; font-size: 13px; margin-left: 8px; }
  .storage { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .storage b { color: var(--text); font-weight: 600; }

  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .panel > h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 12px; font-weight: 600; }

  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  input[type=password], input[type=text], textarea {
    width: 100%;
    background: var(--panel-2);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 11px 12px;
    font: inherit;
    font-size: 14px;
    min-height: 44px;
  }
  textarea { min-height: 96px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.6; }
  input:focus, textarea:focus, button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; border-color: transparent; }
  input::placeholder, textarea::placeholder { color: #6b7482; }

  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
  .row > .grow { flex: 1 1 240px; min-width: 0; }

  button {
    background: var(--panel-2);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0 16px;
    height: 44px;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover:not(:disabled) { background: #232932; border-color: #38414e; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #06121f; font-weight: 650; }
  button.primary:hover:not(:disabled) { background: #6ea3ff; border-color: #6ea3ff; }
  button.danger { color: var(--dead); border-color: #4a2b30; background: transparent; height: 36px; padding: 0 12px; font-size: 13px; }
  button.danger:hover:not(:disabled) { background: #2a1417; border-color: var(--dead); }

  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .stat { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
  .stat .n { font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .stat .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin-top: 2px; }
  .stat.ready .n { color: var(--ready); }
  .stat.cooling .n { color: var(--cool); }
  .stat.dead .n { color: var(--dead); }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); font-weight: 600; padding: 0 10px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  tbody td { padding: 10px; border-bottom: 1px solid #1e242c; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: #171b21; }
  code.mono, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
  .num { font-variant-numeric: tabular-nums; text-align: right; }

  .badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; padding: 3px 8px; border-radius: 999px; border: 1px solid; }
  .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .badge.ready { color: var(--ready); border-color: #1f4c36; background: #10241a; }
  .badge.cooling { color: var(--cool); border-color: #4d3d12; background: #241e0d; }
  .badge.dead { color: var(--dead); border-color: #4a2b30; background: #241315; }

  .msg { border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-top: 12px; display: none; }
  .msg.show { display: block; }
  .msg.ok { background: #10241a; border: 1px solid #1f4c36; color: #b8f5d2; }
  .msg.err { background: #241315; border: 1px solid #4a2b30; color: #ffc3c6; }
  .msg.info { background: #101a24; border: 1px solid #1f3548; color: #c2e0ff; }

  .empty { padding: 28px 12px; text-align: center; color: var(--muted); font-size: 13.5px; }
  .skeleton { height: 12px; border-radius: 4px; background: linear-gradient(90deg, #1b1f26, #262c35, #1b1f26); background-size: 200% 100%; animation: sh 1.2s linear infinite; }
  @keyframes sh { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  @media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }

  .foot { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-top: 10px; }
  .muted { color: var(--muted); font-size: 12px; }
  .check { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); cursor: pointer; min-height: 44px; }
  .check input { width: 18px; height: 18px; accent-color: var(--accent); }

  @media (max-width: 720px) {
    .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    thead { display: none; }
    tbody tr { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 12px 0; border-bottom: 1px solid #1e242c; }
    tbody td { border: 0; padding: 0; }
    tbody td::before { content: attr(data-l); display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    tbody td.act { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
    tbody td.act::before { display: none; }
    tbody tr:hover { background: transparent; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Key Pool Console <span>gemini-key-rotator</span></h1>
    <div class="storage" id="storageLine">storage <b id="storageVal">unknown</b></div>
  </header>

  <section class="panel" id="authPanel">
    <h2>1. Admin access</h2>
    <div class="row">
      <div class="grow">
        <label for="token">Admin token</label>
        <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="ADMIN_TOKEN">
      </div>
      <button class="primary" id="connect">Connect</button>
      <button id="forget" title="Clear the stored token">Forget</button>
    </div>
    <div class="msg info show" id="authHint">Paste the ADMIN_TOKEN to load the pool. It is kept in this browser only.</div>
  </section>

  <section class="panel" id="statsPanel" hidden>
    <h2>Pool</h2>
    <div class="stats">
      <div class="stat"><div class="n" id="sTotal">0</div><div class="k">Total</div></div>
      <div class="stat ready"><div class="n" id="sReady">0</div><div class="k">Ready</div></div>
      <div class="stat cooling"><div class="n" id="sCooling">0</div><div class="k">Cooling</div></div>
      <div class="stat dead"><div class="n" id="sDead">0</div><div class="k">Dead</div></div>
    </div>
    <div class="foot">
      <label class="check"><input type="checkbox" id="auto" checked> Auto refresh every 5s</label>
      <span class="muted" id="lastSync">never synced</span>
    </div>
  </section>

  <section class="panel" id="addPanel" hidden>
    <h2>2. Add keys</h2>
    <label for="newKeys">One key per line, or comma / space separated</label>
    <textarea id="newKeys" spellcheck="false" placeholder="AIzaSy...&#10;AIzaSy..."></textarea>
    <div class="row" style="margin-top:10px">
      <button class="primary" id="addBtn">Add to pool</button>
      <span class="muted" id="addCount"></span>
    </div>
    <div class="msg" id="addMsg"></div>
  </section>

  <section class="panel" id="keysPanel" hidden>
    <h2>3. Keys</h2>
    <div id="keysBody">
      <div class="empty">
        <div class="skeleton" style="width:60%;margin:0 auto 8px"></div>
        <div class="skeleton" style="width:40%;margin:0 auto"></div>
      </div>
    </div>
    <div class="msg" id="keyMsg"></div>
  </section>
</div>

<script>
(function () {
  "use strict";
  var STORE = "gkr.admin.token";
  var state = { token: "", timer: null, busy: false, keys: [] };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    token: $("token"), connect: $("connect"), forget: $("forget"), authHint: $("authHint"),
    statsPanel: $("statsPanel"), addPanel: $("addPanel"), keysPanel: $("keysPanel"), authPanel: $("authPanel"),
    sTotal: $("sTotal"), sReady: $("sReady"), sCooling: $("sCooling"), sDead: $("sDead"),
    storageVal: $("storageVal"), auto: $("auto"), lastSync: $("lastSync"),
    newKeys: $("newKeys"), addBtn: $("addBtn"), addMsg: $("addMsg"), addCount: $("addCount"),
    keysBody: $("keysBody"), keyMsg: $("keyMsg")
  };

  function say(node, text, kind) {
    node.className = "msg show " + (kind || "info");
    node.textContent = text;
  }
  function hide(node) { node.className = "msg"; node.textContent = ""; }

  function fmtAge(ms) {
    if (!ms) return "never";
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }
  function fmtLeft(ms) {
    if (ms <= 0) return "-";
    var s = Math.ceil(ms / 1000);
    if (s < 60) return s + "s";
    return Math.ceil(s / 60) + "m";
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { "Authorization": "Bearer " + state.token };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = { raw: txt }; }
        if (!res.ok) {
          var m = (data && data.error && data.error.message) || ("HTTP " + res.status);
          var err = new Error(m);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function renderStats(pool) {
    el.sTotal.textContent = pool.total;
    el.sReady.textContent = pool.ready;
    el.sCooling.textContent = pool.cooling;
    el.sDead.textContent = pool.dead;
    el.storageVal.textContent = pool.storage + (pool.degraded ? " (degraded)" : "");
    el.lastSync.textContent = "synced " + new Date().toLocaleTimeString();
  }

  function td(label, cls) {
    var c = document.createElement("td");
    if (cls) c.className = cls;
    if (label) c.setAttribute("data-l", label);
    return c;
  }

  function renderKeys(keys) {
    state.keys = keys;
    if (!keys.length) {
      el.keysBody.innerHTML = '<div class="empty">Pool is empty. Add keys above, or set GEMINI_API_KEYS on the deployment.</div>';
      return;
    }
    var table = document.createElement("table");
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Key</th><th>Status</th><th>Failures</th><th>Cooldown</th><th>Last used</th><th></th></tr>";
    table.appendChild(thead);
    var tbody = document.createElement("tbody");

    keys.forEach(function (k) {
      var tr = document.createElement("tr");

      var cKey = td("Key");
      var code = document.createElement("span");
      code.className = "mono";
      code.textContent = k.key;
      cKey.appendChild(code);

      var cStatus = td("Status");
      var badge = document.createElement("span");
      badge.className = "badge " + k.status;
      badge.textContent = k.status === "dead" ? "dead" : k.status === "cooling" ? "cooling" : "ready";
      cStatus.appendChild(badge);

      var cFail = td("Failures", "num");
      cFail.textContent = k.failures;

      var cCool = td("Cooldown", "num");
      cCool.textContent = fmtLeft(k.cooldownLeftMs);

      var cUsed = td("Last used");
      cUsed.textContent = fmtAge(k.lastUsed);

      var cAct = td(null, "act");
      var btn = document.createElement("button");
      btn.className = "danger";
      btn.type = "button";
      btn.textContent = "Remove";
      btn.addEventListener("click", function () { removeKey(k, btn); });
      cAct.appendChild(btn);

      tr.appendChild(cKey); tr.appendChild(cStatus); tr.appendChild(cFail);
      tr.appendChild(cCool); tr.appendChild(cUsed); tr.appendChild(cAct);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    el.keysBody.innerHTML = "";
    el.keysBody.appendChild(table);
  }

  function refresh() {
    if (!state.token || state.busy) return Promise.resolve();
    state.busy = true;
    return api("/admin/keys")
      .then(function (data) {
        renderStats(data.pool);
        renderKeys(data.keys || []);
        el.statsPanel.hidden = false;
        el.addPanel.hidden = false;
        el.keysPanel.hidden = false;
        el.authPanel.hidden = true;
        hide(el.keyMsg);
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
    api("/admin/keys")
      .then(function (data) {
        try { localStorage.setItem(STORE, t); } catch (e) {}
        renderStats(data.pool);
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
    if (!confirm("Remove key " + k.key + " from the pool?")) return;
    btn.disabled = true;
    api("/admin/keys", { method: "DELETE", body: { id: k.id } })
      .then(function (data) {
        say(el.keyMsg, "Removed " + k.key + " (total now " + data.pool.total + ").", "ok");
        return refresh();
      })
      .catch(function (err) {
        btn.disabled = false;
        say(el.keyMsg, "Remove failed: " + err.message, "err");
      });
  }

  function addKeys() {
    var raw = el.newKeys.value;
    var keys = raw.split(/[\\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!keys.length) { say(el.addMsg, "Nothing to add.", "err"); return; }
    el.addBtn.disabled = true;
    api("/admin/keys", { method: "POST", body: { keys: keys } })
      .then(function (data) {
        el.newKeys.value = "";
        el.addCount.textContent = "";
        say(el.addMsg, "Sent " + data.received + ", added " + data.added + ". Pool total " + data.pool.total + ".", "ok");
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