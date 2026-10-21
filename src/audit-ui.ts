/**
 * Audit console, served at GET /pengatur/audit.
 *
 * The trail of admin actions: who did what to which key and when. It carries
 * no data: the browser pastes the admin token once, then reads
 * /pengatur/audit/data with the filters below.
 *
 * Layout: one filter toolbar, then the trail as a table. An empty trail says
 * so in words instead of rendering an empty frame.
 */

import { authGate, consolePage } from "./ui.ts";

const PAGE_BODY = `

${authGate()}

<section id="console" hidden>
  <div class="strip">
    <div class="kv"><b id="sRows">0</b><span class="k">actions</span></div>
    <div class="kv"><b id="sActions">0</b><span class="k">kinds</span></div>
    <div class="spacer"></div>
    <div class="meta" id="sWindow">-</div>
  </div>

  <section class="panel">
    <div class="panel-head">
      <div class="panel-title">Recorded admin actions</div>
      <div class="row">
        <label class="check"><input id="auto" type="checkbox"> Auto refresh every 15s</label>
        <button id="refreshBtn" class="btn small" type="button"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M16.5 8A6.5 6.5 0 1 0 17 12"/><path d="M16.5 3.5V8H12"/></svg>Refresh</button>
      </div>
    </div>
    <div class="panel-body">
      <div class="row">
        <div class="grow">
          <label class="field" for="action">Action prefix</label>
          <input id="action" type="search" spellcheck="false" placeholder="keys." autocomplete="off">
        </div>
        <div class="grow">
          <label class="field" for="since">Since</label>
          <input id="since" type="datetime-local">
        </div>
        <div class="grow">
          <label class="field" for="limit">Limit</label>
          <select id="limit">
            <option value="50">50</option>
            <option value="100" selected>100</option>
            <option value="250">250</option>
            <option value="500">500</option>
          </select>
        </div>
      </div>
      <div id="msg" class="notice" role="status" aria-live="polite" style="margin-top:8px"></div>
    </div>
    <div class="tablewrap">
      <table class="table" id="body">
        <thead><tr><th>When</th><th>Action</th><th>Target</th><th>Actor</th><th>Detail</th></tr></thead>
        <tbody></tbody>
      </table>
      <div id="empty"></div>
    </div>
  </section>
</section>
`;

const PAGE_SCRIPT = `(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    sRows: document.getElementById("sRows"),
    sActions: document.getElementById("sActions"),
    sWindow: document.getElementById("sWindow"),
    body: document.getElementById("body"),
    empty: document.getElementById("empty"),
    action: document.getElementById("action"),
    since: document.getElementById("since"),
    limit: document.getElementById("limit"),
    auto: document.getElementById("auto"),
    msg: document.getElementById("msg"),
    refresh: document.getElementById("refreshBtn")
  };

  var state = { timer: null };

  function query() {
    var q = [];
    var action = el.action.value.trim();
    var since = el.since.value;
    if (action) q.push("action=" + encodeURIComponent(action));
    if (since) q.push("since=" + encodeURIComponent(new Date(since).toISOString()));
    q.push("limit=" + encodeURIComponent(el.limit.value));
    return "/pengatur/audit/data?" + q.join("&");
  }

  function detailText(v) {
    if (v === null || v === undefined) return "";
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  function render(payload) {
    var rows = payload.rows || [];
    var body = el.body.querySelector("tbody");
    body.textContent = "";
    el.empty.textContent = "";

    var kinds = {};
    rows.forEach(function (r) { kinds[r.action] = true; });
    el.sRows.textContent = rows.length;
    el.sActions.textContent = Object.keys(kinds).length;
    el.sWindow.textContent = el.action.value.trim()
      ? "action starts with " + el.action.value.trim()
      : "all actions";

    if (!rows.length) {
      el.empty.appendChild(GX.state(
        "empty",
        "No admin action recorded yet",
        "Key additions, probes, plan changes and exports land here the moment they happen."
      ));
      return;
    }

    rows.forEach(function (r) {
      var tr = GX.el("tr");
      GX.cell(tr, GX.fmt.stamp(r.ts), "mono nowrap", "when");
      var actionCell = GX.el("td", { "data-l": "action" });
      actionCell.appendChild(GX.el("span", { class: "mono", text: r.action }));
      tr.appendChild(actionCell);
      GX.cell(tr, r.target || "-", "mono", "target");
      GX.cell(tr, r.actor || "-", "", "actor");
      GX.cell(tr, detailText(r.detail), "dimtext", "detail");
      body.appendChild(tr);
    });
  }

  function refresh() {
    return GX.api(query())
      .then(function (payload) {
        if (payload.ok === false) {
          throw new Error((payload.error && payload.error.message) || "The audit query failed.");
        }
        render(payload);
        GX.say(el.msg, "");
        el.console.hidden = false;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        el.console.hidden = false;
        GX.say(el.msg, err.message, "err");
      });
  }

  function reload() {
    return refresh().catch(function () {});
  }

  el.refresh.addEventListener("click", function () { reload(); });
  el.limit.addEventListener("change", function () { reload(); });
  el.since.addEventListener("change", function () { reload(); });
  el.action.addEventListener("keydown", function (event) {
    if (event.key === "Enter") reload();
  });
  el.auto.addEventListener("change", function () {
    if (state.timer) { state.timer(); state.timer = null; }
    if (el.auto.checked) state.timer = GX.every(15000, reload);
  });

  GX.gate({ onSuccess: refresh });
})();`;

export const AUDIT_HTML = consolePage({
  title: "Audit",
  subtitle: "Every admin action, newest first",
  active: "/pengatur/audit",
  body: PAGE_BODY,
  script: PAGE_SCRIPT,
});
