/**
 * Settings console shell, served at GET /pengatur/settings.
 *
 * Read-only by design: cooldowns and tokens are deploy-time values on the
 * host, so the page reports them and says so, and never renders a token value
 * — only `set` or `unset`. The shell carries no data; it reads
 * /pengatur/settings/data with the pasted admin token.
 */

export const SETTINGS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Settings · geminesx</title>
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
input { background:#11141b; color:var(--ink); border:1px solid var(--line); border-radius:6px; padding:6px 9px; font:inherit; }
input[type=password] { width:280px; }
button:focus-visible, input:focus-visible, a:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
table { width:100%; border-collapse:collapse; }
th, td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums; white-space:nowrap; }
th { color:var(--dim); font-weight:500; font-size:12px; }
tr:last-child td { border-bottom:none; }
code { color:var(--ink); }
.tag { display:inline-block; padding:1px 7px; border-radius:999px; border:1px solid var(--line); font-size:12px; }
.tag.ok { color:var(--ok); border-color:var(--ok); }
.tag.miss { color:var(--dim); }
.msg { min-height:20px; font-size:13px; }
.msg.err { color:var(--err); }
.msg.ok { color:var(--ok); }
.hint { color:var(--dim); font-size:12px; }
.note { border-left:2px solid var(--warn); padding-left:10px; color:var(--dim); font-size:13px; }
</style>
</head>
<body>
<header>
  <h1>Settings</h1>
  <a href="/pengatur/stats">stats</a>
  <a href="/pengatur/keys">keys</a>
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
    <div class="msg" id="authMsg"></div>
  </section>

  <section class="panel" id="viewPanel" hidden>
    <h2>Effective configuration</h2>
    <div class="row" style="margin-bottom:12px">
      <button id="refresh">Refresh</button>
      <button id="exportBtn">Export JSON</button>
      <span class="hint">Export contains no secret values.</span>
    </div>
    <div class="msg" id="msg"></div>
    <div id="body"></div>
    <p class="note" id="note"></p>
  </section>
</main>
<script>
const TOKEN_KEY = "geminesx.admin.token";

function token() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

async function api(path, opts) {
  const init = Object.assign({ headers: {} }, opts ?? {});
  init.headers = Object.assign({}, init.headers, { authorization: "Bearer " + token() });
  const res = await fetch(path, init);
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
  return String(v).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function table(title, obj) {
  const rows = Object.entries(obj)
    .map(([k, v]) => "<tr><th>" + esc(k) + "</th><td>" + esc(v) + "</td></tr>")
    .join("");
  return "<h2>" + esc(title) + "</h2><table><tbody>" + rows + "</tbody></table>";
}

function render(d) {
  const parts = [];
  parts.push(table("Defaults", d.defaults));
  parts.push(table("Limits (ms)", d.limits));
  parts.push(table("Ledger", d.ledger));
  parts.push(table("Storage", d.storage));
  const env = (d.env ?? [])
    .map((e) => "<tr><td><code>" + esc(e.name) + "</code></td><td><span class=\"tag " + (e.state === "set" ? "ok\"\>set" : "miss\">unset") + "</span></td></tr>")
    .join("");
  parts.push("<h2>Environment</h2><table><thead><tr><th>name</th><th>state</th></tr></thead><tbody>" + env + "</tbody></table>");
  document.getElementById("body").innerHTML = parts.join("");
  document.getElementById("note").textContent = d.note ?? "";
}

async function refresh() {
  try {
    render(await api("/pengatur/settings/data"));
    say(document.getElementById("msg"), "", "");
    document.getElementById("viewPanel").hidden = false;
    document.getElementById("authPanel").hidden = true;
  } catch (err) {
    say(document.getElementById("msg"), err.message, "err");
  }
}

document.getElementById("token").value = token();

document.getElementById("connect").addEventListener("click", async () => {
  const value = document.getElementById("token").value.trim();
  if (!value) { say(document.getElementById("authMsg"), "Token is empty.", "err"); return; }
  localStorage.setItem(TOKEN_KEY, value);
  document.getElementById("authState").textContent = "token saved";
  say(document.getElementById("authMsg"), "", "");
  await refresh();
});

document.getElementById("refresh").addEventListener("click", refresh);

document.getElementById("exportBtn").addEventListener("click", async () => {
  const btn = document.getElementById("exportBtn");
  btn.disabled = true;
  try {
    const res = await fetch("/pengatur/settings/export", { headers: { authorization: "Bearer " + token() } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (res.headers.get("content-disposition") ?? "").match(/filename="([^"]+)"/)?.[1] ?? "geminesx-config.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    say(document.getElementById("msg"), err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

if (token()) refresh();
</script>
</body>
</html>`;
