/**
 * Providers console, served at GET /pengatur/providers.
 *
 * The registry page: every upstream the gateway can serve, what it is allowed
 * to do (llm / tts / image / video / embeddings), and the keys behind it.
 * Providers are added here — an id, a base URL, a capability set and a key
 * format are all a new OpenAI-compatible gateway needs — with the model list
 * typed by hand or imported from the provider's own /v1/models.
 *
 * The shell carries no data: the browser pastes the admin token once, then
 * reads /pengatur/providers/list and writes through POST/PATCH/DELETE on the
 * shell path. Builtin providers (gemini, elevenlabs, whatstoken) are
 * code-owned: the console may toggle them and curate their model list, never
 * redefine their dialect.
 */

import { confirmDialog, consolePage, icon, noticeBand, stateBlock } from "./ui.ts";

/* ---------- response shapes ---------- */

export type ProviderRow = {
  id: string;
  label: string;
  baseUrl: string;
  capabilities: string[];
  wire: string;
  keyPattern?: string;
  models: string[];
  builtin: boolean;
  enabled: boolean;
  note: string;
  /** pooled keys belonging to this provider */
  keys: number;
  ready: number;
};

/* ---------- page ---------- */

const CAPABILITY_OPTIONS = ["llm", "tts", "image", "video", "embeddings"];

const PROVIDERS_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Govern</span>
      <h1 class="page-title">Providers</h1>
      <p class="page-lede">Every upstream this gateway serves, what each one may do, and the keys behind it.</p>
    </div>
    <div class="page-head-side">
      <span class="meta" id="listMeta">-</span>
    </div>
  </header>

  ${noticeBand()}

  <div class="figures" id="kpis"></div>

  <section class="panel u-mt-4">
    <div class="panel-head">
      <h2>Registry</h2>
      <span class="meta" id="countMeta"></span>
      <div class="actions">
        <button id="reloadBtn" class="btn btn-sm" type="button">${icon("refresh")}Refresh</button>
        <button id="addBtn" class="btn btn-sm btn-primary" type="button">${icon("plus")}Add provider</button>
      </div>
    </div>
    <div id="body" class="table-wrap">${stateBlock("loading", "Loading the registry…")}</div>
    <div class="panel-foot">
      <p class="hint">A provider is routable by naming its models as <code>provider/model</code> (for example <code>whatstoken/deepseek-v4.1-flash-1017</code>). A bare model id is resolved through the provider's own catalog.</p>
    </div>
  </section>
</div>

${confirmDialog()}

<dialog id="providerDialog" aria-labelledby="providerDialogTitle">
  <form id="providerForm" method="dialog">
    <div class="panel-head">
      <h2 id="providerDialogTitle">Add provider</h2>
      <button class="btn btn-ghost btn-sm icon-btn" type="button" id="providerClose" aria-label="Close">${icon("close")}</button>
    </div>
    <div class="panel-body">
      <div class="toolbar">
        <div class="grow">
          <label class="field" for="pId">Id</label>
          <input id="pId" class="input mono" type="text" spellcheck="false" autocomplete="off" placeholder="my-gateway">
          <p class="hint u-mt-1">Lowercase letters, digits and dashes. Used as the <code>provider/</code> route prefix.</p>
        </div>
        <div class="grow">
          <label class="field" for="pLabel">Label</label>
          <input id="pLabel" class="input" type="text" spellcheck="false" autocomplete="off" placeholder="My Gateway">
        </div>
      </div>
      <div class="u-mt-3">
        <label class="field" for="pBaseUrl">Base URL</label>
        <input id="pBaseUrl" class="input mono" type="url" spellcheck="false" autocomplete="off" placeholder="https://api.example.com/v1">
      </div>
      <fieldset class="u-mt-3">
        <legend class="field">Capabilities</legend>
        <div class="toolbar" id="pCaps">
          ${CAPABILITY_OPTIONS.map(
            (c) =>
              '<label class="switch" for="pCap-' +
              c +
              '"><input id="pCap-' +
              c +
              '" type="checkbox" value="' +
              c +
              '"><span>' +
              c +
              "</span></label>",
          ).join("")}
        </div>
        <p class="hint u-mt-2">A route refuses a provider without the capability it needs. An LLM-only gateway never answers TTS.</p>
      </fieldset>
      <div class="u-mt-3">
        <label class="field" for="pKeyPattern">Key format <span class="hint">(optional)</span></label>
        <input id="pKeyPattern" class="input mono" type="text" spellcheck="false" autocomplete="off" placeholder="^sk-[A-Za-z0-9_-]{16,}$">
        <p class="hint u-mt-1">A regular expression that recognises this provider's keys, so a pasted key lands in the right pool automatically.</p>
      </div>
      <div class="u-mt-3">
        <div class="toolbar">
          <label class="field u-mb-0 grow" for="pModels">Models</label>
          <button id="pImport" class="btn btn-sm" type="button">${icon("download")}Import from /v1/models</button>
        </div>
        <textarea id="pModels" spellcheck="false" rows="5" placeholder="deepseek-v4.1-flash-1017&#10;gpt-4o"></textarea>
        <p class="hint u-mt-1">One model id per line. A bare id a client asks for is routed here when it appears in this list or in the provider's live catalog.</p>
      </div>
      <div class="u-mt-3" id="pKeysRow">
        <label class="field" for="pKeys">First keys <span class="hint">(optional)</span></label>
        <textarea id="pKeys" spellcheck="false" rows="3" placeholder="sk-…"></textarea>
        <p class="hint u-mt-1">Added to the pool under this provider in the same step. A provider with no keys serves nothing.</p>
      </div>
      <div class="u-mt-3">
        <label class="field" for="pNote">Note</label>
        <input id="pNote" class="input" type="text" spellcheck="false" autocomplete="off" placeholder="what this upstream is for">
      </div>
      <div class="toolbar u-mt-3">
        <button id="pSubmit" class="btn btn-primary" type="submit">Add provider</button>
        <span id="pCount" class="hint"></span>
      </div>
      <div id="pMsg" class="notice u-mt-2" role="status" aria-live="polite"></div>
    </div>
  </form>
</dialog>
`;

const PROVIDERS_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    listMeta: document.getElementById("listMeta"),
    countMeta: document.getElementById("countMeta"),
    body: document.getElementById("body"),
    reloadBtn: document.getElementById("reloadBtn"),
    addBtn: document.getElementById("addBtn"),
    dialog: document.getElementById("providerDialog"),
    form: document.getElementById("providerForm"),
    dialogTitle: document.getElementById("providerDialogTitle"),
    closeBtn: document.getElementById("providerClose"),
    id: document.getElementById("pId"),
    label: document.getElementById("pLabel"),
    baseUrl: document.getElementById("pBaseUrl"),
    caps: document.getElementById("pCaps"),
    keyPattern: document.getElementById("pKeyPattern"),
    models: document.getElementById("pModels"),
    keysRow: document.getElementById("pKeysRow"),
    keys: document.getElementById("pKeys"),
    note: document.getElementById("pNote"),
    importBtn: document.getElementById("pImport"),
    submit: document.getElementById("pSubmit"),
    count: document.getElementById("pCount"),
    msg: document.getElementById("pMsg")
  };

  var state = { providers: [], editId: "" };

  var CAP_LABEL = {
    llm: "LLM", tts: "TTS", image: "Image", video: "Video", embeddings: "Embeddings"
  };

  function capTag(cap) {
    return GX.el("span", { class: "tag", "data-tone": "neutral" }, [
      GX.el("span", { class: "dot" }),
      GX.el("span", { text: CAP_LABEL[cap] || cap })
    ]);
  }

  function provTone(p) {
    if (p === "gemini") return "prov-gemini";
    if (p === "elevenlabs") return "prov-elevenlabs";
    if (p === "whatstoken") return "prov-whatstoken";
    return "prov-custom";
  }

  function tableHead() {
    var tr = GX.el("tr");
    ["Provider", "Base URL", "Capabilities", "Keys", "Models", "State", ""].forEach(function (h) {
      tr.appendChild(GX.el("th", { text: h }));
    });
    return tr;
  }

  function renderKpis() {
    el.kpis.textContent = "";
    var enabled = state.providers.filter(function (p) { return p.enabled; }).length;
    var keys = 0, ready = 0;
    state.providers.forEach(function (p) { keys += p.keys || 0; ready += p.ready || 0; });
    el.kpis.appendChild(GX.kpi("Providers", GX.fmt.num(state.providers.length), enabled + " enabled"));
    el.kpis.appendChild(GX.kpi("Keys pooled", GX.fmt.num(keys), "across every provider"));
    el.kpis.appendChild(GX.kpi("Ready", GX.fmt.num(ready), "selectable right now", "ok"));
  }

  function drawTable() {
    el.body.textContent = "";
    if (!state.providers.length) {
      el.body.appendChild(GX.state("empty", "No providers", "The registry is empty."));
      return;
    }
    var table = GX.el("table", { class: "table" });
    table.appendChild(tableHead());
    var body = GX.el("tbody");
    state.providers.forEach(function (p) {
      var tr = GX.el("tr", { "data-provider": p.id });

      var prov = GX.el("td", {}, [
        GX.el("div", { class: "row-gap" }, [
          GX.providerTag(p.id),
          GX.el("span", { class: "sub", text: p.builtin ? "builtin" : "custom" })
        ]),
        GX.el("div", { class: "sub", text: p.label })
      ]);
      tr.appendChild(prov);

      /* Base URL is the column; Wire rides under it as a subline, so the
         Provider column keeps its shape and no other column moves. The URL
         itself is mono and truncated with the table's own .sub ellipsis;
         the full URL stays in the title. */
      var urlCell = GX.el("td", { "data-l": "base url" });
      var urlText = GX.el("div", { class: "sub mono", style: "max-width: 280px", text: p.baseUrl || "-" });
      urlText.title = p.baseUrl || "";
      urlCell.appendChild(urlText);
      urlCell.appendChild(GX.el("div", { class: "sub", text: p.wire }));
      tr.appendChild(urlCell);

      var caps = GX.el("td");
      (p.capabilities || []).forEach(function (c) { caps.appendChild(capTag(c)); });
      if (!(p.capabilities || []).length) caps.appendChild(GX.el("span", { class: "sub", text: "none" }));
      tr.appendChild(caps);

      var keysCell = GX.el("td", { class: "u-tnum" });
      keysCell.appendChild(GX.el("a", {
        class: "link",
        href: "/pengatur/keys?provider=" + encodeURIComponent(p.id),
        text: (p.ready || 0) + "/" + (p.keys || 0)
      }));
      tr.appendChild(keysCell);
      var modelsCell = GX.el("td", { class: "u-tnum" });
      modelsCell.appendChild(GX.el("a", {
        class: "link",
        href: "/pengatur/models?provider=" + encodeURIComponent(p.id),
        text: String((p.models || []).length)
      }));
      tr.appendChild(modelsCell);
      tr.appendChild(GX.el("td", {}, [
        p.enabled ? GX.tag("enabled", "ok") : GX.tag("disabled", "warn")
      ]));

      var actions = GX.el("td", { class: "actions" });
      var edit = GX.el("button", { class: "btn btn-sm", type: "button", text: "Edit" });
      edit.addEventListener("click", function () { openDialog(p); });
      actions.appendChild(edit);

      var toggle = GX.el("button", { class: "btn btn-sm", type: "button", text: p.enabled ? "Disable" : "Enable" });
      toggle.addEventListener("click", function () { setEnabled(p, !p.enabled); });
      actions.appendChild(toggle);

      if (!p.builtin) {
        var del = GX.el("button", { class: "btn btn-sm btn-danger", type: "button", text: "Remove" });
        del.addEventListener("click", function () { removeProvider(p); });
        actions.appendChild(del);
      }

      tr.appendChild(actions);
      body.appendChild(tr);
    });
    table.appendChild(body);
    el.body.appendChild(table);
    el.countMeta.textContent = state.providers.length + " provider" + (state.providers.length === 1 ? "" : "s");
  }

  function reload() {
    return GX.api("/pengatur/providers/list")
      .then(function (data) {
        state.providers = data.providers || [];
        renderKpis();
        drawTable();
        el.listMeta.textContent = "updated " + new Date().toLocaleTimeString("en-GB", { hour12: false });
        el.console.hidden = false;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        el.console.hidden = false;
        el.body.textContent = "";
        el.body.appendChild(GX.state("error", "Could not load the registry", err && err.message ? err.message : "The request failed."));
      });
  }

  /* ---------- dialog ---------- */

  function resetDialog() {
    el.form.reset();
    state.editId = "";
    el.dialogTitle.textContent = "Add provider";
    el.submit.textContent = "Add provider";
    el.id.disabled = false;
    el.keysRow.hidden = false;
    el.count.textContent = "";
    GX.say(el.msg, "");
  }

  function openDialog(p) {
    resetDialog();
    if (p) {
      state.editId = p.id;
      el.dialogTitle.textContent = "Edit " + p.label;
      el.submit.textContent = "Save changes";
      el.id.value = p.id;
      el.id.disabled = true;
      el.label.value = p.label || "";
      el.baseUrl.value = p.baseUrl || "";
      el.keyPattern.value = p.keyPattern || "";
      el.models.value = (p.models || []).join("\\n");
      el.note.value = p.note || "";
      /* Builtins are code-owned: the console curates the model list and the
         enabled flag, nothing else. Custom entries keep every field. */
      el.label.disabled = Boolean(p.builtin);
      el.baseUrl.disabled = Boolean(p.builtin);
      el.keyPattern.disabled = Boolean(p.builtin);
      Array.prototype.forEach.call(el.caps.querySelectorAll("input"), function (box) {
        box.checked = (p.capabilities || []).indexOf(box.value) >= 0;
        box.disabled = Boolean(p.builtin);
      });
      el.keysRow.hidden = true;
      el.importBtn.disabled = p.wire !== "openai";
    } else {
      Array.prototype.forEach.call(el.caps.querySelectorAll("input"), function (box) {
        box.disabled = false;
      });
      el.label.disabled = false;
      el.baseUrl.disabled = false;
      el.keyPattern.disabled = false;
      el.importBtn.disabled = true;
    }
    GX.openDialog(el.dialog);
  }

  function pickedCaps() {
    var out = [];
    Array.prototype.forEach.call(el.caps.querySelectorAll("input:checked"), function (box) {
      out.push(box.value);
    });
    return out;
  }

  function splitLines(value) {
    return String(value || "").split(/[\\r\\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function countModels() {
    var n = splitLines(el.models.value).length;
    el.count.textContent = n ? n + " model" + (n === 1 ? "" : "s") : "";
  }

  function submitDialog() {
    var caps = pickedCaps();
    if (!state.editId) {
      if (!el.id.value.trim()) { GX.say(el.msg, "An id is required.", "err"); return; }
      if (!caps.length) { GX.say(el.msg, "Pick at least one capability.", "err"); return; }
    }
    var payload = {
      label: el.label.value,
      baseUrl: el.baseUrl.value,
      capabilities: caps,
      keyPattern: el.keyPattern.value,
      models: splitLines(el.models.value),
      note: el.note.value
    };
    if (!state.editId) {
      payload.id = el.id.value.trim();
      var keys = splitLines(el.keys.value);
      if (keys.length) payload.keys = keys;
    }
    GX.busy(el.submit, "Saving…");
    var call = state.editId
      ? GX.api("/pengatur/providers/" + encodeURIComponent(state.editId), { method: "PATCH", body: payload })
      : GX.api("/pengatur/providers", { method: "POST", body: payload });
    call
      .then(function (data) {
        GX.closeDialog(el.dialog);
        GX.notice(
          state.editId ? "Provider updated." : "Provider " + data.provider.id + " added" + (data.added ? " with " + data.added + " key(s)" : "") + ".",
          "ok"
        );
        return reload();
      })
      .catch(function (err) {
        GX.say(el.msg, "Save failed: " + err.message, "err");
      })
      .then(function () { GX.idle(el.submit); });
  }

  function importModels() {
    if (!state.editId) return;
    GX.busy(el.importBtn, "Importing…");
    GX.api("/pengatur/providers/" + encodeURIComponent(state.editId) + "/models")
      .then(function (data) {
        var ids = (data.models || []).map(function (m) { return m.id; });
        el.models.value = ids.join("\\n");
        countModels();
        GX.say(el.msg, "Imported " + ids.length + " model id(s). Review and save.", "ok");
      })
      .catch(function (err) {
        GX.say(el.msg, "Import failed: " + err.message, "err");
      })
      .then(function () { GX.idle(el.importBtn); });
  }

  function setEnabled(p, enabled) {
    GX.api("/pengatur/providers/" + encodeURIComponent(p.id), { method: "PATCH", body: { enabled: enabled } })
      .then(function () {
        GX.notice(p.label + (enabled ? " enabled." : " disabled."), "ok");
        return reload();
      })
      .catch(function (err) { GX.notice("Update failed: " + err.message, "err"); });
  }

  function removeProvider(p) {
    GX.confirm({
      title: "Remove " + p.label + "?",
      message: "The provider leaves the registry. Its pooled keys must be removed first.",
      confirmLabel: "Remove"
    }).then(function (ok) {
      if (!ok) return;
      GX.api("/pengatur/providers/" + encodeURIComponent(p.id), { method: "DELETE" })
        .then(function () {
          GX.notice(p.label + " removed.", "ok");
          return reload();
        })
        .catch(function (err) { GX.notice("Remove failed: " + err.message, "err"); });
    });
  }

  el.addBtn.addEventListener("click", function () { openDialog(null); });
  el.closeBtn.addEventListener("click", function () { GX.closeDialog(el.dialog); });
  el.submit.addEventListener("click", function (ev) { ev.preventDefault(); submitDialog(); });
  el.importBtn.addEventListener("click", importModels);
  el.models.addEventListener("input", countModels);
  el.reloadBtn.addEventListener("click", function () { reload(); });

  GX.shortcuts({ refresh: "reloadBtn" });
  GX.gate({ onSuccess: reload });
})();
`;

export const PROVIDERS_HTML = consolePage({
  title: "Providers",
  active: "/pengatur/providers",
  body: PROVIDERS_BODY,
  script: PROVIDERS_SCRIPT,
});
