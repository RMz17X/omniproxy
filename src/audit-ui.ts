/**
 * Audit console, served at GET /pengatur/audit.
 *
 * The trail of admin actions: who did what to which key and when. It carries
 * no data: the browser pastes the admin token once, then reads
 * /pengatur/audit/data with the filters below.
 *
 * Layout: the counts first, then the filters, then the trail as a feed. A
 * trail is a story told in time, so it reads as a feed and not as a grid.
 */

import { authGate, consolePage, icon, noticeBand } from "./ui.ts";

const AUDIT_BODY = `
${authGate()}

<div id="console" hidden>
  <div class="page-head">
    <div>
      <h1>Audit</h1>
      <p class="sub">Every admin action, newest first.</p>
    </div>
    <span class="meta" id="sWindow">-</span>
  </div>

  ${noticeBand()}

  <div class="grid kpis" id="kpis"></div>

  <section class="card">
    <div class="card-head">
      <h2>Filters</h2>
      <div class="actions">
        <label class="check"><input id="auto" type="checkbox"> Auto refresh every 15s</label>
      </div>
    </div>
    <div class="card-body">
      <div class="toolbar">
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
      <div id="msg" class="notice u-mt-3" role="status" aria-live="polite" ></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head">
      <h2>Trail</h2>
      <span class="meta" id="trailMeta"></span>
    </div>
    <div class="feed" id="trail"></div>
  </section>
</div>
`;

const AUDIT_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    sWindow: document.getElementById("sWindow"),
    action: document.getElementById("action"),
    since: document.getElementById("since"),
    limit: document.getElementById("limit"),
    auto: document.getElementById("auto"),
    refresh: document.getElementById("refreshBtn"),
    msg: document.getElementById("msg"),
    trail: document.getElementById("trail"),
    trailMeta: document.getElementById("trailMeta")
  };

  var state = { timer: null };

  function writeUrl() {
    GX.url.write({
      action: el.action.value.trim(),
      since: el.since.value,
      limit: el.limit.value
    });
  }

  function readUrl() {
    var params = GX.url.read();
    if (params.action) el.action.value = params.action;
    if (params.since) el.since.value = params.since;
    if (params.limit) el.limit.value = params.limit;
  }

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
    var kinds = {};
    rows.forEach(function (r) { kinds[r.action] = true; });

    el.kpis.textContent = "";
    el.kpis.appendChild(GX.kpi("Actions", GX.fmt.num(rows.length), "in this view"));
    el.kpis.appendChild(GX.kpi("Kinds", GX.fmt.num(Object.keys(kinds).length), "distinct action names"));
    el.kpis.appendChild(GX.kpi("Window", el.since.value ? "since " + el.since.value.replace("T", " ") : "all time", el.action.value.trim() ? "action " + el.action.value.trim() : "every action"));
    el.sWindow.textContent = rows.length ? rows.length + " recorded" : "-";

    el.trail.textContent = "";
    el.trailMeta.textContent = rows.length ? rows.length + (rows.length === 1 ? " entry" : " entries") : "";
    if (!rows.length) {
      el.trail.appendChild(GX.state(
        "empty",
        "No admin action recorded yet",
        "Key additions, probes, plan changes and exports land here the moment they happen."
      ));
      return;
    }

    rows.forEach(function (r) {
      var what = r.target || "";
      var detail = detailText(r.detail);
      el.trail.appendChild(GX.el("div", { class: "feed-item" }, [
        GX.el("span", { class: "act", text: r.action }),
        GX.el("span", { class: "what", text: (what ? what + " · " : "") + detail }),
        GX.el("span", { class: "what", text: r.actor || "" }),
        GX.el("time", { text: GX.fmt.stamp(r.ts) })
      ]));
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
  el.limit.addEventListener("change", function () { writeUrl(); reload(); });
  el.since.addEventListener("change", function () { writeUrl(); reload(); });
  el.action.addEventListener("keydown", function (event) {
    if (event.key === "Enter") reload();
  });
  el.auto.addEventListener("change", function () {
    if (state.timer) { state.timer(); state.timer = null; }
    if (el.auto.checked) state.timer = GX.every(15000, reload);
  });

  GX.shortcuts({ filter: "action", refresh: "refreshBtn" });
  GX.gate({
    onSuccess: function () {
      readUrl();
      return refresh();
    }
  });
})();
`;

export const AUDIT_HTML = consolePage({
  title: "Audit",
  active: "/pengatur/audit",
  actions:
    '<button id="refreshBtn" class="btn btn-sm" type="button">' +
    icon("refresh") +
    "Refresh</button>",
  body: AUDIT_BODY,
  script: AUDIT_SCRIPT,
});
