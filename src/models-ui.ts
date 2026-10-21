/**
 * Models console, served at GET /pengatur/models.
 *
 * Live Gemini model inventory with pricing, a free tier verdict and a real
 * per model probe.
 *
 * Nothing is hardcoded in the client: /pengatur/models/list returns the live
 * list fetched from the Generative Language API, and every Test button
 * performs an actual generateContent call against the selected model.
 */

import { authGate, consolePage, icon, stateBlock, noticeBand } from "./ui.ts";

const MODELS_BODY = `
${authGate()}

<div id="console" hidden>
  <div class="page-head">
    <div>
      <h1>Models</h1>
      <p class="sub">Live inventory from the Generative Language API, joined with published pricing.</p>
    </div>
    <span class="meta" id="asOf">-</span>
  </div>

  ${noticeBand()}

  <div class="grid kpis" id="kpis"></div>

  <section class="card">
    <div class="card-head">
      <h2>Find a model</h2>
      <div class="actions">
        <button id="reloadBtn" class="btn btn-sm" type="button">${icon("refresh")}Refresh live list</button>
      </div>
    </div>
    <div class="card-body">
      <div class="toolbar">
        <div class="grow">
          <label class="field" for="q">Search</label>
          <input id="q" type="search" spellcheck="false" placeholder="gemini, tts, image, embedding">
        </div>
        <div class="grow">
          <label class="field" for="kind">Capability</label>
          <select id="kind">
            <option value="">all</option>
            <option value="text">text</option>
            <option value="tts">tts</option>
            <option value="image">image</option>
            <option value="video">video</option>
            <option value="audio">audio</option>
            <option value="live">live</option>
            <option value="transcribe">transcribe</option>
            <option value="embedding">embedding</option>
            <option value="omni">omni</option>
            <option value="robotics">robotics</option>
          </select>
        </div>
        <div class="grow">
          <label class="field" for="size">Per page</label>
          <select id="size"><option>10</option><option selected>25</option><option>50</option><option>100</option></select>
        </div>
      </div>
      <div class="row u-mt-4" >
        <span class="field u-mb-0">Your plan</span>
        <div class="seg" id="tier" role="group" aria-label="Billing plan">
          <button type="button" data-tier="free" aria-pressed="true">Free tier</button>
          <button type="button" data-tier="paid" aria-pressed="false">Pay as you go</button>
          <button type="button" data-tier="pro" aria-pressed="false">AI Pro</button>
          <button type="button" data-tier="any" aria-pressed="false">Everything</button>
        </div>
      </div>
      <p class="hint u-mt-3" id="tierNote" ></p>
      <div id="msg" class="notice u-mt-2" role="status" aria-live="polite" ></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head">
      <h2>Models</h2>
      <span class="meta" id="listMeta"></span>
    </div>
    <div id="body" class="tablewrap">${stateBlock("loading", "Loading the model list")}</div>
    <div class="card-foot">
      <div id="pager" class="pager u-full" ></div>
      <div id="rowMsg" class="notice" role="status" aria-live="polite"></div>
    </div>
  </section>
</div>
`;

const MODELS_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    asOf: document.getElementById("asOf"),
    tier: document.getElementById("tier"),
    tierNote: document.getElementById("tierNote"),
    q: document.getElementById("q"),
    kind: document.getElementById("kind"),
    size: document.getElementById("size"),
    reloadBtn: document.getElementById("reloadBtn"),
    body: document.getElementById("body"),
    pager: document.getElementById("pager"),
    listMeta: document.getElementById("listMeta"),
    msg: document.getElementById("msg"),
    rowMsg: document.getElementById("rowMsg")
  };

  var TIER_LABELS = {
    free: "Free tier",
    paid: "Pay as you go",
    pro: "AI Pro / Ultra",
    any: "All models"
  };

  var TIER_NOTES = {
    free: "Models marked paid only need billing enabled on the Google Cloud project behind the key.",
    paid: "Prices below are per 1M tokens in USD, from the published Google table.",
    pro: "AI Pro and Ultra quotas apply inside AI Studio, not to raw API keys. API keys bill through Cloud.",
    any: "Showing every model Google returns, regardless of billing."
  };

  var state = { models: [], page: 1, size: 25, tier: "free", testing: {} };

  function money(v) {
    if (v === null || v === undefined) return null;
    return "$" + (v >= 1 ? v.toFixed(2) : v.toFixed(3));
  }

  function tierMatches(m) {
    if (state.tier === "any") return true;
    if (m.free === true) return true;
    if (m.free === false) return state.tier !== "free";
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

  function renderKpis() {
    el.kpis.textContent = "";
    el.kpis.appendChild(GX.kpi("Models", GX.fmt.num(state.models.length), "returned by Google"));
    el.kpis.appendChild(GX.kpi("Free tier", GX.fmt.num(state.models.filter(function (m) { return m.free === true; }).length), "usable without billing", "ok"));
    el.kpis.appendChild(GX.kpi("Paid only", GX.fmt.num(state.models.filter(function (m) { return m.free === false; }).length), "need billing enabled", "warn"));
    el.kpis.appendChild(GX.kpi("Tested", GX.fmt.num(Object.keys(state.testing).length), "probed from this browser"));
    el.kpis.appendChild(GX.kpi("Your plan", TIER_LABELS[state.tier], "changes which models are listed"));
  }

  function badgeFor(m) {
    if (m.free === true) return GX.tag("free tier", "ok");
    if (m.free === false) return GX.tag("paid only", "warn");
    return GX.tag("unlisted", "plain");
  }

  function probeText(r) {
    if (!r) return "-";
    if (r.status === "ok") return "ok " + r.latencyMs + "ms";
    if (r.status === "unsupported") return "n/a";
    return String(r.status).replace(/_/g, " ") + " " + r.httpStatus;
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
    var slice = rows.slice((state.page - 1) * state.size, state.page * state.size);

    renderKpis();
    el.listMeta.textContent = rows.length + (rows.length === 1 ? " model" : " models");

    if (!rows.length) {
      el.body.textContent = "";
      el.body.appendChild(GX.state(
        "empty",
        "No model matches these filters",
        "Clear the search box or switch your plan to Everything."
      ));
      renderPager(0, 1);
      return;
    }
    el.body.textContent = "";

    var table = GX.el("table", { class: "table" });
    var head = GX.el("thead", null, GX.el("tr", null, [
      GX.el("th", { text: "Model" }),
      GX.el("th", { text: "Tier" }),
      GX.el("th", { class: "num", text: "Input /1M" }),
      GX.el("th", { class: "num", text: "Output /1M" }),
      GX.el("th", { class: "num", text: "Ctx" }),
      GX.el("th", { text: "Test" }),
      GX.el("th", { class: "num", text: "" })
    ]));
    table.appendChild(head);

    var body = GX.el("tbody");
    slice.forEach(function (m) {
      var tr = GX.el("tr");

      var idCell = GX.el("td", { "data-l": "model" });
      idCell.appendChild(GX.el("span", { class: "mono", text: m.id }));
      var bits = [m.displayName];
      if (m.kind && m.kind !== "text") bits.push(m.kind);
      if (m.methods && m.methods.length) bits.push(m.methods.join("/"));
      idCell.appendChild(GX.el("div", { class: "sub", text: bits.join(" · ") }));
      tr.appendChild(idCell);

      var tierCell = GX.el("td", { "data-l": "tier" });
      var badge = badgeFor(m);
      badge.title = m.freeLabel;
      tierCell.appendChild(badge);
      tr.appendChild(tierCell);

      var inCell = GX.el("td", { class: "num", "data-l": "input /1M" });
      var inV = money(m.inUsd);
      if (inV) inCell.textContent = inV;
      else inCell.appendChild(GX.el("span", { class: "sub", text: m.inRaw ? "unit" : "-" }));
      if (m.inRaw) inCell.title = m.inRaw;
      tr.appendChild(inCell);

      var outCell = GX.el("td", { class: "num", "data-l": "output /1M" });
      var outV = money(m.outUsd);
      if (outV) outCell.textContent = outV;
      else outCell.appendChild(GX.el("span", { class: "sub", text: m.outRaw ? "unit" : "-" }));
      if (m.outRaw) outCell.title = m.outRaw;
      tr.appendChild(outCell);

      var ctxCell = GX.el("td", { class: "num", "data-l": "ctx" });
      ctxCell.textContent = m.inputTokenLimit
        ? (m.inputTokenLimit >= 1000 ? Math.round(m.inputTokenLimit / 1000) + "k" : String(m.inputTokenLimit))
        : "-";
      tr.appendChild(ctxCell);

      var probeCell = GX.el("td", { "data-l": "test" });
      var known = state.testing[m.id];
      var pv = GX.el("span", { class: "mono", text: probeText(known) });
      if (known && known.message) pv.title = known.message;
      probeCell.appendChild(pv);
      tr.appendChild(probeCell);

      var actions = GX.el("td", { class: "actions" });
      var btn = GX.el("button", { class: "btn btn-sm", type: "button", text: "Test" });
      btn.addEventListener("click", function () { testModel(m, btn, pv); });
      actions.appendChild(btn);
      tr.appendChild(actions);

      body.appendChild(tr);
    });

    table.appendChild(body);
    el.body.textContent = "";
    el.body.appendChild(table);
    renderPager(rows.length, pages);
  }

  function renderPager(total, pages) {
    el.pager.textContent = "";
    if (!total) return;
    el.pager.appendChild(GX.el("span", {
      text: "showing " + ((state.page - 1) * state.size + 1) + "-" +
        Math.min(total, state.page * state.size) + " of " + total
    }));

    var box = GX.el("div", { class: "pages" });
    function mk(label, page, disabled, active) {
      var b = GX.el("button", {
        class: active ? "active" : "",
        type: "button",
        text: label,
        disabled: disabled ? true : null
      });
      if (active) b.setAttribute("aria-current", "page");
      b.addEventListener("click", function () { state.page = page; render(); });
      return b;
    }
    box.appendChild(mk("Prev", state.page - 1, state.page === 1, false));
    var win = 5;
    var from = Math.max(1, state.page - Math.floor(win / 2));
    var to = Math.min(pages, from + win - 1);
    from = Math.max(1, to - win + 1);
    if (from > 1) {
      box.appendChild(mk("1", 1, false, state.page === 1));
      if (from > 2) box.appendChild(GX.el("span", { text: "..." }));
    }
    for (var p = from; p <= to; p++) box.appendChild(mk(String(p), p, false, p === state.page));
    if (to < pages) {
      if (to < pages - 1) box.appendChild(GX.el("span", { text: "..." }));
      box.appendChild(mk(String(pages), pages, false, state.page === pages));
    }
    box.appendChild(mk("Next", state.page + 1, state.page === pages, false));
    el.pager.appendChild(box);
  }

  function load(force) {
    GX.busy(el.reloadBtn, "Loading");
    var url = "/pengatur/models/list" + (force ? "?refresh=1" : "");
    return GX.api(url)
      .then(function (data) {
        state.models = data.models || [];
        var source = data.source || "upstream";
        GX.say(el.msg, state.models.length + " models from " + source + (data.cached ? " (cached)" : ""), "ok");
        el.asOf.textContent = "pricing " + (data.pricing && data.pricing.asOf ? data.pricing.asOf : "-");
        el.console.hidden = false;
        render();
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        el.console.hidden = false;
        renderKpis();
        GX.say(el.msg, "Could not load the model list: " + err.message, "err");
        el.asOf.textContent = "pricing unavailable";
        el.body.textContent = "";
        el.body.appendChild(GX.state(
          "error",
          "Live list unavailable",
          err.message + " Check the key in Keys, then refresh the list."
        ));
      })
      .then(function () { GX.idle(el.reloadBtn); });
  }

  function reload() {
    return load(false).catch(function () {});
  }

  function testModel(m, btn, node) {
    btn.disabled = true;
    node.textContent = "testing...";
    GX.say(el.rowMsg, "Calling " + m.id + " with a pooled key...", "");
    GX.api("/pengatur/models/test", { method: "POST", body: { model: m.id } })
      .then(function (data) {
        var r = data.result;
        state.testing[m.id] = r;
        node.textContent = probeText(r);
        node.title = r.message || "";
        if (r.status === "ok") {
          GX.say(el.rowMsg, m.id + " served in " + r.latencyMs + "ms: " + (r.reply || "(empty reply)"), "ok");
        } else {
          GX.say(el.rowMsg, m.id + " -> " + r.status + " (HTTP " + r.httpStatus + "): " + r.message, r.status === "rate_limited" ? "" : "err");
        }
        renderKpis();
      })
      .catch(function (err) {
        node.textContent = "error";
        GX.say(el.rowMsg, "Test failed: " + err.message, "err");
        if (err.status === 401 || err.status === 403) GX.lock(err.message + " Re-enter the token.");
      })
      .then(function () { btn.disabled = false; });
  }

  el.reloadBtn.addEventListener("click", function () { load(true); });
  el.size.addEventListener("change", function () {
    state.size = Number(el.size.value) || 25;
    state.page = 1;
    render();
  });
  el.q.addEventListener("input", GX.debounce(function () {
    state.page = 1;
    render();
  }, 140));
  el.kind.addEventListener("change", function () {
    state.page = 1;
    render();
  });
  Array.prototype.forEach.call(el.tier.querySelectorAll("button"), function (button) {
    button.addEventListener("click", function () {
      state.tier = button.getAttribute("data-tier");
      try { localStorage.setItem("geminesx.tier", state.tier); } catch (e) {}
      Array.prototype.forEach.call(el.tier.querySelectorAll("button"), function (other) {
        other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      el.tierNote.textContent = TIER_NOTES[state.tier];
      state.page = 1;
      render();
    });
  });

  var savedTier = null;
  try { savedTier = localStorage.getItem("geminesx.tier"); } catch (e) {}
  if (savedTier && TIER_LABELS[savedTier]) {
    state.tier = savedTier;
    Array.prototype.forEach.call(el.tier.querySelectorAll("button"), function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-tier") === savedTier ? "true" : "false");
    });
  }
  el.tierNote.textContent = TIER_NOTES[state.tier];

  GX.gate({ onSuccess: load });
})();
`;

export const MODELS_HTML = consolePage({
  title: "Models",
  active: "/pengatur/models",
  body: MODELS_BODY,
  script: MODELS_SCRIPT,
});
