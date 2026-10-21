/**
 * Keys console shell, served at GET /pengatur/keys, plus the per-key detail
 * shell at GET /pengatur/keys/:id.
 *
 * Same visual language as the other /pengatur shells. Both carry no data: the
 * browser pastes the admin token once, then reads /pengatur/keys/list and
 * /pengatur/keys/:id/data.
 */

export const KEYS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Keys · geminesx</title>
<style>
:root { --bg:#0f1115; --panel:#171a21; --line:#262b36; --ink:#e6e9ef; --dim:#98a1b3; --ok:#3ddc97; --warn:#f5c451; --err:#ff6b6b; --accent:#7aa2ff; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
header { padding:18px 22px; border-bottom:1px solid var(--line); display:flex; gap:14px; align-items:baseline; flex-wrap:wrap; }
header h1 { font-size:15px; margin:0; font-weight:600; }
header a { color:var(--accent); text-decoration:none; }
header .dim, .dim { color:var(--dim); }
main { padding:18px 22px; display:grid; gap:16px; max-width:1280px; }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px 16px; }
.panel h2 { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--dim); margin:0 0 10px; }
.row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
button { background:#202634; color:var(--ink); border:1px solid var(--line); border-radius:6px; padding:6px 12px; font:inherit; cursor:pointer; }
button:hover:not(:disabled) { border-color:var(--accent); }
button:disabled { opacity:.45; cursor:not-allowed; }
button.primary { background:var(--accent); border-color:var(--accent); color:#0b0e14; font-weight:600; }
button.danger { color:var(--err); }
input, select, textarea { background:#11141b; color:var(--ink); border:1px solid var(--line); border-radius:6px; padding:6px 9px; font:inherit; }
textarea { width:100%; min-height:88px; resize:vertical; }
input[type=password] { width:280px; }
table { width:100%; border-collapse:collapse; }
th, td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums; white-space:nowrap; }
th { color:var(--dim); font-weight:500; font-size:12px; }
tr:last-child td { border-bottom:none; }
td.id a { color:var(--accent); text-decoration:none; }
.tag { display:inline-block; padding:1px 7px; border-radius:999px; border:1px solid var(--line); font-size:12px; }
.tag.ok { color:var(--ok); border-color:var(--ok); }
.tag.warn { color:var(--warn); border-color:var(--warn); }
.tag.err { color:var(--err); border-color:var(--err); }
.msg { min-height:20px; font-size:13px; }
.msg.err { color:var(--err); }
.msg.ok { color:var(--ok); }
.hint { color:var(--dim); font-size:12px; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; }
.stat b { display:block; font-size:20px; font-variant-numeric:tabular-nums; }
.stat span { color:var(--dim); font-size:12px; }
</style>
</head>
<body>
<header>
  <h1>Keys</h1>
  <a href="/pengatur/stats">stats</a>
  <a href="/pengatur/settings">settings</a>
  <a href="/pengatur/audit">audit</a>
  <a href="/pengatur/logs">logs</a>
  <span class="dim" id="authState">token required</span>
</header>
<main>
  <section class="panel" id="authPanel">
    <h2>Admin token</h2>
    <div class="row">
      <input type="password" id="token" placeholder="ADMIN_TOKEN" autocomplete="off">
      <button class="primary" id="connect">Connect</button>
      <span class="hint">Held in localStorage for this browser only. Sent as a bearer token.</span>
    </div>
    <div class="msg" id="authHint"></div>
  </section>

  <section class="panel" id="statsPanel" hidden>
    <h2>Pool</h2>
    <div class="grid" id="stats"></div>
  </section>

  <section class="panel" id="bulkPanel" hidden>
    <h2>Bulk actions</h2>
    <div class="row">
      <select id="tierSel"></select>
      <button id="applyTier">Set tier on selected</button>
      <button id="testAll">Test all</button>
      <button id="refresh">Refresh</button>
      <label class="hint"><input type="checkbox" id="auto"> auto-refresh 15s</label>
    </div>
    <div class="row" style="margin-top:10px">
      <button id="enableBtn" disabled>Enable selected</button>
      <button id="disableBtn" disabled>Disable selected</button>
      <span class="hint">Enable/disable is not implemented by the admin API yet — no route toggles the keys table. Remove and re-add a key to reset it.</span>
    </div>
    <div class="msg" id="bulkMsg"></div>
  </section>

  <section class="panel" id="addPanel" hidden>
    <h2>Add keys</h2>
    <textarea id="newKeys" placeholder="One raw key per line"></textarea>
    <div class="row" style="margin-top:10px">
      <button class="primary" id="addBtn">Add</button>
      <span class="hint">Raw values are never returned by the API; only masked ids are.</span>
    </div>
    <div class="msg" id="addMsg"></div>
  </section>

  <section class="panel" id="keysPanel" hidden>
    <h2>Keys</h2>
    <table>
      <thead><tr>
        <th><input type="checkbox" id="all"></th>
        <th>id</th><th>masked</th><th>plan</th><th>state</th><th>enabled</th><th>fails</th><th>last seen</th><th></th>
      </tr></thead>
      <tbody id="keyRows"></tbody>
    </table>
    <div class="msg" id="keyMsg"></div>
  </section>
</main>
<script>
const TOKEN_KEY = "geminesx.admin.token";

function token() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

/** Fetch helper. Every console request carries the pasted token. */
async function api(path, opts) {
  const init = Object.assign({ headers: {} }, opts ?? {});
  init.headers = Object.assign({}, init.headers, { authorization: "Bearer " + token() });
  if (init.body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(init.body);
  }
  const res = await fetch(path, init);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data && data.error && data.error.message ? data.error.message : "HTTP " + res.status;
    throw new Error(message);
  }
  return data;
}

function say(node, text, cls) {
  node.textContent = text;
  node.className = "msg" + (cls ? " " + cls : "");
}

function when(ms) {
  if (!ms) return "never";
  const d = new Date(ms);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function left(ms) {
  if (!ms || ms <= 0) return "-";
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  if (s < 3600) return Math.round(s / 60) + "m";
  return Math.round(s / 3600) + "h";
}

const state = { keys: [], tiers: [], knownTiers: [], timer: null };

function row(k) {
  const tr = document.createElement("tr");
  const status = k.status ?? "ready";
  const badge = status === "ready" ? "ok" : status === "cooling" ? "warn" : "err";
  tr.innerHTML =
    '<td><input type="checkbox" data-id="' + k.id + '"></td>' +
    '<td class="id"><a href="/pengatur/keys/' + k.id + '">' + k.id + "</a></td>" +
    "<td>" + k.key + "</td>" +
    "<td>" + k.tier + "</td>" +
    '<td><span class="tag ' + badge + '">' + status + "</span></td>" +
    "<td>" + (k.enabled === false ? "no" : "yes") + "</td>" +
    "<td>" + k.failures + "</td>" +
    "<td>" + when(k.lastUsed) + "</td>" +
    '<td><button data-test="' + k.id + '">test</button> <button class="danger" data-del="' + k.id + '">delete</button></td>';
  return tr;
}

function selected() {
  return [...document.querySelectorAll("#keyRows input[type=checkbox]:checked")].map((n) => n.dataset.id);
}

function render(data) {
  state.keys = data.keys ?? [];
  state.tiers = data.tiers ?? [];
  state.knownTiers = data.knownTiers ?? [];

  const pool = data.pool ?? {};
  const stats = document.getElementById("stats");
  stats.innerHTML = "";
  for (const [label, value] of [
    ["total", pool.total],
    ["ready", pool.ready],
    ["cooling", pool.cooling],
    ["dead", pool.dead],
    ["storage", pool.storage],
    ["degraded", pool.degraded ? "yes" : "no"],
  ]) {
    const cell = document.createElement("div");
    cell.className = "stat";
    cell.innerHTML = "<b>" + (value ?? 0) + "</b><span>" + label + "</span>";
    stats.appendChild(cell);
  }

  const sel = document.getElementById("tierSel");
  const keep = sel.value;
  sel.innerHTML = "";
  for (const t of state.knownTiers) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  }
  if (keep) sel.value = keep;

  const body = document.getElementById("keyRows");
  body.innerHTML = "";
  for (const k of state.keys) body.appendChild(row(k));

  document.getElementById("keysPanel").hidden = false;
  document.getElementById("bulkPanel").hidden = false;
  document.getElementById("addPanel").hidden = false;
  document.getElementById("statsPanel").hidden = false;
}

async function refresh() {
  try {
    const data = await api("/pengatur/keys/list");
    render(data);
    say(document.getElementById("keyMsg"), state.keys.length + " keys", "ok");
  } catch (err) {
    say(document.getElementById("keyMsg"), err.message, "err");
  }
}

function act(fn) {
  return async (ev) => {
    const id = ev.currentTarget.dataset.test ?? ev.currentTarget.dataset.del;
    ev.currentTarget.disabled = true;
    try {
      await fn(id);
    } catch (err) {
      say(document.getElementById("keyMsg"), err.message, "err");
    } finally {
      ev.currentTarget.disabled = false;
    }
  };
}

document.getElementById("token").value = token();

document.getElementById("connect").addEventListener("click", async () => {
  const value = document.getElementById("token").value.trim();
  if (!value) {
    say(document.getElementById("authHint"), "Paste the admin token.", "err");
    return;
  }
  localStorage.setItem(TOKEN_KEY, value);
  document.getElementById("authHint").textContent = "";
  await refresh();
});

document.getElementById("refresh").addEventListener("click", refresh);

document.getElementById("auto").addEventListener("change", (ev) => {
  clearInterval(state.timer);
  state.timer = ev.target.checked ? setInterval(refresh, 15000) : null;
});

document.getElementById("all").addEventListener("change", (ev) => {
  for (const box of document.querySelectorAll("#keyRows input[type=checkbox]")) box.checked = ev.target.checked;
});

document.getElementById("applyTier").addEventListener("click", async () => {
  const ids = selected();
  if (!ids.length) {
    say(document.getElementById("bulkMsg"), "Select at least one key.", "err");
    return;
  }
  try {
    const res = await api("/pengatur/keys/tier", {
      method: "POST",
      body: { ids: ids, tier: document.getElementById("tierSel").value },
    });
    say(document.getElementById("bulkMsg"), "updated " + (res.updated ?? ids.length) + " keys", "ok");
    await refresh();
  } catch (err) {
    say(document.getElementById("bulkMsg"), err.message, "err");
  }
});

document.getElementById("testAll").addEventListener("click", async (ev) => {
  ev.currentTarget.disabled = true;
  say(document.getElementById("bulkMsg"), "testing…", "");
  try {
    const res = await api("/pengatur/keys/test-all", { method: "POST" });
    say(document.getElementById("bulkMsg"), "tested " + (res.tested ?? 0) + " keys", "ok");
    await refresh();
  } catch (err) {
    say(document.getElementById("bulkMsg"), err.message, "err");
  } finally {
    ev.currentTarget.disabled = false;
  }
});

document.getElementById("addBtn").addEventListener("click", async () => {
  const raw = document.getElementById("newKeys").value;
  const keys = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (!keys.length) {
    say(document.getElementById("addMsg"), "Paste at least one key.", "err");
    return;
  }
  try {
    const res = await api("/pengatur/keys", { method: "POST", body: { keys: keys } });
    say(document.getElementById("addMsg"), "added " + (res.added ?? keys.length) + " keys", "ok");
    document.getElementById("newKeys").value = "";
    await refresh();
  } catch (err) {
    say(document.getElementById("addMsg"), err.message, "err");
  }
});

document.getElementById("keyRows").addEventListener("click", async (ev) => {
  const testId = ev.target.dataset?.test;
  const delId = ev.target.dataset?.del;
  if (testId) await act(async (id) => {
    const res = await api("/pengatur/keys/test", { method: "POST", body: { id: id } });
    say(document.getElementById("keyMsg"), id + ": " + (res.probe?.status ?? "tested") + " (" + (res.applied ?? "none") + ")", "ok");
    await refresh();
  })({ currentTarget: ev.target });
  else if (delId) await act(async (id) => {
    await api("/pengatur/keys", { method: "DELETE", body: { id: id } });
    say(document.getElementById("keyMsg"), "deleted " + id, "ok");
    await refresh();
  })({ currentTarget: ev.target });
});

refresh();
</script>
</body>
</html>`;

export const KEY_DETAIL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Key detail</title>
<style>
:root { --bg:#0b0d12; --panel:#12151d; --line:#242938; --ink:#e6e9f0; --dim:#8b93a7; --accent:#6ea8fe; --ok:#3ecf8e; --warn:#e0b341; --err:#ef6b6b; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
header { display:flex; align-items:center; gap:14px; padding:14px 20px; border-bottom:1px solid var(--line); }
header h1 { font-size:16px; margin:0; font-weight:600; }
header a { color:var(--dim); text-decoration:none; }
header a:hover { color:var(--accent); }
.dim { color:var(--dim); margin-left:auto; font-size:12px; }
main { padding:18px 20px; display:grid; gap:14px; max-width:1200px; }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
.panel h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--dim); margin:0 0 10px; font-weight:600; }
.row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
button { background:#1a1f2b; color:var(--ink); border:1px solid var(--line); border-radius:6px; padding:6px 11px; font:inherit; cursor:pointer; }
button:hover { border-color:var(--accent); }
button:disabled { opacity:.45; cursor:not-allowed; }
button.primary { background:var(--accent); border-color:var(--accent); color:#0b0d12; font-weight:600; }
input { background:#11141b; color:var(--ink); border:1px solid var(--line); border-radius:6px; padding:6px 9px; font:inherit; }
input[type=password] { width:280px; }
table { width:100%; border-collapse:collapse; }
th, td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums; white-space:nowrap; }
th { color:var(--dim); font-weight:500; font-size:12px; }
tr:last-child td { border-bottom:none; }
.tag { display:inline-block; padding:1px 7px; border-radius:999px; border:1px solid var(--line); font-size:12px; }
.tag.ok { color:var(--ok); border-color:var(--ok); }
.tag.warn { color:var(--warn); border-color:var(--warn); }
.tag.err { color:var(--err); border-color:var(--err); }
.msg { min-height:20px; font-size:13px; }
.msg.err { color:var(--err); }
.msg.ok { color:var(--ok); }
.hint { color:var(--dim); font-size:12px; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; }
.stat b { display:block; font-size:18px; font-variant-numeric:tabular-nums; }
.stat span { color:var(--dim); font-size:12px; }
.bar { height:8px; background:var(--accent); border-radius:2px; min-width:1px; }
.barCell { width:180px; }
</style>
</head>
<body>
<header>
  <h1>Key</h1>
  <a href="/pengatur/keys">keys</a>
  <a href="/pengatur/stats">stats</a>
  <span class="dim" id="authState">token required</span>
</header>
<main>
  <section class="panel" id="authPanel">
    <h2>Admin token</h2>
    <div class="row">
      <input type="password" id="token" placeholder="ADMIN_TOKEN" autocomplete="off">
      <button class="primary" id="connect">Connect</button>
      <span class="hint">Held in localStorage for this browser only. Sent as a bearer token.</span>
    </div>
    <div class="msg" id="authHint"></div>
  </section>

  <section class="panel" id="summaryPanel" hidden>
    <h2 id="keyTitle">Summary</h2>
    <div class="grid" id="summary"></div>
    <div class="msg" id="summaryMsg"></div>
  </section>

  <section class="panel" id="chartPanel" hidden>
    <h2>Daily requests</h2>
    <div class="msg" id="chartNote"></div>
    <table>
      <thead><tr><th>day</th><th>requests</th><th></th><th>errors</th><th>cost</th></tr></thead>
      <tbody id="dailyRows"></tbody>
    </table>
  </section>

  <section class="panel" id="cooldownPanel" hidden>
    <h2>Cooldown timeline</h2>
    <div class="msg" id="coolNow"></div>
    <table>
      <thead><tr><th>when</th><th>status</th><th>error</th><th>rotated</th></tr></thead>
      <tbody id="eventRows"></tbody>
    </table>
  </section>

  <section class="panel" id="recentPanel" hidden>
    <h2>Recent requests</h2>
    <div class="msg" id="recentNote"></div>
    <table>
      <thead><tr><th>when</th><th>route</th><th>model</th><th>status</th><th>ms</th><th>tokens</th></tr></thead>
      <tbody id="recentRows"></tbody>
    </table>
  </section>
</main>
<script>
const TOKEN_KEY = "geminesx.admin.token";
const keyId = location.pathname.split("/").filter(Boolean).pop();

function token() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

async function api(path) {
  const res = await fetch(path, { headers: { authorization: "Bearer " + token() } });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || (data && data.ok === false)) {
    const message = data && data.error && data.error.message ? data.error.message : "HTTP " + res.status;
    throw new Error(message);
  }
  return data;
}

function say(node, text, cls) {
  node.textContent = text;
  node.className = "msg" + (cls ? " " + cls : "");
}

function when(ms) {
  if (!ms) return "-";
  const d = new Date(ms);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function left(ms) {
  if (!ms || ms <= 0) return "-";
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  if (s < 3600) return Math.round(s / 60) + "m";
  return Math.round(s / 3600) + "h";
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text == null ? "-" : String(text);
  return td;
}

function tagCell(status, ok) {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = "tag " + (ok ? "ok" : status === 429 ? "warn" : "err");
  span.textContent = String(status);
  td.appendChild(span);
  return td;
}

function summaryStat(label, value) {
  const box = document.createElement("div");
  box.className = "stat";
  const b = document.createElement("b");
  b.textContent = value == null ? "-" : String(value);
  const s = document.createElement("span");
  s.textContent = label;
  box.appendChild(b);
  box.appendChild(s);
  document.getElementById("summary").appendChild(box);
}

function renderDaily(daily) {
  const body = document.getElementById("dailyRows");
  body.innerHTML = "";
  const max = daily.reduce((m, d) => Math.max(m, Number(d.requests) || 0), 0);
  for (const d of daily) {
    const tr = document.createElement("tr");
    const barTd = document.createElement("td");
    barTd.className = "barCell";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.width = max > 0 ? Math.round(((Number(d.requests) || 0) / max) * 100) + "%" : "0%";
    barTd.appendChild(bar);
    tr.appendChild(cell(d.day));
    tr.appendChild(cell(d.requests));
    tr.appendChild(barTd);
    tr.appendChild(cell(d.errors));
    tr.appendChild(cell(d.costUsd == null ? "-" : "$" + Number(d.costUsd).toFixed(4)));
    body.appendChild(tr);
  }
}

function renderEvents(events) {
  const body = document.getElementById("eventRows");
  body.innerHTML = "";
  for (const e of events) {
    const tr = document.createElement("tr");
    tr.appendChild(cell(when(e.ts)));
    tr.appendChild(tagCell(e.status, e.ok));
    tr.appendChild(cell(e.errorCode));
    tr.appendChild(cell(e.rotated ? "yes" : "no"));
    body.appendChild(tr);
  }
}

function renderRecent(recent) {
  const body = document.getElementById("recentRows");
  body.innerHTML = "";
  for (const r of recent) {
    const tr = document.createElement("tr");
    tr.appendChild(cell(when(r.ts)));
    tr.appendChild(cell(r.route));
    tr.appendChild(cell(r.model));
    tr.appendChild(tagCell(r.status, r.status >= 200 && r.status < 300));
    tr.appendChild(cell(r.latencyMs));
    tr.appendChild(cell(r.totalTokens));
    body.appendChild(tr);
  }
}

function render(d) {
  const k = d.key;
  document.getElementById("keyTitle").textContent = k.masked + " · " + k.id;
  document.getElementById("summary").innerHTML = "";
  summaryStat("plan", k.plan);
  summaryStat("state", k.status);
  summaryStat("enabled", k.enabled === false ? "no" : "yes");
  summaryStat("failures", k.failures);
  summaryStat("invalidations", k.invalidations);
  summaryStat("last used", when(k.lastUsed));
  summaryStat("cooldown left", left(k.cooldownLeftMs));
  summaryStat("cooldown until", when(k.cooldownUntil));

  say(document.getElementById("chartNote"), d.dailyNote ?? "", "");
  renderDaily(d.daily ?? []);

  const cool = d.cooldown ?? {};
  say(
    document.getElementById("coolNow"),
    "status " + (cool.status ?? "ready") +
      " · until " + when(cool.until) +
      " · left " + left(cool.leftMs),
    "",
  );
  renderEvents(d.events ?? []);

  say(document.getElementById("recentNote"), (d.recent ?? []).length + " rows from the ring", "");
  renderRecent(d.recent ?? []);

  for (const id of ["summaryPanel", "chartPanel", "cooldownPanel", "recentPanel"]) {
    document.getElementById(id).hidden = false;
  }
}

async function refresh() {
  try {
    const data = await api("/pengatur/keys/" + encodeURIComponent(keyId) + "/data");
    render(data);
    document.getElementById("authState").textContent = "connected";
    say(document.getElementById("summaryMsg"), "", "");
  } catch (err) {
    say(document.getElementById("summaryMsg"), err.message, "err");
  }
}

document.getElementById("token").value = token();

document.getElementById("connect").addEventListener("click", async () => {
  const value = document.getElementById("token").value.trim();
  if (!value) {
    say(document.getElementById("authHint"), "Paste the admin token.", "err");
    return;
  }
  localStorage.setItem(TOKEN_KEY, value);
  say(document.getElementById("authHint"), "", "");
  await refresh();
});

refresh();
</script>
</body>
</html>`;
