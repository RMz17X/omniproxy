/**
 * Keys console, served at GET /pengatur/keys, plus the per-key detail shell
 * at GET /pengatur/keys/:id.
 *
 * The list is the bulk console: pick rows, declare a plan for the whole
 * selection, probe, remove. The detail page is the single key view: counters,
 * the daily request chart, the cooldown timeline and the recent requests.
 *
 * Both shells carry no data: the browser pastes the admin token once, then
 * reads /pengatur/keys/list and /pengatur/keys/:id/data. Every mutation
 * addresses a key by its sha256 id, so no raw credential ever reaches the
 * browser.
 */

import { confirmDialog, consolePage, icon, noticeBand, stateBlock } from "./ui.ts";

/* ---------- response shapes ----------
 * The server half of this console lands on a parallel branch, so the fields
 * this page reads are declared here and every one of them is optional and
 * read defensively: the page still renders against the current server. */

export type KeyQuota = {
  metric: string | null;
  quotaId: string | null;
  limit: string | null;
  limitValue: string | null;
  window: string | null;
  location: string | null;
  consumer: string | null;
  resetAt: number | null;
  retryAfterMs: number;
  freeTier: boolean;
};

export type KeyTierEvidence = {
  tier: string;
  source: string;
  quotaId: string | null;
  quotaMetric: string | null;
  consumer: string | null;
  observedAt: number;
};

export type KeyRow = {
  id: string;
  key: string;
  provider?: string;
  status: string;
  plan: string;
  planValidated?: boolean;
  quota?: KeyQuota | null;
  nextAccessAt?: number | null;
  lastCheckedAt?: number | null;
  failCount?: number;
  reason?: string | null;
  lastError?: string | null;
  error?: string | null;
};

export type KeyTestResponse = {
  ok?: boolean;
  id?: string;
  status?: string;
  verdict?: string;
  httpStatus?: number;
  applied?: string;
  plan?: string;
  planValidated?: boolean;
  tierEvidence?: KeyTierEvidence | null;
  quota?: KeyQuota | null;
  message?: string;
  retryAfterMs?: number;
  nextAccessAt?: number | null;
  error?: string;
};

/* ---------- list ---------- */

const KEYS_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Govern</span>
      <h1 class="page-title">Keys</h1>
      <p class="page-lede">Every pooled key, its plan and its health.</p>
    </div>
    <div class="page-head-side">
      <span class="meta" id="poolMeta">-</span>
    </div>
  </header>

  ${noticeBand()}

  <div class="figures" id="kpis"></div>

  <section class="panel u-mt-4">
    <div class="panel-head">
      <h2>Pool</h2>
      <span class="meta" id="listMeta"></span>
      <div class="actions">
        <label class="switch" for="auto">
          <input id="auto" type="checkbox">
          <span>Auto refresh</span>
        </label>
        <button id="testAllBtn" class="btn btn-sm" type="button">${icon("test")}Test all</button>
        <button id="purgeDeadBtn" class="btn btn-sm" type="button" title="Delete every retired key (invalid or leaked). Quota-exhausted keys are live and stay.">${icon("trash")}Purge dead</button>
      </div>
    </div>

    <div class="panel-body">
      <div class="toolbar">
        <div class="filter-grid">
          <div class="filter-cell filter-search">
            <label class="field" for="keyFilter">Filter</label>
            <div class="search">
              ${icon("search", "icon", 14)}
              <input id="keyFilter" class="input" type="search" spellcheck="false" placeholder="masked key, id or plan">
            </div>
          </div>
          <div class="filter-cell">
            <label class="field" for="keyProvider">Provider</label>
            <select id="keyProvider" class="select">
              <option value="">all</option>
            </select>
          </div>
          <div class="filter-cell">
            <label class="field" for="keyStatus">Status</label>
            <select id="keyStatus" class="select">
              <option value="">all</option>
              <option value="ready">ready</option>
              <option value="cooling">cooling</option>
              <option value="quota">quota exhausted</option>
              <option value="dead">dead</option>
              <option value="unverified">unverified</option>
            </select>
          </div>
          <div class="filter-cell">
            <label class="field" for="keyPlan">Plan</label>
            <select id="keyPlan" class="select">
              <option value="">all</option>
              <option value="free">Free tier</option>
              <option value="paid">Pay as you go</option>
              <option value="pro">AI Pro / Ultra</option>
              <option value="unknown">Unspecified</option>
            </select>
          </div>
          <div class="filter-cell filter-size">
            <label class="field" for="keySize">Per page</label>
            <select id="keySize" class="select">
              <option value="10">10</option>
              <option value="25" selected>25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div id="bulkBar" class="panel-body u-rule-top" hidden>
      <div class="toolbar">
        <b id="selCount" class="u-tnum">0 selected</b>
        <button id="bulkApply" class="btn btn-sm" type="button">Validate plan</button>
        <button id="bulkRemove" class="btn btn-sm btn-danger" type="button">Remove selected</button>
        <span class="spacer"></span>
        <button id="bulkClear" class="btn btn-ghost btn-sm" type="button">Clear</button>
      </div>
      <div id="bulkMsg" class="notice u-mt-3" role="status" aria-live="polite"></div>
    </div>

    <div id="keysBody" class="table-wrap">${stateBlock("loading", "Loading the pool…")}</div>

    <div class="panel-foot">
      <div id="keyPager" class="pager u-full"></div>
    </div>
  </section>
</div>

${confirmDialog()}

<dialog id="addDialog" aria-labelledby="addTitle">
  <form id="addForm" method="dialog">
    <div class="panel-head">
      <h2 id="addTitle">Add keys</h2>
      <button class="btn btn-ghost btn-sm icon-btn" type="button" id="addClose" aria-label="Close">${icon("close")}</button>
    </div>
    <div class="panel-body">
      <div class="u-mb-3">
        <label class="field" for="newProvider">Provider</label>
        <select id="newProvider" class="select"></select>
        <p class="hint u-mt-2" id="newProviderHint"></p>
      </div>
      <label class="field" for="newKeys">One key per line, or separated by commas</label>
      <textarea id="newKeys" spellcheck="false" placeholder="key one&#10;key two"></textarea>
      <div class="toolbar u-mt-3">
        <button id="addSubmit" class="btn btn-primary" type="submit">Add to pool</button>
        <span id="addCount" class="hint"></span>
      </div>
      <div id="addMsg" class="notice u-mt-2" role="status" aria-live="polite"></div>
      <p class="hint u-mt-3">Raw values are never returned by the API. The console only ever holds the id and the masked form.</p>
    </div>
  </form>
</dialog>
`;

const KEYS_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    poolMeta: document.getElementById("poolMeta"),
    listMeta: document.getElementById("listMeta"),
    keysBody: document.getElementById("keysBody"),
    keyFilter: document.getElementById("keyFilter"),
    keyProvider: document.getElementById("keyProvider"),
    keyStatus: document.getElementById("keyStatus"),
    keyPlan: document.getElementById("keyPlan"),
    keySize: document.getElementById("keySize"),
    keyPager: document.getElementById("keyPager"),
    testAllBtn: document.getElementById("testAllBtn"),
    purgeDeadBtn: document.getElementById("purgeDeadBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    auto: document.getElementById("auto"),
    bulkBar: document.getElementById("bulkBar"),
    bulkApply: document.getElementById("bulkApply"),
    bulkRemove: document.getElementById("bulkRemove"),
    bulkClear: document.getElementById("bulkClear"),
    selCount: document.getElementById("selCount"),
    bulkMsg: document.getElementById("bulkMsg"),
    addBtn: document.getElementById("addBtn"),
    addDialog: document.getElementById("addDialog"),
    addClose: document.getElementById("addClose"),
    addForm: document.getElementById("addForm"),
    addSubmit: document.getElementById("addSubmit"),
    newProvider: document.getElementById("newProvider"),
    newProviderHint: document.getElementById("newProviderHint"),
    newKeys: document.getElementById("newKeys"),
    addCount: document.getElementById("addCount"),
    addMsg: document.getElementById("addMsg")
  };

  var state = { keys: [], providers: [], knownTiers: [], page: 1, size: 25, query: "", provider: "", status: "", plan: "", selected: {}, timer: null };

  var TIERS = [
    { value: "unknown", label: "Unspecified" },
    { value: "free", label: "Free tier" },
    { value: "paid", label: "Pay as you go" },
    { value: "pro", label: "AI Pro / Ultra" }
  ];

  function tierLabel(value) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].value === value) return TIERS[i].label;
    return value;
  }

  var COPY_ICON = ${JSON.stringify(icon("copy", "icon", 12))};
  /* The row actions. icon() is a module function and does not exist in the
     browser, so the markup is baked in here the same way COPY_ICON is. */
  var CHECK_ICON = ${JSON.stringify(icon("check", "icon", 16))};
  var PULSE_ICON = ${JSON.stringify(icon("pulse", "icon", 16))};
  var TRASH_ICON = ${JSON.stringify(icon("trash", "icon", 16))};

  var STATUS_LABEL = {
    ready: "Ready",
    cooling: "Cooling",
    quota: "Quota exhausted",
    dead: "Dead",
    unverified: "Unverified"
  };
  var STATUS_TONE = { ready: "ok", cooling: "accent", quota: "warn", dead: "bad", unverified: "neutral" };

  /* The status word on a row is not a fixed vocabulary yet, so the page reads
     the row instead of trusting one string. A quota answer must never fall
     into the dead column. */
  function statusKind(k) {
    var status = String((k && k.status) || "").toLowerCase();
    var quota = k && k.quota ? k.quota : null;
    if (status.indexOf("cool") >= 0 || status.indexOf("wait") >= 0) return "cooling";
    if (status.indexOf("quota") >= 0 || status.indexOf("exhaust") >= 0 ||
        status.indexOf("429") >= 0 || status.indexOf("rate") >= 0 ||
        status.indexOf("limit") >= 0) return "quota";
    if (status.indexOf("dead") >= 0 || status.indexOf("invalid") >= 0 ||
        status.indexOf("revoked") >= 0 || status.indexOf("denied") >= 0 ||
        status.indexOf("reject") >= 0) return "dead";
    if (status.indexOf("ready") >= 0 || status.indexOf("active") >= 0 || status === "ok") return "ready";
    if (!status) return quota ? "quota" : "unverified";
    if (status.indexOf("unverified") >= 0 || status.indexOf("unknown") >= 0) return "unverified";
    if (quota && quota.resetAt && Number(quota.resetAt) > Date.now()) return "quota";
    if (k && k.nextAccessAt && Number(k.nextAccessAt) > Date.now()) return "cooling";
    return "unverified";
  }

  /* Absolute times use the shared log stamp, so every page says the same thing. */
  function whenText(ms) {
    if (ms === null || ms === undefined || ms === "") return "";
    var n = Number(ms);
    if (!n || isNaN(n)) return "";
    var date = new Date(n);
    if (isNaN(date.getTime())) return "";
    return GX.fmt.stamp(n);
  }

  function quotaText(q) {
    if (!q) return "";
    var parts = [];
    if (q.metric) parts.push(q.metric);
    var cap = "";
    if (q.limitValue) cap = q.limitValue + (q.window ? "/" + q.window : "");
    else if (q.window) cap = q.window;
    if (cap) parts.push(cap);
    if (q.consumer) parts.push("consumer " + q.consumer);
    var reset = whenText(q.resetAt);
    if (reset) parts.push("resets " + reset);
    else if (q.retryAfterMs) parts.push("retry in " + GX.fmt.left(q.retryAfterMs));
    else if (q.freeTier) parts.push("free tier");
    return parts.join(" · ");
  }

  function statusDetail(k, kind) {
    if (kind === "cooling") {
      var until = whenText(k.nextAccessAt) || whenText(k.quota && k.quota.resetAt);
      return until ? "until " + until : "waiting out the window";
    }
    if (kind === "quota") return quotaText(k.quota) || "upstream quota is spent";
    if (kind === "dead") return k.reason || k.lastError || k.error || "rejected upstream";
    if (kind === "unverified") return "not probed yet";
    return "";
  }

  /* The plan is what the upstream answer said, never what an operator picked. */
  function rowPlan(k) {
    var kind = statusKind(k);
    var value = k.plan || k.tier || "";
    var out = { text: "Unspecified", marker: "" };
    if (k.planValidated === false) { out.marker = "not yet validated"; return out; }
    if (kind === "cooling" || kind === "quota") {
      out.marker = "held back while the key cannot serve";
      return out;
    }
    if (value) out.text = tierLabel(value);
    else out.marker = "not yet validated";
    return out;
  }

  /* Masked keys only. The console never fetches a raw credential: the
     list API hands out the masked form, and that is what is shown and
     copied. There is intentionally no raw-key reveal button or flow. */
  function copyKey(k, btn) {
    GX.copy(k.key || k.masked || "", "Masked key");
  }

  /* ErNor: never hide the key. A Google key is 39 characters and is shown in
     full. Anything longer is trimmed by at most three characters, which is the
     only case where the visible text is not the whole credential; the full
     value always stays in the cell's title and in the copy button. */
  var KEY_FULL_MAX = 42;
  function keyDisplay(value) {
    var text = String(value || "");
    if (text.length <= KEY_FULL_MAX) return text;
    return text.slice(0, text.length - 3) + "…";
  }

  function writeUrl() {
    GX.url.write({
      q: state.query, provider: state.provider, status: state.status, plan: state.plan,
      size: state.size !== 25 ? state.size : "",
      page: state.page > 1 ? state.page : ""
    });
  }

  function readUrl() {
    var params = GX.url.read();
    state.query = (params.q || "").toLowerCase();
    state.provider = params.provider || "";
    state.status = params.status || "";
    state.page = Number(params.page) || 1;
    if (el.keyFilter) el.keyFilter.value = params.q || "";
    if (el.keyProvider) el.keyProvider.value = state.provider;
    if (el.keyStatus) el.keyStatus.value = params.status || "";
    if (el.keyPlan) el.keyPlan.value = params.plan || "";
    if (params.size && el.keySize) { el.keySize.value = params.size; state.size = Number(params.size) || 25; }
  }

  /* The registry (GET /pengatur/keys/list -> providers) is the source of
     truth for the add-key dialog; keys observed in the pool extend the filter
     list so a provider whose keys predate the registry still filters. */
  function syncProviderOptions(keys) {
    var observed = {};
    keys.forEach(function (k) {
      var p = k.provider || "gemini";
      observed[p] = (observed[p] || 0) + 1;
    });
    var registry = {};
    (state.providers || []).forEach(function (p) {
      registry[p.id] = { label: p.label || p.id, caps: p.capabilities || [], keys: p.keys || 0 };
    });
    var ids = {};
    Object.keys(registry).forEach(function (p) { ids[p] = registry[p].keys || observed[p] || 0; });
    Object.keys(observed).forEach(function (p) { if (!(p in ids)) ids[p] = observed[p]; });
    if (state.provider) ids[state.provider] = ids[state.provider] || 0;

    if (el.keyProvider) {
      var currentVal = state.provider || el.keyProvider.value;
      el.keyProvider.textContent = "";
      var allOpt = document.createElement("option");
      allOpt.value = "";
      allOpt.textContent = "all (" + keys.length + ")";
      el.keyProvider.appendChild(allOpt);

      /* The filter names the size of each pool, so the operator picks a
         provider knowing how many keys sit behind it. */
      Object.keys(ids).sort().forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p;
        var name = registry[p] ? registry[p].label + " (" + p + ")" : p;
        opt.textContent = ids[p] ? name + " · " + ids[p] : name;
        if (p === currentVal) opt.selected = true;
        el.keyProvider.appendChild(opt);
      });
      el.keyProvider.value = currentVal;
    }

    if (el.newProvider) {
      var currentNewVal = el.newProvider.value || "";
      el.newProvider.textContent = "";
      var autoOpt = document.createElement("option");
      autoOpt.value = "";
      autoOpt.textContent = "Auto-detect from key format";
      if (!currentNewVal) autoOpt.selected = true;
      el.newProvider.appendChild(autoOpt);
      Object.keys(ids).sort().forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p;
        var label = registry[p] ? registry[p].label + " (" + p + ")" : p;
        var caps = registry[p] && registry[p].caps.length ? " · " + registry[p].caps.join("/") : "";
        opt.textContent = label + caps;
        if (p === currentNewVal) opt.selected = true;
        el.newProvider.appendChild(opt);
      });
      el.newProvider.value = currentNewVal;
      paintProviderHint();
    }
  }

  /* One line under the provider select: what the choice can serve, and how
     its keys are recognised when auto-detect is on. */
  function paintProviderHint() {
    if (!el.newProviderHint) return;
    var id = el.newProvider ? el.newProvider.value : "";
    if (!id) {
      el.newProviderHint.textContent = "Each key is matched to a provider by its format (AIza… Google, sk_… ElevenLabs, sk-… OpenAI-compatible gateways).";
      return;
    }
    var hit = null;
    (state.providers || []).forEach(function (p) { if (p.id === id) hit = p; });
    if (!hit) { el.newProviderHint.textContent = ""; return; }
    var caps = (hit.capabilities || []).join(", ") || "nothing";
    el.newProviderHint.textContent = "Serves: " + caps + ". Keys added here join that pool only.";
  }

  function visibleKeys() {
    var query = state.query;
    /* A dead key is never re-probed (test-all skips it) and can only return
       through a manual Validate, so most of a large pool is dead rows that can
       never serve again: 964 of them meant 39 pages of scrolling to reach the
       81 ready keys. They stay out of the default view; asking for
       status=dead shows them. */
    return state.keys.filter(function (k) {
      var prov = k.provider || "gemini";
      if (state.provider && prov !== state.provider) return false;
      var kind = statusKind(k);
      if (state.status && kind !== state.status) return false;
      if (!state.status && kind === "dead") return false;
      /* Plan was rendered with four options and wired to nothing, so the
         operator could filter by a plan that did nothing and then act on the
         whole pool. Match both the stored code and the label the row shows,
         the same way the search box does. */
      if (state.plan) {
        var planCode = k.plan || k.tier || "unknown";
        if (planCode !== state.plan && tierLabel(planCode) !== state.plan) return false;
      }
      if (!query) return true;
      /* Match what the operator can actually see. The stored plan is a code
         ("paid") while the table renders its label ("Pay as you go"), so a
         filter that only saw the code answered 0 rows for a term copied
         straight off the screen. */
      var planCode = k.plan || k.tier || "unknown";
      var haystack = [
        k.key,
        k.id,
        prov,
        k.status,
        planCode,
        tierLabel(planCode),
        rowPlan(k).text,
        k.label || ""
      ].join(" ").toLowerCase();
      return haystack.indexOf(query) >= 0;
    });
  }

  function selectedIds() {
    var out = [];
    for (var id in state.selected) if (state.selected[id]) out.push(id);
    return out;
  }

  function paintBulk() {
    var ids = selectedIds();
    el.bulkBar.hidden = ids.length === 0;
    el.selCount.textContent = ids.length + (ids.length === 1 ? " key selected" : " keys selected");

    /* Two specified visual states had no producer: a selected row never got
       aria-selected, and the thead box never went indeterminate on a partial
       selection. Both are derived state, so they are repainted wherever the
       selection changes rather than only on a full table rebuild. */
    var visible = visibleKeys().slice((state.page - 1) * state.size, state.page * state.size);
    var picked = 0;
    Array.prototype.forEach.call(el.keysBody.querySelectorAll("tbody tr[data-key-id]"), function (tr) {
      var on = Boolean(state.selected[tr.getAttribute("data-key-id")]);
      if (on) { tr.setAttribute("aria-selected", "true"); picked++; }
      else tr.removeAttribute("aria-selected");
    });
    var all = document.getElementById("selectAll");
    if (all) {
      all.indeterminate = picked > 0 && picked < visible.length;
      all.checked = visible.length > 0 && picked === visible.length;
    }
  }

  function renderKpis(pool) {
    el.kpis.textContent = "";
    el.kpis.appendChild(GX.kpi("Ready", GX.fmt.num(pool.ready), "selectable right now", "ok"));
    el.kpis.appendChild(GX.kpi("Cooling", GX.fmt.num(pool.cooling), "waiting out a quota", pool.cooling ? "warn" : ""));
    el.kpis.appendChild(GX.kpi("Dead", GX.fmt.num(pool.dead), "revoked or no quota", pool.dead ? "bad" : ""));
    el.kpis.appendChild(GX.kpi("Keys in pool", GX.fmt.num(pool.total), pool.degraded ? "degraded" : "shared by every instance"));
    /* Per-provider counts, in each provider's colour. A multi-provider pool
       is several pools wearing one number; the split is the first thing
       asked. The registry names every provider, so a custom one gets its own
       card the moment it holds a key. */
    var byProvider = pool.byProvider || pool.providers || {};
    var tone = function (p) {
      if (p === "gemini") return "prov-gemini";
      if (p === "elevenlabs") return "prov-elevenlabs";
      if (p === "whatstoken") return "prov-whatstoken";
      return "prov-custom";
    };
    var label = function (p) {
      var hit = null;
      (state.providers || []).forEach(function (x) { if (x.id === p) hit = x; });
      return hit && hit.label ? hit.label + " keys" : p + " keys";
    };
    Object.keys(byProvider).sort(function (a, b) {
      if (a === b) return 0;
      return a === "gemini" ? -1 : b === "gemini" ? 1 : a < b ? -1 : 1;
    }).forEach(function (p) {
      var snap = byProvider[p] || {};
      el.kpis.appendChild(GX.kpi(label(p), GX.fmt.num(snap.total || 0), (snap.ready || 0) + " ready", tone(p)));
    });
  }

  function tableHead() {
    return GX.el("thead", null, GX.el("tr", null, [
      GX.el("th", { class: "num", scope: "col" }, GX.el("label", { class: "pickbox" }, GX.el("input", {
        type: "checkbox",
        id: "selectAll",
        "aria-label": "Select every key on this page",
        "title": "Select the keys on this page"
      }))),
      /* A screen reader announced this table as an unnamed "table" with 9
         columns of unknown purpose: no caption, and th without scope. scope=col
         names what each column is; the caption is on the table element below. */
      GX.el("th", { text: "Id", "data-l": "id", scope: "col" }),
      GX.el("th", { text: "Key", "data-l": "key", scope: "col" }),
      GX.el("th", { text: "Provider", "data-l": "provider", scope: "col" }),
      GX.el("th", { text: "Plan", "data-l": "plan", scope: "col" }),
      GX.el("th", { text: "Status", "data-l": "status", scope: "col" }),
      GX.el("th", { class: "num", text: "Fails", "data-l": "fails", scope: "col" }),
      GX.el("th", { class: "num", text: "Cooldown", "data-l": "cooldown", scope: "col" }),
      GX.el("th", { text: "Last used", "data-l": "last used", scope: "col" }),
      GX.el("th", { class: "num", text: "", "data-l": "actions", scope: "col" }),
    ]));
  }

  function drawTable() {
    var filtered = visibleKeys();
    /* "shown" claimed every matching key while the pager renders one page.
       Say how many match, and let the pager state the visible range. */
    /* "N in pool" claimed the enrolled total while the pager renders one page,
       and it counted the dead rows that are hidden. Split the three numbers:
       enrolled, retired, and what actually matches right now. */
    var retired = 0;
    state.keys.forEach(function (k) { if (statusKind(k) === "dead") retired++; });
    var hiddenNote = !state.status && retired ? ", " + retired + " dead hidden" : "";
    el.listMeta.textContent = state.keys.length + " in pool" + hiddenNote + ", " + filtered.length +
      (filtered.length === 1 ? " matches" : " match") +
      (state.status || state.query || state.provider ? " these filters" : "");

    if (!filtered.length) {
      el.keysBody.textContent = "";
      el.keysBody.appendChild(GX.state(
        "empty",
        state.keys.length ? "No key matches this filter" : "Pool is empty",
        state.keys.length
          ? (!state.status && retired
            ? "Every key is dead. Pick status dead in the filter to see them."
            : "Clear the filter box to see the whole pool.")
          : "Add keys with the button above, or set GEMINI_API_KEYS on the deployment."
      ));
      renderPager(0, 1);
      paintBulk();
      return;
    }

    var pages = Math.max(1, Math.ceil(filtered.length / state.size));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var slice = filtered.slice((state.page - 1) * state.size, state.page * state.size);

    /* An unnamed table with 9 columns. The caption states what the columns are
       and what the row is, which is what a screen reader had to infer. */
    var table = GX.el("table", { class: "table", "aria-label": "API keys: id, full key, provider, plan, status, consecutive failures, cooldown, last used" });
    table.appendChild(tableHead());

    var body = GX.el("tbody");
    slice.forEach(function (k) {
      var tr = GX.el("tr", { "data-key-id": k.id, "data-provider": k.provider || "gemini" });

      var pick = GX.el("td", { class: "num pick" });
      var pickLabel = GX.el("label", { class: "pickbox" });
      var box = GX.el("input", { type: "checkbox", "aria-label": "Select key " + k.key });
      box.checked = Boolean(state.selected[k.id]);
      /* .table tbody tr[aria-selected="true"] was a specified visual state with
         no producer anywhere, so a selected row never looked selected. Set it
         from the same state the checkbox reads. */
      if (state.selected[k.id]) tr.setAttribute("aria-selected", "true");
      box.addEventListener("change", function () {
        state.selected[k.id] = box.checked;
        paintBulk();
      });
      pickLabel.appendChild(box);
      pick.appendChild(pickLabel);
      tr.appendChild(pick);

      var idCell = GX.el("td", { "data-l": "id" });
      idCell.appendChild(GX.el("a", {
        class: "mono link",
        href: "/pengatur/keys/" + encodeURIComponent(k.id),
        text: k.id
      }));
      tr.appendChild(idCell);

      var kind = statusKind(k);
      var keyCell = GX.el("td", { class: "key mono", "data-l": "key" });
      var keyText = GX.el("span", { class: "key-text", text: k.key });
      keyCell.appendChild(keyText);
      var copyBtn = GX.el("button", {
        class: "btn btn-ghost btn-sm icon-btn",
        type: "button",
        title: "Copy the masked key",
        "aria-label": "Copy the masked key",
        html: COPY_ICON
      });
      copyBtn.addEventListener("click", function () { copyKey(k, copyBtn); });
      /* The button used to be built, wired, and then dropped on the floor: it
         was never appended, so no row ever had a copy control. */
      keyCell.appendChild(copyBtn);
      /* Every row shows the masked form from the list API. Nothing is
         fetched per row: the masked text is the whole value shown here. */
      tr.appendChild(keyCell);

      var provCell = GX.el("td", { class: "provider-cell", "data-l": "provider" });
      provCell.appendChild(GX.providerTag(k.provider || "gemini"));
      tr.appendChild(provCell);

      var planCell = GX.el("td", { "data-l": "plan" });
      var plan = rowPlan(k);
      planCell.appendChild(GX.el("span", { class: "plan-text", text: plan.text }));
      if (plan.marker) {
        var planHint = GX.el("div", { class: "hint", text: plan.marker });
        planHint.title = plan.marker;
        planCell.appendChild(planHint);
      }
      tr.appendChild(planCell);

      var statusCell = GX.el("td", { "data-l": "status" });
      statusCell.appendChild(GX.tag(STATUS_LABEL[kind], STATUS_TONE[kind]));
      var detail = statusDetail(k, kind);
      if (detail) {
        var statusHint = GX.el("div", { class: "hint", text: detail });
        statusHint.title = detail;
        statusCell.appendChild(statusHint);
      }
      tr.appendChild(statusCell);

      GX.cell(tr, k.failCount !== undefined ? k.failCount : k.failures, "num", "fails");
      var coolMs = k.nextAccessAt ? Number(k.nextAccessAt) - Date.now() : k.cooldownLeftMs;
      GX.cell(tr, GX.fmt.left(coolMs), "num", "cooldown");
      GX.cell(tr, GX.fmt.age(k.lastUsed), "", "last used");

      var actions = GX.el("td", { class: "actions" });
      /* Three text buttons needed 186px, and a column squeezed below that
         wrapped them into a stack that spilled out of its row and over the row
         beneath. Icons carry the same three actions in 106px, which is what the
         column has, and the copy button beside the key is already an icon with
         a title, so the language matches. */
      var valBtn = GX.el("button", {
        class: "btn btn-ghost btn-sm icon-btn",
        type: "button",
        title: "Validate the plan behind this key",
        "aria-label": "Validate the plan behind this key",
        html: CHECK_ICON
      });
      valBtn.addEventListener("click", function () { validatePlan(k, valBtn); });
      var testBtn = GX.el("button", {
        class: "btn btn-ghost btn-sm icon-btn",
        type: "button",
        title: "Probe this key against upstream",
        "aria-label": "Probe this key against upstream",
        html: PULSE_ICON
      });
      testBtn.addEventListener("click", function () { testKey(k, testBtn); });
      var delBtn = GX.el("button", {
        class: "btn btn-danger btn-sm icon-btn",
        type: "button",
        title: "Remove this key from the pool",
        "aria-label": "Remove this key from the pool",
        html: TRASH_ICON
      });
      delBtn.addEventListener("click", function () { removeKey(k, delBtn); });
      actions.appendChild(valBtn);
      actions.appendChild(testBtn);
      actions.appendChild(delBtn);
      tr.appendChild(actions);

      body.appendChild(tr);
    });

    table.appendChild(body);
    /* A 15s auto-refresh used to replace the whole tbody, so focus inside a
       row (a checkbox, one of the three action buttons) was destroyed every
       quarter minute while the operator was mid-task. Remember which row and
       which cell held focus, then put it back on the rebuilt row. */
    var active = document.activeElement;
    var focusRow = active && active.closest ? active.closest("tr[data-key-id]") : null;
    var focusId = focusRow ? focusRow.getAttribute("data-key-id") : null;
    var focusCell = active && active.closest ? active.closest("td") : null;
    var focusIndex = focusRow && focusCell
      ? Array.prototype.indexOf.call(focusRow.children, focusCell) : -1;
    var focusTag = active ? active.tagName : "";

    el.keysBody.textContent = "";
    el.keysBody.appendChild(table);

    if (focusId) {
      var restored = document.querySelector('tr[data-key-id="' + focusId + '"]');
      if (restored) {
        var cell = focusIndex >= 0 ? restored.children[focusIndex] : null;
        var target = cell ? (cell.querySelector("input, button") || cell) : restored;
        try { target.focus({ preventScroll: true }); } catch (e) {}
      }
    } else if (focusTag === "INPUT" || focusTag === "SELECT") {
      /* A toolbar control keeps focus across a refresh; the tbody swap never
         touched it, but re-render can steal it when the control is rebuilt. */
      try { if (active && active.isConnected) active.focus({ preventScroll: true }); } catch (e) {}
    }

    var all = document.getElementById("selectAll");
    /* paintBulk derives indeterminate and aria-selected from the same state;
       calling it here keeps the header box correct right after a rebuild. */
    paintBulk();
    all.addEventListener("change", function () {
      slice.forEach(function (k) { state.selected[k.id] = all.checked; });
      drawTable();
    });

    renderPager(filtered.length, pages);
    paintBulk();
  }

  function renderPager(total, pages) {
    el.keyPager.textContent = "";
    if (!total) return;
    el.keyPager.appendChild(GX.el("span", {
      class: "meta",
      text: "showing " + ((state.page - 1) * state.size + 1) + "-" +
        Math.min(total, state.page * state.size) + " of " + total
    }));

    var box = GX.el("div", { class: "pages", role: "navigation", "aria-label": "Key pages" });
    function mk(label, page, disabled, active, label2) {
      var b = GX.el("button", {
        class: "pagebtn" + (active ? " active" : ""),
        type: "button",
        text: label,
        "aria-label": label2,
        disabled: disabled ? true : null
      });
      if (active) b.setAttribute("aria-current", "page");
      b.addEventListener("click", function () { state.page = page; writeUrl(); drawTable(); });
      return b;
    }
    box.appendChild(mk("‹", state.page - 1, state.page === 1, false, "Previous page"));
    var win = 5;
    var from = Math.max(1, state.page - Math.floor(win / 2));
    var to = Math.min(pages, from + win - 1);
    from = Math.max(1, to - win + 1);
    if (from > 1) {
      box.appendChild(mk("1", 1, false, state.page === 1));
      if (from > 2) box.appendChild(GX.el("span", { class: "gap", text: "…", "aria-hidden": "true" }));
    }
    for (var p = from; p <= to; p++) box.appendChild(mk(String(p), p, false, p === state.page));
    if (to < pages) {
      if (to < pages - 1) box.appendChild(GX.el("span", { class: "gap", text: "…", "aria-hidden": "true" }));
      box.appendChild(mk(String(pages), pages, false, state.page === pages));
    }
    box.appendChild(mk("›", state.page + 1, state.page === pages, false, "Next page"));
    el.keyPager.appendChild(box);
  }

  /* The plan is what the upstream answer proves, so a bulk action asks the
     upstream rather than declaring a tier. There is no operator dropdown. */
  function validateSelectedPlans(control) {
    var ids = selectedIds();
    if (!ids.length) { GX.notice("Select at least one key.", "err"); return; }
    GX.busy(control, "Validating…");
    GX.api("/pengatur/keys/validate-plan", { method: "POST", body: { ids: ids } })
      .then(function (data) {
        var list = (data && (data.results || data.keys)) || [];
        var ok = 0, failed = 0;
        list.forEach(function (row) { if (row && row.error) failed += 1; else ok += 1; });
        if (!list.length) ok = data && data.updated ? data.updated : 0;
        GX.notice(
          "Validated " + ok + " key(s)" + (failed ? ", " + failed + " could not be read." : "."),
          failed ? "warn" : "ok"
        );
        return reload();
      })
      .catch(function (err) { GX.notice("Plan validation failed: " + err.message, "err"); })
      .then(function () { GX.idle(control); });
  }

  function pickValidation(data, id) {
    data = data || {};
    var list = data.results || data.keys || null;
    if (list && list.length) {
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
      if (list.length === 1 && list[0]) return list[0];
    }
    return data;
  }

  function validatePlan(k, btn) {
    GX.busy(btn, "Validating…");
    GX.api("/pengatur/keys/validate-plan", { method: "POST", body: { ids: [k.id] } })
      .then(function (data) {
        var row = pickValidation(data, k.id);
        if (row.error) { GX.notice(k.key + ": " + row.error, "err"); return; }
        var tier = row.plan || row.tier || "";
        if (tier) {
          GX.notice(k.key + ": plan is " + tierLabel(tier) + ".", "ok");
          return;
        }
        GX.notice(k.key + ": " + (row.message || "the upstream answer did not name a plan."), "warn");
      })
      .catch(function (err) { GX.notice("Plan validation failed: " + err.message, "err"); })
      .then(function () { GX.idle(btn); return reload(); });
  }

  function testKey(k, btn) {
    btn.disabled = true;
    /* The button's whole content is an icon. Writing "Testing" into it and
       then "Test" back left the word behind next to two glyphs in a column
       measured at 172px; GX.busy saves and restores the content instead. */
    GX.busy(btn);
    GX.api("/pengatur/keys/test", { method: "POST", body: { id: k.id } })
      .then(function (data) {
        data = data || {};
        var kind = statusKind({ status: data.status || data.verdict, quota: data.quota });
        var tone = data.error || kind === "dead" ? "err" : kind === "ready" ? "ok" : "warn";
        GX.toast(testSummary(k, data), tone);
        return reload();
      })
      .catch(function (err) {
        GX.notice("Test failed: " + err.message, "err");
      })
      .then(function () {
        btn.disabled = false;
        GX.idle(btn);
      });
  }

  /* What the upstream actually answered, not what the console wishes it said. */
  function testSummary(k, data) {
    var parts = [];
    if (data.httpStatus) parts.push("HTTP " + data.httpStatus);
    if (data.verdict || data.status) parts.push(data.verdict || data.status);
    var quota = quotaText(data.quota);
    if (quota) parts.push(quota);
    var next = whenText(data.nextAccessAt);
    if (next) parts.push("next access " + next);
    else if (data.retryAfterMs) parts.push("retry in " + GX.fmt.left(data.retryAfterMs));
    var evidence = data.tierEvidence || null;
    if (evidence && evidence.tier) {
      parts.push("plan " + tierLabel(evidence.tier) + (evidence.source ? " via " + evidence.source : ""));
    } else if (data.plan) {
      parts.push("plan " + tierLabel(data.plan));
    }
    if (data.message) parts.push(data.message);
    if (data.error) parts.push("error: " + data.error);
    if (!parts.length) parts.push("no answer from upstream");
    return k.key + ": " + parts.join(" · ");
  }

  function purgeDead() {
    GX.confirm({
      title: "Purge dead keys?",
      message: "Delete every retired key (invalid or leaked). Quota-exhausted keys are live and stay.",
      confirmLabel: "Purge dead keys"
    }).then(function (ok) {
      if (!ok) return;
      GX.busy(el.purgeDeadBtn, "Purging…");
      GX.api("/pengatur/keys/purge-dead", { method: "POST" })
        .then(function () {
          /* The recheck timer now keeps the live pool healthy; this button only
             removes credentials that can never serve (invalid/leaked), so a dead
             row stops inflating the count. quota_exhausted keys stay - they are
             live and come back when the project gets an allocation. */
          GX.notice("Purged dead keys (invalid/leaked). Live keys untouched.", "ok");
          return reload();
        })
        .catch(function (err) {
          GX.notice("Purge failed: " + err.message, "err");
        })
        .then(function () { GX.idle(el.purgeDeadBtn); });
    });
  }

  function testAll() {
    GX.busy(el.testAllBtn, "Testing…");
    GX.api("/pengatur/keys/test-all", { method: "POST" })
      .then(function (data) {
        GX.notice("Tested " + data.tested + " keys.", "ok");
        return reload();
      })
      .catch(function (err) {
        /* #bulkMsg lives inside #bulkBar, which is hidden until something is
           selected - and Test all is the one action that runs with nothing
           selected, so the failure was written where nobody could read it. */
        GX.notice("Test all failed: " + err.message, "err");
      })
      .then(function () { GX.idle(el.testAllBtn); });
  }

  function removeKey(k, btn) {
    GX.confirm({
      title: "Remove this key?",
      message:
        "Remove " + k.key + " from the pool. The gateway stops serving with it. " +
        "It cannot be restored from this console, because the raw key never reaches the browser.",
      confirmLabel: "Remove key"
    }).then(function (ok) {
      if (!ok) return;
      removeKeyNow(k, btn);
    });
  }

  function removeKeyNow(k, btn) {
    btn.disabled = true;
    GX.api("/pengatur/keys", { method: "DELETE", body: { id: k.id } })
      .then(function (data) {
        GX.notice("Removed " + k.key + ". Pool total " + data.pool.total + ".", "ok");
        delete state.selected[k.id];
        return reload();
      })
      .catch(function (err) {
        btn.disabled = false;
        GX.notice("Remove failed: " + err.message, "err");
      });
  }

  function removeSelected() {
    var ids = selectedIds();
    if (!ids.length) return;
    var names = state.keys
      .filter(function (k) { return ids.indexOf(k.id) >= 0; })
      .slice(0, 3)
      .map(function (k) { return k.key; })
      .join(", ");
    GX.confirm({
      title: "Remove " + ids.length + (ids.length === 1 ? " key" : " keys") + "?",
      message:
        "Remove " + (names || ids.length + " keys") + (ids.length > 3 ? " and " + (ids.length - 3) + " more" : "") +
        " from the pool. The gateway stops serving with them, and they cannot be restored from this console.",
      confirmLabel: "Remove " + ids.length + (ids.length === 1 ? " key" : " keys")
    }).then(function (ok) {
      if (!ok) return;
      removeSelectedNow(ids);
    });
  }

  function removeSelectedNow(ids) {
    GX.busy(el.bulkRemove, "Removing…");
    GX.api("/pengatur/keys", { method: "DELETE", body: { ids: ids } })
      .then(function (data) {
        var removed = (data.removed || []).length;
        var failed = (data.failed || []).length;
        state.selected = {};
        GX.notice(
          failed
            ? "Removed " + removed + " key(s), " + failed + " could not be removed."
            : "Removed " + removed + (removed === 1 ? " key." : " keys."),
          failed ? "warn" : "ok"
        );
        return reload();
      })
      .catch(function (err) {
        GX.notice("Remove failed: " + err.message, "err");
      })
      .then(function () { GX.idle(el.bulkRemove); });
  }

  function addKeys() {
    var raw = el.newKeys.value;
    /* Empty provider = auto-detect: the server matches each key to a pool by
       its format, so a mixed paste lands in the right pools. */
    var provider = (el.newProvider && el.newProvider.value) ? el.newProvider.value.trim() : "";
    var keys = raw.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!keys.length) { GX.say(el.addMsg, "Nothing to add.", "err"); return; }
    GX.busy(el.addSubmit, "Adding…");
    GX.api("/pengatur/keys", { method: "POST", body: { keys: keys, provider: provider } })
      .then(function (data) {
        el.newKeys.value = "";
        el.addCount.textContent = "";
        var byProvider = data.providers || {};
        var split = Object.keys(byProvider).map(function (p) { return p + " ×" + byProvider[p]; }).join(", ");
        GX.say(
          el.addMsg,
          "Sent " + data.received + ", added " + data.added + (split ? " (" + split + ")" : "") + ".",
          data.added ? "ok" : ""
        );
        GX.closeDialog(el.addDialog);
        GX.notice(
          data.added ? "Added " + data.added + " key(s) to the pool." : "No key was added.",
          data.added ? "ok" : "warn"
        );
        return reload();
      })
      .catch(function (err) {
        GX.say(el.addMsg, "Add failed: " + err.message, "err");
        GX.notice("Add failed: " + err.message, "err");
      })
      .then(function () { GX.idle(el.addSubmit); });
  }

  /* A failed list keeps the header on screen: the operator still sees which
     columns exist, and the retry sits inside the table. */
  function drawListError(err) {
    el.keysBody.textContent = "";
    var table = GX.el("table", { class: "table" });
    table.appendChild(tableHead());
    var body = GX.el("tbody");
    var row = GX.el("tr");
    var td = GX.el("td", { colspan: "10" });
    var box = GX.state("error", "Could not load the pool", err && err.message ? err.message : "The list request failed.");
    var retry = GX.el("button", { class: "btn btn-sm", type: "button", text: "Try again" });
    retry.addEventListener("click", function () { refresh(); });
    box.appendChild(GX.el("div", { class: "u-mt-3" }, [retry]));
    td.appendChild(box);
    row.appendChild(td);
    body.appendChild(row);
    table.appendChild(body);
    el.keysBody.appendChild(table);
    el.listMeta.textContent = "could not load";
  }

  function refresh() {
    /* One request, one audit row. Asking per row cost 25 keys.raw audit
       writes on every render, and a 15s auto-refresh turned that into ~100
       rows a minute of page-view noise in the trail. */
    return GX.api("/pengatur/keys/list")
      .then(function (data) {
        state.keys = data.keys || [];
        state.providers = data.providers || [];
        syncProviderOptions(state.keys);
        state.knownTiers = data.knownTiers || [];
        var pool = data.pool || {};
        renderKpis(pool);
        el.poolMeta.textContent = "updated " + new Date().toLocaleTimeString("en-GB", { hour12: false });
        drawTable();
        el.console.hidden = false;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        drawListError(err);
        el.console.hidden = false;
        GX.notice("Refresh failed: " + err.message, "err");
      });
  }

  function reload() {
    return refresh().catch(function () {});
  }

  function startAuto() {
    if (state.timer || !el.auto.checked) return;
    state.timer = GX.every(15000, reload);
  }
  function stopAuto() {
    if (state.timer) { state.timer(); state.timer = null; }
  }

  el.addBtn.addEventListener("click", function () {
    GX.say(el.addMsg, "");
    paintProviderHint();
    GX.openDialog(el.addDialog);
    if (el.newKeys) el.newKeys.focus();
  });
  el.addClose.addEventListener("click", function () { GX.closeDialog(el.addDialog); });
  if (el.newProvider) el.newProvider.addEventListener("change", paintProviderHint);
  el.addForm.addEventListener("submit", function (event) { event.preventDefault(); addKeys(); });
  el.newKeys.addEventListener("input", function () {
    var n = el.newKeys.value.split(/[\\s,]+/).filter(function (s) { return s.trim(); }).length;
    el.addCount.textContent = n ? n + " key" + (n === 1 ? "" : "s") + " detected" : "";
  });
  el.refreshBtn.addEventListener("click", function () { reload(); });
  el.testAllBtn.addEventListener("click", testAll);
  if (el.purgeDeadBtn) el.purgeDeadBtn.addEventListener("click", purgeDead);
  el.auto.addEventListener("change", function () {
    if (el.auto.checked) startAuto(); else stopAuto();
  });
  el.bulkApply.addEventListener("click", function () { validateSelectedPlans(el.bulkApply); });
  el.bulkRemove.addEventListener("click", removeSelected);
  el.bulkClear.addEventListener("click", function () {
    state.selected = {};
    drawTable();
  });
  el.keyFilter.addEventListener("input", GX.debounce(function () {
    state.query = el.keyFilter.value.trim().toLowerCase();
    state.page = 1;
    writeUrl();
    drawTable();
  }, 140));
  if (el.keyProvider) {
    el.keyProvider.addEventListener("change", function () {
      state.provider = el.keyProvider.value;
      state.page = 1;
      writeUrl();
      drawTable();
    });
  }
  el.keyStatus.addEventListener("change", function () {
    state.status = el.keyStatus.value;
    state.page = 1;
    writeUrl();
    drawTable();
  });
  el.keyPlan.addEventListener("change", function () {
    state.plan = el.keyPlan.value;
    state.page = 1;
    writeUrl();
    drawTable();
  });
  el.keySize.addEventListener("change", function () {
    state.size = Number(el.keySize.value) || 25;
    state.page = 1;
    /* Per-page was the one view fact whose change handler never wrote the URL,
       so a shared link dropped back to 25 rows. */
    writeUrl();
    drawTable();
  });

  GX.shortcuts({
    filter: "keyFilter",
    refresh: "refreshBtn",
    onEscape: function () {
      if (!state.query && !state.status && !state.provider) return;
      state.query = "";
      state.status = "";
      state.provider = "";
      state.page = 1;
      el.keyFilter.value = "";
      if (el.keyProvider) el.keyProvider.value = "";
      el.keyStatus.value = "";
      writeUrl();
      drawTable();
    }
  });

  GX.gate({
    onSuccess: function () {
      readUrl();
      return refresh().then(function () { startAuto(); });
    }
  });
})();
`;

/* ---------- detail ---------- */

const DETAIL_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Govern · Key</span>
      <h1 class="page-title">Key detail</h1>
      <p class="page-lede" id="keyPath">-</p>
    </div>
    <div class="page-head-side">
      <div class="u-gap-2">
        <button class="btn btn-sm" id="detailValidate" type="button" title="Validate the plan behind this key" aria-label="Validate the plan behind this key">${icon("check")}Validate plan</button>
        <button class="btn btn-sm" id="detailTest" type="button" title="Probe this key against upstream" aria-label="Probe this key against upstream">${icon("pulse")}Probe</button>
        <button class="btn btn-sm btn-danger" id="detailRemove" type="button" title="Remove this key from the pool" aria-label="Remove this key from the pool">${icon("trash")}Remove</button>
        <a class="btn btn-sm" href="/pengatur/keys">${icon("back")}All keys</a>
      </div>
    </div>
  </header>

  ${noticeBand()}

  <section class="panel">
    <div class="panel-head">
      <h2>API key</h2>
      <span class="meta" id="keyMaskNote">masked only</span>
    </div>
    <div class="panel-body">
      <div class="credential">
        <code class="credential-value" id="keyRaw">…</code>
        <button class="btn btn-sm" id="keyCopy" type="button">${icon("copy")}Copy</button>
      </div>
    </div>
  </section>

  <section class="panel u-mt-4">
    <div class="panel-head">
      <h2>State</h2>
      <span class="meta" id="stateNote"></span>
    </div>
    <div class="panel-body">
      <dl class="defs" id="summary"></dl>
    </div>
  </section>

  <section class="panel u-mt-4" id="dailyPanel" hidden>
    <div class="panel-head">
      <h2>Daily requests</h2>
      <span class="meta" id="dailyNote"></span>
    </div>
    <div class="panel-body">
      <div id="dailyBars" class="bars"></div>
    </div>
    <div class="table-wrap">
      <table class="table" id="dailyTable">
        <thead><tr><th>Day</th><th class="num">Requests</th><th class="num">Errors</th><th class="num">Cost</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </section>

  <section class="panel u-mt-4" id="recentPanel" hidden>
    <div class="panel-head">
      <h2>Recent requests</h2>
      <span class="meta" id="recentNote"></span>
    </div>
    <div class="table-wrap">
      <table class="table" id="recentTable">
        <thead><tr><th>When</th><th>Route</th><th>Model</th><th>Status</th><th class="num">ms</th><th class="num">Tokens</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </section>

  <section class="panel u-mt-4" id="eventsPanel">
    <div class="panel-head">
      <h2>Cooldown timeline</h2>
      <span class="meta" id="cooldownNote"></span>
    </div>
    <div id="eventsFeed" class="feed"></div>
  </section>

  <p class="hint u-mt-3" id="noHistory"></p>
</div>
`;

const DETAIL_SCRIPT = `
(function () {
  "use strict";

  var keyId = location.pathname.split("/").filter(Boolean).pop();

  /* The plan vocabulary. TIERS and tierLabel live in the list page's script,
     and this is a separate IIFE that shares no scope with it, so the same
     table is baked in here. */

  /* Same normalised status vocabulary as the list page (ready / cooling /
     quota / dead / unverified): the detail page used to print the raw
     backend string, so the same key read differently on the two pages. */
  var DETAIL_STATUS_LABEL = { ready: "Ready", cooling: "Cooling", quota: "Quota exhausted", dead: "Dead", unverified: "Unverified" };
  var DETAIL_STATUS_TONE = { ready: "ok", cooling: "accent", quota: "warn", dead: "bad", unverified: "neutral" };
  function statusKindDetail(k) {
    var status = String((k && k.status) || "").toLowerCase();
    var quota = k && k.quota ? k.quota : null;
    if (status.indexOf("cool") >= 0 || status.indexOf("wait") >= 0) return "cooling";
    if (status.indexOf("quota") >= 0 || status.indexOf("exhaust") >= 0 ||
        status.indexOf("429") >= 0 || status.indexOf("rate") >= 0 ||
        status.indexOf("limit") >= 0) return "quota";
    if (status.indexOf("dead") >= 0 || status.indexOf("invalid") >= 0 ||
        status.indexOf("revoked") >= 0 || status.indexOf("denied") >= 0 ||
        status.indexOf("reject") >= 0) return "dead";
    if (status.indexOf("ready") >= 0 || status.indexOf("active") >= 0 || status === "ok") return "ready";
    if (!status) return quota ? "quota" : "unverified";
    if (status.indexOf("unverified") >= 0 || status.indexOf("unknown") >= 0) return "unverified";
    if (quota && quota.resetAt && Number(quota.resetAt) > Date.now()) return "quota";
    if (k && k.nextAccessAt && Number(k.nextAccessAt) > Date.now()) return "cooling";
    return "unverified";
  }
  var TIERS = [
    { value: "unknown", label: "Unspecified" },
    { value: "free", label: "Free tier" },
    { value: "paid", label: "Pay as you go" },
    { value: "pro", label: "AI Pro / Ultra" }
  ];

  function tierLabel(value) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].value === value) return TIERS[i].label;
    return value;
  }

  /* The masked form of the key on screen, for the probe toast. The list
     page's toast prefixes the same masked form; this page keeps it from
     renderCredential so the probe handler can match that toast exactly. */
  var detailMasked = "";

  /* Same shared log stamp as the list page. */
  function whenText(ms) {
    if (ms === null || ms === undefined || ms === "") return "";
    var n = Number(ms);
    if (!n || isNaN(n)) return "";
    var date = new Date(n);
    if (isNaN(date.getTime())) return "";
    return GX.fmt.stamp(n);
  }

  function quotaText(q) {
    if (!q) return "";
    var parts = [];
    if (q.metric) parts.push(q.metric);
    var cap = "";
    if (q.limitValue) cap = q.limitValue + (q.window ? "/" + q.window : "");
    else if (q.window) cap = q.window;
    if (cap) parts.push(cap);
    if (q.consumer) parts.push("consumer " + q.consumer);
    var reset = whenText(q.resetAt);
    if (reset) parts.push("resets " + reset);
    else if (q.retryAfterMs) parts.push("retry in " + GX.fmt.left(q.retryAfterMs));
    else if (q.freeTier) parts.push("free tier");
    return parts.join(" · ");
  }

  /* What the upstream actually answered, not what the console wishes it said.
     Same parts, same order as the list page's probe toast: verdict, quota,
     next access, plan. */
  function testSummary(data) {
    var parts = [];
    if (data.httpStatus) parts.push("HTTP " + data.httpStatus);
    if (data.verdict || data.status) parts.push(data.verdict || data.status);
    var quota = quotaText(data.quota);
    if (quota) parts.push(quota);
    var next = whenText(data.nextAccessAt);
    if (next) parts.push("next access " + next);
    else if (data.retryAfterMs) parts.push("retry in " + GX.fmt.left(data.retryAfterMs));
    var evidence = data.tierEvidence || null;
    if (evidence && evidence.tier) {
      parts.push("plan " + tierLabel(evidence.tier) + (evidence.source ? " via " + evidence.source : ""));
    } else if (data.plan) {
      parts.push("plan " + tierLabel(data.plan));
    }
    if (data.message) parts.push(data.message);
    if (data.error) parts.push("error: " + data.error);
    if (!parts.length) parts.push("no answer from upstream");
    return (detailMasked ? detailMasked + ": " : "") + parts.join(" · ");
  }

  /* Relative cooldown plus the absolute reset moment beside it. The detail
     endpoint carries both: cooldownLeftMs (the wait) and cooldownUntil (the
     instant). With no live cooldown the row keeps its old single value. */
  function cooldownText(k) {
    var rel = GX.fmt.left(k.cooldownLeftMs);
    if (k.cooldownLeftMs && k.cooldownUntil) {
      var abs = whenText(k.cooldownUntil);
      if (abs) return rel + " · until " + abs;
    }
    return rel;
  }

  var el = {
    console: document.getElementById("console"),
    detailValidate: document.getElementById("detailValidate"),
    detailTest: document.getElementById("detailTest"),
    detailRemove: document.getElementById("detailRemove"),
    keyPath: document.getElementById("keyPath"),
    keyRaw: document.getElementById("keyRaw"),
    keyCopy: document.getElementById("keyCopy"),
    keyMaskNote: document.getElementById("keyMaskNote"),
    summary: document.getElementById("summary"),
    stateNote: document.getElementById("stateNote"),
    dailyNote: document.getElementById("dailyNote"),
    dailyBars: document.getElementById("dailyBars"),
    dailyTable: document.getElementById("dailyTable"),
    dailyPanel: document.getElementById("dailyPanel"),
    cooldownNote: document.getElementById("cooldownNote"),
    eventsFeed: document.getElementById("eventsFeed"),
    recentNote: document.getElementById("recentNote"),
    recentTable: document.getElementById("recentTable"),
    recentPanel: document.getElementById("recentPanel"),
    eventsPanel: document.getElementById("eventsPanel"),
    noHistory: document.getElementById("noHistory")
  };

  /* The detail page shows the masked form only. No raw credential is
     fetched, revealed, or copied from this page. */
  function renderCredential(k) {
    el.keyRaw.textContent = k.masked || k.key || "-";
    el.keyRaw.title = "";
    el.keyMaskNote.textContent = "masked only";
    detailMasked = k.masked || k.key || "";
    el.keyCopy.disabled = false;
    el.keyCopy.onclick = function () { GX.copy(k.masked || k.key || "", "Masked key"); };
  }

  /* Seven KPI cards used to wrap into a 200px strip above the fold. A
     definition list carries the same facts in half the height and reads as a
     record rather than as a dashboard. */
  function renderSummary(k) {
    el.summary.textContent = "";
    var kind = statusKindDetail(k);
    var rows = [
      ["Provider", GX.providerLabel(k.provider) || "-", ""],
      /* The list shows the plan label ("Pay as you go"); the detail page used
         to show the raw code ("paid") for the same key. One fact, one word. */
      ["Plan", tierLabel(k.plan || "") || k.plan || "-", k.plan === "free" ? "ok" : ""],
      ["State", DETAIL_STATUS_LABEL[kind], DETAIL_STATUS_TONE[kind]],
      ["Enabled", k.enabled === false ? "no" : "yes", k.enabled === false ? "warn" : "ok"],
      ["Failures", k.failures, k.failures ? "warn" : ""],
      ["Invalidations", k.invalidations, k.invalidations ? "bad" : ""],
      ["Last used", k.lastUsed ? GX.fmt.age(k.lastUsed) : "never", ""],
      ["Cooldown left", cooldownText(k), k.cooldownLeftMs ? "warn" : ""]
    ];
    rows.forEach(function (r) {
      el.summary.appendChild(GX.el("div", { class: "def" }, [
        GX.el("dt", { text: r[0] }),
        GX.el("dd", { text: r[1] === null || r[1] === undefined ? "-" : String(r[1]) })
      ]));
    });
    el.stateNote.textContent = k.enabled === false ? "disabled by an operator" : "";
  }

  function renderDaily(daily) {
    el.dailyNote.textContent = daily.length ? "last " + daily.length + " days" : "";
    el.dailyBars.textContent = "";
    el.dailyTable.querySelector("tbody").textContent = "";
    el.dailyTable.hidden = !daily.length;
    /* A panel with nothing in it is dead space; the one-line note below the
       fold already says the rollup is empty. */
    el.dailyPanel.hidden = !daily.length;
    if (!daily.length) return;

    var max = 0;
    daily.forEach(function (d) { max = Math.max(max, Number(d.requests) || 0); });

    daily.forEach(function (d) {
      var requests = Number(d.requests) || 0;
      var width = max > 0 ? Math.round((requests / max) * 100) : 0;
      var errors = Number(d.errors) || 0;
      var tone = requests === 0 ? "" : errors > 0 ? "warn" : "ok";
      el.dailyBars.appendChild(GX.el("div", { class: "bar-row" }, [
        GX.el("span", { class: "label", text: d.day }),
        GX.el("div", { class: "bar-track" }, GX.el("div", { class: "bar-fill " + tone, style: "width:" + width + "%" })),
        GX.el("span", { class: "value", text: GX.fmt.num(requests) })
      ]));
    });

    daily.forEach(function (d) {
      var tr = GX.el("tr");
      GX.cell(tr, d.day, "", "day");
      GX.cell(tr, GX.fmt.num(d.requests), "num", "requests");
      GX.cell(tr, GX.fmt.num(d.errors), "num", "errors");
      GX.cell(tr, d.costUsd === null || d.costUsd === undefined ? "-" : GX.fmt.money(d.costUsd), "num", "cost");
      el.dailyTable.querySelector("tbody").appendChild(tr);
    });
  }

  function renderEvents(events) {
    el.eventsFeed.textContent = "";
    el.cooldownNote.textContent = events.length ? events.length + " events" : "";
    /* The timeline is the last panel and it always renders: when it used to
       appear and disappear, every panel below it (none now, but Daily and
       Recent sat after it) shifted. An empty feed states that instead. */
    if (!events.length) {
      el.eventsFeed.appendChild(GX.state(
        "empty",
        "No cooldown events",
        "No cooldown events recorded for this key yet."
      ));
      return;
    }
    events.forEach(function (e) {
      el.eventsFeed.appendChild(GX.el("div", { class: "feed-item" }, [
        GX.el("span", { class: "act", text: String(e.status) }),
        GX.el("span", { class: "what", text: e.errorCode ? e.errorCode + (e.rotated ? " · rotated to another key" : "") : (e.rotated ? "rotated to another key" : "failed") }),
        GX.el("time", { text: GX.fmt.time(e.ts) })
      ]));
    });
  }

  function renderRecent(recent) {
    var body = el.recentTable.querySelector("tbody");
    body.textContent = "";
    el.recentTable.hidden = !recent.length;
    el.recentPanel.hidden = !recent.length;
    el.recentNote.textContent = recent.length ? recent.length + " rows" : "";
    if (!recent.length) return;
    recent.forEach(function (r) {
      var tr = GX.el("tr");
      GX.cell(tr, GX.fmt.clock(r.ts), "mono", "when");
      GX.cell(tr, r.route, "mono", "route");
      GX.cell(tr, r.model || "-", "mono", "model");
      var statusCell = GX.el("td", { "data-l": "status" });
      statusCell.appendChild(GX.tag(String(r.status), r.ok ? "ok" : "bad"));
      tr.appendChild(statusCell);
      GX.cell(tr, GX.fmt.num(r.latencyMs), "num", "ms");
      GX.cell(tr, GX.fmt.num(r.totalTokens), "num", "tokens");
      body.appendChild(tr);
    });
  }

  function render(d) {
    var k = d.key;
    /* The provider badge rides in the lede: which upstream pool this key
       belongs to is the first fact about it. */
    el.keyPath.textContent = "";
    el.keyPath.appendChild(GX.providerTag(k.provider));
    el.keyPath.appendChild(document.createTextNode(" · id " + k.id));
    renderCredential(k);
    renderSummary(k);
    renderDaily(d.daily || []);
    renderEvents(d.events || []);
    renderRecent(d.recent || []);
    /* Daily and Recent still hide when empty; the timeline above now carries
       its own empty state, so it leaves this one-line note. */
    var empty = [];
    if (!(d.daily || []).length) empty.push("daily rollup");
    if (!(d.recent || []).length) empty.push("request ring");
    el.noHistory.textContent = empty.length
      ? "No " + empty.join(", ") + " recorded for this key yet."
      : "";
    el.console.hidden = false;
  }

  function refresh() {
    return GX.api("/pengatur/keys/" + encodeURIComponent(keyId) + "/data")
      .then(render)
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        if (err.status === 404) {
          GX.lock("No key with that id.");
          throw err;
        }
        /* The error used to land in #dailyBars, inside #dailyPanel, which
           carries hidden in the markup and is only unhidden by renderDaily() -
           a path that never runs here. The operator got a blank page after
           the header. #keyPath is above the console and always visible. */
        el.console.hidden = false;
        el.keyPath.textContent = "";
        el.keyPath.appendChild(GX.state("error", "Could not load this key", err.message));
      });
  }

  /* The detail page is its own IIFE and shares no scope with the list page's
     script, so its three actions implement the same three endpoints here. The
     list owns Probe / Validate / Remove; a dead key could only be investigated
     by going back to the list to find its row. */
  function post(url, body) {
    var headers = { "Content-Type": "application/json" };
    var token = GX.token();
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body || {}),
      cache: "no-store"
    }).then(function (res) {
      return res.json().then(function (d) {
        if (!res.ok) throw new Error((d && d.error && d.error.message) || "Request failed (" + res.status + ")");
        return d;
      });
    });
  }

  el.detailValidate.addEventListener("click", function () {
    GX.busy(el.detailValidate);
    post("/pengatur/keys/validate-plan", { ids: [keyId] })
      .then(function (d) {
        var r = (d.results || [])[0];
        GX.notice(r && r.tier
          ? "Plan " + tierLabel(r.tier) + (r.planValidated ? " verified." : " could not be verified.")
          : "Plan validated.", "ok");
        return refresh();
      })
      .catch(function (err) { GX.notice("Validate failed: " + err.message, "err"); })
      .then(function () { GX.idle(el.detailValidate); });
  });

  el.detailTest.addEventListener("click", function () {
    GX.busy(el.detailTest);
    post("/pengatur/keys/test", { id: keyId })
      .then(function (data) {
        /* Same toast as the list page's probe: verdict, quota, next access,
           plan. The tone follows the same rule the list uses, read off the
           verdict vocabulary (invalid/dead -> err, ok/ready -> ok). */
        data = data || {};
        var v = String(data.verdict || data.status || "").toLowerCase();
        var tone = data.error || v.indexOf("invalid") >= 0 || v.indexOf("dead") >= 0 || v.indexOf("revoked") >= 0
          ? "err"
          : (v.indexOf("ok") >= 0 || v.indexOf("ready") >= 0 ? "ok" : "warn");
        GX.toast(testSummary(data), tone);
        return refresh();
      })
      .catch(function (err) { GX.notice("Probe failed: " + err.message, "err"); })
      .then(function () { GX.idle(el.detailTest); });
  });

  el.detailRemove.addEventListener("click", function () {
    GX.confirm({
      title: "Remove this key?",
      message:
        "Remove key " + keyId + " from the pool. The gateway stops serving with it, " +
        "and it cannot be restored from this console, because the raw key never " +
        "reaches the browser.",
      confirmLabel: "Remove key"
    }).then(function (ok) {
      if (!ok) return;
      GX.busy(el.detailRemove);
      var headers = { "Content-Type": "application/json" };
      var token = GX.token();
      if (token) headers["Authorization"] = "Bearer " + token;
      return fetch("/pengatur/keys", {
        method: "DELETE",
        headers: headers,
        body: JSON.stringify({ ids: [keyId] }),
        cache: "no-store"
      }).then(function (res) {
        return res.json().then(function (d) {
          if (!res.ok) throw new Error((d && d.error && d.error.message) || "Request failed (" + res.status + ")");
          GX.notice("Key removed.", "ok");
          setTimeout(function () { location.href = "/pengatur/keys"; }, 800);
        });
      }).catch(function (err) { GX.notice("Remove failed: " + err.message, "err"); })
        .then(function () { GX.idle(el.detailRemove); });
    });
  });

  GX.shortcuts();
  GX.gate({ onSuccess: refresh });
})();
`;

export const KEYS_HTML = consolePage({
  title: "Keys",
  active: "/pengatur/keys",
  actions:
    '<button id="refreshBtn" class="btn btn-sm" type="button">' +
    icon("refresh") +
    "Refresh</button>" +
    '<button id="addBtn" class="btn btn-sm btn-primary" type="button">' +
    icon("plus") +
    "Add keys</button>",
  body: KEYS_BODY,
  script: KEYS_SCRIPT,
});

export const KEY_DETAIL_HTML = consolePage({
  title: "Key",
  active: "/pengatur/keys",
  body: DETAIL_BODY,
  script: DETAIL_SCRIPT,
});
