/**
 * Audit console shell, served at GET /pengatur/audit.
 *
 * Carries no data: the browser pastes the admin token once, then reads
 * /pengatur/audit/data. Same visual language as the other /pengatur shells.
 */

export const AUDIT_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit · geminesx</title>
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
input, select { background:#11141b; color:var(--ink); border:1px solid var(--line); border-radius:6px; padding:6px 9px; font:inherit; }
input[type=password] { width:280px; }
table { width:100%; border-collapse:collapse; }
th, td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
th { color:var(--dim); font-weight:500; font-size:12px; white-space:nowrap; }
tr:last-child td { border-bottom:none; }
td.ts, td.actor { color:var(--dim); white-space:nowrap; font-variant-numeric:tabular-nums; }
td.action { color:var(--accent); white-space:nowrap; }
td.target { white-space:nowrap; }
td.detail { font-size:12px; color:var(--dim); word-break:break-word; max-width:520px; }
.empty { color:var(--dim); padding:14px 2px; }
.msg { min-height:20px; font-size:13px; }
.msg.err { color:var(--err); }
.msg.ok { color:var(--ok); }
.hint { color:var(--dim); font-size:12px; }
</style>
</head>
<body>
<header>
  <h1>Audit</h1>
  <a href="/pengatur/stats">stats</a>
  <a href="/pengatur/keys">keys</a>
  <a href="/pengatur/settings">settings</a>
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
    <div class="msg" id="authMsg"></div>
  </section>

  <section class="panel" id="viewPanel" hidden>
    <h2>Recorded admin actions</h2>
    <div class="row" style="margin-bottom:12px">
      <input id="action" placeholder="action prefix, e.g. keys." size="22" autocomplete="off">
      <input id="since" type="datetime-local">
      <select id="limit">
        <option value="50">50</option>
        <option value="100" selected>100</option>
        <option value="250">250</option>
        <option value="500">500</option>
      </select>
      <button id="refresh">Refresh</button>
      <label class="hint"><input type="checkbox" id="auto"> auto-refresh 15s</label>
    </div>
    <div class="msg" id="msg"></div>
    <div id="body"></div>
  </section>
</main>
<script>
const TOKEN_KEY = "geminesx.admin.token";
let timer = null;

function token() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

async function api(path) {
  const res = await fetch(path, { headers: { authorization: "Bearer " + token() } });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
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

function esc(v) {
  return String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
    p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

function detailText(v) {
  if (v === null || v === undefined) return "";
  try { return JSON.stringify(v); } catch { return String(v); }
}

function query() {
  const q = new URLSearchParams();
  const action = document.getElementById("action").value.trim();
  const since = document.getElementById("since").value;
  if (action) q.set("action", action);
  if (since) q.set("since", new Date(since).toISOString());
  q.set("limit", document.getElementById("limit").value);
  return "/pengatur/audit/data?" + q.toString();
}

function render(payload) {
  const rows = payload.rows ?? [];
  if (!payload.ok) {
    document.getElementById("body").innerHTML =
      "<p class=\\"empty\\">audit query failed: " + esc(payload.error ?? "database error") + "</p>";
    return;
  }
  if (!rows.length) {
    document.getElementById("body").innerHTML = "<p class=\\"empty\\">no admin actions recorded yet</p>";
    return;
  }
  const head = "<tr><th>when</th><th>action</th><th>target</th><th>actor</th><th>detail</th></tr>";
  const html = rows.map((r) =>
    "<tr>" +
      "<td class=\\"ts\\">" + esc(when(r.ts)) + "</td>" +
      "<td class=\\"action\\">" + esc(r.action) + "</td>" +
      "<td class=\\"target\\">" + (r.target ? esc(r.target) : "<span class=\\"dim\\">—</span>") + "</td>" +
      "<td class=\\"actor\\">" + esc(r.actor) + "</td>" +
      "<td class=\\"detail\\">" + (r.detail ? esc(detailText(r.detail)) : "") + "</td>" +
    "</tr>"
  ).join("");
  document.getElementById("body").innerHTML = "<table><thead>" + head + "</thead><tbody>" + html + "</tbody></table>";
}

async function refresh() {
  try {
    const payload = await api(query());
    render(payload);
    say(document.getElementById("msg"), payload.ok ? "" : "", payload.ok ? "" : "err");
    document.getElementById("viewPanel").hidden = false;
    document.getElementById("authPanel").hidden = true;
    document.getElementById("authState").textContent = "connected";
  } catch (err) {
    say(document.getElementById("msg"), err.message, "err");
  }
}

function autoRefresh() {
  if (timer) { clearInterval(timer); timer = null; return; }
  timer = setInterval(refresh, 15000);
}

document.getElementById("token").value = token();
document.getElementById("connect").addEventListener("click", () => {
  localStorage.setItem(TOKEN_KEY, document.getElementById("token").value.trim());
  say(document.getElementById("authMsg"), "", "");
  refresh();
});
document.getElementById("refresh").addEventListener("click", refresh);
document.getElementById("limit").addEventListener("change", refresh);
document.getElementById("auto").addEventListener("change", autoRefresh);
document.getElementById("action").addEventListener("keydown", (e) => { if (e.key === "Enter") refresh(); });
document.getElementById("since").addEventListener("change", refresh);
if (token()) refresh();
</script>
</body>
</html>`;