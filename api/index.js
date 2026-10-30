var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config.ts
var num, list, cfg, VOICE_MAP;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    num = (v2, d) => {
      const n = Number(v2);
      return Number.isFinite(n) && n > 0 ? n : d;
    };
    list = (v2, d) => {
      const fromEnv = (v2 ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return fromEnv.length ? fromEnv : d;
    };
    cfg = {
      /**
       * upstream base, no trailing slash
       *
       * A getter, not a plain field: the test harness boots its mock upstream on
       * an OS-assigned port and only then knows the URL. Reading the env var at
       * call time means the harness does not have to win a module-evaluation race
       * against this file.
       */
      get upstream() {
        return process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com";
      },
      /** per-key pacing, ENFORCED by pool.selectable(): a key whose lastUsed is
       *  inside this window is not selectable at all (not merely deprioritised
       *  by LRU). 4000ms == 15 RPM, the Gemini free-tier ceiling per project. */
      rateWindowMs: num(process.env.KEY_RATE_WINDOW_MS, 4e3),
      /** cooldown applied on 429 / RESOURCE_EXHAUSTED */
      cooldownMs: num(process.env.KEY_COOLDOWN_MS, 6e4),
      /** cooldown applied on 5xx */
      serverErrCooldownMs: num(process.env.KEY_5XX_COOLDOWN_MS, 15e3),
      /** max key attempts per request before giving up */
      // 10 per operator policy: a 429 must rotate to another still-valid key, and
      // the console can override this at runtime (see settings-store.ts).
      maxAttempts: num(process.env.MAX_ATTEMPTS, 10),
      /** how long to wait for a busy pool before 429-ing the client */
      maxWaitMs: num(process.env.MAX_WAIT_MS, 8e3),
      /** hard ceiling for one upstream attempt; also the client-disconnect bound */
      upstreamTimeoutMs: num(process.env.UPSTREAM_TIMEOUT_MS, 12e4),
      /**
       * Ceiling for a *fallback* model attempt.
       *
       * A congested model does not answer fast — measured 2026-10-22:
       * `gemini-3.8-flash` took 49-99 s before answering 503, and
       * `gemini-flash-latest` never answered at all. Waiting the full upstream
       * timeout on every fallback turns one request into minutes of silence, so a
       * fallback is given a short window: it either serves quickly or the chain
       * moves on.
       */
      fallbackTimeoutMs: num(process.env.FALLBACK_TIMEOUT_MS, 2e4),
      /**
       * Ceiling for the whole model chain, so a client is always answered.
       * The first (requested) model keeps `upstreamTimeoutMs`; whatever budget is
       * left is shared by the fallbacks.
       */
      modelChainBudgetMs: num(process.env.MODEL_CHAIN_BUDGET_MS, 45e3),
      /** default model when the client omits one */
      defaultModel: process.env.DEFAULT_MODEL ?? "gemini-3.5-flash",
      defaultTtsModel: process.env.DEFAULT_TTS_MODEL ?? "gemini-3.8-flash-tts",
      defaultEmbedModel: process.env.DEFAULT_EMBED_MODEL ?? "gemini-embedding-001",
      defaultVoice: process.env.DEFAULT_VOICE ?? "Kore",
      adminToken: process.env.ADMIN_TOKEN ?? "",
      /**
       * Scoped credential for machine ingestion (`POST /pengatur/keys` only).
       * A harvester should not hold a token that can also delete or purge keys;
       * empty means the endpoint keeps requiring ADMIN_TOKEN.
       */
      ingestToken: process.env.INGEST_TOKEN ?? "",
      /** OpenAI-compatible bearer the clients present ("" = open) */
      clientToken: process.env.CLIENT_TOKEN ?? "",
      /** inject Google Search grounding when the client asks for "search" */
      searchModel: process.env.SEARCH_MODEL ?? "gemini-3.5-flash",
      /**
       * Ordered models to try when the upstream refuses a model rather than a key
       * (404 retired, 503 high demand). The requested model always leads the
       * chain; this list supplies the rest.
       *
       * The order is measured, not guessed: on 2026-10-22 `gemini-3.5-flash`
       * answered 15/15 in 1.87 s and `gemini-3-flash-preview` in 1.85 s, while
       * `gemini-3.1-flash-lite` (503) and `gemini-3.8-flash` (503, 49-99 s) were
       * congested. A retired model must never lead this list.
       */
      modelFallback: list(process.env.MODEL_FALLBACK_MODELS, [
        "gemini-3.5-flash",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite",
        "gemini-3.8-flash"
      ]),
      /** Probe chain; `PROBE_MODELS` wins over the code default. */
      probeModels: list(process.env.PROBE_MODELS, [
        "gemini-3.5-flash",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite"
      ]),
      /**
       * Tier probe chain. A single generateContent call against a quota-gated
       * model answers 429 for both key classes, and the 429 shape is the only
       * place Google discloses the tier. Measured 2026-10-22: `gemini-2.5-flash-image`
       * answers 429 for free and paid keys; `gemini-2.0-flash-preview-image-generation`
       * answers 404 for free keys and 429 for paid ones. The default model is the
       * last resort so a probe never ends without an answer.
       */
      tierProbeModels: list(process.env.TIER_PROBE_MODELS, [
        "gemini-2.5-flash-image",
        "gemini-2.0-flash-preview-image-generation"
      ]),
      /** keys per recheck batch on /internal/keys/recheck */
      recheckBatchSize: num(process.env.RECHECK_BATCH_SIZE, 25),
      /**
       * How often the in-process timer probes what is due. A per-minute rate
       * limit is the common case, so 19 minutes clears every window with margin
       * while staying well inside a serverless function's practical lifetime.
       * 0 disables the timer (the HTTP route still works).
       */
      recheckIntervalMinutes: num(process.env.RECHECK_INTERVAL_MINUTES, 19),
      /**
       * How often public traffic may trigger a background re-check of due keys.
       * A serverless instance is frozen between requests, so the timer alone can
       * miss a rate-limit window expiring; the first request after it pays that
       * miss with a 429 unless traffic drives the probe. 0 disables the hook (the
       * timer and the HTTP route still work); tests set 0 to keep pools still.
       */
      lazyRecheckMs: num(process.env.LAZY_RECHECK_MS, 6e4),
      /** a key rejected as invalid is not re-probed more often than this */
      invalidRecheckFloorMinutes: num(process.env.INVALID_RECHECK_FLOOR_MINUTES, 1440),
      /**
       * A project with no allocation never advertises a reset, so its key would
       * otherwise be due on every tick and take every slot in the batch. This is
       * the floor between two such probes.
       */
      quotaRecheckFloorMinutes: num(process.env.QUOTA_RECHECK_FLOOR_MINUTES, 60),
      /**
       * Models the upstream has retired, filtered out of the /v1/models catalog.
       *
       * Verified on 2026-10-22 against production: `gemini-2.5-flash`,
       * `gemini-2.5-flash-lite` and `gemini-2.5-pro` answer 404 "no longer
       * available to new users" for every key. The other 2.5 ids are NOT retired
       * and must stay listed: `gemini-2.5-flash-image` and
       * `gemini-2.5-pro-preview-tts` answer 429 (quota), and the
       * `gemini-2.5-flash-native-audio-*` ids answer 400 because they serve live
       * bidirectional streaming, not generateContent.
       */
      retiredModels: list(process.env.RETIRED_MODELS, [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro"
      ]),
      /* ---------- storage (all optional) ---------- */
      /** Postgres connection string. Unset disables every persistence path. */
      databaseUrl: (process.env.DATABASE_URL ?? "").trim(),
      /** per-statement ceiling for one Neon HTTP query */
      dbQueryTimeoutMs: num(process.env.DB_QUERY_TIMEOUT_MS, 3e3),
      /** flush the ledger batch after this long */
      ledgerFlushMs: num(process.env.LEDGER_FLUSH_MS, 2e3),
      /** flush the ledger batch once it holds this many rows */
      ledgerMaxRows: num(process.env.LEDGER_MAX_ROWS, 200),
      /** rows kept for the live tail view */
      ledgerTailRows: num(process.env.LEDGER_TAIL_ROWS, 500),
      /** how long raw usage_events survive a rollup run */
      retentionDays: num(process.env.RETENTION_DAYS, 30),
      /** bearer for /internal/rollup; unset disables the route */
      rollupToken: process.env.ROLLUP_TOKEN ?? "",
      /** Vercel sends this as `Authorization: Bearer <CRON_SECRET>` on cron runs */
      cronSecret: process.env.CRON_SECRET ?? ""
    };
    VOICE_MAP = {
      alloy: "Kore",
      echo: "Puck",
      fable: "Charon",
      onyx: "Fenrir",
      nova: "Zephyr",
      shimmer: "Leda",
      ballad: "Aoede",
      coral: "Kore",
      sage: "Sulafat",
      verse: "Bright"
    };
  }
});

// src/log.ts
function log(level, event, fields = {}) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    event,
    ...scrub(fields)
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
var LEVELS, threshold, KEY_SHAPED, scrub;
var init_log = __esm({
  "src/log.ts"() {
    "use strict";
    LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
    threshold = LEVELS[process.env.LOG_LEVEL ?? "info"] ?? LEVELS.info;
    KEY_SHAPED = /AIza[0-9A-Za-z_-]{10,}|ya29\.[0-9A-Za-z._-]{10,}|sk-[0-9A-Za-z_-]{10,}|sk_[0-9A-Za-z]{10,}/g;
    scrub = (value) => {
      if (typeof value === "string") return value.replace(KEY_SHAPED, "[redacted]");
      if (Array.isArray(value)) return value.map(scrub);
      if (value && typeof value === "object") {
        const out = {};
        for (const [k, v2] of Object.entries(value)) out[k] = scrub(v2);
        return out;
      }
      return value;
    };
  }
});

// src/metrics.ts
var startedAt, counters;
var init_metrics = __esm({
  "src/metrics.ts"() {
    "use strict";
    startedAt = Date.now();
    counters = {
      requests: 0,
      upstreamRequests: 0,
      rotations: 0,
      upstream429: 0,
      cooldowns: 0,
      invalidated: 0,
      poolExhausted: 0,
      upstream5xx: 0,
      networkErrors: 0,
      clientAborts: 0,
      dbDegraded: 0,
      embeddings: 0,
      toolCalls: 0
    };
  }
});

// node_modules/@neondatabase/serverless/index.mjs
function Ma(r) {
  return 0;
}
function Xe(r) {
  let e = 1779033703, t = 3144134277, n = 1013904242, i = 2773480762, s = 1359893119, o = 2600822924, u = 528734635, c = 1541459225, l = 0, f = 0, m = [
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ], g = a((I, C) => I >>> C | I << 32 - C, "rrot"), w = new Uint32Array(64), S = new Uint8Array(64), k = a(() => {
    for (let R = 0, $ = 0; R < 16; R++, $ += 4) w[R] = S[$] << 24 | S[$ + 1] << 16 | S[$ + 2] << 8 | S[$ + 3];
    for (let R = 16; R < 64; R++) {
      let $ = g(w[R - 15], 7) ^ g(w[R - 15], 18) ^ w[R - 15] >>> 3, Ee = g(
        w[R - 2],
        17
      ) ^ g(w[R - 2], 19) ^ w[R - 2] >>> 10;
      w[R] = w[R - 16] + $ + w[R - 7] + Ee | 0;
    }
    let I = e, C = t, re = n, ne = i, H = s, oe = o, ae = u, me = c;
    for (let R = 0; R < 64; R++) {
      let $ = g(H, 6) ^ g(H, 11) ^ g(H, 25), Ee = H & oe ^ ~H & ae, ue = me + $ + Ee + m[R] + w[R] | 0, Te = g(I, 2) ^ g(
        I,
        13
      ) ^ g(I, 22), ce = I & C ^ I & re ^ C & re, G = Te + ce | 0;
      me = ae, ae = oe, oe = H, H = ne + ue | 0, ne = re, re = C, C = I, I = ue + G | 0;
    }
    e = e + I | 0, t = t + C | 0, n = n + re | 0, i = i + ne | 0, s = s + H | 0, o = o + oe | 0, u = u + ae | 0, c = c + me | 0, f = 0;
  }, "process"), D = a(
    (I) => {
      typeof I == "string" && (I = new TextEncoder().encode(I));
      for (let C = 0; C < I.length; C++) S[f++] = I[C], f === 64 && k();
      l += I.length;
    },
    "add"
  ), he = a(() => {
    if (S[f++] = 128, f == 64 && k(), f + 8 > 64) {
      for (; f < 64; ) S[f++] = 0;
      k();
    }
    for (; f < 58; ) S[f++] = 0;
    let I = l * 8;
    S[f++] = I / 1099511627776 & 255, S[f++] = I / 4294967296 & 255, S[f++] = I >>> 24, S[f++] = I >>> 16 & 255, S[f++] = I >>> 8 & 255, S[f++] = I & 255, k();
    let C = new Uint8Array(32);
    return C[0] = e >>> 24, C[1] = e >>> 16 & 255, C[2] = e >>> 8 & 255, C[3] = e & 255, C[4] = t >>> 24, C[5] = t >>> 16 & 255, C[6] = t >>> 8 & 255, C[7] = t & 255, C[8] = n >>> 24, C[9] = n >>> 16 & 255, C[10] = n >>> 8 & 255, C[11] = n & 255, C[12] = i >>> 24, C[13] = i >>> 16 & 255, C[14] = i >>> 8 & 255, C[15] = i & 255, C[16] = s >>> 24, C[17] = s >>> 16 & 255, C[18] = s >>> 8 & 255, C[19] = s & 255, C[20] = o >>> 24, C[21] = o >>> 16 & 255, C[22] = o >>> 8 & 255, C[23] = o & 255, C[24] = u >>> 24, C[25] = u >>> 16 & 255, C[26] = u >>> 8 & 255, C[27] = u & 255, C[28] = c >>> 24, C[29] = c >>> 16 & 255, C[30] = c >>> 8 & 255, C[31] = c & 255, C;
  }, "digest");
  return r === void 0 ? { add: D, digest: he } : (D(r), he());
}
function Iu(r) {
  return crypto.getRandomValues(p.alloc(r));
}
function Pu(r) {
  if (r === "sha256") return { update: a(function(e) {
    return { digest: a(
      function() {
        return p.from(Xe(e));
      },
      "digest"
    ) };
  }, "update") };
  if (r === "md5") return { update: a(function(e) {
    return {
      digest: a(function() {
        return typeof e == "string" ? et.hashStr(e) : et.hashByteArray(e);
      }, "digest")
    };
  }, "update") };
  throw new Error(`Hash type '${r}' not supported`);
}
function Ru(r, e) {
  if (r !== "sha256") throw new Error(`Only sha256 is supported (requested: '${r}')`);
  return { update: a(function(t) {
    return { digest: a(
      function() {
        typeof e == "string" && (e = new TextEncoder().encode(e)), typeof t == "string" && (t = new TextEncoder().encode(
          t
        ));
        let n = e.length;
        if (n > 64) e = Xe(e);
        else if (n < 64) {
          let c = new Uint8Array(64);
          c.set(e), e = c;
        }
        let i = new Uint8Array(
          64
        ), s = new Uint8Array(64);
        for (let c = 0; c < 64; c++) i[c] = 54 ^ e[c], s[c] = 92 ^ e[c];
        let o = new Uint8Array(t.length + 64);
        o.set(i, 0), o.set(t, 64);
        let u = new Uint8Array(96);
        return u.set(s, 0), u.set(Xe(o), 64), p.from(Xe(u));
      },
      "digest"
    ) };
  }, "update") };
}
function Ju(...r) {
  return r.join("/");
}
function Xu(r, e) {
  e(new Error("No filesystem"));
}
function bc(r, e = false) {
  let { protocol: t } = new URL(r), n = "http:" + r.substring(
    t.length
  ), { username: i, password: s, host: o, hostname: u, port: c, pathname: l, search: f, searchParams: m, hash: g } = new URL(
    n
  );
  s = decodeURIComponent(s), i = decodeURIComponent(i), l = decodeURIComponent(l);
  let w = i + ":" + s, S = e ? Object.fromEntries(m.entries()) : f;
  return {
    href: r,
    protocol: t,
    auth: w,
    username: i,
    password: s,
    host: o,
    hostname: u,
    port: c,
    pathname: l,
    search: f,
    query: S,
    hash: g
  };
}
function dl({ socket: r, servername: e }) {
  return r.startTls(e), r;
}
function Ea(r, { alphabet: e, scratchArr: t } = {}) {
  if (!je) if (je = new Uint16Array(256), yt = new Uint16Array(256), ci) for (let S = 0; S < 256; S++) je[S] = dt[S & 15] << 8 | dt[S >>> 4], yt[S] = pt[S & 15] << 8 | pt[S >>> 4];
  else for (let S = 0; S < 256; S++) je[S] = dt[S & 15] | dt[S >>> 4] << 8, yt[S] = pt[S & 15] | pt[S >>> 4] << 8;
  r.byteOffset % 4 !== 0 && (r = new Uint8Array(r));
  let n = r.length, i = n >>> 1, s = n >>> 2, o = t || new Uint16Array(n), u = new Uint32Array(
    r.buffer,
    r.byteOffset,
    s
  ), c = new Uint32Array(o.buffer, o.byteOffset, i), l = e === "upper" ? yt : je, f = 0, m = 0, g;
  if (ci)
    for (; f < s; ) g = u[f++], c[m++] = l[g >>> 8 & 255] << 16 | l[g & 255], c[m++] = l[g >>> 24] << 16 | l[g >>> 16 & 255];
  else for (; f < s; )
    g = u[f++], c[m++] = l[g >>> 24] << 16 | l[g >>> 16 & 255], c[m++] = l[g >>> 8 & 255] << 16 | l[g & 255];
  for (f <<= 2; f < n; ) o[f] = l[r[f++]];
  return va.decode(o.subarray(0, n));
}
function Aa(r, e = {}) {
  let t = "", n = r.length, i = xa >>> 1, s = Math.ceil(n / i), o = new Uint16Array(s > 1 ? i : n), u = ba(wa({}, e), { scratchArr: o });
  for (let c = 0; c < s; c++) {
    let l = c * i, f = l + i;
    t += Ea(r.subarray(l, f), u);
  }
  return t;
}
function fi(r, e = {}) {
  return e.alphabet !== "upper" && typeof r.toHex == "function" ? r.toHex() : Aa(r, e);
}
function gt() {
  typeof window < "u" && typeof document < "u" && typeof console < "u" && typeof console.warn == "function" && console.warn(`          
        ************************************************************
        *                                                          *
        *  WARNING: Running SQL directly from the browser can have *
        *  security implications. Even if your database is         *
        *  protected by Row-Level Security (RLS), use it at your   *
        *  own risk. This approach is great for fast prototyping,  *
        *  but ensure proper safeguards are in place to prevent    *
        *  misuse or execution of expensive SQL queries by your    *
        *  end users.                                              *
        *                                                          *
        *  If you've assessed the risks, suppress this message     *
        *  using the disableWarningInBrowsers configuration        *
        *  parameter.                                              *
        *                                                          *
        ************************************************************`);
}
function di(r, e) {
  let t, n;
  try {
    t = new URL(r).protocol, n = new URL("http:" + r.slice(t.length));
  } catch {
    throw new N(
      `Database connection string provided to neon() is not a valid URL (connection string: ${r})`
    );
  }
  let {
    username: i,
    hostname: s,
    pathname: o
  } = n;
  if (t !== "postgres:" && t !== "postgresql:" || e && (!i || !s || s === "-" || !o || o === "/")) throw new N(
    "Wrong URL scheme or missing user, host or database in connection parameters"
  );
  return n;
}
function Ca(r) {
  return "postgresql:" + r.href.slice(r.protocol.length);
}
function pi(...r) {
  let e = {};
  for (let t of r) e = t.connectionString !== void 0 ? t : { ...e, ...t };
  return e;
}
async function yi(r = "postgresql://-", e = {}, t = {}) {
  if (e.connectionString !== void 0 && (r = e.connectionString), typeof r == "function" && (r = await r()), typeof r != "string") throw new N("Connection string must be a string or a function resolving to one");
  if (e.user !== void 0 && e.username !== void 0) throw new N("Please specify one only of user and username");
  if (e.host !== void 0 && e.hostname !== void 0) throw new N("Please specify one only of host and hostname");
  let n = di(r, false);
  await Promise.all(_a.map(async (u) => {
    if (u === "connectionString") return;
    let c = e[u];
    if (typeof c == "function" && (c = await c()), c === void 0) return;
    if (typeof c != "string" && !(u === "port" && typeof c == "number")) {
      let f = u === "port" ? " or a number" : "";
      throw new N(`Connection parameter "${u}" must be a string${f} or a function resolving to one`);
    }
    let l = Ta[u] ?? u;
    n[l] = c;
  }));
  let { searchParams: i } = n;
  for (let u in t) i.has(u) || i.append(u, t[u]);
  let s = Ca(n), o = di(s, true);
  return { resolvedConnectionString: s, resolvedURL: o };
}
function Nu(r) {
  return r instanceof p ? "\\x" + fi(r) : r;
}
function fs(r) {
  let { query: e, params: t } = r instanceof He ? r.toParameterizedQuery() : r;
  return { query: e, params: t.map((n) => Nu((0, ps.prepareValue)(n))) };
}
function ys(r, e = {}) {
  typeof r != "string" && (e = r ?? {}, r = void 0);
  let {
    arrayMode: t,
    fullResults: n,
    fetchOptions: i,
    isolationLevel: s,
    readOnly: o,
    deferrable: u,
    authToken: c,
    disableWarningInBrowsers: l
  } = e;
  function f(g, ...w) {
    if (!(Array.isArray(g) && Array.isArray(g.raw) && Array.isArray(w))) throw new Error('This function can now be called only as a tagged-template function: sql`SELECT ${value}`, not sql("SELECT $1", [value], options). For a conventional function call with value placeholders ($1, $2, etc.), use sql.query("SELECT $1", [value], options).');
    return new xe(m, new He(g, w));
  }
  a(f, "templateFn"), f.query = (g, w, S) => new xe(
    m,
    { query: g, params: w ?? [] },
    S
  ), f.unsafe = (g) => new $e(g), f.transaction = async (g, w) => {
    if (typeof g == "function" && (g = g(f)), !Array.isArray(g)) throw new Error(ls);
    g.forEach((D) => {
      if (!(D instanceof xe)) throw new Error(ls);
    });
    let S = g.map((D) => D.queryData), k = g.map((D) => D.opts ?? {});
    return m(S, k, w);
  };
  async function m(g, w, S) {
    let {
      fetchEndpoint: k,
      fetchFunction: D
    } = pe, he = Array.isArray(g) ? { queries: g.map((G) => fs(G)) } : fs(g), I = i ?? {}, C = t ?? false, re = n ?? false, ne = s, H = o, oe = u;
    S !== void 0 && (S.fetchOptions !== void 0 && (I = { ...I, ...S.fetchOptions }), S.arrayMode !== void 0 && (C = S.arrayMode), S.fullResults !== void 0 && (re = S.fullResults), S.isolationLevel !== void 0 && (ne = S.isolationLevel), S.readOnly !== void 0 && (H = S.readOnly), S.deferrable !== void 0 && (oe = S.deferrable)), w !== void 0 && !Array.isArray(
      w
    ) && w.fetchOptions !== void 0 && (I = { ...I, ...w.fetchOptions });
    let ae = c;
    !Array.isArray(w) && w?.authToken !== void 0 && (ae = w.authToken);
    let me = pi(e, S ?? {}, Array.isArray(w) || !w ? {} : w), { resolvedConnectionString: R, resolvedURL: $ } = await yi(
      r,
      me,
      { application_name: vt }
    ), Ee = typeof k == "function" ? k($.hostname, $.port, { jwtAuth: ae !== void 0 }) : k, ue = {
      "Neon-Connection-String": R,
      "Neon-Raw-Text-Output": "true",
      "Neon-Array-Mode": "true"
    }, Te = await Wu(ae);
    Te && (ue.Authorization = `Bearer ${Te}`), Array.isArray(g) && (ne !== void 0 && (ue["Neon-Batch-Isolation-Level"] = ne), H !== void 0 && (ue["Neon-Batch-Read-Only"] = String(H)), oe !== void 0 && (ue["Neon-Batch-Deferrable"] = String(
      oe
    ))), l || pe.disableWarningInBrowsers || gt();
    let ce;
    try {
      ce = await (D ?? fetch)(Ee, { method: "POST", body: JSON.stringify(he), headers: ue, ...I });
    } catch (G) {
      let q = new N(`Error connecting to database: ${G}`);
      throw q.sourceError = G, q;
    }
    if (ce.ok) {
      let G = await ce.json();
      if (Array.isArray(g)) {
        let q = G.results;
        if (!Array.isArray(q)) throw new N(
          "Neon internal error: unexpected result format"
        );
        return q.map((ge, J) => {
          let ie = w[J] ?? {}, Dt = ie.arrayMode ?? C, Io = ie.fullResults ?? re;
          return hs(ge, { arrayMode: Dt, fullResults: Io, types: ie.types });
        });
      } else {
        let q = w ?? {}, ge = q.arrayMode ?? C, J = q.fullResults ?? re;
        return hs(G, { arrayMode: ge, fullResults: J, types: q.types });
      }
    } else {
      let { status: G } = ce;
      if (G === 400) {
        let q = await ce.json(), ge = new N(q.message);
        for (let J of hi) ge[J] = q[J] ?? void 0;
        throw ge;
      } else {
        let q = await ce.text();
        throw new N(`Server error (HTTP status ${G}): ${q}`);
      }
    }
  }
  return a(
    m,
    "execute"
  ), f;
}
function hs(r, { arrayMode: e, fullResults: t, types: n }) {
  let i = new ds.default(
    n
  ), s = r.fields.map((c) => c.name), o = r.fields.map((c) => i.getTypeParser(c.dataTypeID)), u = e === true ? r.rows.map((c) => c.map((l, f) => l === null ? null : o[f](l))) : r.rows.map((c) => Object.fromEntries(c.map((l, f) => [s[f], l === null ? null : o[f](l)])));
  return t ? (r.viaNeonFetch = true, r.rowAsArray = e, r.rows = u, r._parsers = o, r._types = i, r) : u;
}
async function Wu(r) {
  if (typeof r == "string") return r;
  if (typeof r == "function") try {
    return await Promise.resolve(r());
  } catch (e) {
    let t = new N("Error getting auth token.");
    throw e instanceof Error && (t = new N(`Error getting auth token: ${e.message}`)), t;
  }
}
function Wl(r, e) {
  if (e) return { callback: e, result: void 0 };
  let t, n, i = a(function(o, u) {
    o ? t(o) : n(u);
  }, "cb"), s = new r(function(o, u) {
    n = o, t = u;
  });
  return { callback: i, result: s };
}
function jl(r) {
  return Object.entries(r).reduce((t, [n, i]) => (i != null && (t[n] = i), t), /* @__PURE__ */ Object.create(null));
}
function Hl(r) {
  return Object.entries(r).reduce((t, [n, i]) => {
    if (n === "ssl") {
      let s = i;
      typeof s == "boolean" && (t[n] = s), typeof s == "object" && (t[n] = jl(s));
    } else if (i != null) if (n === "port") {
      if (i !== "") {
        let s = parseInt(i, 10);
        if (isNaN(s)) throw new Error(`Invalid ${n}: ${i}`);
        t[n] = s;
      }
    } else t[n] = i;
    return t;
  }, /* @__PURE__ */ Object.create(null));
}
function $l(r) {
  return Hl((0, To.parse)(r));
}
var Po, Ie, Ro, Lo, Bo, Fo, Mo, a, V, T, se, Dn, we, O, E, Wn, jn, oi, b, x, v, p, y, h, ve, Ii, Ti, _i, A, pe, Ge, tr, rr, Fi, ki, Qi, Ni, zi, Yi, ts, ns, Je, _t, os, M, et, as, lr, fr, tt, rt, nt, ju, it, xs, yr, mr, gr, wr, br, ec, xr, vs, Sr, vr, Ss, _s, Ps, Ls, Bs, wc, Fs, Ms, ks, Ir, Lt, Ws, Gs, ln, Vs, Ks, Ys, eo, vn, to, ro, An, uo, fo, ho, Il, po, yo, wo, So, Mn, ot, da, pa, ya, ai, ma, ga, ui, wa, ba, xa, ci, va, Yt, dt, pt, Sa, li, je, yt, Zt, xe, mt, He, Jt, $e, wt, N, hi, _a, Ta, vt, ds, ps, ls, Co, Ao, On, ut, _o, Qn, ct, To, export_DatabaseError, export_defaults, export_escapeIdentifier, export_escapeLiteral, export_types;
var init_serverless = __esm({
  "node_modules/@neondatabase/serverless/index.mjs"() {
    Po = Object.create;
    Ie = Object.defineProperty;
    Ro = Object.getOwnPropertyDescriptor;
    Lo = Object.getOwnPropertyNames;
    Bo = Object.getPrototypeOf;
    Fo = Object.prototype.hasOwnProperty;
    Mo = (r, e, t) => e in r ? Ie(r, e, { enumerable: true, configurable: true, writable: true, value: t }) : r[e] = t;
    a = (r, e) => Ie(r, "name", { value: e, configurable: true });
    V = (r, e, t) => () => {
      if (t) throw t[0];
      try {
        return r && (e = r(r = 0)), e;
      } catch (n) {
        throw t = [n], n;
      }
    };
    T = (r, e) => () => {
      try {
        return e || r((e = { exports: {} }).exports, e), e.exports;
      } catch (t) {
        throw e = 0, t;
      }
    };
    se = (r, e) => {
      for (var t in e) Ie(r, t, { get: e[t], enumerable: true });
    };
    Dn = (r, e, t, n) => {
      if (e && typeof e == "object" || typeof e == "function") for (let i of Lo(e)) !Fo.call(r, i) && i !== t && Ie(r, i, { get: () => e[i], enumerable: !(n = Ro(e, i)) || n.enumerable });
      return r;
    };
    we = (r, e, t) => (t = r != null ? Po(Bo(r)) : {}, Dn(e || !r || !r.__esModule ? Ie(t, "default", { value: r, enumerable: true }) : t, r));
    O = (r) => Dn(Ie({}, "__esModule", { value: true }), r);
    E = (r, e, t) => Mo(r, typeof e != "symbol" ? e + "" : e, t);
    Wn = T((lt) => {
      "use strict";
      h();
      lt.byteLength = Oo;
      lt.toByteArray = Qo;
      lt.fromByteArray = No;
      var le = [], X = [], ko = typeof Uint8Array < "u" ? Uint8Array : Array, qt = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      for (Ae = 0, qn = qt.length; Ae < qn; ++Ae) le[Ae] = qt[Ae], X[qt.charCodeAt(Ae)] = Ae;
      var Ae, qn;
      X[45] = 62;
      X[95] = 63;
      function Nn(r) {
        var e = r.length;
        if (e % 4 > 0) throw new Error("Invalid string. Length must be a multiple of 4");
        var t = r.indexOf("=");
        t === -1 && (t = e);
        var n = t === e ? 0 : 4 - t % 4;
        return [t, n];
      }
      a(Nn, "getLens");
      function Oo(r) {
        var e = Nn(r), t = e[0], n = e[1];
        return (t + n) * 3 / 4 - n;
      }
      a(Oo, "byteLength");
      function Uo(r, e, t) {
        return (e + t) * 3 / 4 - t;
      }
      a(Uo, "_byteLength");
      function Qo(r) {
        var e, t = Nn(r), n = t[0], i = t[1], s = new ko(Uo(r, n, i)), o = 0, u = i > 0 ? n - 4 : n, c;
        for (c = 0; c < u; c += 4) e = X[r.charCodeAt(c)] << 18 | X[r.charCodeAt(c + 1)] << 12 | X[r.charCodeAt(c + 2)] << 6 | X[r.charCodeAt(
          c + 3
        )], s[o++] = e >> 16 & 255, s[o++] = e >> 8 & 255, s[o++] = e & 255;
        return i === 2 && (e = X[r.charCodeAt(c)] << 2 | X[r.charCodeAt(
          c + 1
        )] >> 4, s[o++] = e & 255), i === 1 && (e = X[r.charCodeAt(c)] << 10 | X[r.charCodeAt(c + 1)] << 4 | X[r.charCodeAt(c + 2)] >> 2, s[o++] = e >> 8 & 255, s[o++] = e & 255), s;
      }
      a(Qo, "toByteArray");
      function Do(r) {
        return le[r >> 18 & 63] + le[r >> 12 & 63] + le[r >> 6 & 63] + le[r & 63];
      }
      a(Do, "tripletToBase64");
      function qo(r, e, t) {
        for (var n, i = [], s = e; s < t; s += 3) n = (r[s] << 16 & 16711680) + (r[s + 1] << 8 & 65280) + (r[s + 2] & 255), i.push(Do(n));
        return i.join("");
      }
      a(qo, "encodeChunk");
      function No(r) {
        for (var e, t = r.length, n = t % 3, i = [], s = 16383, o = 0, u = t - n; o < u; o += s) i.push(qo(r, o, o + s > u ? u : o + s));
        return n === 1 ? (e = r[t - 1], i.push(le[e >> 2] + le[e << 4 & 63] + "==")) : n === 2 && (e = (r[t - 2] << 8) + r[t - 1], i.push(le[e >> 10] + le[e >> 4 & 63] + le[e << 2 & 63] + "=")), i.join("");
      }
      a(No, "fromByteArray");
    });
    jn = T((Nt) => {
      h();
      Nt.read = function(r, e, t, n, i) {
        var s, o, u = i * 8 - n - 1, c = (1 << u) - 1, l = c >> 1, f = -7, m = t ? i - 1 : 0, g = t ? -1 : 1, w = r[e + m];
        for (m += g, s = w & (1 << -f) - 1, w >>= -f, f += u; f > 0; s = s * 256 + r[e + m], m += g, f -= 8) ;
        for (o = s & (1 << -f) - 1, s >>= -f, f += n; f > 0; o = o * 256 + r[e + m], m += g, f -= 8) ;
        if (s === 0) s = 1 - l;
        else {
          if (s === c) return o ? NaN : (w ? -1 : 1) * (1 / 0);
          o = o + Math.pow(2, n), s = s - l;
        }
        return (w ? -1 : 1) * o * Math.pow(2, s - n);
      };
      Nt.write = function(r, e, t, n, i, s) {
        var o, u, c, l = s * 8 - i - 1, f = (1 << l) - 1, m = f >> 1, g = i === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0, w = n ? 0 : s - 1, S = n ? 1 : -1, k = e < 0 || e === 0 && 1 / e < 0 ? 1 : 0;
        for (e = Math.abs(e), isNaN(e) || e === 1 / 0 ? (u = isNaN(e) ? 1 : 0, o = f) : (o = Math.floor(Math.log(e) / Math.LN2), e * (c = Math.pow(2, -o)) < 1 && (o--, c *= 2), o + m >= 1 ? e += g / c : e += g * Math.pow(2, 1 - m), e * c >= 2 && (o++, c /= 2), o + m >= f ? (u = 0, o = f) : o + m >= 1 ? (u = (e * c - 1) * Math.pow(2, i), o = o + m) : (u = e * Math.pow(2, m - 1) * Math.pow(2, i), o = 0)); i >= 8; r[t + w] = u & 255, w += S, u /= 256, i -= 8) ;
        for (o = o << i | u, l += i; l > 0; r[t + w] = o & 255, w += S, o /= 256, l -= 8) ;
        r[t + w - S] |= k * 128;
      };
    });
    oi = T((Be) => {
      "use strict";
      h();
      var Wt = Wn(), Re = jn(), Hn = typeof Symbol == "function" && typeof Symbol.for == "function" ? Symbol.for("nodejs.util.inspect.custom") : null;
      Be.Buffer = d;
      Be.SlowBuffer = Vo;
      Be.INSPECT_MAX_BYTES = 50;
      var ft = 2147483647;
      Be.kMaxLength = ft;
      d.TYPED_ARRAY_SUPPORT = Wo();
      !d.TYPED_ARRAY_SUPPORT && typeof console < "u" && typeof console.error == "function" && console.error("This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support.");
      function Wo() {
        try {
          let r = new Uint8Array(1), e = { foo: a(function() {
            return 42;
          }, "foo") };
          return Object.setPrototypeOf(e, Uint8Array.prototype), Object.setPrototypeOf(r, e), r.foo() === 42;
        } catch {
          return false;
        }
      }
      a(Wo, "typedArraySupport");
      Object.defineProperty(d.prototype, "parent", { enumerable: true, get: a(function() {
        if (d.isBuffer(this)) return this.buffer;
      }, "get") });
      Object.defineProperty(d.prototype, "offset", { enumerable: true, get: a(function() {
        if (d.isBuffer(
          this
        )) return this.byteOffset;
      }, "get") });
      function de(r) {
        if (r > ft) throw new RangeError('The value "' + r + '" is invalid for option "size"');
        let e = new Uint8Array(r);
        return Object.setPrototypeOf(e, d.prototype), e;
      }
      a(de, "createBuffer");
      function d(r, e, t) {
        if (typeof r == "number") {
          if (typeof e == "string") throw new TypeError(
            'The "string" argument must be of type string. Received type number'
          );
          return Gt(r);
        }
        return zn(r, e, t);
      }
      a(d, "Buffer");
      d.poolSize = 8192;
      function zn(r, e, t) {
        if (typeof r == "string") return Ho(r, e);
        if (ArrayBuffer.isView(r)) return $o(r);
        if (r == null) throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof r);
        if (fe(r, ArrayBuffer) || r && fe(r.buffer, ArrayBuffer) || typeof SharedArrayBuffer < "u" && (fe(r, SharedArrayBuffer) || r && fe(
          r.buffer,
          SharedArrayBuffer
        ))) return Ht(r, e, t);
        if (typeof r == "number") throw new TypeError('The "value" argument must not be of type number. Received type number');
        let n = r.valueOf && r.valueOf();
        if (n != null && n !== r) return d.from(n, e, t);
        let i = Go(r);
        if (i) return i;
        if (typeof Symbol < "u" && Symbol.toPrimitive != null && typeof r[Symbol.toPrimitive] == "function") return d.from(r[Symbol.toPrimitive]("string"), e, t);
        throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof r);
      }
      a(zn, "from");
      d.from = function(r, e, t) {
        return zn(r, e, t);
      };
      Object.setPrototypeOf(
        d.prototype,
        Uint8Array.prototype
      );
      Object.setPrototypeOf(d, Uint8Array);
      function Kn(r) {
        if (typeof r != "number") throw new TypeError(
          '"size" argument must be of type number'
        );
        if (r < 0) throw new RangeError('The value "' + r + '" is invalid for option "size"');
      }
      a(Kn, "assertSize");
      function jo(r, e, t) {
        return Kn(r), r <= 0 ? de(r) : e !== void 0 ? typeof t == "string" ? de(r).fill(e, t) : de(r).fill(e) : de(r);
      }
      a(jo, "alloc");
      d.alloc = function(r, e, t) {
        return jo(r, e, t);
      };
      function Gt(r) {
        return Kn(r), de(r < 0 ? 0 : Vt(r) | 0);
      }
      a(Gt, "allocUnsafe");
      d.allocUnsafe = function(r) {
        return Gt(
          r
        );
      };
      d.allocUnsafeSlow = function(r) {
        return Gt(r);
      };
      function Ho(r, e) {
        if ((typeof e != "string" || e === "") && (e = "utf8"), !d.isEncoding(e)) throw new TypeError("Unknown encoding: " + e);
        let t = Yn(r, e) | 0, n = de(t), i = n.write(
          r,
          e
        );
        return i !== t && (n = n.slice(0, i)), n;
      }
      a(Ho, "fromString");
      function jt(r) {
        let e = r.length < 0 ? 0 : Vt(r.length) | 0, t = de(e);
        for (let n = 0; n < e; n += 1) t[n] = r[n] & 255;
        return t;
      }
      a(jt, "fromArrayLike");
      function $o(r) {
        if (fe(r, Uint8Array)) {
          let e = new Uint8Array(r);
          return Ht(e.buffer, e.byteOffset, e.byteLength);
        }
        return jt(r);
      }
      a($o, "fromArrayView");
      function Ht(r, e, t) {
        if (e < 0 || r.byteLength < e) throw new RangeError('"offset" is outside of buffer bounds');
        if (r.byteLength < e + (t || 0)) throw new RangeError('"length" is outside of buffer bounds');
        let n;
        return e === void 0 && t === void 0 ? n = new Uint8Array(r) : t === void 0 ? n = new Uint8Array(r, e) : n = new Uint8Array(
          r,
          e,
          t
        ), Object.setPrototypeOf(n, d.prototype), n;
      }
      a(Ht, "fromArrayBuffer");
      function Go(r) {
        if (d.isBuffer(r)) {
          let e = Vt(r.length) | 0, t = de(e);
          return t.length === 0 || r.copy(t, 0, 0, e), t;
        }
        if (r.length !== void 0) return typeof r.length != "number" || Kt(r.length) ? de(0) : jt(r);
        if (r.type === "Buffer" && Array.isArray(r.data)) return jt(r.data);
      }
      a(Go, "fromObject");
      function Vt(r) {
        if (r >= ft) throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + ft.toString(16) + " bytes");
        return r | 0;
      }
      a(Vt, "checked");
      function Vo(r) {
        return +r != r && (r = 0), d.alloc(+r);
      }
      a(Vo, "SlowBuffer");
      d.isBuffer = a(function(e) {
        return e != null && e._isBuffer === true && e !== d.prototype;
      }, "isBuffer");
      d.compare = a(function(e, t) {
        if (fe(e, Uint8Array) && (e = d.from(e, e.offset, e.byteLength)), fe(t, Uint8Array) && (t = d.from(t, t.offset, t.byteLength)), !d.isBuffer(e) || !d.isBuffer(t)) throw new TypeError(
          'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
        );
        if (e === t) return 0;
        let n = e.length, i = t.length;
        for (let s = 0, o = Math.min(n, i); s < o; ++s) if (e[s] !== t[s]) {
          n = e[s], i = t[s];
          break;
        }
        return n < i ? -1 : i < n ? 1 : 0;
      }, "compare");
      d.isEncoding = a(function(e) {
        switch (String(e).toLowerCase()) {
          case "hex":
          case "utf8":
          case "utf-8":
          case "ascii":
          case "latin1":
          case "binary":
          case "base64":
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return true;
          default:
            return false;
        }
      }, "isEncoding");
      d.concat = a(function(e, t) {
        if (!Array.isArray(e)) throw new TypeError(
          '"list" argument must be an Array of Buffers'
        );
        if (e.length === 0) return d.alloc(0);
        let n;
        if (t === void 0)
          for (t = 0, n = 0; n < e.length; ++n) t += e[n].length;
        let i = d.allocUnsafe(t), s = 0;
        for (n = 0; n < e.length; ++n) {
          let o = e[n];
          if (fe(o, Uint8Array)) s + o.length > i.length ? (d.isBuffer(o) || (o = d.from(o)), o.copy(i, s)) : Uint8Array.prototype.set.call(i, o, s);
          else if (d.isBuffer(o)) o.copy(i, s);
          else throw new TypeError('"list" argument must be an Array of Buffers');
          s += o.length;
        }
        return i;
      }, "concat");
      function Yn(r, e) {
        if (d.isBuffer(r)) return r.length;
        if (ArrayBuffer.isView(r) || fe(r, ArrayBuffer)) return r.byteLength;
        if (typeof r != "string") throw new TypeError(
          'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof r
        );
        let t = r.length, n = arguments.length > 2 && arguments[2] === true;
        if (!n && t === 0) return 0;
        let i = false;
        for (; ; ) switch (e) {
          case "ascii":
          case "latin1":
          case "binary":
            return t;
          case "utf8":
          case "utf-8":
            return $t(r).length;
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return t * 2;
          case "hex":
            return t >>> 1;
          case "base64":
            return si(r).length;
          default:
            if (i) return n ? -1 : $t(r).length;
            e = ("" + e).toLowerCase(), i = true;
        }
      }
      a(Yn, "byteLength");
      d.byteLength = Yn;
      function zo(r, e, t) {
        let n = false;
        if ((e === void 0 || e < 0) && (e = 0), e > this.length || ((t === void 0 || t > this.length) && (t = this.length), t <= 0) || (t >>>= 0, e >>>= 0, t <= e)) return "";
        for (r || (r = "utf8"); ; ) switch (r) {
          case "hex":
            return ia(this, e, t);
          case "utf8":
          case "utf-8":
            return Jn(this, e, t);
          case "ascii":
            return ra(this, e, t);
          case "latin1":
          case "binary":
            return na(
              this,
              e,
              t
            );
          case "base64":
            return ea(this, e, t);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return sa(
              this,
              e,
              t
            );
          default:
            if (n) throw new TypeError("Unknown encoding: " + r);
            r = (r + "").toLowerCase(), n = true;
        }
      }
      a(
        zo,
        "slowToString"
      );
      d.prototype._isBuffer = true;
      function Ce(r, e, t) {
        let n = r[e];
        r[e] = r[t], r[t] = n;
      }
      a(Ce, "swap");
      d.prototype.swap16 = a(function() {
        let e = this.length;
        if (e % 2 !== 0) throw new RangeError("Buffer size must be a multiple of 16-bits");
        for (let t = 0; t < e; t += 2) Ce(this, t, t + 1);
        return this;
      }, "swap16");
      d.prototype.swap32 = a(function() {
        let e = this.length;
        if (e % 4 !== 0) throw new RangeError("Buffer size must be a multiple of 32-bits");
        for (let t = 0; t < e; t += 4) Ce(this, t, t + 3), Ce(this, t + 1, t + 2);
        return this;
      }, "swap32");
      d.prototype.swap64 = a(
        function() {
          let e = this.length;
          if (e % 8 !== 0) throw new RangeError("Buffer size must be a multiple of 64-bits");
          for (let t = 0; t < e; t += 8) Ce(this, t, t + 7), Ce(this, t + 1, t + 6), Ce(this, t + 2, t + 5), Ce(this, t + 3, t + 4);
          return this;
        },
        "swap64"
      );
      d.prototype.toString = a(function() {
        let e = this.length;
        return e === 0 ? "" : arguments.length === 0 ? Jn(
          this,
          0,
          e
        ) : zo.apply(this, arguments);
      }, "toString");
      d.prototype.toLocaleString = d.prototype.toString;
      d.prototype.equals = a(function(e) {
        if (!d.isBuffer(e)) throw new TypeError("Argument must be a Buffer");
        return this === e ? true : d.compare(this, e) === 0;
      }, "equals");
      d.prototype.inspect = a(function() {
        let e = "", t = Be.INSPECT_MAX_BYTES;
        return e = this.toString("hex", 0, t).replace(/(.{2})/g, "$1 ").trim(), this.length > t && (e += " ... "), "<Buffer " + e + ">";
      }, "inspect");
      Hn && (d.prototype[Hn] = d.prototype.inspect);
      d.prototype.compare = a(function(e, t, n, i, s) {
        if (fe(e, Uint8Array) && (e = d.from(e, e.offset, e.byteLength)), !d.isBuffer(e)) throw new TypeError('The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof e);
        if (t === void 0 && (t = 0), n === void 0 && (n = e ? e.length : 0), i === void 0 && (i = 0), s === void 0 && (s = this.length), t < 0 || n > e.length || i < 0 || s > this.length) throw new RangeError("out of range index");
        if (i >= s && t >= n) return 0;
        if (i >= s) return -1;
        if (t >= n) return 1;
        if (t >>>= 0, n >>>= 0, i >>>= 0, s >>>= 0, this === e) return 0;
        let o = s - i, u = n - t, c = Math.min(o, u), l = this.slice(
          i,
          s
        ), f = e.slice(t, n);
        for (let m = 0; m < c; ++m) if (l[m] !== f[m]) {
          o = l[m], u = f[m];
          break;
        }
        return o < u ? -1 : u < o ? 1 : 0;
      }, "compare");
      function Zn(r, e, t, n, i) {
        if (r.length === 0) return -1;
        if (typeof t == "string" ? (n = t, t = 0) : t > 2147483647 ? t = 2147483647 : t < -2147483648 && (t = -2147483648), t = +t, Kt(t) && (t = i ? 0 : r.length - 1), t < 0 && (t = r.length + t), t >= r.length) {
          if (i) return -1;
          t = r.length - 1;
        } else if (t < 0) if (i) t = 0;
        else return -1;
        if (typeof e == "string" && (e = d.from(
          e,
          n
        )), d.isBuffer(e)) return e.length === 0 ? -1 : $n(r, e, t, n, i);
        if (typeof e == "number") return e = e & 255, typeof Uint8Array.prototype.indexOf == "function" ? i ? Uint8Array.prototype.indexOf.call(r, e, t) : Uint8Array.prototype.lastIndexOf.call(r, e, t) : $n(r, [e], t, n, i);
        throw new TypeError("val must be string, number or Buffer");
      }
      a(Zn, "bidirectionalIndexOf");
      function $n(r, e, t, n, i) {
        let s = 1, o = r.length, u = e.length;
        if (n !== void 0 && (n = String(n).toLowerCase(), n === "ucs2" || n === "ucs-2" || n === "utf16le" || n === "utf-16le")) {
          if (r.length < 2 || e.length < 2) return -1;
          s = 2, o /= 2, u /= 2, t /= 2;
        }
        function c(f, m) {
          return s === 1 ? f[m] : f.readUInt16BE(m * s);
        }
        a(c, "read");
        let l;
        if (i) {
          let f = -1;
          for (l = t; l < o; l++) if (c(r, l) === c(e, f === -1 ? 0 : l - f)) {
            if (f === -1 && (f = l), l - f + 1 === u) return f * s;
          } else f !== -1 && (l -= l - f), f = -1;
        } else for (t + u > o && (t = o - u), l = t; l >= 0; l--) {
          let f = true;
          for (let m = 0; m < u; m++) if (c(r, l + m) !== c(e, m)) {
            f = false;
            break;
          }
          if (f) return l;
        }
        return -1;
      }
      a($n, "arrayIndexOf");
      d.prototype.includes = a(function(e, t, n) {
        return this.indexOf(
          e,
          t,
          n
        ) !== -1;
      }, "includes");
      d.prototype.indexOf = a(function(e, t, n) {
        return Zn(this, e, t, n, true);
      }, "indexOf");
      d.prototype.lastIndexOf = a(function(e, t, n) {
        return Zn(this, e, t, n, false);
      }, "lastIndexOf");
      function Ko(r, e, t, n) {
        t = Number(t) || 0;
        let i = r.length - t;
        n ? (n = Number(n), n > i && (n = i)) : n = i;
        let s = e.length;
        n > s / 2 && (n = s / 2);
        let o;
        for (o = 0; o < n; ++o) {
          let u = parseInt(e.substr(o * 2, 2), 16);
          if (Kt(u)) return o;
          r[t + o] = u;
        }
        return o;
      }
      a(Ko, "hexWrite");
      function Yo(r, e, t, n) {
        return ht($t(e, r.length - t), r, t, n);
      }
      a(Yo, "utf8Write");
      function Zo(r, e, t, n) {
        return ht(ca(e), r, t, n);
      }
      a(
        Zo,
        "asciiWrite"
      );
      function Jo(r, e, t, n) {
        return ht(si(e), r, t, n);
      }
      a(Jo, "base64Write");
      function Xo(r, e, t, n) {
        return ht(
          la(e, r.length - t),
          r,
          t,
          n
        );
      }
      a(Xo, "ucs2Write");
      d.prototype.write = a(function(e, t, n, i) {
        if (t === void 0) i = "utf8", n = this.length, t = 0;
        else if (n === void 0 && typeof t == "string") i = t, n = this.length, t = 0;
        else if (isFinite(t))
          t = t >>> 0, isFinite(n) ? (n = n >>> 0, i === void 0 && (i = "utf8")) : (i = n, n = void 0);
        else throw new Error("Buffer.write(string, encoding, offset[, length]) is no longer supported");
        let s = this.length - t;
        if ((n === void 0 || n > s) && (n = s), e.length > 0 && (n < 0 || t < 0) || t > this.length) throw new RangeError("Attempt to write outside buffer bounds");
        i || (i = "utf8");
        let o = false;
        for (; ; ) switch (i) {
          case "hex":
            return Ko(this, e, t, n);
          case "utf8":
          case "utf-8":
            return Yo(this, e, t, n);
          case "ascii":
          case "latin1":
          case "binary":
            return Zo(this, e, t, n);
          case "base64":
            return Jo(this, e, t, n);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return Xo(this, e, t, n);
          default:
            if (o) throw new TypeError("Unknown encoding: " + i);
            i = ("" + i).toLowerCase(), o = true;
        }
      }, "write");
      d.prototype.toJSON = a(function() {
        return { type: "Buffer", data: Array.prototype.slice.call(this._arr || this, 0) };
      }, "toJSON");
      function ea(r, e, t) {
        return e === 0 && t === r.length ? Wt.fromByteArray(r) : Wt.fromByteArray(r.slice(e, t));
      }
      a(ea, "base64Slice");
      function Jn(r, e, t) {
        t = Math.min(r.length, t);
        let n = [], i = e;
        for (; i < t; ) {
          let s = r[i], o = null, u = s > 239 ? 4 : s > 223 ? 3 : s > 191 ? 2 : 1;
          if (i + u <= t) {
            let c, l, f, m;
            switch (u) {
              case 1:
                s < 128 && (o = s);
                break;
              case 2:
                c = r[i + 1], (c & 192) === 128 && (m = (s & 31) << 6 | c & 63, m > 127 && (o = m));
                break;
              case 3:
                c = r[i + 1], l = r[i + 2], (c & 192) === 128 && (l & 192) === 128 && (m = (s & 15) << 12 | (c & 63) << 6 | l & 63, m > 2047 && (m < 55296 || m > 57343) && (o = m));
                break;
              case 4:
                c = r[i + 1], l = r[i + 2], f = r[i + 3], (c & 192) === 128 && (l & 192) === 128 && (f & 192) === 128 && (m = (s & 15) << 18 | (c & 63) << 12 | (l & 63) << 6 | f & 63, m > 65535 && m < 1114112 && (o = m));
            }
          }
          o === null ? (o = 65533, u = 1) : o > 65535 && (o -= 65536, n.push(o >>> 10 & 1023 | 55296), o = 56320 | o & 1023), n.push(o), i += u;
        }
        return ta(n);
      }
      a(Jn, "utf8Slice");
      var Gn = 4096;
      function ta(r) {
        let e = r.length;
        if (e <= Gn) return String.fromCharCode.apply(String, r);
        let t = "", n = 0;
        for (; n < e; ) t += String.fromCharCode.apply(String, r.slice(n, n += Gn));
        return t;
      }
      a(ta, "decodeCodePointsArray");
      function ra(r, e, t) {
        let n = "";
        t = Math.min(r.length, t);
        for (let i = e; i < t; ++i) n += String.fromCharCode(r[i] & 127);
        return n;
      }
      a(ra, "asciiSlice");
      function na(r, e, t) {
        let n = "";
        t = Math.min(r.length, t);
        for (let i = e; i < t; ++i) n += String.fromCharCode(r[i]);
        return n;
      }
      a(na, "latin1Slice");
      function ia(r, e, t) {
        let n = r.length;
        (!e || e < 0) && (e = 0), (!t || t < 0 || t > n) && (t = n);
        let i = "";
        for (let s = e; s < t; ++s) i += fa[r[s]];
        return i;
      }
      a(ia, "hexSlice");
      function sa(r, e, t) {
        let n = r.slice(e, t), i = "";
        for (let s = 0; s < n.length - 1; s += 2) i += String.fromCharCode(n[s] + n[s + 1] * 256);
        return i;
      }
      a(sa, "utf16leSlice");
      d.prototype.slice = a(function(e, t) {
        let n = this.length;
        e = ~~e, t = t === void 0 ? n : ~~t, e < 0 ? (e += n, e < 0 && (e = 0)) : e > n && (e = n), t < 0 ? (t += n, t < 0 && (t = 0)) : t > n && (t = n), t < e && (t = e);
        let i = this.subarray(e, t);
        return Object.setPrototypeOf(i, d.prototype), i;
      }, "slice");
      function U(r, e, t) {
        if (r % 1 !== 0 || r < 0) throw new RangeError("offset is not uint");
        if (r + e > t) throw new RangeError("Trying to access beyond buffer length");
      }
      a(U, "checkOffset");
      d.prototype.readUintLE = d.prototype.readUIntLE = a(
        function(e, t, n) {
          e = e >>> 0, t = t >>> 0, n || U(e, t, this.length);
          let i = this[e], s = 1, o = 0;
          for (; ++o < t && (s *= 256); ) i += this[e + o] * s;
          return i;
        },
        "readUIntLE"
      );
      d.prototype.readUintBE = d.prototype.readUIntBE = a(function(e, t, n) {
        e = e >>> 0, t = t >>> 0, n || U(
          e,
          t,
          this.length
        );
        let i = this[e + --t], s = 1;
        for (; t > 0 && (s *= 256); ) i += this[e + --t] * s;
        return i;
      }, "readUIntBE");
      d.prototype.readUint8 = d.prototype.readUInt8 = a(
        function(e, t) {
          return e = e >>> 0, t || U(e, 1, this.length), this[e];
        },
        "readUInt8"
      );
      d.prototype.readUint16LE = d.prototype.readUInt16LE = a(function(e, t) {
        return e = e >>> 0, t || U(
          e,
          2,
          this.length
        ), this[e] | this[e + 1] << 8;
      }, "readUInt16LE");
      d.prototype.readUint16BE = d.prototype.readUInt16BE = a(function(e, t) {
        return e = e >>> 0, t || U(e, 2, this.length), this[e] << 8 | this[e + 1];
      }, "readUInt16BE");
      d.prototype.readUint32LE = d.prototype.readUInt32LE = a(function(e, t) {
        return e = e >>> 0, t || U(e, 4, this.length), (this[e] | this[e + 1] << 8 | this[e + 2] << 16) + this[e + 3] * 16777216;
      }, "readUInt32LE");
      d.prototype.readUint32BE = d.prototype.readUInt32BE = a(function(e, t) {
        return e = e >>> 0, t || U(e, 4, this.length), this[e] * 16777216 + (this[e + 1] << 16 | this[e + 2] << 8 | this[e + 3]);
      }, "readUInt32BE");
      d.prototype.readBigUInt64LE = be(a(function(e) {
        e = e >>> 0, Le(e, "offset");
        let t = this[e], n = this[e + 7];
        (t === void 0 || n === void 0) && We(e, this.length - 8);
        let i = t + this[++e] * 2 ** 8 + this[++e] * 2 ** 16 + this[++e] * 2 ** 24, s = this[++e] + this[++e] * 2 ** 8 + this[++e] * 2 ** 16 + n * 2 ** 24;
        return BigInt(i) + (BigInt(s) << BigInt(32));
      }, "readBigUInt64LE"));
      d.prototype.readBigUInt64BE = be(a(function(e) {
        e = e >>> 0, Le(e, "offset");
        let t = this[e], n = this[e + 7];
        (t === void 0 || n === void 0) && We(e, this.length - 8);
        let i = t * 2 ** 24 + this[++e] * 2 ** 16 + this[++e] * 2 ** 8 + this[++e], s = this[++e] * 2 ** 24 + this[++e] * 2 ** 16 + this[++e] * 2 ** 8 + n;
        return (BigInt(i) << BigInt(
          32
        )) + BigInt(s);
      }, "readBigUInt64BE"));
      d.prototype.readIntLE = a(function(e, t, n) {
        e = e >>> 0, t = t >>> 0, n || U(
          e,
          t,
          this.length
        );
        let i = this[e], s = 1, o = 0;
        for (; ++o < t && (s *= 256); ) i += this[e + o] * s;
        return s *= 128, i >= s && (i -= Math.pow(2, 8 * t)), i;
      }, "readIntLE");
      d.prototype.readIntBE = a(function(e, t, n) {
        e = e >>> 0, t = t >>> 0, n || U(e, t, this.length);
        let i = t, s = 1, o = this[e + --i];
        for (; i > 0 && (s *= 256); ) o += this[e + --i] * s;
        return s *= 128, o >= s && (o -= Math.pow(2, 8 * t)), o;
      }, "readIntBE");
      d.prototype.readInt8 = a(function(e, t) {
        return e = e >>> 0, t || U(e, 1, this.length), this[e] & 128 ? (255 - this[e] + 1) * -1 : this[e];
      }, "readInt8");
      d.prototype.readInt16LE = a(function(e, t) {
        e = e >>> 0, t || U(
          e,
          2,
          this.length
        );
        let n = this[e] | this[e + 1] << 8;
        return n & 32768 ? n | 4294901760 : n;
      }, "readInt16LE");
      d.prototype.readInt16BE = a(function(e, t) {
        e = e >>> 0, t || U(e, 2, this.length);
        let n = this[e + 1] | this[e] << 8;
        return n & 32768 ? n | 4294901760 : n;
      }, "readInt16BE");
      d.prototype.readInt32LE = a(function(e, t) {
        return e = e >>> 0, t || U(e, 4, this.length), this[e] | this[e + 1] << 8 | this[e + 2] << 16 | this[e + 3] << 24;
      }, "readInt32LE");
      d.prototype.readInt32BE = a(function(e, t) {
        return e = e >>> 0, t || U(e, 4, this.length), this[e] << 24 | this[e + 1] << 16 | this[e + 2] << 8 | this[e + 3];
      }, "readInt32BE");
      d.prototype.readBigInt64LE = be(a(function(e) {
        e = e >>> 0, Le(e, "offset");
        let t = this[e], n = this[e + 7];
        (t === void 0 || n === void 0) && We(e, this.length - 8);
        let i = this[e + 4] + this[e + 5] * 2 ** 8 + this[e + 6] * 2 ** 16 + (n << 24);
        return (BigInt(i) << BigInt(
          32
        )) + BigInt(t + this[++e] * 2 ** 8 + this[++e] * 2 ** 16 + this[++e] * 2 ** 24);
      }, "readBigInt64LE"));
      d.prototype.readBigInt64BE = be(a(function(e) {
        e = e >>> 0, Le(e, "offset");
        let t = this[e], n = this[e + 7];
        (t === void 0 || n === void 0) && We(e, this.length - 8);
        let i = (t << 24) + this[++e] * 2 ** 16 + this[++e] * 2 ** 8 + this[++e];
        return (BigInt(i) << BigInt(32)) + BigInt(
          this[++e] * 2 ** 24 + this[++e] * 2 ** 16 + this[++e] * 2 ** 8 + n
        );
      }, "readBigInt64BE"));
      d.prototype.readFloatLE = a(function(e, t) {
        return e = e >>> 0, t || U(e, 4, this.length), Re.read(this, e, true, 23, 4);
      }, "readFloatLE");
      d.prototype.readFloatBE = a(function(e, t) {
        return e = e >>> 0, t || U(e, 4, this.length), Re.read(this, e, false, 23, 4);
      }, "readFloatBE");
      d.prototype.readDoubleLE = a(function(e, t) {
        return e = e >>> 0, t || U(e, 8, this.length), Re.read(this, e, true, 52, 8);
      }, "readDoubleLE");
      d.prototype.readDoubleBE = a(function(e, t) {
        return e = e >>> 0, t || U(e, 8, this.length), Re.read(
          this,
          e,
          false,
          52,
          8
        );
      }, "readDoubleBE");
      function z(r, e, t, n, i, s) {
        if (!d.isBuffer(r)) throw new TypeError('"buffer" argument must be a Buffer instance');
        if (e > i || e < s) throw new RangeError('"value" argument is out of bounds');
        if (t + n > r.length) throw new RangeError("Index out of range");
      }
      a(z, "checkInt");
      d.prototype.writeUintLE = d.prototype.writeUIntLE = a(function(e, t, n, i) {
        if (e = +e, t = t >>> 0, n = n >>> 0, !i) {
          let u = Math.pow(2, 8 * n) - 1;
          z(
            this,
            e,
            t,
            n,
            u,
            0
          );
        }
        let s = 1, o = 0;
        for (this[t] = e & 255; ++o < n && (s *= 256); ) this[t + o] = e / s & 255;
        return t + n;
      }, "writeUIntLE");
      d.prototype.writeUintBE = d.prototype.writeUIntBE = a(function(e, t, n, i) {
        if (e = +e, t = t >>> 0, n = n >>> 0, !i) {
          let u = Math.pow(2, 8 * n) - 1;
          z(this, e, t, n, u, 0);
        }
        let s = n - 1, o = 1;
        for (this[t + s] = e & 255; --s >= 0 && (o *= 256); ) this[t + s] = e / o & 255;
        return t + n;
      }, "writeUIntBE");
      d.prototype.writeUint8 = d.prototype.writeUInt8 = a(function(e, t, n) {
        return e = +e, t = t >>> 0, n || z(this, e, t, 1, 255, 0), this[t] = e & 255, t + 1;
      }, "writeUInt8");
      d.prototype.writeUint16LE = d.prototype.writeUInt16LE = a(function(e, t, n) {
        return e = +e, t = t >>> 0, n || z(this, e, t, 2, 65535, 0), this[t] = e & 255, this[t + 1] = e >>> 8, t + 2;
      }, "writeUInt16LE");
      d.prototype.writeUint16BE = d.prototype.writeUInt16BE = a(function(e, t, n) {
        return e = +e, t = t >>> 0, n || z(this, e, t, 2, 65535, 0), this[t] = e >>> 8, this[t + 1] = e & 255, t + 2;
      }, "writeUInt16BE");
      d.prototype.writeUint32LE = d.prototype.writeUInt32LE = a(function(e, t, n) {
        return e = +e, t = t >>> 0, n || z(
          this,
          e,
          t,
          4,
          4294967295,
          0
        ), this[t + 3] = e >>> 24, this[t + 2] = e >>> 16, this[t + 1] = e >>> 8, this[t] = e & 255, t + 4;
      }, "writeUInt32LE");
      d.prototype.writeUint32BE = d.prototype.writeUInt32BE = a(function(e, t, n) {
        return e = +e, t = t >>> 0, n || z(
          this,
          e,
          t,
          4,
          4294967295,
          0
        ), this[t] = e >>> 24, this[t + 1] = e >>> 16, this[t + 2] = e >>> 8, this[t + 3] = e & 255, t + 4;
      }, "writeUInt32BE");
      function Xn(r, e, t, n, i) {
        ii(e, n, i, r, t, 7);
        let s = Number(e & BigInt(4294967295));
        r[t++] = s, s = s >> 8, r[t++] = s, s = s >> 8, r[t++] = s, s = s >> 8, r[t++] = s;
        let o = Number(e >> BigInt(32) & BigInt(4294967295));
        return r[t++] = o, o = o >> 8, r[t++] = o, o = o >> 8, r[t++] = o, o = o >> 8, r[t++] = o, t;
      }
      a(Xn, "wrtBigUInt64LE");
      function ei(r, e, t, n, i) {
        ii(e, n, i, r, t, 7);
        let s = Number(e & BigInt(4294967295));
        r[t + 7] = s, s = s >> 8, r[t + 6] = s, s = s >> 8, r[t + 5] = s, s = s >> 8, r[t + 4] = s;
        let o = Number(e >> BigInt(32) & BigInt(4294967295));
        return r[t + 3] = o, o = o >> 8, r[t + 2] = o, o = o >> 8, r[t + 1] = o, o = o >> 8, r[t] = o, t + 8;
      }
      a(ei, "wrtBigUInt64BE");
      d.prototype.writeBigUInt64LE = be(a(function(e, t = 0) {
        return Xn(this, e, t, BigInt(0), BigInt("0xffffffffffffffff"));
      }, "writeBigUInt64LE"));
      d.prototype.writeBigUInt64BE = be(a(function(e, t = 0) {
        return ei(this, e, t, BigInt(0), BigInt(
          "0xffffffffffffffff"
        ));
      }, "writeBigUInt64BE"));
      d.prototype.writeIntLE = a(function(e, t, n, i) {
        if (e = +e, t = t >>> 0, !i) {
          let c = Math.pow(2, 8 * n - 1);
          z(this, e, t, n, c - 1, -c);
        }
        let s = 0, o = 1, u = 0;
        for (this[t] = e & 255; ++s < n && (o *= 256); )
          e < 0 && u === 0 && this[t + s - 1] !== 0 && (u = 1), this[t + s] = (e / o >> 0) - u & 255;
        return t + n;
      }, "writeIntLE");
      d.prototype.writeIntBE = a(function(e, t, n, i) {
        if (e = +e, t = t >>> 0, !i) {
          let c = Math.pow(2, 8 * n - 1);
          z(this, e, t, n, c - 1, -c);
        }
        let s = n - 1, o = 1, u = 0;
        for (this[t + s] = e & 255; --s >= 0 && (o *= 256); ) e < 0 && u === 0 && this[t + s + 1] !== 0 && (u = 1), this[t + s] = (e / o >> 0) - u & 255;
        return t + n;
      }, "writeIntBE");
      d.prototype.writeInt8 = a(function(e, t, n) {
        return e = +e, t = t >>> 0, n || z(this, e, t, 1, 127, -128), e < 0 && (e = 255 + e + 1), this[t] = e & 255, t + 1;
      }, "writeInt8");
      d.prototype.writeInt16LE = a(function(e, t, n) {
        return e = +e, t = t >>> 0, n || z(this, e, t, 2, 32767, -32768), this[t] = e & 255, this[t + 1] = e >>> 8, t + 2;
      }, "writeInt16LE");
      d.prototype.writeInt16BE = a(function(e, t, n) {
        return e = +e, t = t >>> 0, n || z(this, e, t, 2, 32767, -32768), this[t] = e >>> 8, this[t + 1] = e & 255, t + 2;
      }, "writeInt16BE");
      d.prototype.writeInt32LE = a(function(e, t, n) {
        return e = +e, t = t >>> 0, n || z(
          this,
          e,
          t,
          4,
          2147483647,
          -2147483648
        ), this[t] = e & 255, this[t + 1] = e >>> 8, this[t + 2] = e >>> 16, this[t + 3] = e >>> 24, t + 4;
      }, "writeInt32LE");
      d.prototype.writeInt32BE = a(function(e, t, n) {
        return e = +e, t = t >>> 0, n || z(
          this,
          e,
          t,
          4,
          2147483647,
          -2147483648
        ), e < 0 && (e = 4294967295 + e + 1), this[t] = e >>> 24, this[t + 1] = e >>> 16, this[t + 2] = e >>> 8, this[t + 3] = e & 255, t + 4;
      }, "writeInt32BE");
      d.prototype.writeBigInt64LE = be(a(function(e, t = 0) {
        return Xn(this, e, t, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      }, "writeBigInt64LE"));
      d.prototype.writeBigInt64BE = be(
        a(function(e, t = 0) {
          return ei(this, e, t, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
        }, "writeBigInt64BE")
      );
      function ti(r, e, t, n, i, s) {
        if (t + n > r.length) throw new RangeError("Index out of range");
        if (t < 0) throw new RangeError("Index out of range");
      }
      a(ti, "checkIEEE754");
      function ri(r, e, t, n, i) {
        return e = +e, t = t >>> 0, i || ti(r, e, t, 4, 34028234663852886e22, -34028234663852886e22), Re.write(r, e, t, n, 23, 4), t + 4;
      }
      a(
        ri,
        "writeFloat"
      );
      d.prototype.writeFloatLE = a(function(e, t, n) {
        return ri(this, e, t, true, n);
      }, "writeFloatLE");
      d.prototype.writeFloatBE = a(function(e, t, n) {
        return ri(this, e, t, false, n);
      }, "writeFloatBE");
      function ni(r, e, t, n, i) {
        return e = +e, t = t >>> 0, i || ti(r, e, t, 8, 17976931348623157e292, -17976931348623157e292), Re.write(
          r,
          e,
          t,
          n,
          52,
          8
        ), t + 8;
      }
      a(ni, "writeDouble");
      d.prototype.writeDoubleLE = a(function(e, t, n) {
        return ni(this, e, t, true, n);
      }, "writeDoubleLE");
      d.prototype.writeDoubleBE = a(function(e, t, n) {
        return ni(this, e, t, false, n);
      }, "writeDoubleBE");
      d.prototype.copy = a(function(e, t, n, i) {
        if (!d.isBuffer(e)) throw new TypeError("argument should be a Buffer");
        if (n || (n = 0), !i && i !== 0 && (i = this.length), t >= e.length && (t = e.length), t || (t = 0), i > 0 && i < n && (i = n), i === n || e.length === 0 || this.length === 0) return 0;
        if (t < 0) throw new RangeError("targetStart out of bounds");
        if (n < 0 || n >= this.length) throw new RangeError("Index out of range");
        if (i < 0) throw new RangeError("sourceEnd out of bounds");
        i > this.length && (i = this.length), e.length - t < i - n && (i = e.length - t + n);
        let s = i - n;
        return this === e && typeof Uint8Array.prototype.copyWithin == "function" ? this.copyWithin(t, n, i) : Uint8Array.prototype.set.call(e, this.subarray(n, i), t), s;
      }, "copy");
      d.prototype.fill = a(function(e, t, n, i) {
        if (typeof e == "string") {
          if (typeof t == "string" ? (i = t, t = 0, n = this.length) : typeof n == "string" && (i = n, n = this.length), i !== void 0 && typeof i != "string") throw new TypeError("encoding must be a string");
          if (typeof i == "string" && !d.isEncoding(i)) throw new TypeError(
            "Unknown encoding: " + i
          );
          if (e.length === 1) {
            let o = e.charCodeAt(0);
            (i === "utf8" && o < 128 || i === "latin1") && (e = o);
          }
        } else typeof e == "number" ? e = e & 255 : typeof e == "boolean" && (e = Number(e));
        if (t < 0 || this.length < t || this.length < n) throw new RangeError("Out of range index");
        if (n <= t) return this;
        t = t >>> 0, n = n === void 0 ? this.length : n >>> 0, e || (e = 0);
        let s;
        if (typeof e == "number") for (s = t; s < n; ++s) this[s] = e;
        else {
          let o = d.isBuffer(e) ? e : d.from(
            e,
            i
          ), u = o.length;
          if (u === 0) throw new TypeError('The value "' + e + '" is invalid for argument "value"');
          for (s = 0; s < n - t; ++s) this[s + t] = o[s % u];
        }
        return this;
      }, "fill");
      var Pe = {};
      function zt(r, e, t) {
        var n;
        Pe[r] = (n = class extends t {
          constructor() {
            super(), Object.defineProperty(this, "message", { value: e.apply(this, arguments), writable: true, configurable: true }), this.name = `${this.name} [${r}]`, this.stack, delete this.name;
          }
          get code() {
            return r;
          }
          set code(s) {
            Object.defineProperty(
              this,
              "code",
              { configurable: true, enumerable: true, value: s, writable: true }
            );
          }
          toString() {
            return `${this.name} [${r}]: ${this.message}`;
          }
        }, a(n, "NodeError"), n);
      }
      a(zt, "E");
      zt("ERR_BUFFER_OUT_OF_BOUNDS", function(r) {
        return r ? `${r} is outside of buffer bounds` : "Attempt to access memory outside buffer bounds";
      }, RangeError);
      zt(
        "ERR_INVALID_ARG_TYPE",
        function(r, e) {
          return `The "${r}" argument must be of type number. Received type ${typeof e}`;
        },
        TypeError
      );
      zt("ERR_OUT_OF_RANGE", function(r, e, t) {
        let n = `The value of "${r}" is out of range.`, i = t;
        return Number.isInteger(t) && Math.abs(t) > 2 ** 32 ? i = Vn(String(t)) : typeof t == "bigint" && (i = String(
          t
        ), (t > BigInt(2) ** BigInt(32) || t < -(BigInt(2) ** BigInt(32))) && (i = Vn(i)), i += "n"), n += ` It must be ${e}. Received ${i}`, n;
      }, RangeError);
      function Vn(r) {
        let e = "", t = r.length, n = r[0] === "-" ? 1 : 0;
        for (; t >= n + 4; t -= 3) e = `_${r.slice(t - 3, t)}${e}`;
        return `${r.slice(0, t)}${e}`;
      }
      a(Vn, "addNumericalSeparator");
      function oa(r, e, t) {
        Le(e, "offset"), (r[e] === void 0 || r[e + t] === void 0) && We(e, r.length - (t + 1));
      }
      a(oa, "checkBounds");
      function ii(r, e, t, n, i, s) {
        if (r > t || r < e) {
          let o = typeof e == "bigint" ? "n" : "", u;
          throw s > 3 ? e === 0 || e === BigInt(0) ? u = `>= 0${o} and < 2${o} ** ${(s + 1) * 8}${o}` : u = `>= -(2${o} ** ${(s + 1) * 8 - 1}${o}) and < 2 ** ${(s + 1) * 8 - 1}${o}` : u = `>= ${e}${o} and <= ${t}${o}`, new Pe.ERR_OUT_OF_RANGE("value", u, r);
        }
        oa(n, i, s);
      }
      a(ii, "checkIntBI");
      function Le(r, e) {
        if (typeof r != "number") throw new Pe.ERR_INVALID_ARG_TYPE(e, "number", r);
      }
      a(Le, "validateNumber");
      function We(r, e, t) {
        throw Math.floor(r) !== r ? (Le(r, t), new Pe.ERR_OUT_OF_RANGE(t || "offset", "an integer", r)) : e < 0 ? new Pe.ERR_BUFFER_OUT_OF_BOUNDS() : new Pe.ERR_OUT_OF_RANGE(t || "offset", `>= ${t ? 1 : 0} and <= ${e}`, r);
      }
      a(We, "boundsError");
      var aa = /[^+/0-9A-Za-z-_]/g;
      function ua(r) {
        if (r = r.split("=")[0], r = r.trim().replace(aa, ""), r.length < 2) return "";
        for (; r.length % 4 !== 0; ) r = r + "=";
        return r;
      }
      a(ua, "base64clean");
      function $t(r, e) {
        e = e || 1 / 0;
        let t, n = r.length, i = null, s = [];
        for (let o = 0; o < n; ++o) {
          if (t = r.charCodeAt(o), t > 55295 && t < 57344) {
            if (!i) {
              if (t > 56319) {
                (e -= 3) > -1 && s.push(239, 191, 189);
                continue;
              } else if (o + 1 === n) {
                (e -= 3) > -1 && s.push(239, 191, 189);
                continue;
              }
              i = t;
              continue;
            }
            if (t < 56320) {
              (e -= 3) > -1 && s.push(239, 191, 189), i = t;
              continue;
            }
            t = (i - 55296 << 10 | t - 56320) + 65536;
          } else i && (e -= 3) > -1 && s.push(239, 191, 189);
          if (i = null, t < 128) {
            if ((e -= 1) < 0) break;
            s.push(t);
          } else if (t < 2048) {
            if ((e -= 2) < 0) break;
            s.push(t >> 6 | 192, t & 63 | 128);
          } else if (t < 65536) {
            if ((e -= 3) < 0) break;
            s.push(t >> 12 | 224, t >> 6 & 63 | 128, t & 63 | 128);
          } else if (t < 1114112) {
            if ((e -= 4) < 0) break;
            s.push(t >> 18 | 240, t >> 12 & 63 | 128, t >> 6 & 63 | 128, t & 63 | 128);
          } else throw new Error("Invalid code point");
        }
        return s;
      }
      a($t, "utf8ToBytes");
      function ca(r) {
        let e = [];
        for (let t = 0; t < r.length; ++t) e.push(r.charCodeAt(t) & 255);
        return e;
      }
      a(
        ca,
        "asciiToBytes"
      );
      function la(r, e) {
        let t, n, i, s = [];
        for (let o = 0; o < r.length && !((e -= 2) < 0); ++o) t = r.charCodeAt(
          o
        ), n = t >> 8, i = t % 256, s.push(i), s.push(n);
        return s;
      }
      a(la, "utf16leToBytes");
      function si(r) {
        return Wt.toByteArray(
          ua(r)
        );
      }
      a(si, "base64ToBytes");
      function ht(r, e, t, n) {
        let i;
        for (i = 0; i < n && !(i + t >= e.length || i >= r.length); ++i)
          e[i + t] = r[i];
        return i;
      }
      a(ht, "blitBuffer");
      function fe(r, e) {
        return r instanceof e || r != null && r.constructor != null && r.constructor.name != null && r.constructor.name === e.name;
      }
      a(fe, "isInstance");
      function Kt(r) {
        return r !== r;
      }
      a(Kt, "numberIsNaN");
      var fa = function() {
        let r = "0123456789abcdef", e = new Array(256);
        for (let t = 0; t < 16; ++t) {
          let n = t * 16;
          for (let i = 0; i < 16; ++i) e[n + i] = r[t] + r[i];
        }
        return e;
      }();
      function be(r) {
        return typeof BigInt > "u" ? ha : r;
      }
      a(be, "defineBigIntMethod");
      function ha() {
        throw new Error("BigInt not supported");
      }
      a(ha, "BufferBigIntNotDefined");
    });
    h = V(() => {
      "use strict";
      b = globalThis, x = globalThis.setImmediate ?? ((r) => setTimeout(r, 0)), v = globalThis.clearImmediate ?? ((r) => clearTimeout(r)), p = typeof globalThis.Buffer == "function" && typeof globalThis.Buffer.allocUnsafe == "function" ? globalThis.Buffer : oi().Buffer, y = globalThis.process ?? {};
      y.env ?? (y.env = {});
      try {
        y.nextTick(() => {
        });
      } catch {
        let e = Promise.resolve();
        y.nextTick = e.then.bind(e);
      }
    });
    ve = T((Ef, Xt) => {
      "use strict";
      h();
      var Fe = typeof Reflect == "object" ? Reflect : null, mi = Fe && typeof Fe.apply == "function" ? Fe.apply : a(function(e, t, n) {
        return Function.prototype.apply.call(e, t, n);
      }, "ReflectApply"), bt;
      Fe && typeof Fe.ownKeys == "function" ? bt = Fe.ownKeys : Object.getOwnPropertySymbols ? bt = a(function(e) {
        return Object.getOwnPropertyNames(e).concat(Object.getOwnPropertySymbols(e));
      }, "ReflectOwnKeys") : bt = a(function(e) {
        return Object.getOwnPropertyNames(e);
      }, "ReflectOwnKeys");
      function Ia(r) {
        console && console.warn && console.warn(r);
      }
      a(
        Ia,
        "ProcessEmitWarning"
      );
      var wi = Number.isNaN || a(function(e) {
        return e !== e;
      }, "NumberIsNaN");
      function P() {
        P.init.call(this);
      }
      a(P, "EventEmitter");
      Xt.exports = P;
      Xt.exports.once = Ba;
      P.EventEmitter = P;
      P.prototype._events = void 0;
      P.prototype._eventsCount = 0;
      P.prototype._maxListeners = void 0;
      var gi = 10;
      function xt(r) {
        if (typeof r != "function") throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof r);
      }
      a(xt, "checkListener");
      Object.defineProperty(P, "defaultMaxListeners", { enumerable: true, get: a(function() {
        return gi;
      }, "get"), set: a(
        function(r) {
          if (typeof r != "number" || r < 0 || wi(r)) throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + r + ".");
          gi = r;
        },
        "set"
      ) });
      P.init = function() {
        (this._events === void 0 || this._events === Object.getPrototypeOf(this)._events) && (this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0), this._maxListeners = this._maxListeners || void 0;
      };
      P.prototype.setMaxListeners = a(function(e) {
        if (typeof e != "number" || e < 0 || wi(e)) throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + e + ".");
        return this._maxListeners = e, this;
      }, "setMaxListeners");
      function bi(r) {
        return r._maxListeners === void 0 ? P.defaultMaxListeners : r._maxListeners;
      }
      a(bi, "_getMaxListeners");
      P.prototype.getMaxListeners = a(function() {
        return bi(this);
      }, "getMaxListeners");
      P.prototype.emit = a(function(e) {
        for (var t = [], n = 1; n < arguments.length; n++) t.push(arguments[n]);
        var i = e === "error", s = this._events;
        if (s !== void 0) i = i && s.error === void 0;
        else if (!i) return false;
        if (i) {
          var o;
          if (t.length > 0 && (o = t[0]), o instanceof Error) throw o;
          var u = new Error("Unhandled error." + (o ? " (" + o.message + ")" : ""));
          throw u.context = o, u;
        }
        var c = s[e];
        if (c === void 0) return false;
        if (typeof c == "function") mi(c, this, t);
        else for (var l = c.length, f = Ai(c, l), n = 0; n < l; ++n) mi(f[n], this, t);
        return true;
      }, "emit");
      function xi(r, e, t, n) {
        var i, s, o;
        if (xt(
          t
        ), s = r._events, s === void 0 ? (s = r._events = /* @__PURE__ */ Object.create(null), r._eventsCount = 0) : (s.newListener !== void 0 && (r.emit("newListener", e, t.listener ? t.listener : t), s = r._events), o = s[e]), o === void 0) o = s[e] = t, ++r._eventsCount;
        else if (typeof o == "function" ? o = s[e] = n ? [t, o] : [o, t] : n ? o.unshift(t) : o.push(t), i = bi(r), i > 0 && o.length > i && !o.warned) {
          o.warned = true;
          var u = new Error("Possible EventEmitter memory leak detected. " + o.length + " " + String(e) + " listeners added. Use emitter.setMaxListeners() to increase limit");
          u.name = "MaxListenersExceededWarning", u.emitter = r, u.type = e, u.count = o.length, Ia(u);
        }
        return r;
      }
      a(xi, "_addListener");
      P.prototype.addListener = a(function(e, t) {
        return xi(this, e, t, false);
      }, "addListener");
      P.prototype.on = P.prototype.addListener;
      P.prototype.prependListener = a(function(e, t) {
        return xi(this, e, t, true);
      }, "prependListener");
      function Pa() {
        if (!this.fired) return this.target.removeListener(this.type, this.wrapFn), this.fired = true, arguments.length === 0 ? this.listener.call(this.target) : this.listener.apply(this.target, arguments);
      }
      a(Pa, "onceWrapper");
      function vi(r, e, t) {
        var n = {
          fired: false,
          wrapFn: void 0,
          target: r,
          type: e,
          listener: t
        }, i = Pa.bind(n);
        return i.listener = t, n.wrapFn = i, i;
      }
      a(vi, "_onceWrap");
      P.prototype.once = a(function(e, t) {
        return xt(t), this.on(e, vi(this, e, t)), this;
      }, "once");
      P.prototype.prependOnceListener = a(function(e, t) {
        return xt(t), this.prependListener(e, vi(this, e, t)), this;
      }, "prependOnceListener");
      P.prototype.removeListener = a(function(e, t) {
        var n, i, s, o, u;
        if (xt(t), i = this._events, i === void 0) return this;
        if (n = i[e], n === void 0) return this;
        if (n === t || n.listener === t) --this._eventsCount === 0 ? this._events = /* @__PURE__ */ Object.create(null) : (delete i[e], i.removeListener && this.emit("removeListener", e, n.listener || t));
        else if (typeof n != "function") {
          for (s = -1, o = n.length - 1; o >= 0; o--) if (n[o] === t || n[o].listener === t) {
            u = n[o].listener, s = o;
            break;
          }
          if (s < 0) return this;
          s === 0 ? n.shift() : Ra(n, s), n.length === 1 && (i[e] = n[0]), i.removeListener !== void 0 && this.emit("removeListener", e, u || t);
        }
        return this;
      }, "removeListener");
      P.prototype.off = P.prototype.removeListener;
      P.prototype.removeAllListeners = a(function(e) {
        var t, n, i;
        if (n = this._events, n === void 0) return this;
        if (n.removeListener === void 0) return arguments.length === 0 ? (this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0) : n[e] !== void 0 && (--this._eventsCount === 0 ? this._events = /* @__PURE__ */ Object.create(null) : delete n[e]), this;
        if (arguments.length === 0) {
          var s = Object.keys(n), o;
          for (i = 0; i < s.length; ++i) o = s[i], o !== "removeListener" && this.removeAllListeners(
            o
          );
          return this.removeAllListeners("removeListener"), this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0, this;
        }
        if (t = n[e], typeof t == "function") this.removeListener(e, t);
        else if (t !== void 0) for (i = t.length - 1; i >= 0; i--) this.removeListener(e, t[i]);
        return this;
      }, "removeAllListeners");
      function Si(r, e, t) {
        var n = r._events;
        if (n === void 0) return [];
        var i = n[e];
        return i === void 0 ? [] : typeof i == "function" ? t ? [i.listener || i] : [i] : t ? La(i) : Ai(i, i.length);
      }
      a(Si, "_listeners");
      P.prototype.listeners = a(function(e) {
        return Si(this, e, true);
      }, "listeners");
      P.prototype.rawListeners = a(function(e) {
        return Si(this, e, false);
      }, "rawListeners");
      P.listenerCount = function(r, e) {
        return typeof r.listenerCount == "function" ? r.listenerCount(e) : Ei.call(r, e);
      };
      P.prototype.listenerCount = Ei;
      function Ei(r) {
        var e = this._events;
        if (e !== void 0) {
          var t = e[r];
          if (typeof t == "function")
            return 1;
          if (t !== void 0) return t.length;
        }
        return 0;
      }
      a(Ei, "listenerCount");
      P.prototype.eventNames = a(function() {
        return this._eventsCount > 0 ? bt(this._events) : [];
      }, "eventNames");
      function Ai(r, e) {
        for (var t = new Array(e), n = 0; n < e; ++n) t[n] = r[n];
        return t;
      }
      a(Ai, "arrayClone");
      function Ra(r, e) {
        for (; e + 1 < r.length; e++) r[e] = r[e + 1];
        r.pop();
      }
      a(Ra, "spliceOne");
      function La(r) {
        for (var e = new Array(r.length), t = 0; t < e.length; ++t) e[t] = r[t].listener || r[t];
        return e;
      }
      a(La, "unwrapListeners");
      function Ba(r, e) {
        return new Promise(function(t, n) {
          function i(o) {
            r.removeListener(e, s), n(o);
          }
          a(i, "errorListener");
          function s() {
            typeof r.removeListener == "function" && r.removeListener("error", i), t([].slice.call(arguments));
          }
          a(s, "resolver"), Ci(r, e, s, { once: true }), e !== "error" && Fa(r, i, { once: true });
        });
      }
      a(Ba, "once");
      function Fa(r, e, t) {
        typeof r.on == "function" && Ci(r, "error", e, t);
      }
      a(
        Fa,
        "addErrorHandlerIfEventEmitter"
      );
      function Ci(r, e, t, n) {
        if (typeof r.on == "function") n.once ? r.once(e, t) : r.on(e, t);
        else if (typeof r.addEventListener == "function") r.addEventListener(e, a(function i(s) {
          n.once && r.removeEventListener(e, i), t(s);
        }, "wrapListener"));
        else throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof r);
      }
      a(Ci, "eventTargetAgnosticAddListener");
    });
    Ii = {};
    se(Ii, { Socket: () => pe, isIP: () => Ma });
    Ge = V(() => {
      "use strict";
      h();
      Ti = we(ve(), 1);
      a(Ma, "isIP");
      _i = /^[^.]+\./, A = class A2 extends Ti.EventEmitter {
        constructor() {
          super(...arguments);
          E(this, "opts", {});
          E(this, "connecting", false);
          E(this, "pending", true);
          E(
            this,
            "writable",
            true
          );
          E(this, "encrypted", false);
          E(this, "authorized", false);
          E(this, "destroyed", false);
          E(this, "ws", null);
          E(this, "writeBuffer");
          E(this, "tlsState", 0);
          E(this, "tlsRead");
          E(this, "tlsWrite");
        }
        static get poolQueryViaFetch() {
          return A2.opts.poolQueryViaFetch ?? A2.defaults.poolQueryViaFetch;
        }
        static set poolQueryViaFetch(t) {
          A2.opts.poolQueryViaFetch = t;
        }
        static get fetchEndpoint() {
          return A2.opts.fetchEndpoint ?? A2.defaults.fetchEndpoint;
        }
        static set fetchEndpoint(t) {
          A2.opts.fetchEndpoint = t;
        }
        static get fetchConnectionCache() {
          return true;
        }
        static set fetchConnectionCache(t) {
          console.warn("The `fetchConnectionCache` option is deprecated (now always `true`)");
        }
        static get fetchFunction() {
          return A2.opts.fetchFunction ?? A2.defaults.fetchFunction;
        }
        static set fetchFunction(t) {
          A2.opts.fetchFunction = t;
        }
        static get webSocketConstructor() {
          return A2.opts.webSocketConstructor ?? A2.defaults.webSocketConstructor;
        }
        static set webSocketConstructor(t) {
          A2.opts.webSocketConstructor = t;
        }
        get webSocketConstructor() {
          return this.opts.webSocketConstructor ?? A2.webSocketConstructor;
        }
        set webSocketConstructor(t) {
          this.opts.webSocketConstructor = t;
        }
        static get wsProxy() {
          return A2.opts.wsProxy ?? A2.defaults.wsProxy;
        }
        static set wsProxy(t) {
          A2.opts.wsProxy = t;
        }
        get wsProxy() {
          return this.opts.wsProxy ?? A2.wsProxy;
        }
        set wsProxy(t) {
          this.opts.wsProxy = t;
        }
        static get coalesceWrites() {
          return A2.opts.coalesceWrites ?? A2.defaults.coalesceWrites;
        }
        static set coalesceWrites(t) {
          A2.opts.coalesceWrites = t;
        }
        get coalesceWrites() {
          return this.opts.coalesceWrites ?? A2.coalesceWrites;
        }
        set coalesceWrites(t) {
          this.opts.coalesceWrites = t;
        }
        static get useSecureWebSocket() {
          return A2.opts.useSecureWebSocket ?? A2.defaults.useSecureWebSocket;
        }
        static set useSecureWebSocket(t) {
          A2.opts.useSecureWebSocket = t;
        }
        get useSecureWebSocket() {
          return this.opts.useSecureWebSocket ?? A2.useSecureWebSocket;
        }
        set useSecureWebSocket(t) {
          this.opts.useSecureWebSocket = t;
        }
        static get forceDisablePgSSL() {
          return A2.opts.forceDisablePgSSL ?? A2.defaults.forceDisablePgSSL;
        }
        static set forceDisablePgSSL(t) {
          A2.opts.forceDisablePgSSL = t;
        }
        get forceDisablePgSSL() {
          return this.opts.forceDisablePgSSL ?? A2.forceDisablePgSSL;
        }
        set forceDisablePgSSL(t) {
          this.opts.forceDisablePgSSL = t;
        }
        static get disableSNI() {
          return A2.opts.disableSNI ?? A2.defaults.disableSNI;
        }
        static set disableSNI(t) {
          A2.opts.disableSNI = t;
        }
        get disableSNI() {
          return this.opts.disableSNI ?? A2.disableSNI;
        }
        set disableSNI(t) {
          this.opts.disableSNI = t;
        }
        static get disableWarningInBrowsers() {
          return A2.opts.disableWarningInBrowsers ?? A2.defaults.disableWarningInBrowsers;
        }
        static set disableWarningInBrowsers(t) {
          A2.opts.disableWarningInBrowsers = t;
        }
        get disableWarningInBrowsers() {
          return this.opts.disableWarningInBrowsers ?? A2.disableWarningInBrowsers;
        }
        set disableWarningInBrowsers(t) {
          this.opts.disableWarningInBrowsers = t;
        }
        static get pipelineConnect() {
          return A2.opts.pipelineConnect ?? A2.defaults.pipelineConnect;
        }
        static set pipelineConnect(t) {
          A2.opts.pipelineConnect = t;
        }
        get pipelineConnect() {
          return this.opts.pipelineConnect ?? A2.pipelineConnect;
        }
        set pipelineConnect(t) {
          this.opts.pipelineConnect = t;
        }
        static get subtls() {
          return A2.opts.subtls ?? A2.defaults.subtls;
        }
        static set subtls(t) {
          A2.opts.subtls = t;
        }
        get subtls() {
          return this.opts.subtls ?? A2.subtls;
        }
        set subtls(t) {
          this.opts.subtls = t;
        }
        static get pipelineTLS() {
          return A2.opts.pipelineTLS ?? A2.defaults.pipelineTLS;
        }
        static set pipelineTLS(t) {
          A2.opts.pipelineTLS = t;
        }
        get pipelineTLS() {
          return this.opts.pipelineTLS ?? A2.pipelineTLS;
        }
        set pipelineTLS(t) {
          this.opts.pipelineTLS = t;
        }
        static get rootCerts() {
          return A2.opts.rootCerts ?? A2.defaults.rootCerts;
        }
        static set rootCerts(t) {
          A2.opts.rootCerts = t;
        }
        get rootCerts() {
          return this.opts.rootCerts ?? A2.rootCerts;
        }
        set rootCerts(t) {
          this.opts.rootCerts = t;
        }
        wsProxyAddrForHost(t, n) {
          let i = this.wsProxy;
          if (i === void 0) throw new Error("No WebSocket proxy is configured. Please see https://github.com/neondatabase/serverless/blob/main/CONFIG.md#wsproxy-string--host-string-port-number--string--string");
          return typeof i == "function" ? i(t, n) : `${i}?address=${t}:${n}`;
        }
        setNoDelay() {
          return this;
        }
        setKeepAlive() {
          return this;
        }
        ref() {
          return this;
        }
        unref() {
          return this;
        }
        connect(t, n, i) {
          this.connecting = true, i && this.once("connect", i);
          let s = a(() => {
            this.connecting = false, this.pending = false, this.emit("connect"), this.emit("ready");
          }, "handleWebSocketOpen"), o = a((c, l = false) => {
            c.binaryType = "arraybuffer", c.addEventListener("error", (f) => {
              this.emit("error", f), this.emit("close");
            }), c.addEventListener("message", (f) => {
              if (this.tlsState === 0) {
                let m = p.from(f.data);
                this.emit("data", m);
              }
            }), c.addEventListener("close", () => {
              this.destroyed = true, this.emit("close");
            }), l ? s() : c.addEventListener("open", s);
          }, "configureWebSocket"), u;
          try {
            u = this.wsProxyAddrForHost(n, typeof t == "string" ? parseInt(t, 10) : t);
          } catch (c) {
            this.emit("error", c), this.emit("close");
            return;
          }
          try {
            let l = (this.useSecureWebSocket ? "wss:" : "ws:") + "//" + u;
            if (this.webSocketConstructor !== void 0) this.ws = new this.webSocketConstructor(l), o(this.ws);
            else try {
              this.ws = new WebSocket(l), o(this.ws);
            } catch {
              this.ws = new __unstable_WebSocket(l), o(
                this.ws
              );
            }
          } catch (c) {
            let f = (this.useSecureWebSocket ? "https:" : "http:") + "//" + u;
            fetch(f, { headers: { Upgrade: "websocket" } }).then((m) => {
              if (this.ws = m.webSocket, this.ws == null) throw c;
              this.ws.accept(), o(this.ws, true);
            }).catch((m) => {
              this.emit("error", new Error(`All attempts to open a WebSocket to connect to the database failed. Please refer to https://github.com/neondatabase/serverless/blob/main/CONFIG.md#websocketconstructor-typeof-websocket--undefined. Details: ${m}`)), this.emit("close");
            });
          }
        }
        async startTls(t) {
          if (this.subtls === void 0) throw new Error("For Postgres SSL connections, you must set `neonConfig.subtls` to the subtls library. See https://github.com/neondatabase/serverless/blob/main/CONFIG.md for more information.");
          this.tlsState = 1;
          let n = await this.subtls.TrustedCert.databaseFromPEM(this.rootCerts), i = new this.subtls.WebSocketReadQueue(this.ws), s = i.read.bind(i), o = this.rawWrite.bind(this), { read: u, write: c } = await this.subtls.startTls(t, n, s, o, { useSNI: !this.disableSNI, expectPreData: this.pipelineTLS ? new Uint8Array([83]) : void 0 });
          this.tlsRead = u, this.tlsWrite = c, this.tlsState = 2, this.encrypted = true, this.authorized = true, this.emit(
            "secureConnection",
            this
          ), this.tlsReadLoop().catch((l) => {
            this.destroyed || (this.destroyed = true, this.emit("error", l), this.ws?.close());
          });
        }
        async tlsReadLoop() {
          for (; ; ) {
            let t = await this.tlsRead();
            if (t === void 0) break;
            {
              let n = p.from(t);
              this.emit("data", n);
            }
          }
        }
        rawWrite(t) {
          if (!this.coalesceWrites) {
            this.ws && this.ws.send(t);
            return;
          }
          if (this.writeBuffer === void 0) this.writeBuffer = t, setTimeout(() => {
            this.ws && this.ws.send(this.writeBuffer), this.writeBuffer = void 0;
          }, 0);
          else {
            let n = new Uint8Array(this.writeBuffer.length + t.length);
            n.set(this.writeBuffer), n.set(t, this.writeBuffer.length), this.writeBuffer = n;
          }
        }
        write(t, n = "utf8", i = (s) => {
        }) {
          return t.length === 0 ? (i(), true) : (typeof t == "string" && (t = p.from(t, n)), this.tlsState === 0 ? (this.rawWrite(t), i()) : this.tlsState === 1 ? this.once("secureConnection", () => {
            this.write(t, n, i);
          }) : (this.tlsWrite(t), i()), true);
        }
        end(t = p.alloc(0), n = "utf8", i = () => {
        }) {
          return this.write(t, n, () => {
            this.ws?.close(), i();
          }), this;
        }
        destroy() {
          return this.destroyed = true, this.end();
        }
      };
      a(A, "Socket"), E(A, "defaults", {
        poolQueryViaFetch: false,
        fetchEndpoint: a((t, n, i) => {
          let s;
          return i?.jwtAuth ? s = t.replace(_i, "apiauth.") : s = t.replace(_i, "api."), "https://" + s + "/sql";
        }, "fetchEndpoint"),
        fetchConnectionCache: true,
        fetchFunction: void 0,
        webSocketConstructor: void 0,
        wsProxy: a((t) => t + "/v2", "wsProxy"),
        useSecureWebSocket: true,
        forceDisablePgSSL: true,
        coalesceWrites: true,
        pipelineConnect: "password",
        subtls: void 0,
        rootCerts: "",
        pipelineTLS: false,
        disableSNI: false,
        disableWarningInBrowsers: false
      }), E(A, "opts", {});
      pe = A;
    });
    tr = T((Pi) => {
      "use strict";
      h();
      Pi.parse = function(r, e) {
        return new er(r, e).parse();
      };
      var St = class St2 {
        constructor(e, t) {
          this.source = e, this.transform = t || ka, this.position = 0, this.entries = [], this.recorded = [], this.dimension = 0;
        }
        isEof() {
          return this.position >= this.source.length;
        }
        nextCharacter() {
          var e = this.source[this.position++];
          return e === "\\" ? { value: this.source[this.position++], escaped: true } : { value: e, escaped: false };
        }
        record(e) {
          this.recorded.push(
            e
          );
        }
        newEntry(e) {
          var t;
          (this.recorded.length > 0 || e) && (t = this.recorded.join(""), t === "NULL" && !e && (t = null), t !== null && (t = this.transform(t)), this.entries.push(t), this.recorded = []);
        }
        consumeDimensions() {
          if (this.source[0] === "[") for (; !this.isEof(); ) {
            var e = this.nextCharacter();
            if (e.value === "=") break;
          }
        }
        parse(e) {
          var t, n, i;
          for (this.consumeDimensions(); !this.isEof(); ) if (t = this.nextCharacter(), t.value === "{" && !i) this.dimension++, this.dimension > 1 && (n = new St2(this.source.substr(this.position - 1), this.transform), this.entries.push(n.parse(
            true
          )), this.position += n.position - 2);
          else if (t.value === "}" && !i) {
            if (this.dimension--, !this.dimension && (this.newEntry(), e)) return this.entries;
          } else t.value === '"' && !t.escaped ? (i && this.newEntry(true), i = !i) : t.value === "," && !i ? this.newEntry() : this.record(t.value);
          if (this.dimension !== 0) throw new Error("array dimension not balanced");
          return this.entries;
        }
      };
      a(St, "ArrayParser");
      var er = St;
      function ka(r) {
        return r;
      }
      a(ka, "identity");
    });
    rr = T((Ff, Ri) => {
      h();
      var Oa = tr();
      Ri.exports = { create: a(function(r, e) {
        return { parse: a(function() {
          return Oa.parse(r, e);
        }, "parse") };
      }, "create") };
    });
    Fi = T((Of, Bi) => {
      "use strict";
      h();
      var Ua = /(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?.*?( BC)?$/, Qa = /^(\d{1,})-(\d{2})-(\d{2})( BC)?$/, Da = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/, qa = /^-?infinity$/;
      Bi.exports = a(function(e) {
        if (qa.test(e)) return Number(e.replace("i", "I"));
        var t = Ua.exec(e);
        if (!t) return Na(
          e
        ) || null;
        var n = !!t[8], i = parseInt(t[1], 10);
        n && (i = Li(i));
        var s = parseInt(t[2], 10) - 1, o = t[3], u = parseInt(
          t[4],
          10
        ), c = parseInt(t[5], 10), l = parseInt(t[6], 10), f = t[7];
        f = f ? 1e3 * parseFloat(f) : 0;
        var m, g = Wa(e);
        return g != null ? (m = new Date(Date.UTC(i, s, o, u, c, l, f)), nr(i) && m.setUTCFullYear(i), g !== 0 && m.setTime(m.getTime() - g)) : (m = new Date(i, s, o, u, c, l, f), nr(i) && m.setFullYear(i)), m;
      }, "parseDate");
      function Na(r) {
        var e = Qa.exec(r);
        if (e) {
          var t = parseInt(e[1], 10), n = !!e[4];
          n && (t = Li(t));
          var i = parseInt(e[2], 10) - 1, s = e[3], o = new Date(t, i, s);
          return nr(
            t
          ) && o.setFullYear(t), o;
        }
      }
      a(Na, "getDate");
      function Wa(r) {
        if (r.endsWith("+00")) return 0;
        var e = Da.exec(r.split(" ")[1]);
        if (e) {
          var t = e[1];
          if (t === "Z") return 0;
          var n = t === "-" ? -1 : 1, i = parseInt(e[2], 10) * 3600 + parseInt(
            e[3] || 0,
            10
          ) * 60 + parseInt(e[4] || 0, 10);
          return i * n * 1e3;
        }
      }
      a(Wa, "timeZoneOffset");
      function Li(r) {
        return -(r - 1);
      }
      a(Li, "bcYearToNegativeYear");
      function nr(r) {
        return r >= 0 && r < 100;
      }
      a(nr, "is0To99");
    });
    ki = T((Df, Mi) => {
      h();
      Mi.exports = Ha;
      var ja = Object.prototype.hasOwnProperty;
      function Ha(r) {
        for (var e = 1; e < arguments.length; e++) {
          var t = arguments[e];
          for (var n in t) ja.call(t, n) && (r[n] = t[n]);
        }
        return r;
      }
      a(Ha, "extend");
    });
    Qi = T((Wf, Ui) => {
      "use strict";
      h();
      var $a = ki();
      Ui.exports = Me;
      function Me(r) {
        if (!(this instanceof Me))
          return new Me(r);
        $a(this, nu(r));
      }
      a(Me, "PostgresInterval");
      var Ga = [
        "seconds",
        "minutes",
        "hours",
        "days",
        "months",
        "years"
      ];
      Me.prototype.toPostgres = function() {
        var r = Ga.filter(this.hasOwnProperty, this);
        return this.milliseconds && r.indexOf("seconds") < 0 && r.push("seconds"), r.length === 0 ? "0" : r.map(function(e) {
          var t = this[e] || 0;
          return e === "seconds" && this.milliseconds && (t = (t + this.milliseconds / 1e3).toFixed(6).replace(
            /\.?0+$/,
            ""
          )), t + " " + e;
        }, this).join(" ");
      };
      var Va = { years: "Y", months: "M", days: "D", hours: "H", minutes: "M", seconds: "S" }, za = ["years", "months", "days"], Ka = ["hours", "minutes", "seconds"];
      Me.prototype.toISOString = Me.prototype.toISO = function() {
        var r = za.map(t, this).join(""), e = Ka.map(t, this).join("");
        return "P" + r + "T" + e;
        function t(n) {
          var i = this[n] || 0;
          return n === "seconds" && this.milliseconds && (i = (i + this.milliseconds / 1e3).toFixed(6).replace(
            /0+$/,
            ""
          )), i + Va[n];
        }
      };
      var ir = "([+-]?\\d+)", Ya = ir + "\\s+years?", Za = ir + "\\s+mons?", Ja = ir + "\\s+days?", Xa = "([+-])?([\\d]*):(\\d\\d):(\\d\\d)\\.?(\\d{1,6})?", eu = new RegExp([Ya, Za, Ja, Xa].map(function(r) {
        return "(" + r + ")?";
      }).join("\\s*")), Oi = { years: 2, months: 4, days: 6, hours: 9, minutes: 10, seconds: 11, milliseconds: 12 }, tu = ["hours", "minutes", "seconds", "milliseconds"];
      function ru(r) {
        var e = r + "000000".slice(r.length);
        return parseInt(
          e,
          10
        ) / 1e3;
      }
      a(ru, "parseMilliseconds");
      function nu(r) {
        if (!r) return {};
        var e = eu.exec(r), t = e[8] === "-";
        return Object.keys(Oi).reduce(function(n, i) {
          var s = Oi[i], o = e[s];
          return !o || (o = i === "milliseconds" ? ru(o) : parseInt(o, 10), !o) || (t && ~tu.indexOf(i) && (o *= -1), n[i] = o), n;
        }, {});
      }
      a(nu, "parse");
    });
    Ni = T(($f, qi) => {
      "use strict";
      h();
      var Di = p.from || p;
      qi.exports = a(function(e) {
        if (/^\\x/.test(e)) return Di(
          e.substr(2),
          "hex"
        );
        for (var t = "", n = 0; n < e.length; ) if (e[n] !== "\\") t += e[n], ++n;
        else if (/[0-7]{3}/.test(e.substr(n + 1, 3))) t += String.fromCharCode(parseInt(e.substr(n + 1, 3), 8)), n += 4;
        else {
          for (var i = 1; n + i < e.length && e[n + i] === "\\"; ) i++;
          for (var s = 0; s < Math.floor(i / 2); ++s) t += "\\";
          n += Math.floor(i / 2) * 2;
        }
        return Di(t, "binary");
      }, "parseBytea");
    });
    zi = T((zf, Vi) => {
      h();
      var Ve = tr(), ze = rr(), Et = Fi(), ji = Qi(), Hi = Ni();
      function At(r) {
        return a(function(t) {
          return t === null ? t : r(t);
        }, "nullAllowed");
      }
      a(At, "allowNull");
      function $i(r) {
        return r === null ? r : r === "TRUE" || r === "t" || r === "true" || r === "y" || r === "yes" || r === "on" || r === "1";
      }
      a($i, "parseBool");
      function iu(r) {
        return r ? Ve.parse(r, $i) : null;
      }
      a(iu, "parseBoolArray");
      function su(r) {
        return parseInt(r, 10);
      }
      a(su, "parseBaseTenInt");
      function sr(r) {
        return r ? Ve.parse(r, At(su)) : null;
      }
      a(sr, "parseIntegerArray");
      function ou(r) {
        return r ? Ve.parse(r, At(function(e) {
          return Gi(e).trim();
        })) : null;
      }
      a(ou, "parseBigIntegerArray");
      var au = a(function(r) {
        if (!r) return null;
        var e = ze.create(r, function(t) {
          return t !== null && (t = cr(t)), t;
        });
        return e.parse();
      }, "parsePointArray"), or = a(function(r) {
        if (!r) return null;
        var e = ze.create(r, function(t) {
          return t !== null && (t = parseFloat(t)), t;
        });
        return e.parse();
      }, "parseFloatArray"), ee = a(function(r) {
        if (!r) return null;
        var e = ze.create(r);
        return e.parse();
      }, "parseStringArray"), ar = a(function(r) {
        if (!r) return null;
        var e = ze.create(
          r,
          function(t) {
            return t !== null && (t = Et(t)), t;
          }
        );
        return e.parse();
      }, "parseDateArray"), uu = a(function(r) {
        if (!r)
          return null;
        var e = ze.create(r, function(t) {
          return t !== null && (t = ji(t)), t;
        });
        return e.parse();
      }, "parseIntervalArray"), cu = a(function(r) {
        return r ? Ve.parse(r, At(Hi)) : null;
      }, "parseByteAArray"), ur = a(function(r) {
        return parseInt(r, 10);
      }, "parseInteger"), Gi = a(function(r) {
        var e = String(r);
        return /^\d+$/.test(e) ? e : r;
      }, "parseBigInteger"), Wi = a(function(r) {
        return r ? Ve.parse(r, At(JSON.parse)) : null;
      }, "parseJsonArray"), cr = a(
        function(r) {
          return r[0] !== "(" ? null : (r = r.substring(1, r.length - 1).split(","), { x: parseFloat(r[0]), y: parseFloat(
            r[1]
          ) });
        },
        "parsePoint"
      ), lu = a(function(r) {
        if (r[0] !== "<" && r[1] !== "(") return null;
        for (var e = "(", t = "", n = false, i = 2; i < r.length - 1; i++) {
          if (n || (e += r[i]), r[i] === ")") {
            n = true;
            continue;
          } else if (!n) continue;
          r[i] !== "," && (t += r[i]);
        }
        var s = cr(e);
        return s.radius = parseFloat(t), s;
      }, "parseCircle"), fu = a(function(r) {
        r(20, Gi), r(21, ur), r(23, ur), r(26, ur), r(700, parseFloat), r(701, parseFloat), r(16, $i), r(1082, Et), r(1114, Et), r(1184, Et), r(
          600,
          cr
        ), r(651, ee), r(718, lu), r(1e3, iu), r(1001, cu), r(1005, sr), r(1007, sr), r(1028, sr), r(1016, ou), r(1017, au), r(1021, or), r(1022, or), r(1231, or), r(1014, ee), r(1015, ee), r(1008, ee), r(1009, ee), r(1040, ee), r(1041, ee), r(
          1115,
          ar
        ), r(1182, ar), r(1185, ar), r(1186, ji), r(1187, uu), r(17, Hi), r(114, JSON.parse.bind(JSON)), r(3802, JSON.parse.bind(JSON)), r(199, Wi), r(3807, Wi), r(3907, ee), r(2951, ee), r(791, ee), r(1183, ee), r(1270, ee);
      }, "init");
      Vi.exports = { init: fu };
    });
    Yi = T((Zf, Ki) => {
      "use strict";
      h();
      var K = 1e6;
      function hu(r) {
        var e = r.readInt32BE(0), t = r.readUInt32BE(
          4
        ), n = "";
        e < 0 && (e = ~e + (t === 0), t = ~t + 1 >>> 0, n = "-");
        var i = "", s, o, u, c, l, f;
        {
          if (s = e % K, e = e / K >>> 0, o = 4294967296 * s + t, t = o / K >>> 0, u = "" + (o - K * t), t === 0 && e === 0) return n + u + i;
          for (c = "", l = 6 - u.length, f = 0; f < l; f++) c += "0";
          i = c + u + i;
        }
        {
          if (s = e % K, e = e / K >>> 0, o = 4294967296 * s + t, t = o / K >>> 0, u = "" + (o - K * t), t === 0 && e === 0) return n + u + i;
          for (c = "", l = 6 - u.length, f = 0; f < l; f++) c += "0";
          i = c + u + i;
        }
        {
          if (s = e % K, e = e / K >>> 0, o = 4294967296 * s + t, t = o / K >>> 0, u = "" + (o - K * t), t === 0 && e === 0) return n + u + i;
          for (c = "", l = 6 - u.length, f = 0; f < l; f++) c += "0";
          i = c + u + i;
        }
        return s = e % K, o = 4294967296 * s + t, u = "" + o % K, n + u + i;
      }
      a(hu, "readInt8");
      Ki.exports = hu;
    });
    ts = T((eh, es) => {
      h();
      var du = Yi(), B = a(function(r, e, t, n, i) {
        t = t || 0, n = n || false, i = i || function(w, S, k) {
          return w * Math.pow(2, k) + S;
        };
        var s = t >> 3, o = a(function(w) {
          return n ? ~w & 255 : w;
        }, "inv"), u = 255, c = 8 - t % 8;
        e < c && (u = 255 << 8 - e & 255, c = e), t && (u = u >> t % 8);
        var l = 0;
        t % 8 + e >= 8 && (l = i(0, o(r[s]) & u, c));
        for (var f = e + t >> 3, m = s + 1; m < f; m++) l = i(l, o(
          r[m]
        ), 8);
        var g = (e + t) % 8;
        return g > 0 && (l = i(l, o(r[f]) >> 8 - g, g)), l;
      }, "parseBits"), Xi = a(function(r, e, t) {
        var n = Math.pow(2, t - 1) - 1, i = B(r, 1), s = B(r, t, 1);
        if (s === 0) return 0;
        var o = 1, u = a(function(l, f, m) {
          l === 0 && (l = 1);
          for (var g = 1; g <= m; g++) o /= 2, (f & 1 << m - g) > 0 && (l += o);
          return l;
        }, "parsePrecisionBits"), c = B(r, e, t + 1, false, u);
        return s == Math.pow(
          2,
          t + 1
        ) - 1 ? c === 0 ? i === 0 ? 1 / 0 : -1 / 0 : NaN : (i === 0 ? 1 : -1) * Math.pow(2, s - n) * c;
      }, "parseFloatFromBits"), pu = a(function(r) {
        return B(r, 1) == 1 ? -1 * (B(r, 15, 1, true) + 1) : B(r, 15, 1);
      }, "parseInt16"), Zi = a(function(r) {
        return B(r, 1) == 1 ? -1 * (B(
          r,
          31,
          1,
          true
        ) + 1) : B(r, 31, 1);
      }, "parseInt32"), yu = a(function(r) {
        return Xi(r, 23, 8);
      }, "parseFloat32"), mu = a(function(r) {
        return Xi(r, 52, 11);
      }, "parseFloat64"), gu = a(function(r) {
        var e = B(r, 16, 32);
        if (e == 49152) return NaN;
        for (var t = Math.pow(1e4, B(r, 16, 16)), n = 0, i = [], s = B(r, 16), o = 0; o < s; o++) n += B(r, 16, 64 + 16 * o) * t, t /= 1e4;
        var u = Math.pow(10, B(
          r,
          16,
          48
        ));
        return (e === 0 ? 1 : -1) * Math.round(n * u) / u;
      }, "parseNumeric"), Ji = a(function(r, e) {
        var t = B(e, 1), n = B(
          e,
          63,
          1
        ), i = new Date((t === 0 ? 1 : -1) * n / 1e3 + 9466848e5);
        return r || i.setTime(i.getTime() + i.getTimezoneOffset() * 6e4), i.usec = n % 1e3, i.getMicroSeconds = function() {
          return this.usec;
        }, i.setMicroSeconds = function(s) {
          this.usec = s;
        }, i.getUTCMicroSeconds = function() {
          return this.usec;
        }, i;
      }, "parseDate"), Ke = a(
        function(r) {
          for (var e = B(
            r,
            32
          ), t = B(r, 32, 32), n = B(r, 32, 64), i = 96, s = [], o = 0; o < e; o++) s[o] = B(r, 32, i), i += 32, i += 32;
          var u = a(function(l) {
            var f = B(r, 32, i);
            if (i += 32, f == 4294967295) return null;
            var m;
            if (l == 23 || l == 20) return m = B(r, f * 8, i), i += f * 8, m;
            if (l == 25) return m = r.toString(this.encoding, i >> 3, (i += f << 3) >> 3), m;
            console.log("ERROR: ElementType not implemented: " + l);
          }, "parseElement"), c = a(function(l, f) {
            var m = [], g;
            if (l.length > 1) {
              var w = l.shift();
              for (g = 0; g < w; g++) m[g] = c(l, f);
              l.unshift(w);
            } else for (g = 0; g < l[0]; g++) m[g] = u(f);
            return m;
          }, "parse");
          return c(s, n);
        },
        "parseArray"
      ), wu = a(function(r) {
        return r.toString("utf8");
      }, "parseText"), bu = a(function(r) {
        return r === null ? null : B(r, 8) > 0;
      }, "parseBool"), xu = a(function(r) {
        r(20, du), r(21, pu), r(23, Zi), r(26, Zi), r(1700, gu), r(700, yu), r(701, mu), r(16, bu), r(1114, Ji.bind(null, false)), r(1184, Ji.bind(null, true)), r(1e3, Ke), r(1007, Ke), r(1016, Ke), r(1008, Ke), r(1009, Ke), r(25, wu);
      }, "init");
      es.exports = { init: xu };
    });
    ns = T((nh, rs) => {
      h();
      rs.exports = {
        BOOL: 16,
        BYTEA: 17,
        CHAR: 18,
        INT8: 20,
        INT2: 21,
        INT4: 23,
        REGPROC: 24,
        TEXT: 25,
        OID: 26,
        TID: 27,
        XID: 28,
        CID: 29,
        JSON: 114,
        XML: 142,
        PG_NODE_TREE: 194,
        SMGR: 210,
        PATH: 602,
        POLYGON: 604,
        CIDR: 650,
        FLOAT4: 700,
        FLOAT8: 701,
        ABSTIME: 702,
        RELTIME: 703,
        TINTERVAL: 704,
        CIRCLE: 718,
        MACADDR8: 774,
        MONEY: 790,
        MACADDR: 829,
        INET: 869,
        ACLITEM: 1033,
        BPCHAR: 1042,
        VARCHAR: 1043,
        DATE: 1082,
        TIME: 1083,
        TIMESTAMP: 1114,
        TIMESTAMPTZ: 1184,
        INTERVAL: 1186,
        TIMETZ: 1266,
        BIT: 1560,
        VARBIT: 1562,
        NUMERIC: 1700,
        REFCURSOR: 1790,
        REGPROCEDURE: 2202,
        REGOPER: 2203,
        REGOPERATOR: 2204,
        REGCLASS: 2205,
        REGTYPE: 2206,
        UUID: 2950,
        TXID_SNAPSHOT: 2970,
        PG_LSN: 3220,
        PG_NDISTINCT: 3361,
        PG_DEPENDENCIES: 3402,
        TSVECTOR: 3614,
        TSQUERY: 3615,
        GTSVECTOR: 3642,
        REGCONFIG: 3734,
        REGDICTIONARY: 3769,
        JSONB: 3802,
        REGNAMESPACE: 4089,
        REGROLE: 4096
      };
    });
    Je = T((Ze) => {
      h();
      var vu = zi(), Su = ts(), Eu = rr(), Au = ns();
      Ze.getTypeParser = Cu;
      Ze.setTypeParser = _u;
      Ze.arrayParser = Eu;
      Ze.builtins = Au;
      var Ye = { text: {}, binary: {} };
      function is(r) {
        return String(r);
      }
      a(is, "noParse");
      function Cu(r, e) {
        return e = e || "text", Ye[e] && Ye[e][r] || is;
      }
      a(Cu, "getTypeParser");
      function _u(r, e, t) {
        typeof e == "function" && (t = e, e = "text"), Ye[e][r] = t;
      }
      a(_u, "setTypeParser");
      vu.init(function(r, e) {
        Ye.text[r] = e;
      });
      Su.init(function(r, e) {
        Ye.binary[r] = e;
      });
    });
    _t = T((uh, ss) => {
      "use strict";
      h();
      var Tu = Je();
      function Ct(r) {
        this._types = r || Tu, this.text = {}, this.binary = {};
      }
      a(Ct, "TypeOverrides");
      Ct.prototype.getOverrides = function(r) {
        switch (r) {
          case "text":
            return this.text;
          case "binary":
            return this.binary;
          default:
            return {};
        }
      };
      Ct.prototype.setTypeParser = function(r, e, t) {
        typeof e == "function" && (t = e, e = "text"), this.getOverrides(e)[r] = t;
      };
      Ct.prototype.getTypeParser = function(r, e) {
        return e = e || "text", this.getOverrides(e)[r] || this._types.getTypeParser(r, e);
      };
      ss.exports = Ct;
    });
    os = V(() => {
      "use strict";
      h();
      a(Xe, "sha256");
    });
    as = V(() => {
      "use strict";
      h();
      M = class M2 {
        constructor() {
          E(this, "_dataLength", 0);
          E(this, "_bufferLength", 0);
          E(this, "_state", new Int32Array(4));
          E(this, "_buffer", new ArrayBuffer(68));
          E(this, "_buffer8");
          E(this, "_buffer32");
          this._buffer8 = new Uint8Array(this._buffer, 0, 68), this._buffer32 = new Uint32Array(this._buffer, 0, 17), this.start();
        }
        static hashByteArray(e, t = false) {
          return this.onePassHasher.start().appendByteArray(
            e
          ).end(t);
        }
        static hashStr(e, t = false) {
          return this.onePassHasher.start().appendStr(e).end(t);
        }
        static hashAsciiStr(e, t = false) {
          return this.onePassHasher.start().appendAsciiStr(e).end(t);
        }
        static _hex(e) {
          let t = M2.hexChars, n = M2.hexOut, i, s, o, u;
          for (u = 0; u < 4; u += 1) for (s = u * 8, i = e[u], o = 0; o < 8; o += 2) n[s + 1 + o] = t.charAt(i & 15), i >>>= 4, n[s + 0 + o] = t.charAt(
            i & 15
          ), i >>>= 4;
          return n.join("");
        }
        static _md5cycle(e, t) {
          let n = e[0], i = e[1], s = e[2], o = e[3];
          n += (i & s | ~i & o) + t[0] - 680876936 | 0, n = (n << 7 | n >>> 25) + i | 0, o += (n & i | ~n & s) + t[1] - 389564586 | 0, o = (o << 12 | o >>> 20) + n | 0, s += (o & n | ~o & i) + t[2] + 606105819 | 0, s = (s << 17 | s >>> 15) + o | 0, i += (s & o | ~s & n) + t[3] - 1044525330 | 0, i = (i << 22 | i >>> 10) + s | 0, n += (i & s | ~i & o) + t[4] - 176418897 | 0, n = (n << 7 | n >>> 25) + i | 0, o += (n & i | ~n & s) + t[5] + 1200080426 | 0, o = (o << 12 | o >>> 20) + n | 0, s += (o & n | ~o & i) + t[6] - 1473231341 | 0, s = (s << 17 | s >>> 15) + o | 0, i += (s & o | ~s & n) + t[7] - 45705983 | 0, i = (i << 22 | i >>> 10) + s | 0, n += (i & s | ~i & o) + t[8] + 1770035416 | 0, n = (n << 7 | n >>> 25) + i | 0, o += (n & i | ~n & s) + t[9] - 1958414417 | 0, o = (o << 12 | o >>> 20) + n | 0, s += (o & n | ~o & i) + t[10] - 42063 | 0, s = (s << 17 | s >>> 15) + o | 0, i += (s & o | ~s & n) + t[11] - 1990404162 | 0, i = (i << 22 | i >>> 10) + s | 0, n += (i & s | ~i & o) + t[12] + 1804603682 | 0, n = (n << 7 | n >>> 25) + i | 0, o += (n & i | ~n & s) + t[13] - 40341101 | 0, o = (o << 12 | o >>> 20) + n | 0, s += (o & n | ~o & i) + t[14] - 1502002290 | 0, s = (s << 17 | s >>> 15) + o | 0, i += (s & o | ~s & n) + t[15] + 1236535329 | 0, i = (i << 22 | i >>> 10) + s | 0, n += (i & o | s & ~o) + t[1] - 165796510 | 0, n = (n << 5 | n >>> 27) + i | 0, o += (n & s | i & ~s) + t[6] - 1069501632 | 0, o = (o << 9 | o >>> 23) + n | 0, s += (o & i | n & ~i) + t[11] + 643717713 | 0, s = (s << 14 | s >>> 18) + o | 0, i += (s & n | o & ~n) + t[0] - 373897302 | 0, i = (i << 20 | i >>> 12) + s | 0, n += (i & o | s & ~o) + t[5] - 701558691 | 0, n = (n << 5 | n >>> 27) + i | 0, o += (n & s | i & ~s) + t[10] + 38016083 | 0, o = (o << 9 | o >>> 23) + n | 0, s += (o & i | n & ~i) + t[15] - 660478335 | 0, s = (s << 14 | s >>> 18) + o | 0, i += (s & n | o & ~n) + t[4] - 405537848 | 0, i = (i << 20 | i >>> 12) + s | 0, n += (i & o | s & ~o) + t[9] + 568446438 | 0, n = (n << 5 | n >>> 27) + i | 0, o += (n & s | i & ~s) + t[14] - 1019803690 | 0, o = (o << 9 | o >>> 23) + n | 0, s += (o & i | n & ~i) + t[3] - 187363961 | 0, s = (s << 14 | s >>> 18) + o | 0, i += (s & n | o & ~n) + t[8] + 1163531501 | 0, i = (i << 20 | i >>> 12) + s | 0, n += (i & o | s & ~o) + t[13] - 1444681467 | 0, n = (n << 5 | n >>> 27) + i | 0, o += (n & s | i & ~s) + t[2] - 51403784 | 0, o = (o << 9 | o >>> 23) + n | 0, s += (o & i | n & ~i) + t[7] + 1735328473 | 0, s = (s << 14 | s >>> 18) + o | 0, i += (s & n | o & ~n) + t[12] - 1926607734 | 0, i = (i << 20 | i >>> 12) + s | 0, n += (i ^ s ^ o) + t[5] - 378558 | 0, n = (n << 4 | n >>> 28) + i | 0, o += (n ^ i ^ s) + t[8] - 2022574463 | 0, o = (o << 11 | o >>> 21) + n | 0, s += (o ^ n ^ i) + t[11] + 1839030562 | 0, s = (s << 16 | s >>> 16) + o | 0, i += (s ^ o ^ n) + t[14] - 35309556 | 0, i = (i << 23 | i >>> 9) + s | 0, n += (i ^ s ^ o) + t[1] - 1530992060 | 0, n = (n << 4 | n >>> 28) + i | 0, o += (n ^ i ^ s) + t[4] + 1272893353 | 0, o = (o << 11 | o >>> 21) + n | 0, s += (o ^ n ^ i) + t[7] - 155497632 | 0, s = (s << 16 | s >>> 16) + o | 0, i += (s ^ o ^ n) + t[10] - 1094730640 | 0, i = (i << 23 | i >>> 9) + s | 0, n += (i ^ s ^ o) + t[13] + 681279174 | 0, n = (n << 4 | n >>> 28) + i | 0, o += (n ^ i ^ s) + t[0] - 358537222 | 0, o = (o << 11 | o >>> 21) + n | 0, s += (o ^ n ^ i) + t[3] - 722521979 | 0, s = (s << 16 | s >>> 16) + o | 0, i += (s ^ o ^ n) + t[6] + 76029189 | 0, i = (i << 23 | i >>> 9) + s | 0, n += (i ^ s ^ o) + t[9] - 640364487 | 0, n = (n << 4 | n >>> 28) + i | 0, o += (n ^ i ^ s) + t[12] - 421815835 | 0, o = (o << 11 | o >>> 21) + n | 0, s += (o ^ n ^ i) + t[15] + 530742520 | 0, s = (s << 16 | s >>> 16) + o | 0, i += (s ^ o ^ n) + t[2] - 995338651 | 0, i = (i << 23 | i >>> 9) + s | 0, n += (s ^ (i | ~o)) + t[0] - 198630844 | 0, n = (n << 6 | n >>> 26) + i | 0, o += (i ^ (n | ~s)) + t[7] + 1126891415 | 0, o = (o << 10 | o >>> 22) + n | 0, s += (n ^ (o | ~i)) + t[14] - 1416354905 | 0, s = (s << 15 | s >>> 17) + o | 0, i += (o ^ (s | ~n)) + t[5] - 57434055 | 0, i = (i << 21 | i >>> 11) + s | 0, n += (s ^ (i | ~o)) + t[12] + 1700485571 | 0, n = (n << 6 | n >>> 26) + i | 0, o += (i ^ (n | ~s)) + t[3] - 1894986606 | 0, o = (o << 10 | o >>> 22) + n | 0, s += (n ^ (o | ~i)) + t[10] - 1051523 | 0, s = (s << 15 | s >>> 17) + o | 0, i += (o ^ (s | ~n)) + t[1] - 2054922799 | 0, i = (i << 21 | i >>> 11) + s | 0, n += (s ^ (i | ~o)) + t[8] + 1873313359 | 0, n = (n << 6 | n >>> 26) + i | 0, o += (i ^ (n | ~s)) + t[15] - 30611744 | 0, o = (o << 10 | o >>> 22) + n | 0, s += (n ^ (o | ~i)) + t[6] - 1560198380 | 0, s = (s << 15 | s >>> 17) + o | 0, i += (o ^ (s | ~n)) + t[13] + 1309151649 | 0, i = (i << 21 | i >>> 11) + s | 0, n += (s ^ (i | ~o)) + t[4] - 145523070 | 0, n = (n << 6 | n >>> 26) + i | 0, o += (i ^ (n | ~s)) + t[11] - 1120210379 | 0, o = (o << 10 | o >>> 22) + n | 0, s += (n ^ (o | ~i)) + t[2] + 718787259 | 0, s = (s << 15 | s >>> 17) + o | 0, i += (o ^ (s | ~n)) + t[9] - 343485551 | 0, i = (i << 21 | i >>> 11) + s | 0, e[0] = n + e[0] | 0, e[1] = i + e[1] | 0, e[2] = s + e[2] | 0, e[3] = o + e[3] | 0;
        }
        start() {
          return this._dataLength = 0, this._bufferLength = 0, this._state.set(M2.stateIdentity), this;
        }
        appendStr(e) {
          let t = this._buffer8, n = this._buffer32, i = this._bufferLength, s, o;
          for (o = 0; o < e.length; o += 1) {
            if (s = e.charCodeAt(o), s < 128) t[i++] = s;
            else if (s < 2048) t[i++] = (s >>> 6) + 192, t[i++] = s & 63 | 128;
            else if (s < 55296 || s > 56319) t[i++] = (s >>> 12) + 224, t[i++] = s >>> 6 & 63 | 128, t[i++] = s & 63 | 128;
            else {
              if (s = (s - 55296) * 1024 + (e.charCodeAt(++o) - 56320) + 65536, s > 1114111) throw new Error(
                "Unicode standard supports code points up to U+10FFFF"
              );
              t[i++] = (s >>> 18) + 240, t[i++] = s >>> 12 & 63 | 128, t[i++] = s >>> 6 & 63 | 128, t[i++] = s & 63 | 128;
            }
            i >= 64 && (this._dataLength += 64, M2._md5cycle(this._state, n), i -= 64, n[0] = n[16]);
          }
          return this._bufferLength = i, this;
        }
        appendAsciiStr(e) {
          let t = this._buffer8, n = this._buffer32, i = this._bufferLength, s, o = 0;
          for (; ; ) {
            for (s = Math.min(e.length - o, 64 - i); s--; ) t[i++] = e.charCodeAt(o++);
            if (i < 64) break;
            this._dataLength += 64, M2._md5cycle(this._state, n), i = 0;
          }
          return this._bufferLength = i, this;
        }
        appendByteArray(e) {
          let t = this._buffer8, n = this._buffer32, i = this._bufferLength, s, o = 0;
          for (; ; ) {
            for (s = Math.min(e.length - o, 64 - i); s--; ) t[i++] = e[o++];
            if (i < 64) break;
            this._dataLength += 64, M2._md5cycle(this._state, n), i = 0;
          }
          return this._bufferLength = i, this;
        }
        getState() {
          let e = this._state;
          return { buffer: String.fromCharCode.apply(null, Array.from(this._buffer8)), buflen: this._bufferLength, length: this._dataLength, state: [e[0], e[1], e[2], e[3]] };
        }
        setState(e) {
          let t = e.buffer, n = e.state, i = this._state, s;
          for (this._dataLength = e.length, this._bufferLength = e.buflen, i[0] = n[0], i[1] = n[1], i[2] = n[2], i[3] = n[3], s = 0; s < t.length; s += 1) this._buffer8[s] = t.charCodeAt(s);
        }
        end(e = false) {
          let t = this._bufferLength, n = this._buffer8, i = this._buffer32, s = (t >> 2) + 1;
          this._dataLength += t;
          let o = this._dataLength * 8;
          if (n[t] = 128, n[t + 1] = n[t + 2] = n[t + 3] = 0, i.set(M2.buffer32Identity.subarray(s), s), t > 55 && (M2._md5cycle(this._state, i), i.set(M2.buffer32Identity)), o <= 4294967295) i[14] = o;
          else {
            let u = o.toString(16).match(/(.*?)(.{0,8})$/);
            if (u === null) return;
            let c = parseInt(
              u[2],
              16
            ), l = parseInt(u[1], 16) || 0;
            i[14] = c, i[15] = l;
          }
          return M2._md5cycle(this._state, i), e ? this._state : M2._hex(
            this._state
          );
        }
      };
      a(M, "Md5"), E(M, "stateIdentity", new Int32Array([1732584193, -271733879, -1732584194, 271733878])), E(M, "buffer32Identity", new Int32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), E(M, "hexChars", "0123456789abcdef"), E(M, "hexOut", []), E(M, "onePassHasher", new M());
      et = M;
    });
    lr = {};
    se(lr, { createHash: () => Pu, createHmac: () => Ru, randomBytes: () => Iu });
    fr = V(() => {
      "use strict";
      h();
      os();
      as();
      a(Iu, "randomBytes");
      a(Pu, "createHash");
      a(Ru, "createHmac");
    });
    tt = T((vh, hr) => {
      "use strict";
      h();
      hr.exports = {
        host: "localhost",
        user: y.platform === "win32" ? y.env.USERNAME : y.env.USER,
        database: void 0,
        password: null,
        connectionString: void 0,
        port: 5432,
        rows: 0,
        binary: false,
        max: 10,
        idleTimeoutMillis: 3e4,
        client_encoding: "",
        ssl: false,
        application_name: void 0,
        fallback_application_name: void 0,
        options: void 0,
        parseInputDatesAsUTC: false,
        statement_timeout: false,
        lock_timeout: false,
        idle_in_transaction_session_timeout: false,
        query_timeout: false,
        connect_timeout: 0,
        keepalives: 1,
        keepalives_idle: 0
      };
      var ke = Je(), Lu = ke.getTypeParser(20, "text"), Bu = ke.getTypeParser(
        1016,
        "text"
      );
      hr.exports.__defineSetter__("parseInt8", function(r) {
        ke.setTypeParser(20, "text", r ? ke.getTypeParser(
          23,
          "text"
        ) : Lu), ke.setTypeParser(1016, "text", r ? ke.getTypeParser(1007, "text") : Bu);
      });
    });
    rt = T((Eh, cs) => {
      "use strict";
      h();
      var Fu = (fr(), O(lr)), Mu = tt();
      function ku(r) {
        var e = r.replace(
          /\\/g,
          "\\\\"
        ).replace(/"/g, '\\"');
        return '"' + e + '"';
      }
      a(ku, "escapeElement");
      function us(r) {
        for (var e = "{", t = 0; t < r.length; t++) t > 0 && (e = e + ","), r[t] === null || typeof r[t] > "u" ? e = e + "NULL" : Array.isArray(r[t]) ? e = e + us(r[t]) : r[t] instanceof p ? e += "\\\\x" + r[t].toString("hex") : e += ku(Tt(r[t]));
        return e = e + "}", e;
      }
      a(us, "arrayString");
      var Tt = a(function(r, e) {
        if (r == null) return null;
        if (r instanceof p) return r;
        if (ArrayBuffer.isView(r)) {
          var t = p.from(r.buffer, r.byteOffset, r.byteLength);
          return t.length === r.byteLength ? t : t.slice(r.byteOffset, r.byteOffset + r.byteLength);
        }
        return r instanceof Date ? Mu.parseInputDatesAsUTC ? Qu(r) : Uu(r) : Array.isArray(r) ? us(r) : typeof r == "object" ? Ou(r, e) : r.toString();
      }, "prepareValue");
      function Ou(r, e) {
        if (r && typeof r.toPostgres == "function") {
          if (e = e || [], e.indexOf(r) !== -1) throw new Error('circular reference detected while preparing "' + r + '" for query');
          return e.push(r), Tt(r.toPostgres(Tt), e);
        }
        return JSON.stringify(r);
      }
      a(Ou, "prepareObject");
      function W(r, e) {
        for (r = "" + r; r.length < e; ) r = "0" + r;
        return r;
      }
      a(W, "pad");
      function Uu(r) {
        var e = -r.getTimezoneOffset(), t = r.getFullYear(), n = t < 1;
        n && (t = Math.abs(t) + 1);
        var i = W(t, 4) + "-" + W(r.getMonth() + 1, 2) + "-" + W(r.getDate(), 2) + "T" + W(
          r.getHours(),
          2
        ) + ":" + W(r.getMinutes(), 2) + ":" + W(r.getSeconds(), 2) + "." + W(r.getMilliseconds(), 3);
        return e < 0 ? (i += "-", e *= -1) : i += "+", i += W(Math.floor(e / 60), 2) + ":" + W(e % 60, 2), n && (i += " BC"), i;
      }
      a(Uu, "dateToString");
      function Qu(r) {
        var e = r.getUTCFullYear(), t = e < 1;
        t && (e = Math.abs(e) + 1);
        var n = W(e, 4) + "-" + W(r.getUTCMonth() + 1, 2) + "-" + W(r.getUTCDate(), 2) + "T" + W(r.getUTCHours(), 2) + ":" + W(r.getUTCMinutes(), 2) + ":" + W(r.getUTCSeconds(), 2) + "." + W(
          r.getUTCMilliseconds(),
          3
        );
        return n += "+00:00", t && (n += " BC"), n;
      }
      a(Qu, "dateToStringUTC");
      function Du(r, e, t) {
        return r = typeof r == "string" ? { text: r } : r, e && (typeof e == "function" ? r.callback = e : r.values = e), t && (r.callback = t), r;
      }
      a(Du, "normalizeQueryConfig");
      var dr = a(function(r) {
        return Fu.createHash("md5").update(r, "utf-8").digest("hex");
      }, "md5"), qu = a(
        function(r, e, t) {
          var n = dr(e + r), i = dr(p.concat([p.from(n), t]));
          return "md5" + i;
        },
        "postgresMd5PasswordHash"
      );
      cs.exports = {
        prepareValue: a(function(e) {
          return Tt(e);
        }, "prepareValueWrapper"),
        normalizeQueryConfig: Du,
        postgresMd5PasswordHash: qu,
        md5: dr
      };
    });
    nt = {};
    se(nt, { default: () => ju });
    it = V(() => {
      "use strict";
      h();
      ju = {};
    });
    xs = T((Dh, bs) => {
      "use strict";
      h();
      var pr = (fr(), O(lr));
      function Hu(r) {
        if (r.indexOf("SCRAM-SHA-256") === -1) throw new Error("SASL: Only mechanism SCRAM-SHA-256 is currently supported");
        let e = pr.randomBytes(
          18
        ).toString("base64");
        return { mechanism: "SCRAM-SHA-256", clientNonce: e, response: "n,,n=*,r=" + e, message: "SASLInitialResponse" };
      }
      a(Hu, "startSession");
      function $u(r, e, t) {
        if (r.message !== "SASLInitialResponse") throw new Error(
          "SASL: Last message was not SASLInitialResponse"
        );
        if (typeof e != "string") throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string");
        if (typeof t != "string") throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: serverData must be a string");
        let n = zu(t);
        if (n.nonce.startsWith(r.clientNonce)) {
          if (n.nonce.length === r.clientNonce.length) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short");
        } else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce");
        var i = p.from(n.salt, "base64"), s = Zu(e, i, n.iteration), o = Oe(s, "Client Key"), u = Yu(
          o
        ), c = "n=*,r=" + r.clientNonce, l = "r=" + n.nonce + ",s=" + n.salt + ",i=" + n.iteration, f = "c=biws,r=" + n.nonce, m = c + "," + l + "," + f, g = Oe(u, m), w = ws(o, g), S = w.toString("base64"), k = Oe(s, "Server Key"), D = Oe(k, m);
        r.message = "SASLResponse", r.serverSignature = D.toString("base64"), r.response = f + ",p=" + S;
      }
      a($u, "continueSession");
      function Gu(r, e) {
        if (r.message !== "SASLResponse") throw new Error("SASL: Last message was not SASLResponse");
        if (typeof e != "string") throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: serverData must be a string");
        let { serverSignature: t } = Ku(
          e
        );
        if (t !== r.serverSignature) throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match");
      }
      a(Gu, "finalizeSession");
      function Vu(r) {
        if (typeof r != "string") throw new TypeError("SASL: text must be a string");
        return r.split("").map((e, t) => r.charCodeAt(t)).every((e) => e >= 33 && e <= 43 || e >= 45 && e <= 126);
      }
      a(Vu, "isPrintableChars");
      function ms(r) {
        return /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(r);
      }
      a(ms, "isBase64");
      function gs(r) {
        if (typeof r != "string") throw new TypeError("SASL: attribute pairs text must be a string");
        return new Map(r.split(",").map((e) => {
          if (!/^.=/.test(e)) throw new Error("SASL: Invalid attribute pair entry");
          let t = e[0], n = e.substring(2);
          return [t, n];
        }));
      }
      a(gs, "parseAttributePairs");
      function zu(r) {
        let e = gs(r), t = e.get("r");
        if (t) {
          if (!Vu(t)) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce must only contain printable characters");
        } else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing");
        let n = e.get("s");
        if (n) {
          if (!ms(n)) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt must be base64");
        } else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing");
        let i = e.get("i");
        if (i) {
          if (!/^[1-9][0-9]*$/.test(i)) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count");
        } else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing");
        let s = parseInt(i, 10);
        return { nonce: t, salt: n, iteration: s };
      }
      a(zu, "parseServerFirstMessage");
      function Ku(r) {
        let t = gs(r).get("v");
        if (t) {
          if (!ms(t)) throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64");
        } else throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing");
        return { serverSignature: t };
      }
      a(Ku, "parseServerFinalMessage");
      function ws(r, e) {
        if (!p.isBuffer(r)) throw new TypeError("first argument must be a Buffer");
        if (!p.isBuffer(e)) throw new TypeError(
          "second argument must be a Buffer"
        );
        if (r.length !== e.length) throw new Error("Buffer lengths must match");
        if (r.length === 0) throw new Error("Buffers cannot be empty");
        return p.from(r.map((t, n) => r[n] ^ e[n]));
      }
      a(ws, "xorBuffers");
      function Yu(r) {
        return pr.createHash("sha256").update(r).digest();
      }
      a(Yu, "sha256");
      function Oe(r, e) {
        return pr.createHmac("sha256", r).update(e).digest();
      }
      a(Oe, "hmacSha256");
      function Zu(r, e, t) {
        for (var n = Oe(
          r,
          p.concat([e, p.from([0, 0, 0, 1])])
        ), i = n, s = 0; s < t - 1; s++) n = Oe(r, n), i = ws(i, n);
        return i;
      }
      a(Zu, "Hi");
      bs.exports = { startSession: Hu, continueSession: $u, finalizeSession: Gu };
    });
    yr = {};
    se(yr, { join: () => Ju });
    mr = V(() => {
      "use strict";
      h();
      a(
        Ju,
        "join"
      );
    });
    gr = {};
    se(gr, { stat: () => Xu });
    wr = V(() => {
      "use strict";
      h();
      a(Xu, "stat");
    });
    br = {};
    se(br, { default: () => ec });
    xr = V(() => {
      "use strict";
      h();
      ec = {};
    });
    vs = {};
    se(vs, { StringDecoder: () => vr });
    Ss = V(() => {
      "use strict";
      h();
      Sr = class Sr {
        constructor(e) {
          E(this, "td");
          this.td = new TextDecoder(e);
        }
        write(e) {
          return this.td.decode(e, { stream: true });
        }
        end(e) {
          return this.td.decode(e);
        }
      };
      a(Sr, "StringDecoder");
      vr = Sr;
    });
    _s = T((Kh, Cs) => {
      "use strict";
      h();
      var { Transform: tc } = (xr(), O(br)), { StringDecoder: rc } = (Ss(), O(vs)), Se = Symbol(
        "last"
      ), It = Symbol("decoder");
      function nc(r, e, t) {
        let n;
        if (this.overflow) {
          if (n = this[It].write(r).split(
            this.matcher
          ), n.length === 1) return t();
          n.shift(), this.overflow = false;
        } else this[Se] += this[It].write(r), n = this[Se].split(this.matcher);
        this[Se] = n.pop();
        for (let i = 0; i < n.length; i++) try {
          As(this, this.mapper(n[i]));
        } catch (s) {
          return t(s);
        }
        if (this.overflow = this[Se].length > this.maxLength, this.overflow && !this.skipOverflow) {
          t(new Error(
            "maximum buffer reached"
          ));
          return;
        }
        t();
      }
      a(nc, "transform");
      function ic(r) {
        if (this[Se] += this[It].end(), this[Se])
          try {
            As(this, this.mapper(this[Se]));
          } catch (e) {
            return r(e);
          }
        r();
      }
      a(ic, "flush");
      function As(r, e) {
        e !== void 0 && r.push(e);
      }
      a(As, "push");
      function Es(r) {
        return r;
      }
      a(Es, "noop");
      function sc(r, e, t) {
        switch (r = r || /\r?\n/, e = e || Es, t = t || {}, arguments.length) {
          case 1:
            typeof r == "function" ? (e = r, r = /\r?\n/) : typeof r == "object" && !(r instanceof RegExp) && !r[Symbol.split] && (t = r, r = /\r?\n/);
            break;
          case 2:
            typeof r == "function" ? (t = e, e = r, r = /\r?\n/) : typeof e == "object" && (t = e, e = Es);
        }
        t = Object.assign({}, t), t.autoDestroy = true, t.transform = nc, t.flush = ic, t.readableObjectMode = true;
        let n = new tc(t);
        return n[Se] = "", n[It] = new rc("utf8"), n.matcher = r, n.mapper = e, n.maxLength = t.maxLength, n.skipOverflow = t.skipOverflow || false, n.overflow = false, n._destroy = function(i, s) {
          this._writableState.errorEmitted = false, s(i);
        }, n;
      }
      a(sc, "split");
      Cs.exports = sc;
    });
    Ps = T((Jh, ye) => {
      "use strict";
      h();
      var Ts = (mr(), O(yr)), oc = (xr(), O(br)).Stream, ac = _s(), Is = (it(), O(nt)), uc = 5432, Pt = y.platform === "win32", st = y.stderr, cc = 56, lc = 7, fc = 61440, hc = 32768;
      function dc(r) {
        return (r & fc) == hc;
      }
      a(dc, "isRegFile");
      var Ue = ["host", "port", "database", "user", "password"], Er = Ue.length, pc = Ue[Er - 1];
      function Ar() {
        var r = st instanceof oc && st.writable === true;
        if (r) {
          var e = Array.prototype.slice.call(arguments).concat(`
`);
          st.write(Is.format.apply(Is, e));
        }
      }
      a(Ar, "warn");
      Object.defineProperty(ye.exports, "isWin", { get: a(function() {
        return Pt;
      }, "get"), set: a(function(r) {
        Pt = r;
      }, "set") });
      ye.exports.warnTo = function(r) {
        var e = st;
        return st = r, e;
      };
      ye.exports.getFileName = function(r) {
        var e = r || y.env, t = e.PGPASSFILE || (Pt ? Ts.join(e.APPDATA || "./", "postgresql", "pgpass.conf") : Ts.join(e.HOME || "./", ".pgpass"));
        return t;
      };
      ye.exports.usePgPass = function(r, e) {
        return Object.prototype.hasOwnProperty.call(y.env, "PGPASSWORD") ? false : Pt ? true : (e = e || "<unkn>", dc(r.mode) ? r.mode & (cc | lc) ? (Ar('WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less', e), false) : true : (Ar('WARNING: password file "%s" is not a plain file', e), false));
      };
      var yc = ye.exports.match = function(r, e) {
        return Ue.slice(0, -1).reduce(function(t, n, i) {
          return i == 1 && Number(r[n] || uc) === Number(
            e[n]
          ) ? t && true : t && (e[n] === "*" || e[n] === r[n]);
        }, true);
      };
      ye.exports.getPassword = function(r, e, t) {
        var n, i = e.pipe(
          ac()
        );
        function s(c) {
          var l = mc(c);
          l && gc(l) && yc(r, l) && (n = l[pc], i.end());
        }
        a(s, "onLine");
        var o = a(function() {
          e.destroy(), t(n);
        }, "onEnd"), u = a(function(c) {
          e.destroy(), Ar("WARNING: error on reading file: %s", c), t(
            void 0
          );
        }, "onErr");
        e.on("error", u), i.on("data", s).on("end", o).on("error", u);
      };
      var mc = ye.exports.parseLine = function(r) {
        if (r.length < 11 || r.match(/^\s+#/)) return null;
        for (var e = "", t = "", n = 0, i = 0, s = 0, o = {}, u = false, c = a(
          function(f, m, g) {
            var w = r.substring(m, g);
            Object.hasOwnProperty.call(y.env, "PGPASS_NO_DEESCAPE") || (w = w.replace(/\\([:\\])/g, "$1")), o[Ue[f]] = w;
          },
          "addToObj"
        ), l = 0; l < r.length - 1; l += 1) {
          if (e = r.charAt(l + 1), t = r.charAt(
            l
          ), u = n == Er - 1, u) {
            c(n, i);
            break;
          }
          l >= 0 && e == ":" && t !== "\\" && (c(n, i, l + 1), i = l + 2, n += 1);
        }
        return o = Object.keys(o).length === Er ? o : null, o;
      }, gc = ye.exports.isValidEntry = function(r) {
        for (var e = { 0: function(o) {
          return o.length > 0;
        }, 1: function(o) {
          return o === "*" ? true : (o = Number(o), isFinite(o) && o > 0 && o < 9007199254740992 && Math.floor(o) === o);
        }, 2: function(o) {
          return o.length > 0;
        }, 3: function(o) {
          return o.length > 0;
        }, 4: function(o) {
          return o.length > 0;
        } }, t = 0; t < Ue.length; t += 1) {
          var n = e[t], i = r[Ue[t]] || "", s = n(i);
          if (!s) return false;
        }
        return true;
      };
    });
    Ls = T((rd, Cr) => {
      "use strict";
      h();
      var td = (mr(), O(yr)), Rs = (wr(), O(gr)), Rt = Ps();
      Cr.exports = function(r, e) {
        var t = Rt.getFileName();
        Rs.stat(t, function(n, i) {
          if (n || !Rt.usePgPass(i, t)) return e(void 0);
          var s = Rs.createReadStream(
            t
          );
          Rt.getPassword(r, s, e);
        });
      };
      Cr.exports.warnTo = Rt.warnTo;
    });
    Bs = {};
    se(Bs, { default: () => wc });
    Fs = V(() => {
      "use strict";
      h();
      wc = {};
    });
    Ms = {};
    se(Ms, { parse: () => bc });
    ks = V(() => {
      "use strict";
      h();
      a(bc, "parse");
    });
    Ir = T((ad, Os) => {
      "use strict";
      h();
      var xc = (ks(), O(Ms)), _r = (wr(), O(gr));
      function Tr(r) {
        if (r.charAt(0) === "/") {
          var t = r.split(" ");
          return { host: t[0], database: t[1] };
        }
        var e = xc.parse(/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(r) ? encodeURI(r).replace(/\%25(\d\d)/g, "%$1") : r, true), t = e.query;
        for (var n in t) Array.isArray(t[n]) && (t[n] = t[n][t[n].length - 1]);
        var i = (e.auth || ":").split(":");
        if (t.user = i[0], t.password = i.splice(1).join(
          ":"
        ), t.port = e.port, e.protocol == "socket:") return t.host = decodeURI(e.pathname), t.database = e.query.db, t.client_encoding = e.query.encoding, t;
        t.host || (t.host = e.hostname);
        var s = e.pathname;
        if (!t.host && s && /^%2f/i.test(s)) {
          var o = s.split("/");
          t.host = decodeURIComponent(o[0]), s = o.splice(1).join("/");
        }
        switch (s && s.charAt(
          0
        ) === "/" && (s = s.slice(1) || null), t.database = s && decodeURI(s), (t.ssl === "true" || t.ssl === "1") && (t.ssl = true), t.ssl === "0" && (t.ssl = false), (t.sslcert || t.sslkey || t.sslrootcert || t.sslmode) && (t.ssl = {}), t.sslcert && (t.ssl.cert = _r.readFileSync(t.sslcert).toString()), t.sslkey && (t.ssl.key = _r.readFileSync(t.sslkey).toString()), t.sslrootcert && (t.ssl.ca = _r.readFileSync(t.sslrootcert).toString()), t.sslmode) {
          case "disable": {
            t.ssl = false;
            break;
          }
          case "prefer":
          case "require":
          case "verify-ca":
          case "verify-full":
            break;
          case "no-verify": {
            t.ssl.rejectUnauthorized = false;
            break;
          }
        }
        return t;
      }
      a(Tr, "parse");
      Os.exports = Tr;
      Tr.parse = Tr;
    });
    Lt = T((ld, Ds) => {
      "use strict";
      h();
      var vc = (Fs(), O(Bs)), Qs = tt(), Us = Ir().parse, j = a(function(r, e, t) {
        return t === void 0 ? t = y.env["PG" + r.toUpperCase()] : t === false || (t = y.env[t]), e[r] || t || Qs[r];
      }, "val"), Sc = a(function() {
        switch (y.env.PGSSLMODE) {
          case "disable":
            return false;
          case "prefer":
          case "require":
          case "verify-ca":
          case "verify-full":
            return true;
          case "no-verify":
            return { rejectUnauthorized: false };
        }
        return Qs.ssl;
      }, "readSSLConfigFromEnvironment"), Qe = a(function(r) {
        return "'" + ("" + r).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
      }, "quoteParamValue"), te = a(function(r, e, t) {
        var n = e[t];
        n != null && r.push(t + "=" + Qe(n));
      }, "add"), Rr = class Rr {
        constructor(e) {
          e = typeof e == "string" ? Us(e) : e || {}, e.connectionString && (e = Object.assign({}, e, Us(e.connectionString))), this.user = j("user", e), this.database = j("database", e), this.database === void 0 && (this.database = this.user), this.port = parseInt(j("port", e), 10), this.host = j("host", e), Object.defineProperty(this, "password", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: j("password", e)
          }), this.binary = j("binary", e), this.options = j("options", e), this.ssl = typeof e.ssl > "u" ? Sc() : e.ssl, typeof this.ssl == "string" && this.ssl === "true" && (this.ssl = true), this.ssl === "no-verify" && (this.ssl = { rejectUnauthorized: false }), this.ssl && this.ssl.key && Object.defineProperty(this.ssl, "key", { enumerable: false }), this.client_encoding = j("client_encoding", e), this.replication = j("replication", e), this.isDomainSocket = !(this.host || "").indexOf("/"), this.application_name = j("application_name", e, "PGAPPNAME"), this.fallback_application_name = j("fallback_application_name", e, false), this.statement_timeout = j("statement_timeout", e, false), this.lock_timeout = j("lock_timeout", e, false), this.idle_in_transaction_session_timeout = j("idle_in_transaction_session_timeout", e, false), this.query_timeout = j("query_timeout", e, false), e.connectionTimeoutMillis === void 0 ? this.connect_timeout = y.env.PGCONNECT_TIMEOUT || 0 : this.connect_timeout = Math.floor(e.connectionTimeoutMillis / 1e3), e.keepAlive === false ? this.keepalives = 0 : e.keepAlive === true && (this.keepalives = 1), typeof e.keepAliveInitialDelayMillis == "number" && (this.keepalives_idle = Math.floor(e.keepAliveInitialDelayMillis / 1e3));
        }
        getLibpqConnectionString(e) {
          var t = [];
          te(t, this, "user"), te(t, this, "password"), te(t, this, "port"), te(t, this, "application_name"), te(
            t,
            this,
            "fallback_application_name"
          ), te(t, this, "connect_timeout"), te(t, this, "options");
          var n = typeof this.ssl == "object" ? this.ssl : this.ssl ? { sslmode: this.ssl } : {};
          if (te(t, n, "sslmode"), te(t, n, "sslca"), te(t, n, "sslkey"), te(t, n, "sslcert"), te(t, n, "sslrootcert"), this.database && t.push("dbname=" + Qe(this.database)), this.replication && t.push("replication=" + Qe(this.replication)), this.host && t.push("host=" + Qe(this.host)), this.isDomainSocket) return e(null, t.join(" "));
          this.client_encoding && t.push("client_encoding=" + Qe(this.client_encoding)), vc.lookup(this.host, function(i, s) {
            return i ? e(i, null) : (t.push("hostaddr=" + Qe(s)), e(null, t.join(" ")));
          });
        }
      };
      a(Rr, "ConnectionParameters");
      var Pr = Rr;
      Ds.exports = Pr;
    });
    Ws = T((dd, Ns) => {
      "use strict";
      h();
      var Ec = Je(), qs = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/, Br = class Br {
        constructor(e, t) {
          this.command = null, this.rowCount = null, this.oid = null, this.rows = [], this.fields = [], this._parsers = void 0, this._types = t, this.RowCtor = null, this.rowAsArray = e === "array", this.rowAsArray && (this.parseRow = this._parseRowAsArray);
        }
        addCommandComplete(e) {
          var t;
          e.text ? t = qs.exec(e.text) : t = qs.exec(e.command), t && (this.command = t[1], t[3] ? (this.oid = parseInt(
            t[2],
            10
          ), this.rowCount = parseInt(t[3], 10)) : t[2] && (this.rowCount = parseInt(t[2], 10)));
        }
        _parseRowAsArray(e) {
          for (var t = new Array(
            e.length
          ), n = 0, i = e.length; n < i; n++) {
            var s = e[n];
            s !== null ? t[n] = this._parsers[n](s) : t[n] = null;
          }
          return t;
        }
        parseRow(e) {
          for (var t = {}, n = 0, i = e.length; n < i; n++) {
            var s = e[n], o = this.fields[n].name;
            s !== null ? t[o] = this._parsers[n](
              s
            ) : t[o] = null;
          }
          return t;
        }
        addRow(e) {
          this.rows.push(e);
        }
        addFields(e) {
          this.fields = e, this.fields.length && (this._parsers = new Array(e.length));
          for (var t = 0; t < e.length; t++) {
            var n = e[t];
            this._types ? this._parsers[t] = this._types.getTypeParser(n.dataTypeID, n.format || "text") : this._parsers[t] = Ec.getTypeParser(n.dataTypeID, n.format || "text");
          }
        }
      };
      a(Br, "Result");
      var Lr = Br;
      Ns.exports = Lr;
    });
    Gs = T((md, $s) => {
      "use strict";
      h();
      var { EventEmitter: Ac } = ve(), js = Ws(), Hs = rt(), Mr = class Mr extends Ac {
        constructor(e, t, n) {
          super(), e = Hs.normalizeQueryConfig(e, t, n), this.text = e.text, this.values = e.values, this.rows = e.rows, this.types = e.types, this.name = e.name, this.binary = e.binary, this.portal = e.portal || "", this.callback = e.callback, this._rowMode = e.rowMode, y.domain && e.callback && (this.callback = y.domain.bind(e.callback)), this._result = new js(this._rowMode, this.types), this._results = this._result, this.isPreparedStatement = false, this._canceledDueToError = false, this._promise = null;
        }
        requiresPreparation() {
          return this.name || this.rows ? true : !this.text || !this.values ? false : this.values.length > 0;
        }
        _checkForMultirow() {
          this._result.command && (Array.isArray(this._results) || (this._results = [this._result]), this._result = new js(this._rowMode, this.types), this._results.push(this._result));
        }
        handleRowDescription(e) {
          this._checkForMultirow(), this._result.addFields(e.fields), this._accumulateRows = this.callback || !this.listeners("row").length;
        }
        handleDataRow(e) {
          let t;
          if (!this._canceledDueToError) {
            try {
              t = this._result.parseRow(
                e.fields
              );
            } catch (n) {
              this._canceledDueToError = n;
              return;
            }
            this.emit("row", t, this._result), this._accumulateRows && this._result.addRow(t);
          }
        }
        handleCommandComplete(e, t) {
          this._checkForMultirow(), this._result.addCommandComplete(
            e
          ), this.rows && t.sync();
        }
        handleEmptyQuery(e) {
          this.rows && e.sync();
        }
        handleError(e, t) {
          if (this._canceledDueToError && (e = this._canceledDueToError, this._canceledDueToError = false), this.callback) return this.callback(e);
          this.emit("error", e);
        }
        handleReadyForQuery(e) {
          if (this._canceledDueToError) return this.handleError(
            this._canceledDueToError,
            e
          );
          if (this.callback) try {
            this.callback(null, this._results);
          } catch (t) {
            y.nextTick(() => {
              throw t;
            });
          }
          this.emit(
            "end",
            this._results
          );
        }
        submit(e) {
          if (typeof this.text != "string" && typeof this.name != "string") return new Error(
            "A query must have either text or a name. Supplying neither is unsupported."
          );
          let t = e.parsedStatements[this.name];
          return this.text && t && this.text !== t ? new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`) : this.values && !Array.isArray(this.values) ? new Error("Query values must be an array") : (this.requiresPreparation() ? this.prepare(e) : e.query(this.text), null);
        }
        hasBeenParsed(e) {
          return this.name && e.parsedStatements[this.name];
        }
        handlePortalSuspended(e) {
          this._getRows(e, this.rows);
        }
        _getRows(e, t) {
          e.execute({ portal: this.portal, rows: t }), t ? e.flush() : e.sync();
        }
        prepare(e) {
          this.isPreparedStatement = true, this.hasBeenParsed(e) || e.parse({ text: this.text, name: this.name, types: this.types });
          try {
            e.bind({ portal: this.portal, statement: this.name, values: this.values, binary: this.binary, valueMapper: Hs.prepareValue });
          } catch (t) {
            this.handleError(t, e);
            return;
          }
          e.describe({ type: "P", name: this.portal || "" }), this._getRows(e, this.rows);
        }
        handleCopyInResponse(e) {
          e.sendCopyFail("No source stream defined");
        }
        handleCopyData(e, t) {
        }
      };
      a(Mr, "Query");
      var Fr = Mr;
      $s.exports = Fr;
    });
    ln = T((_) => {
      "use strict";
      h();
      Object.defineProperty(_, "__esModule", { value: true });
      _.NoticeMessage = _.DataRowMessage = _.CommandCompleteMessage = _.ReadyForQueryMessage = _.NotificationResponseMessage = _.BackendKeyDataMessage = _.AuthenticationMD5Password = _.ParameterStatusMessage = _.ParameterDescriptionMessage = _.RowDescriptionMessage = _.Field = _.CopyResponse = _.CopyDataMessage = _.DatabaseError = _.copyDone = _.emptyQuery = _.replicationStart = _.portalSuspended = _.noData = _.closeComplete = _.bindComplete = _.parseComplete = void 0;
      _.parseComplete = { name: "parseComplete", length: 5 };
      _.bindComplete = { name: "bindComplete", length: 5 };
      _.closeComplete = { name: "closeComplete", length: 5 };
      _.noData = { name: "noData", length: 5 };
      _.portalSuspended = { name: "portalSuspended", length: 5 };
      _.replicationStart = { name: "replicationStart", length: 4 };
      _.emptyQuery = { name: "emptyQuery", length: 4 };
      _.copyDone = { name: "copyDone", length: 4 };
      var Kr = class Kr extends Error {
        constructor(e, t, n) {
          super(e), this.length = t, this.name = n;
        }
      };
      a(Kr, "DatabaseError");
      var kr = Kr;
      _.DatabaseError = kr;
      var Yr = class Yr {
        constructor(e, t) {
          this.length = e, this.chunk = t, this.name = "copyData";
        }
      };
      a(Yr, "CopyDataMessage");
      var Or = Yr;
      _.CopyDataMessage = Or;
      var Zr = class Zr {
        constructor(e, t, n, i) {
          this.length = e, this.name = t, this.binary = n, this.columnTypes = new Array(i);
        }
      };
      a(Zr, "CopyResponse");
      var Ur = Zr;
      _.CopyResponse = Ur;
      var Jr = class Jr {
        constructor(e, t, n, i, s, o, u) {
          this.name = e, this.tableID = t, this.columnID = n, this.dataTypeID = i, this.dataTypeSize = s, this.dataTypeModifier = o, this.format = u;
        }
      };
      a(Jr, "Field");
      var Qr = Jr;
      _.Field = Qr;
      var Xr = class Xr {
        constructor(e, t) {
          this.length = e, this.fieldCount = t, this.name = "rowDescription", this.fields = new Array(this.fieldCount);
        }
      };
      a(Xr, "RowDescriptionMessage");
      var Dr = Xr;
      _.RowDescriptionMessage = Dr;
      var en = class en {
        constructor(e, t) {
          this.length = e, this.parameterCount = t, this.name = "parameterDescription", this.dataTypeIDs = new Array(this.parameterCount);
        }
      };
      a(en, "ParameterDescriptionMessage");
      var qr = en;
      _.ParameterDescriptionMessage = qr;
      var tn = class tn {
        constructor(e, t, n) {
          this.length = e, this.parameterName = t, this.parameterValue = n, this.name = "parameterStatus";
        }
      };
      a(tn, "ParameterStatusMessage");
      var Nr = tn;
      _.ParameterStatusMessage = Nr;
      var rn = class rn {
        constructor(e, t) {
          this.length = e, this.salt = t, this.name = "authenticationMD5Password";
        }
      };
      a(rn, "AuthenticationMD5Password");
      var Wr = rn;
      _.AuthenticationMD5Password = Wr;
      var nn = class nn {
        constructor(e, t, n) {
          this.length = e, this.processID = t, this.secretKey = n, this.name = "backendKeyData";
        }
      };
      a(nn, "BackendKeyDataMessage");
      var jr = nn;
      _.BackendKeyDataMessage = jr;
      var sn = class sn {
        constructor(e, t, n, i) {
          this.length = e, this.processId = t, this.channel = n, this.payload = i, this.name = "notification";
        }
      };
      a(sn, "NotificationResponseMessage");
      var Hr = sn;
      _.NotificationResponseMessage = Hr;
      var on = class on {
        constructor(e, t) {
          this.length = e, this.status = t, this.name = "readyForQuery";
        }
      };
      a(on, "ReadyForQueryMessage");
      var $r = on;
      _.ReadyForQueryMessage = $r;
      var an = class an {
        constructor(e, t) {
          this.length = e, this.text = t, this.name = "commandComplete";
        }
      };
      a(an, "CommandCompleteMessage");
      var Gr = an;
      _.CommandCompleteMessage = Gr;
      var un = class un {
        constructor(e, t) {
          this.length = e, this.fields = t, this.name = "dataRow", this.fieldCount = t.length;
        }
      };
      a(un, "DataRowMessage");
      var Vr = un;
      _.DataRowMessage = Vr;
      var cn = class cn {
        constructor(e, t) {
          this.length = e, this.message = t, this.name = "notice";
        }
      };
      a(cn, "NoticeMessage");
      var zr = cn;
      _.NoticeMessage = zr;
    });
    Vs = T((Bt) => {
      "use strict";
      h();
      Object.defineProperty(Bt, "__esModule", { value: true });
      Bt.Writer = void 0;
      var hn = class hn {
        constructor(e = 256) {
          this.size = e, this.offset = 5, this.headerPosition = 0, this.buffer = p.allocUnsafe(e);
        }
        ensure(e) {
          if (this.buffer.length - this.offset < e) {
            let n = this.buffer, i = n.length + (n.length >> 1) + e;
            this.buffer = p.allocUnsafe(i), n.copy(
              this.buffer
            );
          }
        }
        addInt32(e) {
          return this.ensure(4), this.buffer[this.offset++] = e >>> 24 & 255, this.buffer[this.offset++] = e >>> 16 & 255, this.buffer[this.offset++] = e >>> 8 & 255, this.buffer[this.offset++] = e >>> 0 & 255, this;
        }
        addInt16(e) {
          return this.ensure(2), this.buffer[this.offset++] = e >>> 8 & 255, this.buffer[this.offset++] = e >>> 0 & 255, this;
        }
        addCString(e) {
          if (!e) this.ensure(1);
          else {
            let t = p.byteLength(e);
            this.ensure(t + 1), this.buffer.write(e, this.offset, "utf-8"), this.offset += t;
          }
          return this.buffer[this.offset++] = 0, this;
        }
        addString(e = "") {
          let t = p.byteLength(e);
          return this.ensure(t), this.buffer.write(e, this.offset), this.offset += t, this;
        }
        addInt32PrefixedString(e) {
          let t = p.byteLength(e);
          this.ensure(4 + t);
          let n = this.buffer, i = this.offset;
          return n[i++] = t >>> 24 & 255, n[i++] = t >>> 16 & 255, n[i++] = t >>> 8 & 255, n[i++] = t >>> 0 & 255, n.write(e, i, "utf-8"), this.offset = i + t, this;
        }
        add(e) {
          return this.ensure(e.length), e.copy(this.buffer, this.offset), this.offset += e.length, this;
        }
        join(e) {
          if (e) {
            this.buffer[this.headerPosition] = e;
            let t = this.offset - (this.headerPosition + 1);
            this.buffer.writeInt32BE(t, this.headerPosition + 1);
          }
          return this.buffer.slice(e ? 0 : 5, this.offset);
        }
        flush(e) {
          let t = this.join(e);
          return this.offset = 5, this.headerPosition = 0, this.buffer = p.allocUnsafe(this.size), t;
        }
        clear() {
          this.offset = 5, this.headerPosition = 0;
        }
      };
      a(hn, "Writer");
      var fn = hn;
      Bt.Writer = fn;
    });
    Ks = T((Mt) => {
      "use strict";
      h();
      Object.defineProperty(Mt, "__esModule", { value: true });
      Mt.serialize = void 0;
      var dn = Vs(), L = new dn.Writer(), Cc = a((r) => {
        L.addInt16(3).addInt16(0);
        for (let n of Object.keys(r)) L.addCString(
          n
        ).addCString(r[n]);
        L.addCString("client_encoding").addCString("UTF8");
        let e = L.addCString("").flush(), t = e.length + 4;
        return new dn.Writer().addInt32(t).add(e).flush();
      }, "startup"), _c = a(() => {
        let r = p.allocUnsafe(
          8
        );
        return r.writeInt32BE(8, 0), r.writeInt32BE(80877103, 4), r;
      }, "requestSsl"), Tc = a((r) => L.addCString(r).flush(
        112
      ), "password"), Ic = a(function(r, e) {
        return L.addCString(r).addInt32PrefixedString(e), L.flush(112);
      }, "sendSASLInitialResponseMessage"), Pc = a(function(r) {
        return L.addString(r).flush(112);
      }, "sendSCRAMClientFinalMessage"), Rc = a((r) => L.addCString(r).flush(81), "query"), zs = [], Lc = a((r) => {
        let e = r.name || "";
        e.length > 63 && (console.error("Warning! Postgres only supports 63 characters for query names."), console.error("You supplied %s (%s)", e, e.length), console.error("This can cause conflicts and silent errors executing queries"));
        let t = r.types || zs, n = t.length, i = L.addCString(e).addCString(r.text).addInt16(n);
        for (let s = 0; s < n; s++) i.addInt32(t[s]);
        return L.flush(80);
      }, "parse"), De = new dn.Writer(), Bc = a(function(r, e) {
        for (let t = 0; t < r.length; t++) {
          let n = e ? e(r[t], t) : r[t];
          n == null ? (L.addInt16(0), De.addInt32(-1)) : n instanceof p ? (L.addInt16(
            1
          ), De.addInt32(n.length), De.add(n)) : (L.addInt16(0), De.addInt32PrefixedString(n));
        }
      }, "writeValues"), Fc = a(
        (r = {}) => {
          let e = r.portal || "", t = r.statement || "", n = r.binary || false, i = r.values || zs, s = i.length;
          L.addCString(
            e
          ).addCString(t), L.addInt16(s);
          try {
            Bc(i, r.valueMapper);
          } catch (o) {
            throw L.clear(), De.clear(), o;
          }
          return L.addInt16(s), L.add(De.flush()), L.addInt16(1), L.addInt16(n ? 1 : 0), L.flush(66);
        },
        "bind"
      ), Mc = p.from([
        69,
        0,
        0,
        0,
        9,
        0,
        0,
        0,
        0,
        0
      ]), kc = a((r) => {
        if (!r || !r.portal && !r.rows) return Mc;
        let e = r.portal || "", t = r.rows || 0, n = p.byteLength(
          e
        ), i = 4 + n + 1 + 4, s = p.allocUnsafe(1 + i);
        return s[0] = 69, s.writeInt32BE(i, 1), s.write(e, 5, "utf-8"), s[n + 5] = 0, s.writeUInt32BE(t, s.length - 4), s;
      }, "execute"), Oc = a((r, e) => {
        let t = p.allocUnsafe(16);
        return t.writeInt32BE(
          16,
          0
        ), t.writeInt16BE(1234, 4), t.writeInt16BE(5678, 6), t.writeInt32BE(r, 8), t.writeInt32BE(e, 12), t;
      }, "cancel"), pn = a((r, e) => {
        let n = 4 + p.byteLength(e) + 1, i = p.allocUnsafe(1 + n);
        return i[0] = r, i.writeInt32BE(n, 1), i.write(e, 5, "utf-8"), i[n] = 0, i;
      }, "cstringMessage"), Uc = L.addCString("P").flush(68), Qc = L.addCString("S").flush(68), Dc = a((r) => r.name ? pn(68, `${r.type}${r.name || ""}`) : r.type === "P" ? Uc : Qc, "describe"), qc = a((r) => {
        let e = `${r.type}${r.name || ""}`;
        return pn(67, e);
      }, "close"), Nc = a((r) => L.add(r).flush(100), "copyData"), Wc = a((r) => pn(
        102,
        r
      ), "copyFail"), Ft = a((r) => p.from([r, 0, 0, 0, 4]), "codeOnlyBuffer"), jc = Ft(72), Hc = Ft(83), $c = Ft(88), Gc = Ft(99), Vc = {
        startup: Cc,
        password: Tc,
        requestSsl: _c,
        sendSASLInitialResponseMessage: Ic,
        sendSCRAMClientFinalMessage: Pc,
        query: Rc,
        parse: Lc,
        bind: Fc,
        execute: kc,
        describe: Dc,
        close: qc,
        flush: a(() => jc, "flush"),
        sync: a(() => Hc, "sync"),
        end: a(() => $c, "end"),
        copyData: Nc,
        copyDone: a(() => Gc, "copyDone"),
        copyFail: Wc,
        cancel: Oc
      };
      Mt.serialize = Vc;
    });
    Ys = T((kt) => {
      "use strict";
      h();
      Object.defineProperty(kt, "__esModule", { value: true });
      kt.BufferReader = void 0;
      var mn = class mn {
        constructor(e = 0) {
          this.offset = e, this.buffer = p.allocUnsafe(0), this.encoding = "utf-8";
        }
        setBuffer(e, t) {
          this.offset = e, this.buffer = t;
        }
        int16() {
          let e = this.buffer.readInt16BE(this.offset);
          return this.offset += 2, e;
        }
        byte() {
          let e = this.buffer[this.offset];
          return this.offset++, e;
        }
        int32() {
          let e = this.buffer.readInt32BE(
            this.offset
          );
          return this.offset += 4, e;
        }
        uint32() {
          let e = this.buffer.readUInt32BE(this.offset);
          return this.offset += 4, e;
        }
        string(e) {
          let t = this.buffer.toString(this.encoding, this.offset, this.offset + e);
          return this.offset += e, t;
        }
        cstring() {
          let e = this.offset, t = e;
          for (; this.buffer[t++]; ) ;
          return this.offset = t, this.buffer.toString(this.encoding, e, t - 1);
        }
        bytes(e) {
          let t = this.buffer.slice(this.offset, this.offset + e);
          return this.offset += e, t;
        }
      };
      a(mn, "BufferReader");
      var yn = mn;
      kt.BufferReader = yn;
    });
    eo = T((Ot) => {
      "use strict";
      h();
      Object.defineProperty(Ot, "__esModule", { value: true });
      Ot.Parser = void 0;
      var F = ln(), zc = Ys(), wn = 1, Kc = 4, Zs = wn + Kc, Z = -1, gn = p.allocUnsafe(0), xn = class xn {
        constructor(e) {
          if (this.buffer = gn, this.bufferLength = 0, this.bufferOffset = 0, this.reader = new zc.BufferReader(), e?.mode === "binary") throw new Error(
            "Binary mode not supported yet"
          );
          this.mode = e?.mode || "text";
        }
        parse(e, t) {
          this.mergeBuffer(e);
          let n = this.bufferOffset + this.bufferLength, i = this.bufferOffset;
          for (; i + Zs <= n; ) {
            let s = this.buffer[i], o = this.buffer.readUInt32BE(i + wn), u = wn + o;
            if (u + i <= n) {
              let c = this.handlePacket(i + Zs, s, o, this.buffer);
              t(c), i += u;
            } else break;
          }
          i === n ? (this.buffer = gn, this.bufferLength = 0, this.bufferOffset = 0) : (this.bufferLength = n - i, this.bufferOffset = i);
        }
        mergeBuffer(e) {
          if (this.bufferLength > 0) {
            let t = this.bufferLength + e.byteLength;
            if (t + this.bufferOffset > this.buffer.byteLength) {
              let i;
              if (t <= this.buffer.byteLength && this.bufferOffset >= this.bufferLength) i = this.buffer;
              else {
                let s = this.buffer.byteLength * 2;
                for (; t >= s; ) s *= 2;
                i = p.allocUnsafe(s);
              }
              this.buffer.copy(i, 0, this.bufferOffset, this.bufferOffset + this.bufferLength), this.buffer = i, this.bufferOffset = 0;
            }
            e.copy(
              this.buffer,
              this.bufferOffset + this.bufferLength
            ), this.bufferLength = t;
          } else this.buffer = e, this.bufferOffset = 0, this.bufferLength = e.byteLength;
        }
        handlePacket(e, t, n, i) {
          let { reader: s } = this;
          s.setBuffer(e, i);
          let o;
          switch (t) {
            case 50:
              o = F.bindComplete;
              break;
            case 49:
              o = F.parseComplete;
              break;
            case 51:
              o = F.closeComplete;
              break;
            case 110:
              o = F.noData;
              break;
            case 115:
              o = F.portalSuspended;
              break;
            case 99:
              o = F.copyDone;
              break;
            case 87:
              o = F.replicationStart;
              break;
            case 73:
              o = F.emptyQuery;
              break;
            case 68:
              o = sl(s);
              break;
            case 67:
              o = Zc(s);
              break;
            case 90:
              o = Yc(s);
              break;
            case 65:
              o = tl(s);
              break;
            case 82:
              o = ul(s, n);
              break;
            case 83:
              o = ol(s);
              break;
            case 75:
              o = al(s);
              break;
            case 69:
              o = Js(s, "error");
              break;
            case 78:
              o = Js(s, "notice");
              break;
            case 84:
              o = rl(s);
              break;
            case 116:
              o = il(s);
              break;
            case 71:
              o = Xc(
                s
              );
              break;
            case 72:
              o = el(s);
              break;
            case 100:
              o = Jc(s, n);
              break;
            default:
              return new F.DatabaseError("received invalid response: " + t.toString(16), n, "error");
          }
          return s.setBuffer(0, gn), o.length = n, o;
        }
      };
      a(xn, "Parser");
      var bn = xn;
      Ot.Parser = bn;
      var Yc = a((r) => {
        let e = r.string(1);
        return new F.ReadyForQueryMessage(Z, e);
      }, "parseReadyForQueryMessage"), Zc = a((r) => {
        let e = r.cstring();
        return new F.CommandCompleteMessage(Z, e);
      }, "parseCommandCompleteMessage"), Jc = a((r, e) => {
        let t = r.bytes(e - 4);
        return new F.CopyDataMessage(Z, t);
      }, "parseCopyData"), Xc = a((r) => Xs(r, "copyInResponse"), "parseCopyInMessage"), el = a((r) => Xs(r, "copyOutResponse"), "parseCopyOutMessage"), Xs = a((r, e) => {
        let t = r.byte() !== 0, n = r.int16(), i = new F.CopyResponse(Z, e, t, n);
        for (let s = 0; s < n; s++) i.columnTypes[s] = r.int16();
        return i;
      }, "parseCopyMessage"), tl = a((r) => {
        let e = r.int32(), t = r.cstring(), n = r.cstring();
        return new F.NotificationResponseMessage(Z, e, t, n);
      }, "parseNotificationMessage"), rl = a((r) => {
        let e = r.int16(), t = new F.RowDescriptionMessage(Z, e);
        for (let n = 0; n < e; n++) t.fields[n] = nl(r);
        return t;
      }, "parseRowDescriptionMessage"), nl = a((r) => {
        let e = r.cstring(), t = r.uint32(), n = r.int16(), i = r.uint32(), s = r.int16(), o = r.int32(), u = r.int16() === 0 ? "text" : "binary";
        return new F.Field(e, t, n, i, s, o, u);
      }, "parseField"), il = a((r) => {
        let e = r.int16(), t = new F.ParameterDescriptionMessage(Z, e);
        for (let n = 0; n < e; n++) t.dataTypeIDs[n] = r.uint32();
        return t;
      }, "parseParameterDescriptionMessage"), sl = a((r) => {
        let e = r.int16(), t = new Array(e);
        for (let n = 0; n < e; n++) {
          let i = r.int32();
          t[n] = i === -1 ? null : r.string(i);
        }
        return new F.DataRowMessage(Z, t);
      }, "parseDataRowMessage"), ol = a((r) => {
        let e = r.cstring(), t = r.cstring();
        return new F.ParameterStatusMessage(Z, e, t);
      }, "parseParameterStatusMessage"), al = a((r) => {
        let e = r.int32(), t = r.int32();
        return new F.BackendKeyDataMessage(
          Z,
          e,
          t
        );
      }, "parseBackendKeyData"), ul = a((r, e) => {
        let t = r.int32(), n = { name: "authenticationOk", length: e };
        switch (t) {
          case 0:
            break;
          case 3:
            n.length === 8 && (n.name = "authenticationCleartextPassword");
            break;
          case 5:
            if (n.length === 12) {
              n.name = "authenticationMD5Password";
              let i = r.bytes(4);
              return new F.AuthenticationMD5Password(Z, i);
            }
            break;
          case 10:
            {
              n.name = "authenticationSASL", n.mechanisms = [];
              let i;
              do
                i = r.cstring(), i && n.mechanisms.push(i);
              while (i);
            }
            break;
          case 11:
            n.name = "authenticationSASLContinue", n.data = r.string(e - 8);
            break;
          case 12:
            n.name = "authenticationSASLFinal", n.data = r.string(e - 8);
            break;
          default:
            throw new Error("Unknown authenticationOk message type " + t);
        }
        return n;
      }, "parseAuthenticationResponse"), Js = a((r, e) => {
        let t = {}, n = r.string(1);
        for (; n !== "\0"; ) t[n] = r.cstring(), n = r.string(1);
        let i = t.M, s = e === "notice" ? new F.NoticeMessage(Z, i) : new F.DatabaseError(
          i,
          Z,
          e
        );
        return s.severity = t.S, s.code = t.C, s.detail = t.D, s.hint = t.H, s.position = t.P, s.internalPosition = t.p, s.internalQuery = t.q, s.where = t.W, s.schema = t.s, s.table = t.t, s.column = t.c, s.dataType = t.d, s.constraint = t.n, s.file = t.F, s.line = t.L, s.routine = t.R, s;
      }, "parseErrorMessage");
    });
    vn = T((_e) => {
      "use strict";
      h();
      Object.defineProperty(_e, "__esModule", { value: true });
      _e.DatabaseError = _e.serialize = void 0;
      _e.parse = hl;
      var cl = ln();
      Object.defineProperty(_e, "DatabaseError", { enumerable: true, get: a(
        function() {
          return cl.DatabaseError;
        },
        "get"
      ) });
      var ll = Ks();
      Object.defineProperty(_e, "serialize", {
        enumerable: true,
        get: a(function() {
          return ll.serialize;
        }, "get")
      });
      var fl = eo();
      function hl(r, e) {
        let t = new fl.Parser();
        return r.on("data", (n) => t.parse(n, e)), new Promise((n) => r.on("end", () => n()));
      }
      a(hl, "parse");
    });
    to = {};
    se(to, { connect: () => dl });
    ro = V(
      () => {
        "use strict";
        h();
        a(dl, "connect");
      }
    );
    An = T((Dd, so) => {
      "use strict";
      h();
      var no = (Ge(), O(Ii)), pl = ve().EventEmitter, { parse: yl, serialize: Q } = vn(), io = Q.flush(), ml = Q.sync(), gl = Q.end(), En = class En extends pl {
        constructor(e) {
          super(), e = e || {}, this.stream = e.stream || new no.Socket(), this._keepAlive = e.keepAlive, this._keepAliveInitialDelayMillis = e.keepAliveInitialDelayMillis, this.lastBuffer = false, this.parsedStatements = {}, this.ssl = e.ssl || false, this._ending = false, this._emitMessage = false;
          var t = this;
          this.on("newListener", function(n) {
            n === "message" && (t._emitMessage = true);
          });
        }
        connect(e, t) {
          var n = this;
          this._connecting = true, this.stream.setNoDelay(true), this.stream.connect(e, t), this.stream.once("connect", function() {
            n._keepAlive && n.stream.setKeepAlive(true, n._keepAliveInitialDelayMillis), n.emit("connect");
          });
          let i = a(function(s) {
            n._ending && (s.code === "ECONNRESET" || s.code === "EPIPE") || n.emit("error", s);
          }, "reportStreamError");
          if (this.stream.on("error", i), this.stream.on("close", function() {
            n.emit("end");
          }), !this.ssl) return this.attachListeners(
            this.stream
          );
          this.stream.once("data", function(s) {
            var o = s.toString("utf8");
            switch (o) {
              case "S":
                break;
              case "N":
                return n.stream.end(), n.emit("error", new Error("The server does not support SSL connections"));
              default:
                return n.stream.end(), n.emit("error", new Error("There was an error establishing an SSL connection"));
            }
            var u = (ro(), O(to));
            let c = { socket: n.stream };
            n.ssl !== true && (Object.assign(c, n.ssl), "key" in n.ssl && (c.key = n.ssl.key)), no.isIP(t) === 0 && (c.servername = t);
            try {
              n.stream = u.connect(c);
            } catch (l) {
              return n.emit(
                "error",
                l
              );
            }
            n.attachListeners(n.stream), n.stream.on("error", i), n.emit("sslconnect");
          });
        }
        attachListeners(e) {
          e.on(
            "end",
            () => {
              this.emit("end");
            }
          ), yl(e, (t) => {
            var n = t.name === "error" ? "errorMessage" : t.name;
            this._emitMessage && this.emit("message", t), this.emit(n, t);
          });
        }
        requestSsl() {
          this.stream.write(Q.requestSsl());
        }
        startup(e) {
          this.stream.write(Q.startup(e));
        }
        cancel(e, t) {
          this._send(Q.cancel(e, t));
        }
        password(e) {
          this._send(Q.password(e));
        }
        sendSASLInitialResponseMessage(e, t) {
          this._send(Q.sendSASLInitialResponseMessage(e, t));
        }
        sendSCRAMClientFinalMessage(e) {
          this._send(Q.sendSCRAMClientFinalMessage(
            e
          ));
        }
        _send(e) {
          return this.stream.writable ? this.stream.write(e) : false;
        }
        query(e) {
          this._send(Q.query(e));
        }
        parse(e) {
          this._send(Q.parse(e));
        }
        bind(e) {
          this._send(Q.bind(e));
        }
        execute(e) {
          this._send(Q.execute(e));
        }
        flush() {
          this.stream.writable && this.stream.write(io);
        }
        sync() {
          this._ending = true, this._send(io), this._send(ml);
        }
        ref() {
          this.stream.ref();
        }
        unref() {
          this.stream.unref();
        }
        end() {
          if (this._ending = true, !this._connecting || !this.stream.writable) {
            this.stream.end();
            return;
          }
          return this.stream.write(gl, () => {
            this.stream.end();
          });
        }
        close(e) {
          this._send(Q.close(e));
        }
        describe(e) {
          this._send(Q.describe(e));
        }
        sendCopyFromChunk(e) {
          this._send(Q.copyData(e));
        }
        endCopyFrom() {
          this._send(Q.copyDone());
        }
        sendCopyFail(e) {
          this._send(Q.copyFail(e));
        }
      };
      a(En, "Connection");
      var Sn = En;
      so.exports = Sn;
    });
    uo = T((jd, ao) => {
      "use strict";
      h();
      var wl = ve().EventEmitter, Wd = (it(), O(nt)), bl = rt(), Cn = xs(), xl = Ls(), vl = _t(), Sl = Lt(), oo = Gs(), El = tt(), Al = An(), _n = class _n extends wl {
        constructor(e) {
          super(), this.connectionParameters = new Sl(e), this.user = this.connectionParameters.user, this.database = this.connectionParameters.database, this.port = this.connectionParameters.port, this.host = this.connectionParameters.host, Object.defineProperty(
            this,
            "password",
            { configurable: true, enumerable: false, writable: true, value: this.connectionParameters.password }
          ), this.replication = this.connectionParameters.replication;
          var t = e || {};
          this._Promise = t.Promise || b.Promise, this._types = new vl(t.types), this._ending = false, this._connecting = false, this._connected = false, this._connectionError = false, this._queryable = true, this.connection = t.connection || new Al({ stream: t.stream, ssl: this.connectionParameters.ssl, keepAlive: t.keepAlive || false, keepAliveInitialDelayMillis: t.keepAliveInitialDelayMillis || 0, encoding: this.connectionParameters.client_encoding || "utf8" }), this.queryQueue = [], this.binary = t.binary || El.binary, this.processID = null, this.secretKey = null, this.ssl = this.connectionParameters.ssl || false, this.ssl && this.ssl.key && Object.defineProperty(this.ssl, "key", { enumerable: false }), this._connectionTimeoutMillis = t.connectionTimeoutMillis || 0;
        }
        _errorAllQueries(e) {
          let t = a((n) => {
            y.nextTick(() => {
              n.handleError(e, this.connection);
            });
          }, "enqueueError");
          this.activeQuery && (t(this.activeQuery), this.activeQuery = null), this.queryQueue.forEach(t), this.queryQueue.length = 0;
        }
        _connect(e) {
          var t = this, n = this.connection;
          if (this._connectionCallback = e, this._connecting || this._connected) {
            let i = new Error("Client has already been connected. You cannot reuse a client.");
            y.nextTick(
              () => {
                e(i);
              }
            );
            return;
          }
          this._connecting = true, this.connectionTimeoutHandle, this._connectionTimeoutMillis > 0 && (this.connectionTimeoutHandle = setTimeout(() => {
            n._ending = true, n.stream.destroy(new Error("timeout expired"));
          }, this._connectionTimeoutMillis)), this.host && this.host.indexOf("/") === 0 ? n.connect(this.host + "/.s.PGSQL." + this.port) : n.connect(this.port, this.host), n.on("connect", function() {
            t.ssl ? n.requestSsl() : n.startup(t.getStartupConf());
          }), n.on("sslconnect", function() {
            n.startup(t.getStartupConf());
          }), this._attachListeners(
            n
          ), n.once("end", () => {
            let i = this._ending ? new Error("Connection terminated") : new Error("Connection terminated unexpectedly");
            clearTimeout(this.connectionTimeoutHandle), this._errorAllQueries(i), this._ending || (this._connecting && !this._connectionError ? this._connectionCallback ? this._connectionCallback(i) : this._handleErrorEvent(i) : this._connectionError || this._handleErrorEvent(i)), y.nextTick(() => {
              this.emit("end");
            });
          });
        }
        connect(e) {
          if (e) {
            this._connect(e);
            return;
          }
          return new this._Promise((t, n) => {
            this._connect((i) => {
              i ? n(i) : t();
            });
          });
        }
        _attachListeners(e) {
          e.on("authenticationCleartextPassword", this._handleAuthCleartextPassword.bind(this)), e.on("authenticationMD5Password", this._handleAuthMD5Password.bind(this)), e.on("authenticationSASL", this._handleAuthSASL.bind(this)), e.on("authenticationSASLContinue", this._handleAuthSASLContinue.bind(this)), e.on("authenticationSASLFinal", this._handleAuthSASLFinal.bind(this)), e.on("backendKeyData", this._handleBackendKeyData.bind(this)), e.on("error", this._handleErrorEvent.bind(this)), e.on("errorMessage", this._handleErrorMessage.bind(this)), e.on("readyForQuery", this._handleReadyForQuery.bind(this)), e.on("notice", this._handleNotice.bind(this)), e.on("rowDescription", this._handleRowDescription.bind(this)), e.on("dataRow", this._handleDataRow.bind(this)), e.on("portalSuspended", this._handlePortalSuspended.bind(
            this
          )), e.on("emptyQuery", this._handleEmptyQuery.bind(this)), e.on("commandComplete", this._handleCommandComplete.bind(this)), e.on("parseComplete", this._handleParseComplete.bind(this)), e.on("copyInResponse", this._handleCopyInResponse.bind(this)), e.on("copyData", this._handleCopyData.bind(this)), e.on("notification", this._handleNotification.bind(this));
        }
        _checkPgPass(e) {
          let t = this.connection;
          typeof this.password == "function" ? this._Promise.resolve().then(() => this.password()).then((n) => {
            if (n !== void 0) {
              if (typeof n != "string") {
                t.emit("error", new TypeError(
                  "Password must be a string"
                ));
                return;
              }
              this.connectionParameters.password = this.password = n;
            } else this.connectionParameters.password = this.password = null;
            e();
          }).catch((n) => {
            t.emit("error", n);
          }) : this.password !== null ? e() : xl(
            this.connectionParameters,
            (n) => {
              n !== void 0 && (this.connectionParameters.password = this.password = n), e();
            }
          );
        }
        _handleAuthCleartextPassword(e) {
          this._checkPgPass(() => {
            this.connection.password(this.password);
          });
        }
        _handleAuthMD5Password(e) {
          this._checkPgPass(
            () => {
              let t = bl.postgresMd5PasswordHash(this.user, this.password, e.salt);
              this.connection.password(t);
            }
          );
        }
        _handleAuthSASL(e) {
          this._checkPgPass(() => {
            this.saslSession = Cn.startSession(e.mechanisms), this.connection.sendSASLInitialResponseMessage(
              this.saslSession.mechanism,
              this.saslSession.response
            );
          });
        }
        _handleAuthSASLContinue(e) {
          Cn.continueSession(
            this.saslSession,
            this.password,
            e.data
          ), this.connection.sendSCRAMClientFinalMessage(this.saslSession.response);
        }
        _handleAuthSASLFinal(e) {
          Cn.finalizeSession(this.saslSession, e.data), this.saslSession = null;
        }
        _handleBackendKeyData(e) {
          this.processID = e.processID, this.secretKey = e.secretKey;
        }
        _handleReadyForQuery(e) {
          this._connecting && (this._connecting = false, this._connected = true, clearTimeout(this.connectionTimeoutHandle), this._connectionCallback && (this._connectionCallback(null, this), this._connectionCallback = null), this.emit("connect"));
          let { activeQuery: t } = this;
          this.activeQuery = null, this.readyForQuery = true, t && t.handleReadyForQuery(this.connection), this._pulseQueryQueue();
        }
        _handleErrorWhileConnecting(e) {
          if (!this._connectionError) {
            if (this._connectionError = true, clearTimeout(this.connectionTimeoutHandle), this._connectionCallback) return this._connectionCallback(e);
            this.emit("error", e);
          }
        }
        _handleErrorEvent(e) {
          if (this._connecting) return this._handleErrorWhileConnecting(e);
          this._queryable = false, this._errorAllQueries(e), this.emit("error", e);
        }
        _handleErrorMessage(e) {
          if (this._connecting) return this._handleErrorWhileConnecting(e);
          let t = this.activeQuery;
          if (!t) {
            this._handleErrorEvent(e);
            return;
          }
          this.activeQuery = null, t.handleError(
            e,
            this.connection
          );
        }
        _handleRowDescription(e) {
          this.activeQuery.handleRowDescription(e);
        }
        _handleDataRow(e) {
          this.activeQuery.handleDataRow(e);
        }
        _handlePortalSuspended(e) {
          this.activeQuery.handlePortalSuspended(this.connection);
        }
        _handleEmptyQuery(e) {
          this.activeQuery.handleEmptyQuery(this.connection);
        }
        _handleCommandComplete(e) {
          this.activeQuery.handleCommandComplete(e, this.connection);
        }
        _handleParseComplete(e) {
          this.activeQuery.name && (this.connection.parsedStatements[this.activeQuery.name] = this.activeQuery.text);
        }
        _handleCopyInResponse(e) {
          this.activeQuery.handleCopyInResponse(this.connection);
        }
        _handleCopyData(e) {
          this.activeQuery.handleCopyData(
            e,
            this.connection
          );
        }
        _handleNotification(e) {
          this.emit("notification", e);
        }
        _handleNotice(e) {
          this.emit("notice", e);
        }
        getStartupConf() {
          var e = this.connectionParameters, t = { user: e.user, database: e.database }, n = e.application_name || e.fallback_application_name;
          return n && (t.application_name = n), e.replication && (t.replication = "" + e.replication), e.statement_timeout && (t.statement_timeout = String(parseInt(e.statement_timeout, 10))), e.lock_timeout && (t.lock_timeout = String(parseInt(e.lock_timeout, 10))), e.idle_in_transaction_session_timeout && (t.idle_in_transaction_session_timeout = String(parseInt(e.idle_in_transaction_session_timeout, 10))), e.options && (t.options = e.options), t;
        }
        cancel(e, t) {
          if (e.activeQuery === t) {
            var n = this.connection;
            this.host && this.host.indexOf("/") === 0 ? n.connect(this.host + "/.s.PGSQL." + this.port) : n.connect(this.port, this.host), n.on("connect", function() {
              n.cancel(
                e.processID,
                e.secretKey
              );
            });
          } else e.queryQueue.indexOf(t) !== -1 && e.queryQueue.splice(e.queryQueue.indexOf(t), 1);
        }
        setTypeParser(e, t, n) {
          return this._types.setTypeParser(e, t, n);
        }
        getTypeParser(e, t) {
          return this._types.getTypeParser(e, t);
        }
        escapeIdentifier(e) {
          return '"' + e.replace(/"/g, '""') + '"';
        }
        escapeLiteral(e) {
          for (var t = false, n = "'", i = 0; i < e.length; i++) {
            var s = e[i];
            s === "'" ? n += s + s : s === "\\" ? (n += s + s, t = true) : n += s;
          }
          return n += "'", t === true && (n = " E" + n), n;
        }
        _pulseQueryQueue() {
          if (this.readyForQuery === true) if (this.activeQuery = this.queryQueue.shift(), this.activeQuery) {
            this.readyForQuery = false, this.hasExecuted = true;
            let e = this.activeQuery.submit(this.connection);
            e && y.nextTick(() => {
              this.activeQuery.handleError(e, this.connection), this.readyForQuery = true, this._pulseQueryQueue();
            });
          } else this.hasExecuted && (this.activeQuery = null, this.emit("drain"));
        }
        query(e, t, n) {
          var i, s, o, u, c;
          if (e == null) throw new TypeError(
            "Client was passed a null or undefined query"
          );
          return typeof e.submit == "function" ? (o = e.query_timeout || this.connectionParameters.query_timeout, s = i = e, typeof t == "function" && (i.callback = i.callback || t)) : (o = this.connectionParameters.query_timeout, i = new oo(e, t, n), i.callback || (s = new this._Promise((l, f) => {
            i.callback = (m, g) => m ? f(m) : l(g);
          }))), o && (c = i.callback, u = setTimeout(() => {
            var l = new Error("Query read timeout");
            y.nextTick(
              () => {
                i.handleError(l, this.connection);
              }
            ), c(l), i.callback = () => {
            };
            var f = this.queryQueue.indexOf(i);
            f > -1 && this.queryQueue.splice(f, 1), this._pulseQueryQueue();
          }, o), i.callback = (l, f) => {
            clearTimeout(u), c(l, f);
          }), this.binary && !i.binary && (i.binary = true), i._result && !i._result._types && (i._result._types = this._types), this._queryable ? this._ending ? (y.nextTick(() => {
            i.handleError(new Error("Client was closed and is not queryable"), this.connection);
          }), s) : (this.queryQueue.push(i), this._pulseQueryQueue(), s) : (y.nextTick(() => {
            i.handleError(new Error("Client has encountered a connection error and is not queryable"), this.connection);
          }), s);
        }
        ref() {
          this.connection.ref();
        }
        unref() {
          this.connection.unref();
        }
        end(e) {
          if (this._ending = true, !this.connection._connecting) if (e) e();
          else return this._Promise.resolve();
          if (this.activeQuery || !this._queryable ? this.connection.stream.destroy() : this.connection.end(), e) this.connection.once("end", e);
          else return new this._Promise((t) => {
            this.connection.once("end", t);
          });
        }
      };
      a(_n, "Client");
      var Ut = _n;
      Ut.Query = oo;
      ao.exports = Ut;
    });
    fo = T((Gd, lo) => {
      "use strict";
      h();
      var Cl = ve().EventEmitter, Tn = a(function() {
      }, "NOOP"), co = a((r, e) => {
        let t = r.findIndex(e);
        return t === -1 ? void 0 : r.splice(t, 1)[0];
      }, "removeWhere"), Rn = class Rn {
        constructor(e, t, n) {
          this.client = e, this.idleListener = t, this.timeoutId = n;
        }
      };
      a(Rn, "IdleItem");
      var In = Rn, Ln = class Ln {
        constructor(e) {
          this.callback = e;
        }
      };
      a(Ln, "PendingItem");
      var qe = Ln;
      function _l() {
        throw new Error("Release called on client which has already been released to the pool.");
      }
      a(_l, "throwOnDoubleRelease");
      function Qt(r, e) {
        if (e)
          return { callback: e, result: void 0 };
        let t, n, i = a(function(o, u) {
          o ? t(o) : n(u);
        }, "cb"), s = new r(function(o, u) {
          n = o, t = u;
        }).catch((o) => {
          throw Error.captureStackTrace(o), o;
        });
        return { callback: i, result: s };
      }
      a(Qt, "promisify");
      function Tl(r, e) {
        return a(function t(n) {
          n.client = e, e.removeListener("error", t), e.on("error", () => {
            r.log(
              "additional client error after disconnection due to error",
              n
            );
          }), r._remove(e), r.emit("error", n, e);
        }, "idleListener");
      }
      a(Tl, "makeIdleListener");
      var Bn = class Bn extends Cl {
        constructor(e, t) {
          super(), this.options = Object.assign({}, e), e != null && "password" in e && Object.defineProperty(this.options, "password", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: e.password
          }), e != null && e.ssl && e.ssl.key && Object.defineProperty(this.options.ssl, "key", { enumerable: false }), this.options.max = this.options.max || this.options.poolSize || 10, this.options.min = this.options.min || 0, this.options.maxUses = this.options.maxUses || 1 / 0, this.options.allowExitOnIdle = this.options.allowExitOnIdle || false, this.options.maxLifetimeSeconds = this.options.maxLifetimeSeconds || 0, this.log = this.options.log || function() {
          }, this.Client = this.options.Client || t || ot().Client, this.Promise = this.options.Promise || b.Promise, typeof this.options.idleTimeoutMillis > "u" && (this.options.idleTimeoutMillis = 1e4), this._clients = [], this._idle = [], this._expired = /* @__PURE__ */ new WeakSet(), this._pendingQueue = [], this._endCallback = void 0, this.ending = false, this.ended = false;
        }
        _promiseTry(e) {
          let t = this.Promise;
          return typeof t.try == "function" ? t.try(e) : new t((n) => n(e()));
        }
        _isFull() {
          return this._clients.length >= this.options.max;
        }
        _isAboveMin() {
          return this._clients.length > this.options.min;
        }
        _pulseQueue() {
          if (this.log("pulse queue"), this.ended) {
            this.log("pulse queue ended");
            return;
          }
          if (this.ending) {
            this.log("pulse queue on ending"), this._idle.length && this._idle.slice().map((t) => {
              this._remove(t.client);
            }), this._clients.length || (this.ended = true, this._endCallback());
            return;
          }
          if (!this._pendingQueue.length) {
            this.log("no queued requests");
            return;
          }
          if (!this._idle.length && this._isFull())
            return;
          let e = this._pendingQueue.shift();
          if (this._idle.length) {
            let t = this._idle.pop();
            clearTimeout(t.timeoutId);
            let n = t.client;
            n.ref && n.ref();
            let i = t.idleListener;
            return this._acquireClient(n, e, i, false);
          }
          if (!this._isFull()) return this.newClient(e);
          throw new Error("unexpected condition");
        }
        _remove(e, t) {
          let n = co(this._idle, (s) => s.client === e);
          n !== void 0 && clearTimeout(n.timeoutId), this._clients = this._clients.filter((s) => s !== e);
          let i = this;
          e.end(() => {
            i.emit("remove", e), typeof t == "function" && t();
          });
        }
        connect(e) {
          if (this.ending) {
            let i = new Error(
              "Cannot use a pool after calling end on the pool"
            );
            return e ? e(i) : this.Promise.reject(i);
          }
          let t = Qt(this.Promise, e), n = t.result;
          if (this._isFull() || this._idle.length) {
            if (this._idle.length && y.nextTick(() => this._pulseQueue()), !this.options.connectionTimeoutMillis) return this._pendingQueue.push(new qe(t.callback)), n;
            let i = a((u, c, l) => {
              clearTimeout(o), t.callback(u, c, l);
            }, "queueCallback"), s = new qe(i), o = setTimeout(() => {
              co(this._pendingQueue, (u) => u.callback === i), s.timedOut = true, t.callback(new Error("timeout exceeded when trying to connect"));
            }, this.options.connectionTimeoutMillis);
            return o.unref && o.unref(), this._pendingQueue.push(s), n;
          }
          return this.newClient(new qe(t.callback)), n;
        }
        newClient(e) {
          let t = new this.Client(this.options);
          this._clients.push(t);
          let n = Tl(this, t);
          this.log("checking client timeout");
          let i, s = false;
          this.options.connectionTimeoutMillis && (i = setTimeout(() => {
            t.connection ? (this.log("ending client due to timeout"), s = true, t.connection.stream.destroy()) : t.isConnected() || (this.log("ending client due to timeout"), s = true, t.end());
          }, this.options.connectionTimeoutMillis)), this.log("connecting new client"), t.connect((o) => {
            if (i && clearTimeout(i), t.on("error", n), o) this.log("client failed to connect", o), this._clients = this._clients.filter((u) => u !== t), s && (o = new Error("Connection terminated due to connection timeout", { cause: o })), this._pulseQueue(), e.timedOut || e.callback(
              o,
              void 0,
              Tn
            );
            else {
              if (this.log("new client connected"), this.options.onConnect) {
                this._promiseTry(() => this.options.onConnect(t)).then(() => {
                  this._afterConnect(t, e, n);
                }, (u) => {
                  this._clients = this._clients.filter((c) => c !== t), t.end(() => {
                    this._pulseQueue(), e.timedOut || e.callback(u, void 0, Tn);
                  });
                });
                return;
              }
              return this._afterConnect(
                t,
                e,
                n
              );
            }
          });
        }
        _afterConnect(e, t, n) {
          if (this.options.maxLifetimeSeconds !== 0) {
            let i = setTimeout(() => {
              this.log(
                "ending client due to expired lifetime"
              ), this._expired.add(e), this._idle.findIndex((o) => o.client === e) !== -1 && this._acquireClient(e, new qe((o, u, c) => c()), n, false);
            }, this.options.maxLifetimeSeconds * 1e3);
            i.unref(), e.once("end", () => clearTimeout(i));
          }
          return this._acquireClient(e, t, n, true);
        }
        _acquireClient(e, t, n, i) {
          i && this.emit("connect", e), this.emit("acquire", e), e.release = this._releaseOnce(e, n), e.removeListener("error", n), t.timedOut ? i && this.options.verify ? this.options.verify(e, e.release) : e.release() : i && this.options.verify ? this.options.verify(e, (s) => {
            if (s) return e.release(s), t.callback(s, void 0, Tn);
            t.callback(void 0, e, e.release);
          }) : t.callback(void 0, e, e.release);
        }
        _releaseOnce(e, t) {
          let n = false;
          return (i) => {
            n && _l(), n = true, this._release(
              e,
              t,
              i
            );
          };
        }
        _release(e, t, n) {
          if (e.on("error", t), e._poolUseCount = (e._poolUseCount || 0) + 1, this.emit(
            "release",
            n,
            e
          ), n || this.ending || !e._queryable || e._ending || e._poolUseCount >= this.options.maxUses) return e._poolUseCount >= this.options.maxUses && this.log("remove expended client"), this._remove(e, this._pulseQueue.bind(this));
          if (this._expired.has(e)) return this.log("remove expired client"), this._expired.delete(e), this._remove(
            e,
            this._pulseQueue.bind(this)
          );
          let s;
          this.options.idleTimeoutMillis && this._isAboveMin() && (s = setTimeout(
            () => {
              this._isAboveMin() && (this.log("remove idle client"), this._remove(e, this._pulseQueue.bind(this)));
            },
            this.options.idleTimeoutMillis
          ), this.options.allowExitOnIdle && s.unref()), this.options.allowExitOnIdle && e.unref(), this._idle.push(new In(e, t, s)), this._pulseQueue();
        }
        query(e, t, n) {
          if (typeof e == "function") {
            let s = Qt(
              this.Promise,
              e
            );
            return x(function() {
              return s.callback(new Error("Passing a function as the first parameter to pool.query is not supported"));
            }), s.result;
          }
          typeof t == "function" && (n = t, t = void 0);
          let i = Qt(this.Promise, n);
          return n = i.callback, this.connect((s, o) => {
            if (s) return n(s);
            let u = false, c = a((l) => {
              u || (u = true, o.release(
                l
              ), n(l));
            }, "onError");
            o.once("error", c), this.log("dispatching query");
            try {
              o.query(e, t, (l, f) => {
                if (this.log("query dispatched"), o.removeListener("error", c), !u) return u = true, o.release(l), l ? n(l) : n(void 0, f);
              });
            } catch (l) {
              return o.release(l), n(l);
            }
          }), i.result;
        }
        end(e) {
          if (this.log("ending"), this.ending) {
            let n = new Error("Called end on pool more than once");
            return e ? e(n) : this.Promise.reject(n);
          }
          this.ending = true;
          let t = Qt(
            this.Promise,
            e
          );
          return this._endCallback = t.callback, this._pulseQueue(), t.result;
        }
        get waitingCount() {
          return this._pendingQueue.length;
        }
        get idleCount() {
          return this._idle.length;
        }
        get expiredCount() {
          return this._clients.reduce((e, t) => e + (this._expired.has(t) ? 1 : 0), 0);
        }
        get totalCount() {
          return this._clients.length;
        }
      };
      a(Bn, "Pool");
      var Pn = Bn;
      lo.exports = Pn;
    });
    ho = {};
    se(ho, { default: () => Il });
    po = V(() => {
      "use strict";
      h();
      Il = {};
    });
    yo = T((Yd, Pl) => {
      Pl.exports = { name: "pg", version: "8.8.0", description: "PostgreSQL client - pure javascript & libpq with the same API", keywords: [
        "database",
        "libpq",
        "pg",
        "postgre",
        "postgres",
        "postgresql",
        "rdbms"
      ], homepage: "https://github.com/brianc/node-postgres", repository: { type: "git", url: "git://github.com/brianc/node-postgres.git", directory: "packages/pg" }, author: "Brian Carlson <brian.m.carlson@gmail.com>", main: "./lib", dependencies: { "buffer-writer": "2.0.0", "packet-reader": "1.0.0", "pg-connection-string": "^2.5.0", "pg-pool": "^3.5.2", "pg-protocol": "^1.5.0", "pg-types": "^2.1.0", pgpass: "1.x" }, devDependencies: {
        async: "2.6.4",
        bluebird: "3.5.2",
        co: "4.6.0",
        "pg-copy-streams": "0.3.0"
      }, peerDependencies: { "pg-native": ">=3.0.1" }, peerDependenciesMeta: { "pg-native": { optional: true } }, scripts: { test: "make test-all" }, files: ["lib", "SPONSORS.md"], license: "MIT", engines: { node: ">= 8.0.0" }, gitHead: "c99fb2c127ddf8d712500db2c7b9a5491a178655" };
    });
    wo = T((Zd, go) => {
      "use strict";
      h();
      var mo = ve().EventEmitter, Rl = (it(), O(nt)), Fn = rt(), Ne = go.exports = function(r, e, t) {
        mo.call(this), r = Fn.normalizeQueryConfig(r, e, t), this.text = r.text, this.values = r.values, this.name = r.name, this.callback = r.callback, this.state = "new", this._arrayMode = r.rowMode === "array", this._emitRowEvents = false, this.on("newListener", function(n) {
          n === "row" && (this._emitRowEvents = true);
        }.bind(this));
      };
      Rl.inherits(Ne, mo);
      var Ll = { sqlState: "code", statementPosition: "position", messagePrimary: "message", context: "where", schemaName: "schema", tableName: "table", columnName: "column", dataTypeName: "dataType", constraintName: "constraint", sourceFile: "file", sourceLine: "line", sourceFunction: "routine" };
      Ne.prototype.handleError = function(r) {
        var e = this.native.pq.resultErrorFields();
        if (e) for (var t in e) {
          var n = Ll[t] || t;
          r[n] = e[t];
        }
        this.callback ? this.callback(r) : this.emit("error", r), this.state = "error";
      };
      Ne.prototype.then = function(r, e) {
        return this._getPromise().then(
          r,
          e
        );
      };
      Ne.prototype.catch = function(r) {
        return this._getPromise().catch(r);
      };
      Ne.prototype._getPromise = function() {
        return this._promise ? this._promise : (this._promise = new Promise(function(r, e) {
          this._once("end", r), this._once("error", e);
        }.bind(this)), this._promise);
      };
      Ne.prototype.submit = function(r) {
        this.state = "running";
        var e = this;
        this.native = r.native, r.native.arrayMode = this._arrayMode;
        var t = a(function(s, o, u) {
          if (r.native.arrayMode = false, x(function() {
            e.emit("_done");
          }), s) return e.handleError(s);
          e._emitRowEvents && (u.length > 1 ? o.forEach(
            (c, l) => {
              c.forEach((f) => {
                e.emit("row", f, u[l]);
              });
            }
          ) : o.forEach(function(c) {
            e.emit("row", c, u);
          })), e.state = "end", e.emit("end", u), e.callback && e.callback(null, u);
        }, "after");
        if (y.domain && (t = y.domain.bind(t)), this.name) {
          this.name.length > 63 && (console.error("Warning! Postgres only supports 63 characters for query names."), console.error("You supplied %s (%s)", this.name, this.name.length), console.error("This can cause conflicts and silent errors executing queries"));
          var n = (this.values || []).map(Fn.prepareValue);
          if (r.namedQueries[this.name]) {
            if (this.text && r.namedQueries[this.name] !== this.text) {
              let s = new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
              return t(s);
            }
            return r.native.execute(this.name, n, t);
          }
          return r.native.prepare(this.name, this.text, n.length, function(s) {
            return s ? t(s) : (r.namedQueries[e.name] = e.text, e.native.execute(e.name, n, t));
          });
        } else if (this.values) {
          if (!Array.isArray(
            this.values
          )) {
            let s = new Error("Query values must be an array");
            return t(s);
          }
          var i = this.values.map(Fn.prepareValue);
          r.native.query(this.text, i, t);
        } else r.native.query(this.text, t);
      };
    });
    So = T((tp, vo) => {
      "use strict";
      h();
      var Bl = (po(), O(ho)), Fl = _t(), ep = yo(), bo = ve().EventEmitter, Ml = (it(), O(nt)), kl = Lt(), xo = wo(), Y = vo.exports = function(r) {
        bo.call(this), r = r || {}, this._Promise = r.Promise || b.Promise, this._types = new Fl(r.types), this.native = new Bl({ types: this._types }), this._queryQueue = [], this._ending = false, this._connecting = false, this._connected = false, this._queryable = true;
        var e = this.connectionParameters = new kl(r);
        this.user = e.user, Object.defineProperty(this, "password", { configurable: true, enumerable: false, writable: true, value: e.password }), this.database = e.database, this.host = e.host, this.port = e.port, this.namedQueries = {};
      };
      Y.Query = xo;
      Ml.inherits(Y, bo);
      Y.prototype._errorAllQueries = function(r) {
        let e = a((t) => {
          y.nextTick(() => {
            t.native = this.native, t.handleError(r);
          });
        }, "enqueueError");
        this._hasActiveQuery() && (e(this._activeQuery), this._activeQuery = null), this._queryQueue.forEach(e), this._queryQueue.length = 0;
      };
      Y.prototype._connect = function(r) {
        var e = this;
        if (this._connecting) {
          y.nextTick(() => r(new Error("Client has already been connected. You cannot reuse a client.")));
          return;
        }
        this._connecting = true, this.connectionParameters.getLibpqConnectionString(function(t, n) {
          if (t) return r(t);
          e.native.connect(n, function(i) {
            if (i) return e.native.end(), r(i);
            e._connected = true, e.native.on("error", function(s) {
              e._queryable = false, e._errorAllQueries(s), e.emit("error", s);
            }), e.native.on("notification", function(s) {
              e.emit("notification", { channel: s.relname, payload: s.extra });
            }), e.emit("connect"), e._pulseQueryQueue(true), r();
          });
        });
      };
      Y.prototype.connect = function(r) {
        if (r) {
          this._connect(r);
          return;
        }
        return new this._Promise((e, t) => {
          this._connect((n) => {
            n ? t(n) : e();
          });
        });
      };
      Y.prototype.query = function(r, e, t) {
        var n, i, s, o, u;
        if (r == null) throw new TypeError("Client was passed a null or undefined query");
        if (typeof r.submit == "function") s = r.query_timeout || this.connectionParameters.query_timeout, i = n = r, typeof e == "function" && (r.callback = e);
        else if (s = this.connectionParameters.query_timeout, n = new xo(r, e, t), !n.callback) {
          let c, l;
          i = new this._Promise((f, m) => {
            c = f, l = m;
          }), n.callback = (f, m) => f ? l(f) : c(m);
        }
        return s && (u = n.callback, o = setTimeout(() => {
          var c = new Error(
            "Query read timeout"
          );
          y.nextTick(() => {
            n.handleError(c, this.connection);
          }), u(c), n.callback = () => {
          };
          var l = this._queryQueue.indexOf(n);
          l > -1 && this._queryQueue.splice(l, 1), this._pulseQueryQueue();
        }, s), n.callback = (c, l) => {
          clearTimeout(o), u(c, l);
        }), this._queryable ? this._ending ? (n.native = this.native, y.nextTick(() => {
          n.handleError(
            new Error("Client was closed and is not queryable")
          );
        }), i) : (this._queryQueue.push(n), this._pulseQueryQueue(), i) : (n.native = this.native, y.nextTick(() => {
          n.handleError(new Error("Client has encountered a connection error and is not queryable"));
        }), i);
      };
      Y.prototype.end = function(r) {
        var e = this;
        this._ending = true, this._connected || this.once("connect", this.end.bind(this, r));
        var t;
        return r || (t = new this._Promise(function(n, i) {
          r = a((s) => s ? i(s) : n(), "cb");
        })), this.native.end(function() {
          e._errorAllQueries(new Error("Connection terminated")), y.nextTick(() => {
            e.emit("end"), r && r();
          });
        }), t;
      };
      Y.prototype._hasActiveQuery = function() {
        return this._activeQuery && this._activeQuery.state !== "error" && this._activeQuery.state !== "end";
      };
      Y.prototype._pulseQueryQueue = function(r) {
        if (this._connected && !this._hasActiveQuery()) {
          var e = this._queryQueue.shift();
          if (!e) {
            r || this.emit("drain");
            return;
          }
          this._activeQuery = e, e.submit(this);
          var t = this;
          e.once("_done", function() {
            t._pulseQueryQueue();
          });
        }
      };
      Y.prototype.cancel = function(r) {
        this._activeQuery === r ? this.native.cancel(function() {
        }) : this._queryQueue.indexOf(r) !== -1 && this._queryQueue.splice(this._queryQueue.indexOf(r), 1);
      };
      Y.prototype.ref = function() {
      };
      Y.prototype.unref = function() {
      };
      Y.prototype.setTypeParser = function(r, e, t) {
        return this._types.setTypeParser(
          r,
          e,
          t
        );
      };
      Y.prototype.getTypeParser = function(r, e) {
        return this._types.getTypeParser(r, e);
      };
    });
    Mn = T((ip, Eo) => {
      "use strict";
      h();
      Eo.exports = So();
    });
    ot = T((op, at) => {
      "use strict";
      h();
      var Ol = uo(), Ul = tt(), Ql = An(), Dl = fo(), { DatabaseError: ql } = vn(), Nl = a(
        (r) => {
          var e;
          return e = class extends Dl {
            constructor(n) {
              super(n, r);
            }
          }, a(e, "BoundPool"), e;
        },
        "poolFactory"
      ), kn = a(
        function(r) {
          this.defaults = Ul, this.Client = r, this.Query = this.Client.Query, this.Pool = Nl(this.Client), this._pools = [], this.Connection = Ql, this.types = Je(), this.DatabaseError = ql;
        },
        "PG"
      );
      typeof y.env.NODE_PG_FORCE_NATIVE < "u" ? at.exports = new kn(Mn()) : (at.exports = new kn(Ol), Object.defineProperty(at.exports, "native", {
        configurable: true,
        enumerable: false,
        get() {
          var r = null;
          try {
            r = new kn(Mn());
          } catch (e) {
            if (e.code !== "MODULE_NOT_FOUND") throw e;
          }
          return Object.defineProperty(at.exports, "native", { value: r }), r;
        }
      }));
    });
    h();
    h();
    h();
    da = Object.defineProperty;
    pa = Object.defineProperties;
    ya = Object.getOwnPropertyDescriptors;
    ai = Object.getOwnPropertySymbols;
    ma = Object.prototype.hasOwnProperty;
    ga = Object.prototype.propertyIsEnumerable;
    ui = a(
      (r, e, t) => e in r ? da(r, e, { enumerable: true, configurable: true, writable: true, value: t }) : r[e] = t,
      "__defNormalProp"
    );
    wa = a((r, e) => {
      for (var t in e || (e = {})) ma.call(e, t) && ui(r, t, e[t]);
      if (ai) for (var t of ai(e)) ga.call(e, t) && ui(r, t, e[t]);
      return r;
    }, "__spreadValues");
    ba = a((r, e) => pa(r, ya(e)), "__spreadProps");
    xa = 1008e3;
    ci = new Uint8Array(
      new Uint16Array([258]).buffer
    )[0] === 2;
    va = new TextDecoder();
    Yt = new TextEncoder();
    dt = Yt.encode("0123456789abcdef");
    pt = Yt.encode("0123456789ABCDEF");
    Sa = Yt.encode("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
    li = Sa.slice();
    li[62] = 45;
    li[63] = 95;
    a(Ea, "_toHex");
    a(Aa, "_toHexChunked");
    a(fi, "toHex");
    h();
    h();
    Zt = class Zt2 {
      constructor(e, t, n) {
        E(this, "execute", e);
        E(this, "queryData", t);
        E(this, "opts", n);
      }
      then(e, t) {
        return this.execute(this.queryData, this.opts).then(e, t);
      }
      catch(e) {
        return this.execute(
          this.queryData,
          this.opts
        ).catch(e);
      }
      finally(e) {
        return this.execute(this.queryData, this.opts).finally(e);
      }
    };
    a(Zt, "NeonQueryPromise");
    xe = Zt;
    mt = class mt2 {
      constructor(e, t) {
        E(this, "strings", e);
        E(this, "values", t);
      }
      toParameterizedQuery(e = {
        query: "",
        params: []
      }) {
        let { strings: t, values: n } = this;
        for (let i = 0, s = t.length; i < s; i++) if (e.query += t[i], i < n.length) {
          let o = n[i];
          if (o instanceof $e) e.query += o.sql;
          else if (o instanceof xe) if (o.queryData instanceof mt2) o.queryData.toParameterizedQuery(e);
          else {
            if (o.queryData.params?.length) throw new Error("This query is not composable");
            e.query += o.queryData.query;
          }
          else {
            let { params: u } = e;
            u.push(o), e.query += "$" + u.length, (o instanceof p || ArrayBuffer.isView(o)) && (e.query += "::bytea");
          }
        }
        return e;
      }
    };
    a(mt, "SqlTemplate");
    He = mt;
    Jt = class Jt2 {
      constructor(e) {
        E(this, "sql", e);
      }
    };
    a(Jt, "UnsafeRawSql");
    $e = Jt;
    h();
    a(gt, "warnIfBrowser");
    h();
    h();
    wt = class wt2 extends Error {
      constructor(t) {
        super(t);
        E(this, "name", "NeonDbError");
        E(this, "severity");
        E(this, "code");
        E(this, "detail");
        E(this, "hint");
        E(this, "position");
        E(this, "internalPosition");
        E(
          this,
          "internalQuery"
        );
        E(this, "where");
        E(this, "schema");
        E(this, "table");
        E(this, "column");
        E(this, "dataType");
        E(this, "constraint");
        E(this, "file");
        E(this, "line");
        E(this, "routine");
        E(this, "sourceError");
        "captureStackTrace" in Error && typeof Error.captureStackTrace == "function" && Error.captureStackTrace(this, wt2);
      }
    };
    a(
      wt,
      "NeonDbError"
    );
    N = wt;
    hi = ["severity", "code", "detail", "hint", "position", "internalPosition", "internalQuery", "where", "schema", "table", "column", "dataType", "constraint", "file", "line", "routine"];
    a(di, "URLFromPgConnectionString");
    a(Ca, "pgConnectionStringFromURL");
    _a = ["connectionString", "user", "username", "password", "host", "hostname", "port", "database"];
    Ta = { database: "pathname", user: "username", host: "hostname" };
    a(pi, "mergeConnectionParams");
    a(yi, "resolveConnectionParams");
    Ge();
    h();
    vt = "pkg:npm/%40neondatabase/serverless@1.2.0";
    ds = we(_t());
    ps = we(rt());
    ls = "transaction() expects an array of queries, or a function returning an array of queries";
    a(Nu, "encodeBuffersAsBytea");
    a(fs, "prepareQuery");
    a(ys, "neon");
    a(hs, "processQueryResult");
    a(Wu, "getAuthToken");
    h();
    h();
    Co = we(ot());
    h();
    Ao = we(ot());
    On = class On2 extends Ao.Client {
      constructor(t) {
        let n = typeof t == "string" ? { connectionString: t } : {
          ...t,
          ...t && "password" in t ? { password: t.password } : {}
        };
        super({ fallback_application_name: vt, ...n });
        E(this, "config", t);
      }
      get neonConfig() {
        return this.connection.stream;
      }
      connect(t) {
        let { neonConfig: n } = this;
        n.forceDisablePgSSL && (this.ssl = this.connection.ssl = false), this.ssl && n.useSecureWebSocket && console.warn("SSL is enabled for both Postgres (e.g. ?sslmode=require in the connection string + forceDisablePgSSL = false) and the WebSocket tunnel (useSecureWebSocket = true). Double encryption will increase latency and CPU usage. It may be appropriate to disable SSL in the Postgres connection parameters or set forceDisablePgSSL = true.");
        let i = typeof this.config != "string" && this.config?.host !== void 0 || typeof this.config != "string" && this.config?.connectionString !== void 0 || y.env.PGHOST !== void 0, s = y.env.USER ?? y.env.USERNAME;
        if (!i && this.host === "localhost" && this.user === s && this.database === s && this.password === null) throw new Error(`No database host or connection string was set, and key parameters have default values (host: localhost, user: ${s}, db: ${s}, password: null). Is an environment variable missing? Alternatively, if you intended to connect with these parameters, please set the host to 'localhost' explicitly.`);
        let o = super.connect(
          t
        ), u = n.pipelineTLS && this.ssl, c = n.pipelineConnect === "password";
        if (!u && !n.pipelineConnect) return o;
        let l = this.connection;
        if (u && l.on("connect", () => l.stream.emit("data", "S")), c) {
          l.removeAllListeners("authenticationCleartextPassword"), l.removeAllListeners("readyForQuery"), l.once("readyForQuery", () => l.on("readyForQuery", this._handleReadyForQuery.bind(this)));
          let f = this.password, m = Promise.resolve(typeof f == "function" ? f() : f), g = this.ssl ? "sslconnect" : "connect";
          l.on(g, () => {
            this.neonConfig.disableWarningInBrowsers || gt(), m.then((w) => {
              this.password = w, this._handleAuthCleartextPassword(), this._handleReadyForQuery();
            }).catch(
              (w) => l.emit("error", w)
            );
          });
        }
        return o;
      }
      async _handleAuthSASLContinue(t) {
        if (typeof crypto > "u" || crypto.subtle === void 0 || crypto.subtle.importKey === void 0) throw new Error("Cannot use SASL auth when `crypto.subtle` is not defined");
        let n = crypto.subtle, i = this.saslSession, s = this.password, o = t.data;
        if (i.message !== "SASLInitialResponse" || typeof s != "string" || typeof o != "string") throw new Error("SASL: protocol error");
        let u = Object.fromEntries(o.split(",").map((J) => {
          if (!/^.=/.test(J)) throw new Error("SASL: Invalid attribute pair entry");
          let ie = J[0], Dt = J.substring(2);
          return [ie, Dt];
        })), c = u.r, l = u.s, f = u.i;
        if (!c || !/^[!-+--~]+$/.test(c))
          throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing/unprintable");
        if (!l || !/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(l)) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing/not base64");
        if (!f || !/^[1-9][0-9]*$/.test(f)) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: missing/invalid iteration count");
        if (!c.startsWith(
          i.clientNonce
        )) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce");
        if (c.length === i.clientNonce.length) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short");
        let m = parseInt(f, 10), g = p.from(l, "base64"), w = new TextEncoder(), S = w.encode(s), k = await n.importKey("raw", S, { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]), D = new Uint8Array(await n.sign("HMAC", k, p.concat([g, p.from([0, 0, 0, 1])]))), he = D;
        for (var I = 0; I < m - 1; I++) D = new Uint8Array(await n.sign("HMAC", k, D)), he = p.from(he.map((J, ie) => he[ie] ^ D[ie]));
        let C = he, re = await n.importKey("raw", C, { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]), ne = new Uint8Array(await n.sign("HMAC", re, w.encode("Client Key"))), H = await n.digest("SHA-256", ne), oe = "n=*,r=" + i.clientNonce, ae = "r=" + c + ",s=" + l + ",i=" + m, me = "c=biws,r=" + c, R = oe + "," + ae + "," + me, $ = await n.importKey("raw", H, { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]);
        var Ee = new Uint8Array(await n.sign("HMAC", $, w.encode(R))), ue = p.from(ne.map((J, ie) => ne[ie] ^ Ee[ie])), Te = ue.toString("base64");
        let ce = await n.importKey("raw", C, { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]), G = await n.sign("HMAC", ce, w.encode("Server Key")), q = await n.importKey("raw", G, { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]);
        var ge = p.from(await n.sign("HMAC", q, w.encode(R)));
        i.message = "SASLResponse", i.serverSignature = ge.toString("base64"), i.response = me + ",p=" + Te, this.connection.sendSCRAMClientFinalMessage(
          this.saslSession.response
        );
      }
    };
    a(On, "NeonClient");
    ut = On;
    Ge();
    _o = we(Lt());
    a(Wl, "promisify");
    Qn = class Qn2 extends Co.Pool {
      constructor() {
        super(...arguments);
        E(this, "Client", ut);
        E(this, "hasFetchUnsupportedListeners", false);
        E(this, "addListener", this.on);
      }
      on(t, n) {
        return t !== "error" && (this.hasFetchUnsupportedListeners = true), super.on(t, n);
      }
      query(t, n, i) {
        if (!pe.poolQueryViaFetch || this.hasFetchUnsupportedListeners || typeof t == "function") return super.query(
          t,
          n,
          i
        );
        typeof n == "function" && (i = n, n = void 0);
        let s = Wl(this.Promise, i);
        i = s.callback;
        try {
          let o = new _o.default(
            this.options
          ), u = encodeURIComponent, c = encodeURI, l = `postgresql://${u(o.user)}:${u(o.password)}@${u(o.host)}/${c(o.database)}`, f = typeof t == "string" ? t : t.text, m = n ?? t.values ?? [];
          ys(l, { fullResults: true, arrayMode: t.rowMode === "array" }).query(f, m, { types: t.types ?? this.options?.types }).then((w) => i(void 0, w)).catch((w) => i(
            w
          ));
        } catch (o) {
          i(o);
        }
        return s.result;
      }
    };
    a(Qn, "NeonPool");
    Ge();
    ct = we(ot());
    h();
    To = we(Ir());
    a(jl, "toConnectionOptions");
    a(Hl, "toClientConfig");
    a(
      $l,
      "parseIntoClientConfig"
    );
    export_DatabaseError = ct.DatabaseError;
    export_defaults = ct.defaults;
    export_escapeIdentifier = ct.escapeIdentifier;
    export_escapeLiteral = ct.escapeLiteral;
    export_types = ct.types;
  }
});

// src/db.ts
function dbEnabled() {
  return client !== null || runner !== null;
}
function breakerOpen() {
  return openUntil > Date.now();
}
function onSuccess() {
  if (failStreak > 0 || openUntil > 0) log("info", "db.recovered", {});
  failStreak = 0;
  openUntil = 0;
  probing = false;
}
function onFailure(reason, message) {
  failStreak += 1;
  probing = false;
  if (failStreak >= TRIP_AT && openUntil <= Date.now()) {
    openUntil = Date.now() + OPEN_MS;
    log("warn", "db.degraded", { breakerMs: OPEN_MS, reason });
  }
  log("warn", "db.query_failed", { reason, failures: failStreak, message });
}
async function sql(query, params = [], opts = {}) {
  if (runner) return runner(query, params);
  if (!client) return { ok: false, reason: "disabled", message: "DATABASE_URL not set" };
  const open = openUntil > Date.now();
  if (open && probing) return { ok: false, reason: "breaker", message: "breaker open" };
  if (open) probing = true;
  const timeoutMs = opts.timeoutMs ?? cfg.dbQueryTimeoutMs;
  const ctrl = new AbortController();
  const timer2 = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const rows = await client.query(query, params, {
      fetchOptions: { signal: ctrl.signal }
    });
    onSuccess();
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (err2) {
    const aborted2 = ctrl.signal.aborted;
    const raw2 = err2 instanceof Error ? err2.message : String(err2);
    const message = raw2.replace(DSN_SHAPED, "[redacted]");
    onFailure(aborted2 ? "timeout" : "error", aborted2 ? `timeout after ${timeoutMs}ms` : message);
    return { ok: false, reason: aborted2 ? "timeout" : "error", message };
  } finally {
    clearTimeout(timer2);
  }
}
function sqlLater(query, params = []) {
  if (!dbEnabled()) return;
  void sql(query, params);
}
var TRIP_AT, OPEN_MS, DSN_SHAPED, client, runner, failStreak, openUntil, probing;
var init_db = __esm({
  "src/db.ts"() {
    "use strict";
    init_serverless();
    init_config();
    init_log();
    TRIP_AT = 5;
    OPEN_MS = 6e4;
    DSN_SHAPED = /postgres(?:ql)?:\/\/\S+/gi;
    client = cfg.databaseUrl ? ys(cfg.databaseUrl) : null;
    runner = null;
    failStreak = 0;
    openUntil = 0;
    probing = false;
  }
});

// src/keys-repo.ts
function toJson(v2) {
  if (v2 === null || v2 === void 0) return null;
  if (typeof v2 === "string") {
    try {
      return JSON.parse(v2);
    } catch {
      return null;
    }
  }
  if (typeof v2 === "object") return v2;
  return null;
}
async function loadKeys() {
  if (!dbEnabled()) return [];
  const res = await sql(
    `select id, masked, provider, label, owner, plan, enabled, fail_count, cooldown_until,
            status, plan_evidence, quota_state, retry_after_at,
            plan_validated_at, last_checked_at, last_used, model_refusals,
            retired_at, retired_reason
       from keys
      where deleted_at is null
      order by id`
  );
  return res.ok ? res.rows.map(toIdentity) : [];
}
async function setCooldown(id, until) {
  if (!dbEnabled()) return;
  await sql(`update keys set cooldown_until = $2 where id = $1`, [id, deadline(until)]);
}
async function upsertKey(identity) {
  if (!dbEnabled()) return;
  await sql(
    `insert into keys (id, masked, provider, plan, label, owner, cooldown_until)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (id) do update
        set masked   = excluded.masked,
            provider = excluded.provider,
            plan     = excluded.plan,
            cooldown_until = greatest(keys.cooldown_until, excluded.cooldown_until)`,
    [
      identity.id,
      identity.masked,
      identity.provider ?? "gemini",
      identity.plan ?? "unknown",
      identity.label ?? null,
      identity.owner ?? null,
      deadline(identity.cooldownUntil ?? 0)
    ]
  );
}
async function purgedIds() {
  if (!dbEnabled()) return [];
  const res = await sql(`select id from keys where deleted_at is not null`);
  return res.ok ? res.rows.map((r) => r.id) : [];
}
async function restoreKeys(ids) {
  if (!dbEnabled() || ids.length === 0) return 0;
  const res = await sql(
    `update keys
        set deleted_at = null,
            enabled = true,
            status = 'unverified',
            retired_at = null,
            retired_reason = null,
            fail_count = 0,
            cooldown_until = null,
            retry_after_at = null,
            last_checked_at = null
      where id = any($1::text[]) and deleted_at is not null
      returning id`,
    [ids]
  );
  return res.ok ? res.rows.length : 0;
}
async function isTombstoned(id) {
  if (!dbEnabled()) return false;
  const res = await sql(
    `select id from keys where id = $1 and deleted_at is not null`,
    [id]
  );
  return res.ok && res.rows.length > 0;
}
async function upsertIdentities(rows) {
  if (!dbEnabled() || rows.length === 0) return 0;
  await sql(
    `insert into keys (id, masked, provider)
     select * from unnest($1::text[], $2::text[], $3::text[])
     on conflict (id) do nothing`,
    [rows.map((r) => r.id), rows.map((r) => r.masked), rows.map((r) => r.provider)]
  );
  return rows.length;
}
async function setPlan(id, plan) {
  if (!dbEnabled()) return;
  await sql(
    `update keys set plan = $2, plan_validated_at = null, plan_evidence = null where id = $1`,
    [id, plan]
  );
}
async function retire(id, observedAt, reason) {
  if (!dbEnabled()) return;
  const at = new Date(observedAt).toISOString();
  await sql(
    `update keys
        set enabled = false,
            status = 'dead',
            retired_at = case when retired_at is null or retired_at < $2::timestamptz
                              then $2::timestamptz else retired_at end,
            retired_reason = case when retired_at is null or retired_at < $2::timestamptz
                                  then $3 else retired_reason end
      where id = $1`,
    [id, at, reason]
  );
}
async function purgeDead() {
  if (!dbEnabled()) return { removed: 0, byReason: {}, ids: [] };
  const FILTER = `status = 'dead' and retired_reason in ('invalid', 'leaked')`;
  const census = await sql(
    `select retired_reason, count(*)::int as n
       from keys
      where ${FILTER}
      group by 1`
  );
  const byReason = {};
  if (census.ok) for (const row of census.rows) byReason[row.retired_reason ?? "unset"] = row.n;
  const ids = await sql(
    `select id from keys where ${FILTER} and deleted_at is null`
  );
  if (!ids.ok || ids.rows.length === 0) return { removed: 0, byReason, ids: [] };
  const doomed = ids.rows.map((r) => r.id);
  await sql(
    `update keys set deleted_at = now(), enabled = false where id = any($1::text[])`,
    [doomed]
  );
  return { removed: doomed.length, byReason, ids: doomed };
}
async function revive(id, observedAt, status) {
  if (!dbEnabled()) return;
  await sql(
    `update keys
        set enabled = true,
            status = $3,
            retired_at = null,
            retired_reason = null
      where id = $1
        and (retired_at is null or retired_at < $2::timestamptz)`,
    [id, new Date(observedAt).toISOString(), status]
  );
}
async function setStatus(id, status, observedAt) {
  if (!dbEnabled()) return;
  await sql(
    `update keys set status = $2
      where id = $1
        and (retired_at is null or retired_at < $3::timestamptz)`,
    [id, status, new Date(observedAt).toISOString()]
  );
}
async function setQuotaState(id, quota) {
  if (!dbEnabled()) return;
  await sql(`update keys set quota_state = $2::jsonb where id = $1`, [
    id,
    quota === null ? null : JSON.stringify(quota)
  ]);
}
async function setModelRefusals(id, refusals) {
  if (!dbEnabled()) return;
  await sql(`update keys set model_refusals = $2::jsonb where id = $1`, [
    id,
    JSON.stringify(refusals)
  ]);
}
async function setRetryAfter(id, at) {
  if (!dbEnabled()) return;
  await sql(`update keys set retry_after_at = $2 where id = $1`, [id, deadline(at)]);
}
async function setLastCheckedAt(id, at) {
  if (!dbEnabled()) return;
  const stamp = at > 0 ? new Date(at).toISOString() : null;
  await sql(`update keys set last_checked_at = $2 where id = $1`, [id, stamp]);
}
async function setLastUsed(id, at) {
  if (!dbEnabled()) return;
  const stamp = at > 0 ? new Date(at).toISOString() : null;
  await sql(`update keys set last_used = $2 where id = $1`, [id, stamp]);
}
async function setValidatedPlan(id, plan, evidence) {
  if (!dbEnabled()) return;
  await sql(
    `update keys
        set plan = $2,
            plan_evidence = $3::jsonb,
            plan_validated_at = now()
      where id = $1`,
    [id, plan, JSON.stringify(evidence)]
  );
}
async function touchLastSeen(id) {
  if (!dbEnabled()) return;
  await sql(`update keys set last_seen_at = now() where id = $1`, [id]);
}
async function bumpFailCount(id) {
  if (!dbEnabled()) return;
  await sql(`update keys set fail_count = fail_count + 1 where id = $1`, [id]);
}
async function deleteKey(id) {
  if (!dbEnabled()) return;
  await sql(`delete from keys where id = $1`, [id]);
  await sql(`delete from key_material where id = $1`, [id]);
}
var isTier, STATUSES, isStatus, toEpoch, toIdentity, deadline;
var init_keys_repo = __esm({
  "src/keys-repo.ts"() {
    "use strict";
    init_db();
    isTier = (v2) => v2 === "free" || v2 === "paid" || v2 === "pro";
    STATUSES = [
      "unknown",
      "ready",
      "cooling",
      "quota_exhausted",
      "dead",
      "unverified"
    ];
    isStatus = (v2) => STATUSES.includes(v2);
    toEpoch = (v2) => {
      if (!v2) return 0;
      const t = v2 instanceof Date ? v2.getTime() : Date.parse(v2);
      return Number.isFinite(t) ? t : 0;
    };
    toIdentity = (r) => ({
      id: r.id,
      masked: r.masked,
      provider: typeof r.provider === "string" && r.provider.trim() ? r.provider.trim() : "gemini",
      plan: isTier(r.plan) ? r.plan : "unknown",
      enabled: r.enabled,
      label: r.label,
      owner: r.owner,
      failCount: Number(r.fail_count) || 0,
      cooldownUntil: toEpoch(r.cooldown_until),
      status: r.status !== null && isStatus(r.status) ? r.status : "unknown",
      planValidated: toEpoch(r.plan_validated_at) > 0,
      planEvidence: toJson(r.plan_evidence),
      quota: toJson(r.quota_state),
      retryAfterAt: toEpoch(r.retry_after_at),
      lastCheckedAt: toEpoch(r.last_checked_at),
      lastUsed: toEpoch(r.last_used),
      modelRefusals: toJson(r.model_refusals) ?? {},
      retiredAt: toEpoch(r.retired_at),
      retiredReason: r.retired_reason
    });
    deadline = (at) => at > Date.now() ? new Date(at).toISOString() : null;
  }
});

// src/key-material.ts
function materialEnabled() {
  return dbEnabled();
}
async function loadMaterial() {
  const out = /* @__PURE__ */ new Map();
  if (!dbEnabled()) return out;
  const res = await sql(
    /* A tombstoned key (purge-dead) keeps its material for restore, but must
       never be seeded back into a pool. */
    `select m.id, m.raw_key from key_material m
       left join keys k on k.id = m.id
      where k.deleted_at is null`
  );
  if (!res.ok) {
    log("warn", "key_material.load_failed", { reason: res.reason });
    return out;
  }
  for (const row of res.rows) {
    const raw2 = typeof row.raw_key === "string" ? row.raw_key.trim() : "";
    if (!raw2) continue;
    out.set(row.id, raw2);
  }
  return out;
}
async function loadMaterialEntries() {
  const out = /* @__PURE__ */ new Map();
  if (!dbEnabled()) return out;
  const res = await sql(
    `select m.id, m.raw_key, m.provider from key_material m
       left join keys k on k.id = m.id
      where k.deleted_at is null`
  );
  if (!res.ok) {
    log("warn", "key_material.load_failed", { reason: res.reason });
    return out;
  }
  for (const row of res.rows) {
    const raw2 = typeof row.raw_key === "string" ? row.raw_key.trim() : "";
    if (!raw2) continue;
    const provider = typeof row.provider === "string" && row.provider.trim() ? row.provider.trim() : "gemini";
    out.set(row.id, { raw: raw2, provider });
  }
  return out;
}
async function saveMaterialNow(id, raw2, provider = "gemini") {
  if (!dbEnabled()) return;
  await sql(
    `insert into key_material (id, raw_key, provider) values ($1, $2, $3)
     on conflict (id) do update
       set raw_key = excluded.raw_key, provider = excluded.provider, updated_at = now()`,
    [id, raw2, provider]
  );
}
function deleteMaterial(id) {
  if (!dbEnabled()) return;
  sqlLater(`delete from key_material where id = $1`, [id]);
}
var init_key_material = __esm({
  "src/key-material.ts"() {
    "use strict";
    init_db();
    init_log();
  }
});

// src/providers.ts
function builtinProviders() {
  return BUILTIN.map((p2) => ({ ...p2, capabilities: [...p2.capabilities], models: [...p2.models] }));
}
function baseUrlOf(p2) {
  if (p2.baseUrl) return p2.baseUrl.replace(/\/+$/, "");
  if (p2.id === "gemini") return cfg.upstream.replace(/\/+$/, "");
  if (p2.id === "elevenlabs") return "https://api.elevenlabs.io";
  return "";
}
function envKeyVar(id) {
  return `${id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEYS`;
}
async function loadRegistry() {
  const builtin = builtinProviders();
  const byId = new Map(builtin.map((p2) => [p2.id, p2]));
  if (!dbEnabled()) {
    for (const [id, p2] of customStore) byId.set(id, p2);
    return [...byId.values()];
  }
  const res = await sql(
    `select id, label, base_url, capabilities, wire, key_pattern, models, enabled, builtin, note
       from providers
      order by builtin desc, id`
  );
  if (!res.ok) {
    for (const [id, p2] of customStore) byId.set(id, p2);
    return [...byId.values()];
  }
  for (const row of res.rows) {
    const p2 = toProvider(row);
    const hit = byId.get(p2.id);
    if (hit) {
      hit.enabled = p2.enabled;
      hit.models = p2.models;
      continue;
    }
    byId.set(p2.id, p2);
  }
  return [...byId.values()];
}
async function allProviders(force = false) {
  const fresh = Date.now() - registryLoadedAt < REGISTRY_TTL_MS;
  if (!force && fresh) return registry;
  try {
    registry = await loadRegistry();
    registryLoadedAt = Date.now();
  } catch (err2) {
    log("warn", "providers.load_failed", { error: err2 instanceof Error ? err2.message : String(err2) });
  }
  return registry;
}
async function getProvider(id) {
  return (await allProviders()).find((p2) => p2.id === id) ?? null;
}
async function providersWith(cap) {
  return (await allProviders()).filter((p2) => p2.enabled && p2.capabilities.includes(cap));
}
function validateInput(input) {
  const id = (input.id ?? "").trim();
  if (!ID_RE.test(id)) {
    return "`id` must be 2-41 chars: lowercase letters, digits and dashes, starting with a letter.";
  }
  if (!(input.label ?? "").trim()) return "`label` is required.";
  const base = (input.baseUrl ?? "").trim();
  if (!/^https?:\/\/[^\s]+$/.test(base)) return "`baseUrl` must be an http(s) URL.";
  const caps = input.capabilities ?? [];
  if (!Array.isArray(caps) || caps.length === 0) return "Pick at least one capability.";
  if (!caps.every(isCapability)) return `Unknown capability. Valid: ${CAPABILITIES.join(", ")}.`;
  if (input.keyPattern) {
    try {
      new RegExp(input.keyPattern);
    } catch {
      return "`keyPattern` is not a valid regular expression.";
    }
  }
  return null;
}
async function registerProvider(input) {
  const problem = validateInput(input);
  if (problem) throw new Error(problem);
  const id = input.id.trim();
  if (builtinProviders().some((p2) => p2.id === id)) {
    throw new Error(`\`${id}\` is a builtin provider and cannot be redefined.`);
  }
  const provider = {
    id,
    label: input.label.trim(),
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    capabilities: [...new Set(input.capabilities)],
    wire: "openai",
    keyPattern: input.keyPattern?.trim() || void 0,
    models: [...new Set((input.models ?? []).map((m) => m.trim()).filter(Boolean))],
    builtin: false,
    enabled: true,
    note: (input.note ?? "").trim()
  };
  if (dbEnabled()) {
    const res = await sql(
      `insert into providers (id, label, base_url, capabilities, wire, key_pattern, models, enabled, builtin, note)
       values ($1, $2, $3, $4::text[], $5, $6, $7::text[], true, false, $8)
       on conflict (id) do update
          set label = excluded.label,
              base_url = excluded.base_url,
              capabilities = excluded.capabilities,
              wire = excluded.wire,
              key_pattern = excluded.key_pattern,
              models = excluded.models,
              note = excluded.note`,
      [
        provider.id,
        provider.label,
        provider.baseUrl,
        provider.capabilities,
        provider.wire,
        provider.keyPattern ?? null,
        provider.models,
        provider.note
      ]
    );
    if (!res.ok) throw new Error(res.message || "Could not persist the provider.");
  }
  registry = [...registry.filter((p2) => p2.id !== id), provider];
  customStore.set(id, provider);
  registryLoadedAt = Date.now();
  log("info", "providers.registered", { id: provider.id, capabilities: provider.capabilities });
  return provider;
}
async function updateProvider(id, patch) {
  const current = (await allProviders()).find((p2) => p2.id === id);
  if (!current) return null;
  const next = { ...current, capabilities: [...current.capabilities], models: [...current.models] };
  if (patch.enabled !== void 0) next.enabled = Boolean(patch.enabled);
  if (patch.models !== void 0) {
    next.models = [...new Set(patch.models.map((m) => m.trim()).filter(Boolean))];
  }
  if (!current.builtin) {
    if (patch.label !== void 0 && patch.label.trim()) next.label = patch.label.trim();
    if (patch.baseUrl !== void 0) {
      if (!/^https?:\/\/[^\s]+$/.test(patch.baseUrl.trim())) {
        throw new Error("`baseUrl` must be an http(s) URL.");
      }
      next.baseUrl = patch.baseUrl.trim().replace(/\/+$/, "");
    }
    if (patch.capabilities !== void 0) {
      if (!patch.capabilities.length || !patch.capabilities.every(isCapability)) {
        throw new Error(`Pick at least one valid capability (${CAPABILITIES.join(", ")}).`);
      }
      next.capabilities = [...new Set(patch.capabilities)];
    }
    if (patch.keyPattern !== void 0) {
      const src = (patch.keyPattern ?? "").trim();
      if (src) {
        try {
          new RegExp(src);
        } catch {
          throw new Error("`keyPattern` is not a valid regular expression.");
        }
      }
      next.keyPattern = src || void 0;
    }
    if (patch.note !== void 0) next.note = patch.note.trim();
  }
  if (dbEnabled()) {
    const res = await sql(
      `update providers
          set label = $2, base_url = $3, capabilities = $4::text[], wire = $5,
              key_pattern = $6, models = $7::text[], enabled = $8, builtin = $9, note = $10
        where id = $1`,
      [
        next.id,
        next.label,
        next.baseUrl,
        next.capabilities,
        next.wire,
        next.keyPattern ?? null,
        next.models,
        next.enabled,
        next.builtin,
        next.note
      ]
    );
    if (!res.ok) throw new Error(res.message || "Could not update the provider.");
  }
  registry = registry.map((p2) => p2.id === id ? next : p2);
  if (!next.builtin) customStore.set(id, next);
  registryLoadedAt = Date.now();
  log("info", "providers.updated", { id, enabled: next.enabled, models: next.models.length });
  return next;
}
async function removeProvider(id) {
  const current = (await allProviders()).find((p2) => p2.id === id);
  if (!current) return { ok: false, error: "No provider with that id." };
  if (current.builtin) return { ok: false, error: "Builtin providers cannot be removed." };
  const { listKeys: listKeys2 } = await Promise.resolve().then(() => (init_pool(), pool_exports));
  const attached = (await listKeys2(id)).length;
  if (attached > 0) {
    return { ok: false, error: `${attached} pooled key(s) still belong to this provider. Remove them first.` };
  }
  if (dbEnabled()) {
    const res = await sql(`delete from providers where id = $1`, [id]);
    if (!res.ok) return { ok: false, error: res.message || "Delete failed." };
  }
  registry = registry.filter((p2) => p2.id !== id);
  customStore.delete(id);
  registryLoadedAt = Date.now();
  log("info", "providers.removed", { id });
  return { ok: true };
}
function detectProvider(key, providers) {
  const k = (key ?? "").trim();
  if (!k) return null;
  const ranked = providers.filter((p2) => p2.keyPattern).map((p2) => ({ p: p2, re: new RegExp(p2.keyPattern) })).sort((a2, b2) => b2.p.keyPattern.length - a2.p.keyPattern.length);
  for (const { p: p2, re } of ranked) {
    if (re.test(k)) return p2.id;
  }
  return null;
}
function keyShapeError(key, provider) {
  if (!provider.keyPattern) return null;
  const k = (key ?? "").trim();
  if (!k) return "is empty";
  try {
    if (new RegExp(provider.keyPattern).test(k)) return null;
  } catch {
    return null;
  }
  return `does not match the \`${provider.id}\` key format`;
}
async function refreshCatalog(provider, rawKey) {
  if (provider.wire !== "openai") return [];
  const base = baseUrlOf(provider);
  if (!base) return [];
  let key = rawKey ?? "";
  if (!key) {
    const { pick: pick2, rawKeyById: rawKeyById3 } = await Promise.resolve().then(() => (init_pool(), pool_exports));
    const st = await pick2(/* @__PURE__ */ new Set(), void 0, provider.id);
    if (!st) return [];
    key = await rawKeyById3(st.key) || st.key;
  }
  try {
    const res = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) return [];
    const payload = await res.json();
    const ids = (payload.data ?? []).map((m) => String(m.id ?? "").trim()).filter(Boolean);
    catalogCache.set(provider.id, { at: Date.now(), ids: new Set(ids) });
    return ids;
  } catch {
    return [];
  }
}
function knownModels(p2) {
  const set = new Set(p2.models);
  const live = catalogCache.get(p2.id);
  if (live && Date.now() - live.at < CATALOG_TTL_MS) {
    for (const id of live.ids) set.add(id);
  }
  return set;
}
function resolveModel(model, providers) {
  const raw2 = (model ?? "").trim();
  const slash = raw2.indexOf("/");
  if (slash > 0) {
    const head = raw2.slice(0, slash);
    const hit = providers.find((p2) => p2.id === head);
    if (hit) return { provider: hit.id, model: raw2.slice(slash + 1), explicit: true };
  }
  if (ELEVENLABS_MODEL_RE.test(raw2)) return { provider: "elevenlabs", model: raw2, explicit: false };
  if (/^gemini/i.test(raw2)) return { provider: "gemini", model: raw2, explicit: false };
  for (const p2 of providers) {
    if (!p2.enabled || p2.id === "gemini") continue;
    if (knownModels(p2).has(raw2)) return { provider: p2.id, model: raw2, explicit: false };
  }
  return { provider: "gemini", model: raw2, explicit: false };
}
async function resolveModelRoute(model) {
  const providers = await allProviders();
  const direct = resolveModel(model, providers);
  const needsLookup = !direct.explicit && direct.provider === "gemini" && !/^gemini/i.test(model ?? "") && !ELEVENLABS_MODEL_RE.test(model ?? "");
  if (needsLookup) {
    await Promise.all(
      providers.filter((p2) => p2.enabled && p2.wire === "openai" && p2.id !== "gemini").map((p2) => refreshCatalog(p2))
    );
    return resolveModel(model, providers);
  }
  return direct;
}
async function providerViews() {
  const providers = await allProviders();
  let counts = /* @__PURE__ */ new Map();
  try {
    const { listKeys: listKeys2 } = await Promise.resolve().then(() => (init_pool(), pool_exports));
    for (const k of await listKeys2()) {
      const acc = counts.get(k.provider) ?? { keys: 0, ready: 0 };
      acc.keys++;
      if (k.status === "ready") acc.ready++;
      counts.set(k.provider, acc);
    }
  } catch {
  }
  return providers.map((p2) => ({ ...p2, ...counts.get(p2.id) ?? { keys: 0, ready: 0 } }));
}
var CAPABILITIES, CAPABILITY_LABEL, ELEVENLABS_KEY_SOURCE, BUILTIN, isCapability, isWire, toStringArray, toProvider, registry, registryLoadedAt, REGISTRY_TTL_MS, customStore, ID_RE, ELEVENLABS_MODEL_RE, catalogCache, CATALOG_TTL_MS;
var init_providers = __esm({
  "src/providers.ts"() {
    "use strict";
    init_config();
    init_db();
    init_log();
    CAPABILITIES = ["llm", "tts", "image", "video", "embeddings"];
    CAPABILITY_LABEL = {
      llm: "LLM",
      tts: "TTS",
      image: "Image",
      video: "Video",
      embeddings: "Embeddings"
    };
    ELEVENLABS_KEY_SOURCE = "^sk_[a-fA-F0-9]{48}$";
    BUILTIN = [
      {
        id: "gemini",
        label: "Gemini",
        baseUrl: "",
        capabilities: ["llm", "tts", "image", "embeddings"],
        wire: "gemini",
        /* Two live formats: the classic `AIza…` key and the newer `AQ.…` key AI
           Studio issues today (53 chars). Both answer generateContent; a pattern
           that only knew the first left 62 working keys undetectable. */
        keyPattern: "^(?:AIza[0-9A-Za-z_-]{20,}|AQ\\.[0-9A-Za-z_-]{20,})$",
        models: [],
        builtin: true,
        enabled: true,
        note: "Google Generative Language. Chat, TTS, image and embeddings."
      },
      {
        id: "elevenlabs",
        label: "ElevenLabs",
        baseUrl: "",
        capabilities: ["tts"],
        wire: "elevenlabs",
        keyPattern: ELEVENLABS_KEY_SOURCE,
        models: [],
        builtin: true,
        enabled: true,
        note: "Text to speech and voices, routed by model name on /v1/audio/speech."
      },
      {
        id: "groq",
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        capabilities: ["llm"],
        wire: "openai",
        /* `gsk_` plus 52 alphanumerics today. The prefix is distinctive, so the
           bounds stay loose: a stricter length would reject a real key the day
           Groq changes it, and nothing else in the registry uses `gsk_`. */
        keyPattern: "^gsk_[A-Za-z0-9]{40,64}$",
        models: [],
        builtin: true,
        enabled: true,
        note: "OpenAI-compatible chat completions. Fast, rate-limited per key."
      },
      {
        id: "cerebras",
        label: "Cerebras",
        baseUrl: "https://api.cerebras.ai/v1",
        capabilities: ["llm"],
        wire: "openai",
        keyPattern: "^csk-[A-Za-z0-9]{32,64}$",
        models: [],
        builtin: true,
        enabled: true,
        note: "OpenAI-compatible inference on wafer-scale hardware."
      },
      {
        id: "openrouter",
        label: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        capabilities: ["llm"],
        wire: "openai",
        /* Longer than the generic `sk-…` gateway pattern, so detection prefers
           this provider for `sk-or-v1-…` keys (longest pattern wins). */
        keyPattern: "^sk-or-v1-[A-Za-z0-9]{48,80}$",
        models: [],
        builtin: true,
        enabled: true,
        note: "OpenAI-compatible gateway; model ids carry the upstream vendor."
      }
    ];
    isCapability = (v2) => CAPABILITIES.includes(v2);
    isWire = (v2) => v2 === "openai" || v2 === "gemini" || v2 === "elevenlabs";
    toStringArray = (v2) => {
      if (Array.isArray(v2)) return v2.filter((x2) => typeof x2 === "string");
      if (typeof v2 === "string") {
        try {
          const parsed = JSON.parse(v2);
          if (Array.isArray(parsed)) return parsed.filter((x2) => typeof x2 === "string");
        } catch {
        }
      }
      return [];
    };
    toProvider = (r) => ({
      id: r.id,
      label: r.label || r.id,
      baseUrl: r.base_url ?? "",
      capabilities: toStringArray(r.capabilities).filter(isCapability),
      wire: r.wire && isWire(r.wire) ? r.wire : "openai",
      keyPattern: typeof r.key_pattern === "string" && r.key_pattern ? r.key_pattern : void 0,
      models: toStringArray(r.models),
      builtin: Boolean(r.builtin),
      enabled: r.enabled !== false,
      note: r.note ?? ""
    });
    registry = builtinProviders();
    registryLoadedAt = 0;
    REGISTRY_TTL_MS = 15e3;
    customStore = /* @__PURE__ */ new Map();
    ID_RE = /^[a-z][a-z0-9-]{1,40}$/;
    ELEVENLABS_MODEL_RE = /^(eleven[_-]|elevenlabs|tts-1|eleven_)/i;
    catalogCache = /* @__PURE__ */ new Map();
    CATALOG_TTL_MS = 6e5;
  }
});

// src/pool.ts
var pool_exports = {};
__export(pool_exports, {
  KEY_TIERS: () => KEY_TIERS,
  addKey: () => addKey,
  backfillMaterial: () => backfillMaterial,
  deadKeys: () => deadKeys,
  dropLocal: () => dropLocal,
  flushPoolWrites: () => flushPoolWrites,
  forgetDead: () => forgetDead,
  hydrate: () => hydrate,
  keyId: () => keyId,
  keyMaterialDurable: () => keyMaterialDurable,
  keySnapshots: () => keySnapshots,
  listKeys: () => listKeys,
  mark429: () => mark429,
  markHealthy: () => markHealthy,
  markInvalid: () => markInvalid,
  markModelRefused: () => markModelRefused,
  markQuotaExhausted: () => markQuotaExhausted,
  markSoftError: () => markSoftError,
  markUnverified: () => markUnverified,
  markUsed: () => markUsed,
  markValidatedPlan: () => markValidatedPlan,
  maskKey: () => maskKey,
  modelBlock: () => modelBlock,
  modelRefused: () => modelRefused,
  pick: () => pick,
  poolSize: () => poolSize,
  providerCounts: () => providerCounts,
  rawKeyById: () => rawKeyById,
  readyCount: () => readyCount,
  removeKey: () => removeKey,
  removeKeyById: () => removeKeyById,
  setKeyTier: () => setKeyTier,
  setTierById: () => setTierById,
  snapshot: () => snapshot,
  storageMode: () => storageMode,
  tierCounts: () => tierCounts
});
import { createHash } from "node:crypto";
function maskKey(k) {
  if (k.length <= 4) return "*".repeat(k.length);
  if (k.length <= 12) return `${k.slice(0, 2)}\u2026${k.slice(-2)}`;
  return `${k.slice(0, 6)}\u2026${k.slice(-4)}`;
}
function keyId(k) {
  return createHash("sha256").update(k).digest("hex").slice(0, 12);
}
function later(fn) {
  if (!dbEnabled()) return;
  queueMicrotask(() => {
    const p2 = fn().catch((err2) => {
      log("warn", "pool.persist_failed", {
        error: err2 instanceof Error ? err2.message : String(err2)
      });
    }).finally(() => pendingWrites.delete(p2));
    pendingWrites.add(p2);
  });
}
async function flushPoolWrites() {
  await new Promise((resolve) => queueMicrotask(resolve));
  while (pendingWrites.size > 0) {
    await Promise.allSettled([...pendingWrites]);
  }
}
async function backfillMaterial() {
  if (!materialEnabled()) return 0;
  let have;
  try {
    have = /* @__PURE__ */ new Set([...(await loadMaterial()).keys()]);
  } catch {
    return 0;
  }
  let written = 0;
  for (const [raw2, st] of local) {
    if (st.invalid) continue;
    const id = keyId(raw2);
    if (have.has(id)) continue;
    await saveMaterialNow(id, raw2, st.provider);
    written++;
  }
  if (written) log("info", "key_material.backfilled", { written });
  return written;
}
function dropLocal(ids) {
  const doomed = new Set(ids);
  if (doomed.size === 0) return 0;
  let dropped2 = 0;
  for (const [raw2, st] of local) {
    if (!doomed.has(keyId(st.key ?? raw2))) continue;
    local.delete(raw2);
    dropped2++;
  }
  return dropped2;
}
function poolSize() {
  return local.size;
}
function readyCount() {
  const t = now();
  let n = 0;
  for (const s of local.values()) if (selectable(s, t)) n++;
  return n;
}
function persistIdentity(st, cooldownUntil = 0) {
  const id = keyId(st.key);
  const masked = maskKey(st.key);
  const plan = st.tier;
  const provider = st.provider;
  later(() => upsertKey({ id, masked, plan, provider, cooldownUntil }));
}
function persistHealth(st, observedAt = now()) {
  const id = keyId(st.key);
  if (st.invalid || st.status === "dead") {
    const at = st.retiredAt || observedAt;
    const reason = st.retiredReason === "leaked" || st.retiredReason === "zero_quota" ? st.retiredReason : "invalid";
    later(() => retire(id, at, reason));
    return;
  }
  later(() => touchLastSeen(id));
  if (st.failures > 0) later(() => bumpFailCount(id));
  later(() => setStatus(id, st.status, observedAt));
  later(() => setCooldown(id, st.cooldownUntil));
  if (st.retryAfterAt > 0) later(() => setRetryAfter(id, st.retryAfterAt));
  if (st.quota) later(() => setQuotaState(id, st.quota));
  if (Object.keys(st.modelRefusals).length > 0) {
    later(() => setModelRefusals(id, st.modelRefusals));
  }
  if (st.lastCheckedAt > 0) later(() => setLastCheckedAt(id, st.lastCheckedAt));
  if (st.lastUsed > 0) later(() => setLastUsed(id, st.lastUsed));
}
function seed(key, provider = "gemini") {
  if (!local.has(key)) local.set(key, blank(key, provider));
}
async function hydrate() {
  const providers = await allProviders();
  for (const p2 of providers) {
    const env = (process.env[envKeyVar(p2.id)] ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    for (const k of env) seed(k, p2.id);
  }
  if (!dbEnabled()) {
    log("info", "pool.hydrated", { source: "env", keys: local.size, material: 0 });
    return local.size;
  }
  let material = 0;
  const entries = materialEnabled() ? await loadMaterialEntries() : /* @__PURE__ */ new Map();
  for (const entry of entries.values()) {
    seed(entry.raw, entry.provider);
    material++;
  }
  const rows = await loadKeys();
  const byId = new Map([...local.values()].map((s) => [keyId(s.key), s]));
  for (const row of rows) {
    const hit = byId.get(row.id);
    if (!hit) continue;
    hit.provider = row.provider || "gemini";
    hit.tier = row.plan;
    hit.failures = Math.max(hit.failures, row.failCount);
    if (row.planValidated) {
      hit.planValidated = true;
      hit.planEvidence = row.planEvidence;
    }
    if (row.quota) hit.quota = row.quota;
    for (const [m, until] of Object.entries(row.modelRefusals)) {
      if (until > (hit.modelRefusals[m] ?? 0)) hit.modelRefusals[m] = until;
    }
    if (row.lastCheckedAt > 0) hit.lastCheckedAt = row.lastCheckedAt;
    if (row.lastUsed > 0) hit.lastUsed = row.lastUsed;
    hit.retiredAt = row.retiredAt;
    hit.retiredReason = row.retiredReason;
    if (!row.enabled || row.status === "dead") {
      hit.invalid = true;
      hit.status = "dead";
      hit.cooldownUntil = Number.MAX_SAFE_INTEGER;
      hit.retiredAt = row.retiredAt || 1;
      if (!hit.retiredReason) hit.retiredReason = "invalid";
    } else {
      hit.status = row.status;
      if (row.cooldownUntil > now()) hit.cooldownUntil = Math.max(hit.cooldownUntil, row.cooldownUntil);
    }
  }
  const purged = await purgedIds();
  if (purged.length > 0) {
    const dropped2 = dropLocal(purged);
    if (dropped2 > 0) log("info", "pool.tombstoned_skipped", { purged: purged.length, dropped: dropped2 });
  }
  const known = new Set(rows.map((r) => r.id));
  const orphans = [...entries.entries()].filter(([id]) => !known.has(id)).map(([id, e]) => ({ id, masked: maskKey(e.raw), provider: e.provider }));
  const envOnly = [...local.values()].filter((s) => {
    const id = keyId(s.key);
    return !known.has(id) && !entries.has(id);
  }).map((s) => ({ id: keyId(s.key), masked: maskKey(s.key), provider: s.provider }));
  const missing = [...orphans, ...envOnly];
  if (missing.length > 0) {
    const written = await upsertIdentities(missing);
    log("info", "pool.identities_backfilled", { written, material: orphans.length, env: envOnly.length });
  }
  log("info", "pool.hydrated", {
    source: "postgres+env",
    keys: local.size,
    rows: rows.length,
    material,
    orphans: orphans.length,
    envIdentities: envOnly.length
  });
  return local.size;
}
function keyMaterialDurable() {
  return materialEnabled();
}
async function addKey(key, provider = "gemini", cooldownUntil = 0) {
  const k = key.trim();
  if (!k) return false;
  const p2 = (provider || "").trim() || "gemini";
  const cur = local.get(k);
  if (cur && !cur.invalid) return false;
  if (await isTombstoned(keyId(k))) {
    log("warn", "key.tombstoned_rejected", { key: maskKey(k), provider: p2 });
    return false;
  }
  const st = blank(k, p2);
  if (Number.isFinite(cooldownUntil) && cooldownUntil > now()) {
    st.cooldownUntil = cooldownUntil;
    st.retryAfterAt = cooldownUntil;
  }
  local.set(k, st);
  persistIdentity(st, st.cooldownUntil);
  await saveMaterialNow(keyId(k), k, p2);
  return true;
}
async function removeKey(key) {
  const k = key.trim();
  const had = local.delete(k);
  if (had) {
    const id = keyId(k);
    later(() => deleteKey(id));
    deleteMaterial(id);
  }
  return had;
}
function forgetDead() {
  let dropped2 = 0;
  for (const [raw2, st] of local) {
    if (st.status === "dead" || st.invalid) {
      local.delete(raw2);
      dropped2++;
    }
  }
  return dropped2;
}
async function removeKeyById(id) {
  const hit = [...local.values()].find((s) => keyId(s.key) === id);
  if (!hit) return false;
  return removeKey(hit.key);
}
async function setKeyTier(key, tier) {
  const st = local.get(key);
  if (!st) return false;
  st.tier = tier;
  const id = keyId(key);
  later(() => setPlan(id, tier));
  return true;
}
async function setTierById(id, tier) {
  const raw2 = await rawKeyById(id);
  if (!raw2) return false;
  return setKeyTier(raw2, tier);
}
async function rawKeyById(id) {
  const hit = [...local.values()].find((s) => keyId(s.key) === id);
  return hit ? hit.key : null;
}
function selectable(s, t, model, provider) {
  if (provider && (s.provider || "gemini") !== provider) return false;
  if (s.invalid || s.status === "dead" || s.status === "unverified") return false;
  if (s.lastUsed > 0 && t - s.lastUsed < cfg.rateWindowMs) return false;
  if (model && (s.modelRefusals[model] ?? 0) > t) return false;
  if (s.status === "quota_exhausted") return s.retryAfterAt > 0 && s.retryAfterAt <= t;
  return s.cooldownUntil <= t && s.retryAfterAt <= t;
}
function refreshFromDurable() {
  const t = Date.now();
  if (hydrating) return hydrating;
  if (t - lastHydrateAt < HYDRATE_REFRESH_MS) return null;
  lastHydrateAt = t;
  hydrating = hydrate().then(() => void 0).catch((err2) => {
    log("warn", "pool.refresh_failed", { error: err2 instanceof Error ? err2.message : String(err2) });
  }).finally(() => {
    hydrating = null;
  });
  return hydrating;
}
async function pick(exclude = /* @__PURE__ */ new Set(), model, provider) {
  const t = now();
  const ready = [...local.values()].filter((s) => !exclude.has(s.key) && selectable(s, t, model, provider));
  if (ready.length === 0) {
    const pending2 = refreshFromDurable();
    if (pending2) await pending2;
    const t2 = now();
    const retry = [...local.values()].filter((s) => !exclude.has(s.key) && selectable(s, t2, model, provider));
    if (retry.length === 0) return null;
    retry.sort((a2, b2) => a2.failures - b2.failures || a2.lastUsed - b2.lastUsed);
    return retry[0];
  }
  ready.sort((a2, b2) => a2.failures - b2.failures || a2.lastUsed - b2.lastUsed);
  return ready[0];
}
function modelBlock(exclude, model, provider) {
  const t = now();
  const refused = [];
  const parked = [];
  let untried = false;
  for (const s of local.values()) {
    if (provider && (s.provider || "gemini") !== provider) continue;
    if (s.invalid || s.status === "dead" || s.status === "unverified") continue;
    if ((s.modelRefusals[model] ?? 0) > t) {
      refused.push(s.key);
      continue;
    }
    if (exclude.has(s.key)) continue;
    if (s.status === "quota_exhausted") {
      parked.push(s.key);
      continue;
    }
    untried = true;
  }
  if (untried) return { kind: "none", keys: [] };
  if (refused.length > 0) return { kind: "model_refusal", keys: refused };
  if (parked.length > 0) return { kind: "quota", keys: parked };
  return { kind: "blocked", keys: [] };
}
async function markUsed(key) {
  const st = local.get(key);
  if (!st) return;
  st.lastUsed = now();
  persistHealth(st);
}
async function mark429(key, cooldownMs, quota, observedAt = now()) {
  const st = local.get(key) ?? blank(key);
  if (outranked(st, observedAt)) {
    st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
    local.set(key, st);
    persistHealth(st, observedAt);
    return;
  }
  st.failures += 1;
  st.invalidations += 1;
  st.cooldownUntil = now() + cooldownMs;
  st.retryAfterAt = st.cooldownUntil;
  st.invalid = false;
  st.retiredAt = 0;
  st.retiredReason = null;
  st.status = "cooling";
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  if (quota !== void 0) st.quota = quota;
  if (quota?.freeTier || quota?.quotaId || quota?.consumer) {
    st.planEvidence = quota ? tierFromQuota(quota) : st.planEvidence;
  }
  counters.cooldowns++;
  local.set(key, st);
  persistHealth(st, observedAt);
  later(() => revive(keyId(key), observedAt, "cooling"));
}
async function markQuotaExhausted(key, quota, observedAt = now()) {
  const st = local.get(key) ?? blank(key);
  if (outranked(st, observedAt)) {
    st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
    local.set(key, st);
    persistHealth(st, observedAt);
    log("warn", "key.quota_after_retirement", { key: maskKey(key) });
    return;
  }
  st.failures += 1;
  st.status = "quota_exhausted";
  st.quota = quota;
  st.retryAfterAt = quota?.retryAfterMs ? now() + quota.retryAfterMs : 0;
  st.cooldownUntil = st.retryAfterAt;
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  st.invalid = false;
  st.retiredAt = 0;
  st.retiredReason = null;
  if (quota) st.planEvidence = tierFromQuota(quota);
  local.set(key, st);
  persistHealth(st, observedAt);
  later(() => revive(keyId(key), observedAt, "quota_exhausted"));
}
async function markModelRefused(key, model, quota, observedAt = now()) {
  const st = local.get(key) ?? blank(key);
  const until = quota?.retryAfterMs ? now() + quota.retryAfterMs : 0;
  st.modelRefusals[model] = until > 0 ? until : endOfUtcDay();
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  if (!outranked(st, observedAt)) st.invalid = false;
  if (quota) {
    st.quota = quota;
    st.planEvidence = tierFromQuota(quota);
  }
  local.set(key, st);
  persistHealth(st, observedAt);
}
function endOfUtcDay() {
  const d = new Date(now());
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}
function modelRefused(key, model) {
  const st = local.get(key);
  if (!st) return false;
  return (st.modelRefusals[model] ?? 0) > now();
}
function tierFromQuota(quota) {
  return {
    tier: quota.freeTier ? "free" : "paid",
    source: quota.freeTier ? "violations" : "consumer",
    quotaId: quota.quotaId,
    quotaMetric: quota.quotaMetric,
    consumer: quota.consumer,
    observedAt: Date.now()
  };
}
async function markUnverified(key, observedAt = now()) {
  const st = local.get(key) ?? blank(key);
  if (outranked(st, observedAt)) {
    st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
    local.set(key, st);
    persistHealth(st, observedAt);
    return;
  }
  st.status = "unverified";
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  local.set(key, st);
  persistHealth(st, observedAt);
}
async function markValidatedPlan(key, evidence) {
  const st = local.get(key) ?? blank(key);
  if (!evidence || evidence.tier === "unknown") return;
  st.tier = evidence.tier;
  st.planValidated = true;
  st.planEvidence = evidence;
  local.set(key, st);
  const id = keyId(key);
  later(() => setValidatedPlan(id, evidence.tier, evidence));
}
async function markSoftError(key, cooldownMs) {
  const st = local.get(key) ?? blank(key);
  st.failures += 1;
  st.cooldownUntil = now() + cooldownMs;
  local.set(key, st);
  persistHealth(st);
}
async function markInvalid(key, observedAt = now(), reason = "invalid") {
  const st = local.get(key) ?? blank(key);
  const at = Math.max(st.retiredAt, observedAt);
  st.invalid = true;
  st.status = "dead";
  st.retiredAt = at;
  if (observedAt >= st.retiredAt || st.retiredReason === null) st.retiredReason = reason;
  st.invalidations += 1;
  st.failures = 999;
  st.cooldownUntil = Number.MAX_SAFE_INTEGER;
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  counters.invalidated++;
  local.set(key, st);
  persistHealth(st, observedAt);
  return true;
}
async function markHealthy(key, observedAt = now()) {
  const st = local.get(key) ?? blank(key);
  if (outranked(st, observedAt)) {
    st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
    local.set(key, st);
    persistHealth(st, observedAt);
    return;
  }
  st.invalid = false;
  st.retiredAt = 0;
  st.retiredReason = null;
  st.failures = 0;
  st.cooldownUntil = 0;
  st.retryAfterAt = 0;
  st.lastCheckedAt = Math.max(st.lastCheckedAt, observedAt);
  st.status = "ready";
  local.set(key, st);
  const id = keyId(key);
  persistHealth(st, observedAt);
  later(() => revive(id, observedAt, "ready"));
  later(() => touchLastSeen(id));
  later(() => setCooldown(id, 0));
}
async function deadKeys() {
  return [...local.values()].filter((s) => s.invalid).map((s) => maskKey(s.key));
}
async function listKeys(provider) {
  const t = now();
  const all = [...local.values()];
  const filtered = provider ? all.filter((s) => (s.provider || "gemini") === provider) : all;
  const list3 = filtered.map((s) => ({
    id: keyId(s.key),
    key: maskKey(s.key),
    provider: s.provider || "gemini",
    tier: s.tier,
    plan: planOf(s),
    planValidated: s.planValidated,
    planEvidence: s.planEvidence,
    quota: s.quota,
    failures: s.failures,
    invalidations: s.invalidations,
    cooldownLeftMs: Math.max(0, s.cooldownUntil - t),
    lastUsed: s.lastUsed,
    lastCheckedAt: s.lastCheckedAt,
    invalid: s.invalid,
    status: s.status,
    cooldownUntil: s.cooldownUntil,
    nextAccessAt: Math.max(s.cooldownUntil, s.retryAfterAt)
  })).sort((a2, b2) => a2.id.localeCompare(b2.id));
  const byProvider = {};
  for (const item of list3) {
    (byProvider[item.provider] ??= []).push(item);
  }
  Object.defineProperty(list3, "byProvider", {
    value: byProvider,
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(list3, "providers", {
    value: byProvider,
    enumerable: false,
    configurable: true
  });
  return list3;
}
function tierCounts(list3) {
  const out = { unknown: 0, free: 0, paid: 0, pro: 0 };
  for (const k of list3) out[k.tier] = (out[k.tier] ?? 0) + 1;
  return out;
}
function providerCounts(list3) {
  const out = {};
  for (const k of list3) out[k.provider] = (out[k.provider] ?? 0) + 1;
  return out;
}
function keySnapshots() {
  return [...local.values()].map((s) => ({
    key: maskKey(s.key),
    failures: s.failures,
    invalidations: s.invalidations,
    invalid: s.invalid,
    cooldownUntil: s.cooldownUntil,
    lastUsed: s.lastUsed
  }));
}
async function snapshot() {
  const all = [...local.values()];
  const t = now();
  let ready = 0;
  let cooling = 0;
  let quotaExhausted = 0;
  let dead = 0;
  let unverified = 0;
  let soonest = Infinity;
  const byProvider = {};
  const getSlot = (p2) => {
    if (!byProvider[p2]) {
      byProvider[p2] = {
        total: 0,
        ready: 0,
        cooling: 0,
        quota_exhausted: 0,
        dead: 0,
        unverified: 0
      };
    }
    return byProvider[p2];
  };
  for (const s of all) {
    const prov = s.provider || "gemini";
    const ps2 = getSlot(prov);
    ps2.total++;
    if (s.invalid || s.status === "dead") {
      dead++;
      ps2.dead++;
    } else if (s.status === "unverified") {
      unverified++;
      ps2.unverified++;
    } else if (s.status === "quota_exhausted" && !(s.retryAfterAt > 0 && s.retryAfterAt <= t)) {
      quotaExhausted++;
      ps2.quota_exhausted++;
      if (s.retryAfterAt > t) soonest = Math.min(soonest, s.retryAfterAt - t);
    } else if (s.cooldownUntil > t) {
      cooling++;
      ps2.cooling++;
      soonest = Math.min(soonest, s.cooldownUntil - t);
    } else if (s.lastUsed > 0 && t - s.lastUsed < cfg.rateWindowMs) {
      cooling++;
      ps2.cooling++;
      soonest = Math.min(soonest, s.lastUsed + cfg.rateWindowMs - t);
    } else {
      ready++;
      ps2.ready++;
    }
  }
  getSlot("gemini");
  return {
    total: all.length,
    ready,
    cooling,
    quota_exhausted: quotaExhausted,
    dead,
    unverified,
    soonestReadyMs: Number.isFinite(soonest) ? soonest : 0,
    /* One vocabulary for the rail footer: "hosted" when the pool is backed by
       Postgres, "memory" when it is not. pool.ts used to emit "postgres",
       which disagreed with settings.data on the same page. */
    storage: dbEnabled() ? "hosted" : "memory",
    degraded: counters.dbDegraded > 0,
    byProvider,
    providers: byProvider
  };
}
var storageMode, KEY_TIERS, local, now, blank, pendingWrites, outranked, HYDRATE_REFRESH_MS, lastHydrateAt, hydrating, planOf;
var init_pool = __esm({
  "src/pool.ts"() {
    "use strict";
    init_config();
    init_log();
    init_metrics();
    init_db();
    init_keys_repo();
    init_key_material();
    init_providers();
    storageMode = dbEnabled() ? "postgres" : "memory";
    KEY_TIERS = ["unknown", "free", "paid", "pro"];
    local = /* @__PURE__ */ new Map();
    now = () => Date.now();
    blank = (key, provider = "gemini") => ({
      key,
      provider,
      tier: "unknown",
      failures: 0,
      invalid: false,
      invalidations: 0,
      retiredAt: 0,
      retiredReason: null,
      cooldownUntil: 0,
      lastUsed: 0,
      // A fresh key carries no disqualifying verdict yet: it serves until an
      // upstream answer says otherwise. `unverified` is set explicitly on admission.
      status: "ready",
      planValidated: false,
      planEvidence: null,
      quota: null,
      retryAfterAt: 0,
      lastCheckedAt: 0,
      modelRefusals: {}
    });
    pendingWrites = /* @__PURE__ */ new Set();
    outranked = (st, observedAt) => st.retiredAt > observedAt;
    HYDRATE_REFRESH_MS = 2e4;
    lastHydrateAt = 0;
    hydrating = null;
    planOf = (s) => s.status === "cooling" || s.status === "quota_exhausted" ? "unspecified" : s.tier;
  }
});

// node_modules/@hono/node-server/dist/constants-BLSFu_RU.mjs
var X_ALREADY_SENT = "x-hono-already-sent";

// node_modules/@hono/node-server/dist/index.mjs
import { STATUS_CODES, ServerResponse, createServer } from "node:http";
import { Http2ServerRequest, constants } from "node:http2";
import { Readable } from "node:stream";

// node_modules/hono/dist/helper/websocket/index.js
var defineWebSocketHelper = (handler2) => {
  return (...args) => {
    if (typeof args[0] === "function") {
      const [createEvents, options] = args;
      return async function upgradeWebSocket2(c, next) {
        const result = await handler2(c, await createEvents(c), options);
        if (result) return result;
        await next();
      };
    } else {
      const [c, events, options] = args;
      return (async () => {
        const upgraded = await handler2(c, events, options);
        if (!upgraded) throw new Error("Failed to upgrade WebSocket");
        return upgraded;
      })();
    }
  };
};

// node_modules/@hono/node-server/dist/index.mjs
var RequestError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "RequestError";
  }
};
var nonJoinedHeaders = /* @__PURE__ */ new Set([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "server",
  "user-agent"
]);
var validHeaderName = /^[!#$%&'*+\-.^_`|~\dA-Za-z]+$/;
var isHttpWhitespace = (code) => code === 9 || code === 10 || code === 13 || code === 32;
var normalizeHeaderValue = (value) => {
  if (!isHttpWhitespace(value.charCodeAt(0)) && !isHttpWhitespace(value.charCodeAt(value.length - 1))) return value;
  let start = 0;
  let end = value.length;
  while (start < end && isHttpWhitespace(value.charCodeAt(start))) start++;
  while (end > start && isHttpWhitespace(value.charCodeAt(end - 1))) end--;
  return value.slice(start, end);
};
var forbiddenHeaderValue = /[\0\r\n]/;
var GlobalHeaders = globalThis.Headers;
var materializeHeaders = (rawHeaders, HeadersCtor = GlobalHeaders) => {
  const headers = new HeadersCtor();
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i];
    if (!name.startsWith(":")) headers.append(name, rawHeaders[i + 1]);
  }
  return headers;
};
var RequestHeaders = class {
  #incoming;
  #rawHeaders;
  #headers;
  #invalidValue;
  constructor(incoming) {
    this.#incoming = incoming;
    if (incoming instanceof Http2ServerRequest) this.#rawHeaders = incoming.rawHeaders.slice();
  }
  get #lazyRawHeaders() {
    return this.#rawHeaders ??= this.#incoming.rawHeaders.slice();
  }
  get #native() {
    if (!this.#headers) {
      this.#headers = materializeHeaders(this.#lazyRawHeaders);
      this.#rawHeaders = void 0;
    }
    return this.#headers;
  }
  #normalizedName(name) {
    if (typeof name !== "string") return;
    if (!validHeaderName.test(name)) throw new TypeError(`Invalid header name: ${name}`);
    return name.toLowerCase();
  }
  #lookupHttp1(lowerName) {
    const headers = this.#incoming instanceof Http2ServerRequest ? void 0 : this.#incoming.headers;
    if (!headers || nonJoinedHeaders.has(lowerName) || lowerName === "set-cookie" || lowerName === "__proto__") return;
    if (!Object.hasOwn(headers, lowerName)) return null;
    const rawValue = headers[lowerName];
    if (typeof rawValue === "string") {
      const value = normalizeHeaderValue(rawValue);
      return forbiddenHeaderValue.test(value) ? void 0 : value;
    }
  }
  #lookup(rawHeaders, lowerName) {
    const separator = lowerName === "cookie" ? "; " : ", ";
    let value = null;
    for (let i = 0; i < rawHeaders.length; i += 2) {
      const rawName = rawHeaders[i];
      if (rawName.length === lowerName.length && rawName.toLowerCase() === lowerName) {
        const rawValue = normalizeHeaderValue(rawHeaders[i + 1]);
        if (forbiddenHeaderValue.test(rawValue)) {
          this.#invalidValue = true;
          return;
        }
        value = value === null ? rawValue : value + separator + rawValue;
      }
    }
    return value;
  }
  append(name, value) {
    this.#native.append(name, value);
  }
  delete(name) {
    this.#native.delete(name);
  }
  get(name) {
    const lowerName = this.#normalizedName(name);
    if (lowerName && !this.#headers && !this.#invalidValue) {
      const http1Value = this.#lookupHttp1(lowerName);
      if (http1Value !== void 0) return http1Value;
      const value = this.#lookup(this.#lazyRawHeaders, lowerName);
      if (value !== void 0) return value;
    }
    return this.#native.get(name);
  }
  has(name) {
    const lowerName = this.#normalizedName(name);
    if (lowerName && !this.#headers && !this.#invalidValue) {
      const http1Value = this.#lookupHttp1(lowerName);
      if (http1Value !== void 0) return http1Value !== null;
      const value = this.#lookup(this.#lazyRawHeaders, lowerName);
      if (value !== void 0) return value !== null;
    }
    return this.#native.has(name);
  }
  set(name, value) {
    this.#native.set(name, value);
  }
  getSetCookie() {
    return this.#native.getSetCookie();
  }
  keys() {
    return this.#native.keys();
  }
  values() {
    return this.#native.values();
  }
  entries() {
    return this.#native.entries();
  }
  forEach(callback, thisArg) {
    this.#native.forEach((value, key) => {
      callback.call(thisArg, value, key, this);
    });
  }
  [Symbol.iterator]() {
    return this.entries();
  }
};
Object.defineProperty(RequestHeaders.prototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Headers (lightweight) ${inspectFn(Object.fromEntries(this), {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(RequestHeaders.prototype, GlobalHeaders.prototype);
var newHeadersFromIncoming = (incoming) => globalThis.Headers === GlobalHeaders ? new RequestHeaders(incoming) : materializeHeaders(incoming.rawHeaders, globalThis.Headers);
var reValidRequestUrl = /^\/[!#$&-;=?-\[\]_a-z~]*$/;
var reDotSegment = /\/\.\.?(?:[/?#]|$)/;
var reValidHost = /^[a-z0-9._-]+(?::(?:[1-5]\d{3,4}|[6-9]\d{3}))?$/;
var buildUrl = (scheme, host, incomingUrl) => {
  const url = `${scheme}://${host}${incomingUrl}`;
  if (!reValidHost.test(host)) {
    const urlObj = new URL(url);
    if (urlObj.hostname.length !== host.length && urlObj.hostname !== (host.includes(":") ? host.replace(/:\d+$/, "") : host).toLowerCase()) throw new RequestError("Invalid host header");
    return urlObj.href;
  } else if (incomingUrl.length === 0) return url + "/";
  else {
    if (incomingUrl.charCodeAt(0) !== 47) throw new RequestError("Invalid URL");
    if (!reValidRequestUrl.test(incomingUrl) || reDotSegment.test(incomingUrl)) return new URL(url).href;
    return url;
  }
};
var toRequestError = (e) => {
  if (e instanceof RequestError) return e;
  return new RequestError(e.message, { cause: e });
};
var GlobalRequest = global.Request;
var Request$1 = class extends GlobalRequest {
  constructor(input, options) {
    if (typeof input === "object" && getRequestCache in input) {
      const hasReplacementBody = options !== void 0 && "body" in options && options.body != null;
      if (input[bodyConsumedDirectlyKey] && !hasReplacementBody) throw new TypeError("Cannot construct a Request with a Request object that has already been used.");
      input = input[getRequestCache]();
    }
    if (typeof options?.body?.getReader !== "undefined") options.duplex ??= "half";
    super(input, options);
  }
};
var wrapBodyStream = Symbol("wrapBodyStream");
var byteExactEncodings = /* @__PURE__ */ new Set([
  "latin1",
  "binary",
  "hex",
  "base64",
  "base64url"
]);
var isByteExactEncoding = (encoding) => encoding === null || byteExactEncodings.has(encoding);
var bodyBufferedBeforeDisconnectKey = Symbol("bodyBufferedBeforeDisconnect");
var bodyBufferedLengthBeforeDisconnectKey = Symbol("bodyBufferedLengthBeforeDisconnect");
var toBufferChunk = (chunk2, encoding) => Buffer.isBuffer(chunk2) ? chunk2 : Buffer.from(chunk2, encoding ?? "utf8");
var isRecoverableDisconnectedIncoming = (incoming) => !(incoming instanceof Http2ServerRequest) && !!incoming.complete && !!incoming.readableAborted && typeof incoming.read === "function" && isByteExactEncoding(incoming.readableEncoding);
var recordBodyBufferedBeforeDisconnect = (incoming) => {
  if (incoming.readableDidRead || !isRecoverableDisconnectedIncoming(incoming)) return;
  const incomingWithRecovery = incoming;
  incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] ??= incoming.readableLength;
};
var readBodyBufferedBeforeDisconnect = (incoming, chunks) => {
  if (incoming.readableDidRead && !chunks || !isRecoverableDisconnectedIncoming(incoming)) return;
  const incomingWithRecovery = incoming;
  if (incomingWithRecovery[bodyBufferedBeforeDisconnectKey] !== void 0) return incomingWithRecovery[bodyBufferedBeforeDisconnectKey];
  let result;
  const errored = incoming.errored;
  if (errored && errored.code !== "ECONNRESET") result = errored;
  else if (incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] !== void 0 && incoming.readableLength !== incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey]) result = newBodyUnusableError();
  else {
    const bodyChunks = chunks ?? [];
    const chunk2 = incoming.read();
    if (chunk2 !== null) bodyChunks.push(toBufferChunk(chunk2, incoming.readableEncoding));
    const buffer = bodyChunks.length === 1 ? bodyChunks[0] : Buffer.concat(bodyChunks);
    result = buffer;
    const contentLength = incoming.headers["content-length"];
    if (typeof contentLength === "string" && /^\d+$/.test(contentLength)) {
      const expectedLength = Number(contentLength);
      if (Number.isSafeInteger(expectedLength) && buffer.length !== expectedLength) result = newBodyUnusableError();
    }
  }
  incomingWithRecovery[bodyBufferedBeforeDisconnectKey] = result;
  return result;
};
var enqueueBufferedBody = (controller, buffered) => {
  if (buffered instanceof Error) {
    controller.error(buffered);
    return;
  }
  if (buffered.length > 0) controller.enqueue(buffered);
  controller.close();
};
var newRequestFromIncoming = (method, url, headers, incoming, abortController) => {
  const init = {
    method,
    headers,
    signal: abortController.signal
  };
  if (method === "TRACE") {
    init.method = "GET";
    const req = new Request$1(url, init);
    Object.defineProperty(req, "method", { get() {
      return "TRACE";
    } });
    return req;
  }
  if (!(method === "GET" || method === "HEAD")) if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) init.body = new ReadableStream({ start(controller) {
    controller.enqueue(incoming.rawBody);
    controller.close();
  } });
  else if (incoming[wrapBodyStream]) {
    let reader;
    init.body = new ReadableStream({ async pull(controller) {
      try {
        if (!reader) {
          const buffered = readBodyBufferedBeforeDisconnect(incoming);
          if (buffered !== void 0) {
            enqueueBufferedBody(controller, buffered);
            return;
          }
        }
        reader ||= Readable.toWeb(incoming).getReader();
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    } });
  } else {
    const buffered = readBodyBufferedBeforeDisconnect(incoming);
    if (buffered !== void 0) init.body = new ReadableStream({ start(controller) {
      enqueueBufferedBody(controller, buffered);
    } });
    else init.body = Readable.toWeb(incoming);
  }
  return new Request$1(url, init);
};
var getRequestCache = Symbol("getRequestCache");
var requestCache = Symbol("requestCache");
var incomingKey = Symbol("incomingKey");
var urlKey = Symbol("urlKey");
var methodKey = Symbol("methodKey");
var headersKey = Symbol("headersKey");
var abortControllerKey = Symbol("abortControllerKey");
var getAbortController = Symbol("getAbortController");
var abortRequest = Symbol("abortRequest");
var bodyBufferKey = Symbol("bodyBuffer");
var bodyReadPromiseKey = Symbol("bodyReadPromise");
var bodyConsumedDirectlyKey = Symbol("bodyConsumedDirectly");
var bodyLockReaderKey = Symbol("bodyLockReader");
var abortReasonKey = Symbol("abortReason");
var newBodyUnusableError = () => {
  return /* @__PURE__ */ new TypeError("Body is unusable");
};
var rejectBodyUnusable = () => {
  return Promise.reject(newBodyUnusableError());
};
var textDecoder = new TextDecoder();
var consumeBodyDirectOnce = (request) => {
  if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  request[bodyConsumedDirectlyKey] = true;
};
var toArrayBuffer = (buf) => {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
var contentType = (request) => {
  return (request[headersKey] ||= newHeadersFromIncoming(request[incomingKey])).get("content-type") || "";
};
var methodTokenRegExp = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
var normalizeIncomingMethod = (method) => {
  if (typeof method !== "string" || method.length === 0) return "GET";
  switch (method) {
    case "DELETE":
    case "GET":
    case "HEAD":
    case "OPTIONS":
    case "PATCH":
    case "POST":
    case "PUT":
    case "QUERY":
      return method;
  }
  const upper = method.toUpperCase();
  switch (upper) {
    case "DELETE":
    case "GET":
    case "HEAD":
    case "OPTIONS":
    case "POST":
    case "PUT":
      return upper;
    default:
      return method;
  }
};
var validateDirectReadMethod = (method) => {
  if (!methodTokenRegExp.test(method)) return /* @__PURE__ */ new TypeError(`'${method}' is not a valid HTTP method.`);
  const normalized = method.toUpperCase();
  if (normalized === "CONNECT" || normalized === "TRACK" || normalized === "TRACE" && method !== "TRACE") return /* @__PURE__ */ new TypeError(`'${method}' HTTP method is unsupported.`);
};
var readBodyWithFastPath = (request, method, fromBuffer) => {
  if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  const methodName = request.method;
  if (methodName === "GET" || methodName === "HEAD") return request[getRequestCache]()[method]();
  const methodValidationError = validateDirectReadMethod(methodName);
  if (methodValidationError) return Promise.reject(methodValidationError);
  if (request[requestCache]) {
    if (methodName !== "TRACE") return request[requestCache][method]();
  }
  const alreadyUsedError = consumeBodyDirectOnce(request);
  if (alreadyUsedError) return alreadyUsedError;
  const raw2 = readRawBodyIfAvailable(request);
  if (raw2) {
    const result = Promise.resolve(fromBuffer(raw2, request));
    request[bodyBufferKey] = void 0;
    return result;
  }
  return readBodyDirect(request).then((buf) => {
    const result = fromBuffer(buf, request);
    request[bodyBufferKey] = void 0;
    return result;
  });
};
var readRawBodyIfAvailable = (request) => {
  const incoming = request[incomingKey];
  if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) return incoming.rawBody;
};
var normalizeAbortError = (request, incoming) => {
  if (incoming.errored) return incoming.errored;
  const reason = request[abortReasonKey];
  if (reason !== void 0) return reason instanceof Error ? reason : new Error(String(reason));
  return /* @__PURE__ */ new Error("Client connection prematurely closed.");
};
var readBodyDirect = (request) => {
  if (request[bodyBufferKey]) return Promise.resolve(request[bodyBufferKey]);
  if (request[bodyReadPromiseKey]) return request[bodyReadPromiseKey];
  const incoming = request[incomingKey];
  if (incoming.readableDidRead) return rejectBodyUnusable();
  const buffered = readBodyBufferedBeforeDisconnect(incoming);
  if (buffered !== void 0) {
    if (buffered instanceof Error) return Promise.reject(buffered);
    request[bodyBufferKey] = buffered;
    return Promise.resolve(buffered);
  }
  const promise = new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const finish2 = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const recoverCompleteBodyAfterDisconnect = (error) => {
      const streamError = incoming.errored ?? error;
      if (!isRecoverableDisconnectedIncoming(incoming) || streamError && streamError.code !== "ECONNRESET") return false;
      finish2(() => {
        const recovered = readBodyBufferedBeforeDisconnect(incoming, chunks);
        if (recovered instanceof Error) reject(recovered);
        else if (recovered === void 0) reject(error ?? normalizeAbortError(request, incoming));
        else {
          request[bodyBufferKey] = recovered;
          resolve(recovered);
        }
      });
      return true;
    };
    const onData = (chunk2) => {
      chunks.push(toBufferChunk(chunk2, incoming.readableEncoding));
    };
    const onEnd = () => {
      finish2(() => {
        const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
        request[bodyBufferKey] = buffer;
        resolve(buffer);
      });
    };
    const onError = (error) => {
      if (recoverCompleteBodyAfterDisconnect(error)) return;
      finish2(() => {
        reject(error);
      });
    };
    const onClose = () => {
      if (incoming.readableEnded) {
        onEnd();
        return;
      }
      if (recoverCompleteBodyAfterDisconnect()) return;
      finish2(() => {
        reject(normalizeAbortError(request, incoming));
      });
    };
    const cleanup = () => {
      incoming.off("data", onData);
      incoming.off("end", onEnd);
      incoming.off("error", onError);
      incoming.off("close", onClose);
      request[bodyReadPromiseKey] = void 0;
    };
    incoming.on("data", onData);
    incoming.on("end", onEnd);
    incoming.on("error", onError);
    incoming.on("close", onClose);
    queueMicrotask(() => {
      if (settled) return;
      if (incoming.readableEnded) onEnd();
      else if (incoming.errored) onError(incoming.errored);
      else if (incoming.destroyed) onClose();
    });
  });
  request[bodyReadPromiseKey] = promise;
  return promise;
};
var requestPrototype = {
  get method() {
    return this[methodKey];
  },
  get url() {
    return this[urlKey];
  },
  get headers() {
    return this[headersKey] ||= newHeadersFromIncoming(this[incomingKey]);
  },
  [abortRequest](reason) {
    if (this[abortReasonKey] === void 0) this[abortReasonKey] = reason;
    const abortController = this[abortControllerKey];
    if (abortController && !abortController.signal.aborted) abortController.abort(reason);
  },
  [getAbortController]() {
    this[abortControllerKey] ||= new AbortController();
    if (this[abortReasonKey] !== void 0 && !this[abortControllerKey].signal.aborted) this[abortControllerKey].abort(this[abortReasonKey]);
    return this[abortControllerKey];
  },
  [getRequestCache]() {
    const abortController = this[getAbortController]();
    if (this[requestCache]) return this[requestCache];
    const method = this.method;
    if (this[bodyConsumedDirectlyKey] && !(method === "GET" || method === "HEAD")) {
      this[bodyBufferKey] = void 0;
      const init = {
        method: method === "TRACE" ? "GET" : method,
        headers: this.headers,
        signal: abortController.signal
      };
      if (method !== "TRACE") {
        init.body = new ReadableStream({ start(c) {
          c.close();
        } });
        init.duplex = "half";
      }
      const req = new Request$1(this[urlKey], init);
      if (method === "TRACE") Object.defineProperty(req, "method", { get() {
        return "TRACE";
      } });
      return this[requestCache] = req;
    }
    return this[requestCache] = newRequestFromIncoming(this.method, this[urlKey], this.headers, this[incomingKey], abortController);
  },
  get body() {
    if (!this[bodyConsumedDirectlyKey]) return this[getRequestCache]().body;
    const request = this[getRequestCache]();
    if (!this[bodyLockReaderKey] && request.body) this[bodyLockReaderKey] = request.body.getReader();
    return request.body;
  },
  get bodyUsed() {
    if (this[bodyConsumedDirectlyKey]) return true;
    if (this[requestCache]) return this[requestCache].bodyUsed;
    return false;
  }
};
Object.defineProperty(requestPrototype, "signal", { get() {
  return this[getAbortController]().signal;
} });
[
  "cache",
  "credentials",
  "destination",
  "integrity",
  "mode",
  "redirect",
  "referrer",
  "referrerPolicy",
  "keepalive"
].forEach((k) => {
  Object.defineProperty(requestPrototype, k, { get() {
    return this[getRequestCache]()[k];
  } });
});
["clone", "formData"].forEach((k) => {
  Object.defineProperty(requestPrototype, k, { value: function() {
    if (this[bodyConsumedDirectlyKey]) {
      if (k === "clone") throw newBodyUnusableError();
      return rejectBodyUnusable();
    }
    return this[getRequestCache]()[k]();
  } });
});
Object.defineProperty(requestPrototype, "text", { value: function() {
  return readBodyWithFastPath(this, "text", (buf) => textDecoder.decode(buf));
} });
Object.defineProperty(requestPrototype, "arrayBuffer", { value: function() {
  return readBodyWithFastPath(this, "arrayBuffer", (buf) => toArrayBuffer(buf));
} });
Object.defineProperty(requestPrototype, "blob", { value: function() {
  return readBodyWithFastPath(this, "blob", (buf, request) => {
    const type = contentType(request);
    const init = type ? { headers: { "content-type": type } } : void 0;
    return new Response(buf, init).blob();
  });
} });
Object.defineProperty(requestPrototype, "json", { value: function() {
  if (this[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  return this.text().then(JSON.parse);
} });
Object.defineProperty(requestPrototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Request (lightweight) ${inspectFn({
    method: this.method,
    url: this.url,
    headers: this.headers,
    nativeRequest: this[requestCache]
  }, {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(requestPrototype, Request$1.prototype);
var newRequest = (incoming, defaultHostname) => {
  const req = Object.create(requestPrototype);
  req[incomingKey] = incoming;
  req[methodKey] = normalizeIncomingMethod(incoming.method);
  const incomingUrl = incoming.url || "";
  if (incomingUrl[0] !== "/" && (incomingUrl.startsWith("http://") || incomingUrl.startsWith("https://"))) {
    if (incoming instanceof Http2ServerRequest) throw new RequestError("Absolute URL for :path is not allowed in HTTP/2");
    try {
      req[urlKey] = new URL(incomingUrl).href;
    } catch (e) {
      throw new RequestError("Invalid absolute URL", { cause: e });
    }
    return req;
  }
  const host = (incoming instanceof Http2ServerRequest ? incoming.authority : incoming.headers.host) || defaultHostname;
  if (!host) throw new RequestError("Missing host header");
  let scheme;
  if (incoming instanceof Http2ServerRequest) {
    scheme = incoming.scheme;
    if (!(scheme === "http" || scheme === "https")) throw new RequestError("Unsupported scheme");
  } else scheme = incoming.socket && incoming.socket.encrypted ? "https" : "http";
  try {
    req[urlKey] = buildUrl(scheme, host, incomingUrl);
  } catch (e) {
    if (e instanceof RequestError) throw e;
    else throw new RequestError("Invalid URL", { cause: e });
  }
  return req;
};
var defaultContentType = "text/plain; charset=UTF-8";
var responseCache = Symbol("responseCache");
var getResponseCache = Symbol("getResponseCache");
var cacheKey = Symbol("cache");
var GlobalResponse = global.Response;
var Response$1 = class Response$12 {
  #body;
  #init;
  [getResponseCache]() {
    const cache5 = this[cacheKey];
    const liveHeaders = cache5 && cache5[2] instanceof Headers ? cache5[2] : void 0;
    delete this[cacheKey];
    return this[responseCache] ||= new GlobalResponse(this.#body, liveHeaders ? {
      status: this.#init?.status,
      statusText: this.#init?.statusText,
      headers: liveHeaders
    } : this.#init);
  }
  constructor(body, init) {
    let headers;
    this.#body = body;
    if (init instanceof GlobalResponse) {
      const cachedGlobalResponse = init[responseCache];
      if (cachedGlobalResponse) {
        this.#init = cachedGlobalResponse;
        this[getResponseCache]();
        return;
      }
      this.#init = init instanceof Response$12 ? init.#init : init;
      headers = new Headers(init.headers);
    } else this.#init = init;
    if (body == null || typeof body === "string" || typeof body?.getReader !== "undefined" || body instanceof Blob || body instanceof Uint8Array) this[cacheKey] = [
      init?.status || 200,
      body ?? null,
      headers || init?.headers
    ];
  }
  get headers() {
    const cache5 = this[cacheKey];
    if (cache5) {
      if (!(cache5[2] instanceof Headers)) cache5[2] = new Headers(cache5[2] || (cache5[1] === null ? void 0 : { "content-type": defaultContentType }));
      return cache5[2];
    }
    return this[getResponseCache]().headers;
  }
  get status() {
    return this[cacheKey]?.[0] ?? this[getResponseCache]().status;
  }
  get ok() {
    const status = this.status;
    return status >= 200 && status < 300;
  }
};
[
  "body",
  "bodyUsed",
  "redirected",
  "statusText",
  "trailers",
  "type",
  "url"
].forEach((k) => {
  Object.defineProperty(Response$1.prototype, k, { get() {
    return this[getResponseCache]()[k];
  } });
});
[
  "arrayBuffer",
  "blob",
  "clone",
  "formData",
  "json",
  "text"
].forEach((k) => {
  Object.defineProperty(Response$1.prototype, k, { value: function() {
    return this[getResponseCache]()[k]();
  } });
});
Object.defineProperty(Response$1.prototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Response (lightweight) ${inspectFn({
    status: this.status,
    headers: this.headers,
    ok: this.ok,
    nativeResponse: this[responseCache]
  }, {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(Response$1, GlobalResponse);
Object.setPrototypeOf(Response$1.prototype, GlobalResponse.prototype);
var validRedirectUrl = /^https?:\/\/[!#-;=?-[\]_a-z~A-Z]+$/;
var parseRedirectUrl = (url) => {
  if (url instanceof URL) return url.href;
  if (validRedirectUrl.test(url)) return url;
  return new URL(url).href;
};
var validRedirectStatuses = /* @__PURE__ */ new Set([
  301,
  302,
  303,
  307,
  308
]);
Object.defineProperty(Response$1, "redirect", {
  value: function redirect(url, status = 302) {
    if (!validRedirectStatuses.has(status)) throw new RangeError("Invalid status code");
    return new Response$1(null, {
      status,
      headers: { location: parseRedirectUrl(url) }
    });
  },
  writable: true,
  configurable: true
});
Object.defineProperty(Response$1, "json", {
  value: function json(data, init) {
    const body = JSON.stringify(data);
    if (body === void 0) throw new TypeError("The data is not JSON serializable");
    const initHeaders = init?.headers;
    let headers;
    if (initHeaders) {
      headers = new Headers(initHeaders);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    } else headers = { "content-type": "application/json" };
    return new Response$1(body, {
      status: init?.status ?? 200,
      statusText: init?.statusText,
      headers
    });
  },
  writable: true,
  configurable: true
});
async function readWithoutBlocking(readPromise) {
  return Promise.race([readPromise, Promise.resolve().then(() => Promise.resolve(void 0))]);
}
function writeFromReadableStreamDefaultReader(reader, writable, currentReadPromise) {
  const cancel = (error) => {
    reader.cancel(error).catch(() => {
    });
  };
  writable.on("close", cancel);
  writable.on("error", cancel);
  (currentReadPromise ?? reader.read()).then(flow, handleStreamError);
  return reader.closed.finally(() => {
    writable.off("close", cancel);
    writable.off("error", cancel);
  });
  function handleStreamError(error) {
    if (error) writable.destroy(error);
  }
  function onDrain() {
    reader.read().then(flow, handleStreamError);
  }
  function flow({ done, value }) {
    try {
      if (done) writable.end();
      else if (!writable.write(value)) writable.once("drain", onDrain);
      else return reader.read().then(flow, handleStreamError);
    } catch (e) {
      handleStreamError(e);
    }
  }
}
function writeFromReadableStream(stream, writable) {
  if (stream.locked) throw new TypeError("ReadableStream is locked.");
  else if (writable.destroyed) return;
  return writeFromReadableStreamDefaultReader(stream.getReader(), writable);
}
var buildOutgoingHttpHeaders = (headers, defaultContentType2) => {
  const res = {};
  if (!(headers instanceof Headers)) headers = new Headers(headers ?? void 0);
  if (headers.has("set-cookie")) {
    const cookies = [];
    for (const [k, v2] of headers) if (k === "set-cookie") cookies.push(v2);
    else res[k] = v2;
    if (cookies.length > 0) res["set-cookie"] = cookies;
  } else for (const [k, v2] of headers) res[k] = v2;
  if (defaultContentType2) res["content-type"] ??= defaultContentType2;
  return res;
};
var outgoingEnded = Symbol("outgoingEnded");
var incomingDraining = Symbol("incomingDraining");
var DRAIN_TIMEOUT_MS = 500;
var MAX_DRAIN_BYTES = 64 * 1024 * 1024;
var drainIncoming = (incoming) => {
  const incomingWithDrainState = incoming;
  if (incoming.destroyed || incomingWithDrainState[incomingDraining]) return;
  incomingWithDrainState[incomingDraining] = true;
  if (incoming instanceof Http2ServerRequest) {
    try {
      incoming.stream?.close?.(constants.NGHTTP2_NO_ERROR);
    } catch {
    }
    return;
  }
  let bytesRead = 0;
  const cleanup = () => {
    clearTimeout(timer2);
    incoming.off("data", onData);
    incoming.off("end", cleanup);
    incoming.off("error", cleanup);
  };
  const forceClose = () => {
    cleanup();
    const socket = incoming.socket;
    if (socket && !socket.destroyed) {
      if (typeof socket.destroySoon === "function") socket.destroySoon();
      else if (typeof socket.destroy === "function") socket.destroy();
    }
  };
  const timer2 = setTimeout(forceClose, DRAIN_TIMEOUT_MS);
  timer2.unref?.();
  const onData = (chunk2) => {
    bytesRead += chunk2.length;
    if (bytesRead > MAX_DRAIN_BYTES) forceClose();
  };
  incoming.on("data", onData);
  incoming.on("end", cleanup);
  incoming.on("error", cleanup);
  incoming.resume();
};
var makeCloseHandler = (req, incoming, outgoing, needsBodyCleanup) => () => {
  if (incoming.errored) {
    recordBodyBufferedBeforeDisconnect(incoming);
    req[abortRequest](incoming.errored.toString());
  } else if (!outgoing.writableFinished || incoming instanceof Http2ServerRequest && incoming.aborted) {
    recordBodyBufferedBeforeDisconnect(incoming);
    req[abortRequest]("Client connection prematurely closed.");
  }
  if (needsBodyCleanup && !incoming.readableEnded) setTimeout(() => {
    if (!incoming.readableEnded) setTimeout(() => {
      drainIncoming(incoming);
    });
  });
};
var isImmediateCacheableResponse = (res) => {
  if (!(cacheKey in res)) return false;
  const body = res[cacheKey][1];
  return body === null || typeof body === "string" || body instanceof Uint8Array;
};
var handleRequestError = () => new Response(null, { status: 400 });
var handleFetchError = (e) => new Response(null, { status: e instanceof Error && (e.name === "TimeoutError" || e.constructor.name === "TimeoutError") ? 504 : 500 });
var handleResponseError = (e, outgoing) => {
  const err2 = e instanceof Error ? e : new Error("unknown error", { cause: e });
  if (err2.code === "ERR_STREAM_PREMATURE_CLOSE") console.info("The user aborted a request.");
  else {
    console.error(e);
    if (!outgoing.headersSent) {
      if (outgoing instanceof ServerResponse) outgoing._contentLength = null;
      outgoing.writeHead(500, { "Content-Type": "text/plain" });
    }
    outgoing.end(`Error: ${err2.message}`);
    outgoing.destroy(err2);
  }
};
var flushHeaders = (outgoing) => {
  if ("flushHeaders" in outgoing && outgoing.writable) outgoing.flushHeaders();
};
var trySetContentLength = (outgoing, status, length) => {
  const http1 = outgoing;
  if (http1._contentLength === null && http1._hasBody && http1.useChunkedEncodingByDefault && !http1._removedContLen && status >= 200 && status !== 204 && status !== 304 && !outgoing.hasHeader("content-length") && !outgoing.hasHeader("transfer-encoding") && !outgoing.hasHeader("trailer")) {
    http1._contentLength = length;
    return true;
  }
  return false;
};
var writeDefaultHeaders = (outgoing, status, length) => {
  if (trySetContentLength(outgoing, status, length)) outgoing.writeHead(status, { "Content-Type": defaultContentType });
  else outgoing.writeHead(status, {
    "Content-Type": defaultContentType,
    "Content-Length": length
  });
};
var responseViaCache = async (res, outgoing) => {
  let [status, body, header] = res[cacheKey];
  if (!header) {
    if (body === null) {
      outgoing.writeHead(status);
      outgoing.end();
    } else if (typeof body === "string") {
      writeDefaultHeaders(outgoing, status, Buffer.byteLength(body));
      outgoing.end(body);
    } else if (body instanceof Uint8Array) {
      writeDefaultHeaders(outgoing, status, body.byteLength);
      outgoing.end(body);
    } else if (body instanceof Blob) {
      writeDefaultHeaders(outgoing, status, body.size);
      outgoing.end(new Uint8Array(await body.arrayBuffer()));
    } else {
      outgoing.writeHead(status, { "Content-Type": defaultContentType });
      flushHeaders(outgoing);
      await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
    }
    outgoing[outgoingEnded]?.();
    return;
  }
  let hasContentLength = false;
  let plainHeaders = false;
  let canAutoLength = true;
  if (header instanceof Headers) {
    hasContentLength = header.has("content-length");
    header = buildOutgoingHttpHeaders(header, body === null ? void 0 : defaultContentType);
  } else if (Array.isArray(header)) {
    const headerObj = new Headers(header);
    hasContentLength = headerObj.has("content-length");
    header = buildOutgoingHttpHeaders(headerObj, body === null ? void 0 : defaultContentType);
  } else {
    plainHeaders = true;
    for (const key in header) {
      if (key.length === 14 && key.toLowerCase() === "content-length") {
        hasContentLength = true;
        break;
      }
      if (key.length === 17 && key.toLowerCase() === "transfer-encoding" || key.length === 7 && key.toLowerCase() === "trailer") canAutoLength = false;
    }
  }
  if (!hasContentLength) {
    let length;
    if (typeof body === "string") length = Buffer.byteLength(body);
    else if (body instanceof Uint8Array) length = body.byteLength;
    else if (body instanceof Blob) length = body.size;
    if (length !== void 0 && (!plainHeaders || !canAutoLength || !trySetContentLength(outgoing, status, length))) {
      if (plainHeaders) header = { ...header };
      header["Content-Length"] = length;
    }
  }
  outgoing.writeHead(status, header);
  if (body == null) outgoing.end();
  else if (typeof body === "string" || body instanceof Uint8Array) outgoing.end(body);
  else if (body instanceof Blob) outgoing.end(new Uint8Array(await body.arrayBuffer()));
  else {
    flushHeaders(outgoing);
    await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
  }
  outgoing[outgoingEnded]?.();
};
var isPromise = (res) => typeof res.then === "function";
var responseViaResponseObject = async (res, outgoing, options = {}) => {
  if (isPromise(res)) if (options.errorHandler) try {
    res = await res;
  } catch (err2) {
    const errRes = await options.errorHandler(err2);
    if (!errRes) return;
    res = errRes;
  }
  else res = await res.catch(handleFetchError);
  if (cacheKey in res) return responseViaCache(res, outgoing);
  const resHeaderRecord = buildOutgoingHttpHeaders(res.headers, res.body === null ? void 0 : defaultContentType);
  if (res.body) {
    const reader = res.body.getReader();
    const values = [];
    let done = false;
    let currentReadPromise = void 0;
    if (resHeaderRecord["transfer-encoding"] !== "chunked") {
      let maxReadCount = 2;
      for (let i = 0; i < maxReadCount; i++) {
        currentReadPromise ||= reader.read();
        const chunk2 = await readWithoutBlocking(currentReadPromise).catch((e) => {
          console.error(e);
          done = true;
        });
        if (!chunk2) {
          if (i === 1) {
            await new Promise((resolve) => setTimeout(resolve));
            maxReadCount = 3;
            continue;
          }
          break;
        }
        currentReadPromise = void 0;
        if (chunk2.value) values.push(chunk2.value);
        if (chunk2.done) {
          done = true;
          break;
        }
      }
      if (done && !("content-length" in resHeaderRecord)) resHeaderRecord["content-length"] = values.reduce((acc, value) => acc + value.length, 0);
    }
    outgoing.writeHead(res.status, resHeaderRecord);
    values.forEach((value) => {
      outgoing.write(value);
    });
    if (done) outgoing.end();
    else {
      if (values.length === 0) flushHeaders(outgoing);
      await writeFromReadableStreamDefaultReader(reader, outgoing, currentReadPromise);
    }
  } else if (resHeaderRecord[X_ALREADY_SENT]) {
  } else {
    outgoing.writeHead(res.status, resHeaderRecord);
    outgoing.end();
  }
  outgoing[outgoingEnded]?.();
};
var getRequestListener = (fetchCallback, options = {}) => {
  const autoCleanupIncoming = options.autoCleanupIncoming ?? true;
  if (options.overrideGlobalObjects !== false && global.Request !== Request$1) {
    Object.defineProperty(global, "Request", { value: Request$1 });
    Object.defineProperty(global, "Response", { value: Response$1 });
  }
  return async (incoming, outgoing) => {
    let res, req;
    let needsBodyCleanup = false;
    let closeHandlerAttached = false;
    const ensureCloseHandler = () => {
      if (!req || closeHandlerAttached) return;
      closeHandlerAttached = true;
      outgoing.on("close", makeCloseHandler(req, incoming, outgoing, needsBodyCleanup));
    };
    try {
      req = newRequest(incoming, options.hostname);
      needsBodyCleanup = autoCleanupIncoming && !(incoming.method === "GET" || incoming.method === "HEAD");
      if (needsBodyCleanup) {
        incoming[wrapBodyStream] = true;
        if (incoming instanceof Http2ServerRequest) outgoing[outgoingEnded] = () => {
          if (!incoming.readableEnded) setTimeout(() => {
            if (!incoming.readableEnded) setTimeout(() => {
              incoming.destroy();
              outgoing.destroy();
            });
          });
        };
      }
      res = fetchCallback(req, {
        incoming,
        outgoing
      });
      if (!isPromise(res) && isImmediateCacheableResponse(res)) {
        if (needsBodyCleanup && !incoming.readableEnded) outgoing.once("finish", () => {
          if (!incoming.readableEnded) drainIncoming(incoming);
        });
        return responseViaCache(res, outgoing);
      }
      ensureCloseHandler();
    } catch (e) {
      if (!res) if (options.errorHandler) {
        ensureCloseHandler();
        res = await options.errorHandler(req ? e : toRequestError(e));
        if (!res) return;
      } else if (!req) res = handleRequestError();
      else res = handleFetchError(e);
      else return handleResponseError(e, outgoing);
    }
    try {
      return await responseViaResponseObject(res, outgoing, options);
    } catch (e) {
      return handleResponseError(e, outgoing);
    }
  };
};
var CloseEvent = globalThis.CloseEvent ?? class extends Event {
  #eventInitDict;
  constructor(type, eventInitDict = {}) {
    super(type, eventInitDict);
    this.#eventInitDict = eventInitDict;
  }
  get wasClean() {
    return this.#eventInitDict.wasClean ?? false;
  }
  get code() {
    return this.#eventInitDict.code ?? 0;
  }
  get reason() {
    return this.#eventInitDict.reason ?? "";
  }
};
var ErrorEvent = globalThis.ErrorEvent ?? class extends Event {
  #eventInitDict;
  constructor(type, eventInitDict = {}) {
    super(type, eventInitDict);
    this.#eventInitDict = eventInitDict;
  }
  get message() {
    return this.#eventInitDict.message ?? "";
  }
  get filename() {
    return this.#eventInitDict.filename ?? "";
  }
  get lineno() {
    return this.#eventInitDict.lineno ?? 0;
  }
  get colno() {
    return this.#eventInitDict.colno ?? 0;
  }
  get error() {
    return this.#eventInitDict.error ?? null;
  }
};
var generateConnectionSymbol = () => Symbol("connection");
var CONNECTION_SYMBOL_KEY = Symbol("CONNECTION_SYMBOL_KEY");
var WAIT_FOR_WEBSOCKET_SYMBOL = Symbol("WAIT_FOR_WEBSOCKET_SYMBOL");
var upgradeWebSocket = defineWebSocketHelper(async (c, events, options) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return;
  const env = c.env;
  const waitForWebSocket = env[WAIT_FOR_WEBSOCKET_SYMBOL];
  if (!waitForWebSocket || !env.incoming) return new Response(null, { status: 500 });
  const connectionSymbol = generateConnectionSymbol();
  env[CONNECTION_SYMBOL_KEY] = connectionSymbol;
  (async () => {
    let ws;
    try {
      ws = await waitForWebSocket(env.incoming, connectionSymbol);
    } catch {
      return;
    }
    const messagesReceivedInStarting = [];
    const bufferMessage = (data, isBinary) => {
      messagesReceivedInStarting.push([data, isBinary]);
    };
    ws.on("message", bufferMessage);
    const ctx = {
      binaryType: "arraybuffer",
      close(code, reason) {
        ws.close(code, reason);
      },
      protocol: ws.protocol,
      raw: ws,
      get readyState() {
        return ws.readyState;
      },
      send(source, opts) {
        ws.send(source, { compress: opts?.compress });
      },
      url: new URL(c.req.url)
    };
    try {
      events?.onOpen?.(new Event("open"), ctx);
    } catch (e) {
      (options?.onError ?? console.error)(e);
    }
    const handleMessage = (data, isBinary) => {
      const datas = Array.isArray(data) ? data : [data];
      for (const data2 of datas) try {
        events?.onMessage?.(new MessageEvent("message", { data: isBinary ? data2 instanceof ArrayBuffer ? data2 : data2.buffer.slice(data2.byteOffset, data2.byteOffset + data2.byteLength) : typeof data2 === "string" ? data2 : Buffer.from(data2).toString("utf-8") }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    };
    ws.off("message", bufferMessage);
    for (const message of messagesReceivedInStarting) handleMessage(...message);
    ws.on("message", (data, isBinary) => {
      handleMessage(data, isBinary);
    });
    ws.on("close", (code, reason) => {
      try {
        events?.onClose?.(new CloseEvent("close", {
          code,
          reason: reason.toString()
        }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    });
    ws.on("error", (error) => {
      try {
        events?.onError?.(new ErrorEvent("error", { error }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    });
  })();
  return new Response();
});

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType2) => {
  return new Response(arrayBuffer, { headers: { "Content-Type": contentType2.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
};

// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
    all,
    dot
  });
  return {};
};
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
  const formData = await formDataPromise;
  if (formData) return convertFormDataToBodyData(formData, options);
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    if (!(options.all || key.endsWith("[]"))) form[key] = value;
    else handleParsingAllValues(form, key, value);
  });
  if (options.dot) Object.entries(form).forEach(([key, value]) => {
    if (key.includes(".")) {
      handleParsingNestedValues(form, key, value, nestingState);
      delete form[key];
    }
  });
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) form[key].push(value);
    else form[key] = [form[key], value];
  } else if (!key.endsWith("[]")) form[key] = value;
  else form[key] = [value];
};
var handleParsingNestedValues = (form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) return;
  let nestedForm = form;
  const keys = key.split(".", 34);
  if (keys.length > 33) throwNestingLimitExceeded();
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) nestedForm[key2] = value;
    else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};
var throwNestingLimitExceeded = () => {
  throw new Error("Nesting limit exceeded");
};

// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
  const paths = path.split("/");
  if (paths[0] === "") paths.shift();
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return {
    groups,
    path
  };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
      paths[j] = paths[j].replace(mark, groups[i][1]);
      break;
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") return "*";
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey2 = `${label}#${next}`;
    if (!patternCache[cacheKey2]) {
      if (match2[2]) patternCache[cacheKey2] = next && next[0] !== ":" && next[0] !== "*" ? [
        cacheKey2,
        match2[1],
        new RegExp(`^${match2[2]}(?=/${next})`)
      ] : [
        label,
        match2[1],
        new RegExp(`^${match2[2]}$`)
      ];
      else patternCache[cacheKey2] = [
        label,
        match2[1],
        true
      ];
    }
    return patternCache[cacheKey2];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) break;
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) sub = mergePath(sub, ...rest);
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
    else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") results.push("/");
        else results.push(basePath);
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else basePath += "/" + segment;
    }
  });
  return results.filter((v2, i, a2) => a2.indexOf(v2) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
  if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
  return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) return;
    if (!url.startsWith(key, keyIndex2 + 1)) keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) return "";
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) return;
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
    let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
    if (encoded) name = _decodeURI(name);
    keyIndex = nextKeyIndex;
    if (name === "") continue;
    let value;
    if (valueIndex === -1) value = "";
    else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) value = _decodeURI(value);
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
      results[name].push(value);
    } else results[name] ??= value;
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  /**
  * `.raw` can get the raw Request object.
  *
  * @see {@link https://hono.dev/docs/api/request#raw}
  *
  * @example
  * ```ts
  * // For Cloudflare Workers
  * app.post('/', async (c) => {
  *   const metadata = c.req.raw.cf?.hostMetadata?
  *   ...
  * })
  * ```
  */
  raw;
  #validatedData;
  #matchResult;
  routeIndex = 0;
  /**
  * `.path` can get the pathname of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#path}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const pathname = c.req.path // `/about/me`
  * })
  * ```
  */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) return this.raw.headers.get(name) ?? void 0;
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) return cachedBody;
    for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
      if (anyCachedKey === "json") body = JSON.stringify(body);
      const contentType2 = anyCachedKey === "formData" ? void 0 : raw2.headers.get("content-type");
      return new Response(body, { headers: contentType2 ? { "Content-Type": contentType2 } : void 0 })[key]();
    });
    return bodyCache[key] = raw2[key]();
  };
  /**
  * `.json()` can parse Request body of type `application/json`
  *
  * @see {@link https://hono.dev/docs/api/request#json}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.json()
  * })
  * ```
  */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
  * `.text()` can parse Request body of type `text/plain`
  *
  * @see {@link https://hono.dev/docs/api/request#text}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.text()
  * })
  * ```
  */
  text() {
    return this.#cachedBody("text");
  }
  /**
  * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
  *
  * @see {@link https://hono.dev/docs/api/request#arraybuffer}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.arrayBuffer()
  * })
  * ```
  */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
  * `.bytes()` parses the request body as a `Uint8Array`.
  *
  * @see {@link https://hono.dev/docs/api/request#bytes}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.bytes()
  * })
  * ```
  */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
  * Parses the request body as a `Blob`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.blob();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#blob
  */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
  * Parses the request body as `FormData`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.formData();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#formdata
  */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
  * Adds validated data to the request.
  *
  * @param target - The target of the validation.
  * @param data - The validated data to add.
  */
  addValidatedData(target, data) {
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
  * `.url` can get the request url strings.
  *
  * @see {@link https://hono.dev/docs/api/request#url}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const url = c.req.url // `http://localhost:8787/about/me`
  *   ...
  * })
  * ```
  */
  get url() {
    return this.raw.url;
  }
  /**
  * `.method` can get the method name of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#method}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const method = c.req.method // `GET`
  * })
  * ```
  */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
  * `.matchedRoutes` can return a matched route in the handler
  *
  * @deprecated
  *
  * Use matchedRoutes helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#matchedroutes}
  *
  * @example
  * ```ts
  * app.use('*', async function logger(c, next) {
  *   await next()
  *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
  *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
  *     console.log(
  *       method,
  *       ' ',
  *       path,
  *       ' '.repeat(Math.max(10 - path.length, 0)),
  *       name,
  *       i === c.req.routeIndex ? '<- respond from here' : ''
  *     )
  *   })
  * })
  * ```
  */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
  * `.routePath` can retrieve the path registered within the handler
  *
  * @deprecated
  *
  * Use routePath helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#routepath}
  *
  * @example
  * ```ts
  * app.get('/posts/:id', (c) => {
  *   return c.json({ path: c.req.routePath })
  * })
  * ```
  */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) str = str.toString();
    if (str instanceof Promise) str = await str;
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) return Promise.resolve(str);
  if (buffer) buffer[0] += str;
  else buffer = [str];
  const resStr = Promise.all(callbacks.map((c) => c({
    phase,
    buffer,
    context
  }))).then((res) => Promise.all(res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))).then(() => buffer[0]));
  if (preserveCallbacks) return raw(await resStr, callbacks);
  else return resStr;
};

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType2, headers) => {
  return {
    "Content-Type": contentType2,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
  * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
  *
  * @see {@link https://hono.dev/docs/api/context#env}
  *
  * @example
  * ```ts
  * // Environment object for Cloudflare Workers
  * app.get('*', async c => {
  *   const counter = c.env.COUNTER
  * })
  * ```
  */
  env = {};
  #var;
  finalized = false;
  /**
  * `.error` can get the error object from the middleware if the Handler throws an error.
  *
  * @see {@link https://hono.dev/docs/api/context#error}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   await next()
  *   if (c.error) {
  *     // do something...
  *   }
  * })
  * ```
  */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
  * Creates an instance of the Context class.
  *
  * @param req - The Request object.
  * @param options - Optional configuration options for the context.
  */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
  * `.req` is the instance of {@link HonoRequest}.
  */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#event}
  * The FetchEvent associated with the current request.
  *
  * @throws Will throw an error if the context does not have a FetchEvent.
  */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no FetchEvent");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#executionctx}
  * The ExecutionContext associated with the current request.
  *
  * @throws Will throw an error if the context does not have an ExecutionContext.
  */
  get executionCtx() {
    if (this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no ExecutionContext");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#res}
  * The Response object for the current request.
  */
  get res() {
    return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
  }
  /**
  * Sets the Response object for the current request.
  *
  * @param _res - The Response object to set.
  */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v2] of this.#res.headers.entries()) {
        if (k === "content-type") continue;
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
        } else _res.headers.set(k, v2);
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
  * `.render()` can create a response within a layout.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   return c.render('Hello!')
  * })
  * ```
  */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
  * Sets the layout for the response.
  *
  * @param layout - The layout to set.
  * @returns The layout function.
  */
  setLayout = (layout) => this.#layout = layout;
  /**
  * Gets the current layout for the response.
  *
  * @returns The current layout function.
  */
  getLayout = () => this.#layout;
  /**
  * `.setRenderer()` can set the layout in the custom middleware.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```tsx
  * app.use('*', async (c, next) => {
  *   c.setRenderer((content) => {
  *     return c.html(
  *       <html>
  *         <body>
  *           <p>{content}</p>
  *         </body>
  *       </html>
  *     )
  *   })
  *   await next()
  * })
  * ```
  */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
  * `.header()` can set headers.
  *
  * @see {@link https://hono.dev/docs/api/context#header}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *
  *   // Append multiple headers using the append option (e.g. Vary)
  *   c.header('Vary', 'Accept-Encoding', { append: true })
  *   c.header('Vary', 'User-Agent', { append: true })
  *
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  header = (name, value, options) => {
    if (this.finalized) this.#res = createResponseInstance(this.#res.body, this.#res);
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) headers.delete(name);
    else if (options?.append) headers.append(name, value);
    else headers.set(name, value);
  };
  status = (status) => {
    this.#status = status;
  };
  /**
  * `.set()` can set the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   c.set('message', 'Hono is hot!!')
  *   await next()
  * })
  * ```
  */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
  * `.get()` can use the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   const message = c.get('message')
  *   return c.text(`The message is "${message}"`)
  * })
  * ```
  */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
  * `.var` can access the value of a variable.
  *
  * @see {@link https://hono.dev/docs/api/context#var}
  *
  * @example
  * ```ts
  * const result = c.var.client.oneMethod()
  * ```
  */
  get var() {
    if (!this.#var) return {};
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
      else responseHeaders.set(key, value);
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
          responseHeaders = new Headers();
          break;
        }
      }
      if (responseHeaders) for (const k in headers) {
        const v2 = headers[k];
        if (typeof v2 === "string") responseHeaders.set(k, v2);
        else {
          responseHeaders.delete(k);
          for (const v22 of v2) responseHeaders.append(k, v22);
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
  * `.body()` can return the HTTP response.
  * You can set headers with `.header()` and set HTTP status code with `.status`.
  * This can also be set in `.text()`, `.json()` and so on.
  *
  * @see {@link https://hono.dev/docs/api/context#body}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *   // Set HTTP status code
  *   c.status(201)
  *
  *   // Return the response body
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
  * `.text()` can render text as `Content-Type:text/plain`.
  *
  * @see {@link https://hono.dev/docs/api/context#text}
  *
  * @example
  * ```ts
  * app.get('/say', (c) => {
  *   return c.text('Hello!')
  * })
  * ```
  */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
  };
  /**
  * `.json()` can render JSON as `Content-Type:application/json`.
  *
  * @see {@link https://hono.dev/docs/api/context#json}
  *
  * @example
  * ```ts
  * app.get('/api', (c) => {
  *   return c.json({ message: 'Hello!' })
  * })
  * ```
  */
  json = (object, arg, headers) => {
    return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
  * `.redirect()` can Redirect, default status code is 302.
  *
  * @see {@link https://hono.dev/docs/api/context#redirect}
  *
  * @example
  * ```ts
  * app.get('/redirect', (c) => {
  *   return c.redirect('/')
  * })
  * app.get('/redirect-permanently', (c) => {
  *   return c.redirect('/', 301)
  * })
  * ```
  */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
    return this.newResponse(null, status ?? 302);
  };
  /**
  * `.notFound()` can return the Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/context#notfound}
  *
  * @example
  * ```ts
  * app.get('/notfound', (c) => {
  *   return c.notFound()
  * })
  * ```
  */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      let res;
      let isError = false;
      let handler2;
      if (middleware[i]) {
        handler2 = middleware[i][0][0];
        context.req.routeIndex = i;
      } else handler2 = i === middleware.length && next || void 0;
      if (handler2) try {
        res = await handler2(context, () => dispatch(i + 1));
      } catch (err2) {
        if (err2 instanceof Error && onError) {
          context.error = err2;
          res = await onError(err2, context);
          isError = true;
        } else throw err2;
      }
      else if (context.finalized === false && onNotFound) res = await onNotFound(context);
      if (res && (context.finalized === false || isError)) context.res = res;
      return context;
    }
  };
};

// node_modules/hono/dist/router.js
var METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "options",
  "patch",
  "query"
];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err2, c) => {
  if ("getResponse" in err2) {
    const res = err2.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err2);
  return c.text("Internal Server Error", 500);
};
var Hono = class Hono2 {
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  router;
  getPath;
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    [...METHODS, "all"].forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") this.#path = args1;
        else this.#addRoute(methodName, this.#path, args1);
        args.forEach((handler2) => {
          this.#addRoute(methodName, this.#path, handler2);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p2 of [path].flat()) {
        this.#path = p2;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler2 of handlers) this.#addRoute(methodName, this.#path, handler2);
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") this.#path = arg1;
      else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler2) => {
        this.#addRoute("ALL", this.#path, handler2);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new Hono2({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  errorHandler = errorHandler;
  /**
  * `.route()` allows grouping other Hono instance in routes.
  *
  * @see {@link https://hono.dev/docs/api/routing#grouping}
  *
  * @param {string} path - base Path
  * @param {Hono} app - other Hono instance
  * @returns {Hono} routed Hono instance
  *
  * @example
  * ```ts
  * const app = new Hono()
  * const app2 = new Hono()
  *
  * app2.get("/user", (c) => c.text("user"))
  * app.route("/api", app2) // GET /api/user
  * ```
  */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler2;
      if (app2.errorHandler === errorHandler) handler2 = r.handler;
      else {
        handler2 = async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res;
        handler2[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler2, r.basePath);
    });
    return this;
  }
  /**
  * `.basePath()` allows base paths to be specified.
  *
  * @see {@link https://hono.dev/docs/api/routing#base-path}
  *
  * @param {string} path - base Path
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * const api = new Hono().basePath('/api')
  * ```
  */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
  * `.onError()` handles an error and returns a customized Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#error-handling}
  *
  * @param {ErrorHandler} handler - request Handler for error
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.onError((err, c) => {
  *   console.error(`${err}`)
  *   return c.text('Custom Error Message', 500)
  * })
  * ```
  */
  onError = (handler2) => {
    this.errorHandler = handler2;
    return this;
  };
  /**
  * `.notFound()` allows you to customize a Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#not-found}
  *
  * @param {NotFoundHandler} handler - request handler for not-found
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.notFound((c) => {
  *   return c.text('Custom 404 Message', 404)
  * })
  * ```
  */
  notFound = (handler2) => {
    this.#notFoundHandler = handler2;
    return this;
  };
  /**
  * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
  *
  * @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
  *
  * @see {@link https://hono.dev/docs/api/hono#mount}
  *
  * @param {string} path - base Path
  * @param {Function} applicationHandler - other Request Handler
  * @param {MountOptions} [options] - options of `.mount()`
  * @returns {Hono} mounted Hono instance
  *
  * @example
  * ```ts
  * import { Router as IttyRouter } from 'itty-router'
  * import { Hono } from 'hono'
  * // Create itty-router application
  * const ittyRouter = IttyRouter()
  * // GET /itty-router/hello
  * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
  *
  * const app = new Hono()
  * app.mount('/itty-router', ittyRouter.handle)
  * ```
  *
  * @example
  * ```ts
  * const app = new Hono()
  * // Send the request to another application without modification.
  * app.mount('/app', anotherApp, {
  *   replaceRequest: (req) => req,
  * })
  * ```
  */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") optionHandler = options;
      else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) replaceRequest = (request) => request;
        else replaceRequest = options.replaceRequest;
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler2 = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) return res;
      await next();
    };
    this.#addRoute("ALL", mergePath(path, "*"), handler2);
    return this;
  }
  #addRoute(method, path, handler2, baseRoutePath) {
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler: handler2
    };
    this.router.add(method, path, [handler2, r]);
    this.routes.push(r);
  }
  #handleError(err2, c) {
    if (err2 instanceof Error) return this.errorHandler(err2, c);
    throw err2;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err2) {
        return this.#handleError(err2, c);
      }
      return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err2) => this.#handleError(err2, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
        return context.res;
      } catch (err2) {
        return this.#handleError(err2, c);
      }
    })();
  }
  /**
  * `.fetch()` will be entry point of your app.
  *
  * @see {@link https://hono.dev/docs/api/hono#fetch}
  *
  * @param {Request} request - request Object of request
  * @param {Env} env - env Object
  * @param {ExecutionContext} executionCtx - context of execution
  * @returns {Response | Promise<Response>} response of request
  *
  */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
  * `.request()` is a useful method for testing.
  * You can pass a URL or pathname to send a GET request.
  * app will return a Response object.
  * ```ts
  * test('GET /hello is ok', async () => {
  *   const res = await app.request('/hello')
  *   expect(res.status).toBe(200)
  * })
  * ```
  * @see https://hono.dev/docs/api/hono#request
  */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    input = input.toString();
    return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
  };
  /**
  * `.fire()` automatically adds a global fetch event listener.
  * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
  * @deprecated
  * Use `fire` from `hono/service-worker` instead.
  * ```ts
  * import { Hono } from 'hono'
  * import { fire } from 'hono/service-worker'
  *
  * const app = new Hono()
  * // ...
  * fire(app)
  * ```
  * @see https://hono.dev/docs/api/hono#fire
  * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
  * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
  */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/hono/dist/router/utils.js
var createNullObject = () => /* @__PURE__ */ Object.create(null);

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = (method2, path2) => {
    const matcher = matchers[method2] || matchers["ALL"];
    const staticMatch = matcher[2][path2];
    if (staticMatch) return staticMatch;
    const match3 = path2.match(matcher[0]);
    if (!match3) return [[], emptyParam];
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  };
  this.match = match2;
  return match2(method, path);
}

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
function compareKey(a2, b2) {
  if (a2.length === 1) return b2.length === 1 ? a2 < b2 ? -1 : 1 : -1;
  if (b2.length === 1) return 1;
  if (a2 === ".*" || a2 === "(?:|/.*)") return b2 === "(?:|/.*)" ? -1 : 1;
  else if (b2 === ".*" || b2 === "(?:|/.*)") return -1;
  if (a2 === "[^/]+") return 1;
  else if (b2 === "[^/]+") return -1;
  return a2.length === b2.length ? a2 < b2 ? -1 : 1 : b2.length - a2.length;
}
var Node = class Node2 {
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context, isStatic) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
        "",
        "",
        ".*"
      ] : [
        "",
        "",
        LABEL_REG_EXP_STR
      ] : null : token === "/*" ? [
        "",
        "",
        TAIL_WILDCARD_REG_EXP_STR
      ] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || "[^/]+";
        if (name && pattern[2]) {
          if (regexpStr === ".*") throw PATH_ERROR;
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
        }
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== ".*" && regexpStr !== "(?:|/.*)") {
            for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          }
          nextNode = node.#children[regexpStr] = new Node2();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) if (k.length > 1 && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          nextNode = node.#children[token] = new Node2();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) throw PATH_ERROR;
    node.#index = isStatic ? -1 : index;
  }
  buildRegExpStr() {
    const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
    if (strList.length === 0) return "";
    if (strList.length === 1) return strList[0];
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  paths = createNullObject();
  insert(path, isStatic) {
    if (isStatic) {
      this.#root.insert(path.split(""), 0, [], this.#context, true);
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) break;
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
        tokens[j] = tokens[j].replace(mark, groups[i][1]);
        break;
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
    this.paths[path] = [this.#index++, paramAssoc];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") return [
      /^$/,
      [],
      []
    ];
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [
      new RegExp(`^${regexp}`),
      indexReplacementMap,
      paramReplacementMap
    ];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(`^${path.replace(/\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g, (match2, metaChar) => metaChar ? `\\${metaChar}` : match2 === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match2 === "*" ? ".*" : `/:${LABEL_REG_EXP_STR}`)}$`);
}
function findMiddleware(middleware, path) {
  for (const k of Object.keys(middleware).sort((a2, b2) => b2.length - a2.length)) if (buildWildcardRegExp(k).test(path)) return [...middleware[k]];
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  #tries;
  constructor() {
    this.#middleware = { ["ALL"]: createNullObject() };
    this.#routes = { ["ALL"]: createNullObject() };
    this.#tries = { ["ALL"]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler2) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    if (!middleware[method]) {
      this.#tries[method] = new Trie();
      for (const handlerMap of [middleware, routes]) {
        handlerMap[method] = createNullObject();
        for (const p2 in handlerMap["ALL"]) {
          handlerMap[method][p2] = [...handlerMap["ALL"][p2]];
          this.#insertPath(method, p2);
        }
      }
    }
    if (path === "/*") path = "*";
    const methods = method === "ALL" ? Object.keys(middleware) : [method];
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      for (const m of methods) if (!middleware[m][path]) {
        this.#insertPath(m, path);
        middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
      }
      for (const handlerMap of [middleware, routes]) for (const m of methods) for (const p2 in handlerMap[m]) re.test(p2) && handlerMap[m][p2].push([handler2, path]);
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (const path2 of paths) for (const m of methods) {
      if (!routes[m][path2]) {
        this.#insertPath(m, path2);
        routes[m][path2] = findMiddleware(middleware[m], path2) || findMiddleware(middleware["ALL"], path2) || [];
      }
      routes[m][path2].push([handler2, path2]);
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#routes)) matchers[method] = this.#buildMatcher(method);
    this.#middleware = this.#routes = this.#tries = void 0;
    wildcardRegExpCache = createNullObject();
    return matchers;
  }
  #buildMatcher(method) {
    const middleware = this.#middleware[method];
    const routes = this.#routes[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    for (const r of [middleware, routes]) for (const path in r) {
      const handlers = r[path];
      const pathData = trie.paths[path];
      if (!pathData) {
        staticMap[path] = [handlers.map(([h2]) => [h2, createNullObject()]), emptyParam];
        continue;
      }
      handlerData[pathData[0]] = handlers.map(([h2, handlerPath]) => [h2, trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
        map[key] = paramReplacementMap[pathData[1][i][1]];
        return map;
      }, createNullObject())]);
    }
    return [
      regexp,
      indexReplacementMap.map((i) => handlerData[i]),
      staticMap
    ];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler2) {
    if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    this.#routes.push([
      method,
      path,
      handler2
    ]);
  }
  match(method, path) {
    if (!this.#routes) throw new Error("Fatal error");
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) router.add(...routes[i2]);
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) continue;
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) throw new Error("Fatal error");
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node3 = class Node4 {
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler2) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p2 of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p2, nextP) || (nextP === void 0 && p2 && p2.indexOf("*") === p2.length - 1 ? p2 : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p2;
      const child = curNode.#children[key] ||= new Node4();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) possibleKeys.add(pattern[1]);
    }
    curNode.#methods.push({ [method]: {
      handler: handler2,
      possibleKeys: [...possibleKeys],
      score: ++order
    } });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m["ALL"];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    let curNodes = [this];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else tempNodes.push(nextNode);
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) continue;
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p2 = 0; p2 < len; p2++) {
                partOffsets[p2] = offset;
                offset += parts[p2].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                (curNodesQueue[componentCount] ||= []).push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) handlerSets.sort((a2, b2) => {
      return a2.score - b2.score;
    });
    return [handlerSets.map(({ handler: handler2, params }) => [handler2, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node = new Node3();
  add(method, path, handler2) {
    for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler2);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono3 = class extends Hono {
  /**
  * Creates an instance of the Hono class.
  *
  * @param options - Optional configuration options for the Hono instance.
  */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = (options) => {
  const opts = {
    origin: "*",
    allowMethods: [
      "GET",
      "HEAD",
      "PUT",
      "POST",
      "DELETE",
      "PATCH",
      "QUERY"
    ],
    allowHeaders: [],
    exposeHeaders: [],
    ...options
  };
  const exposeHeadersStr = opts.exposeHeaders?.length ? opts.exposeHeaders.join(",") : void 0;
  const allowHeadersStr = opts.allowHeaders?.length ? opts.allowHeaders.join(",") : void 0;
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") return () => optsOrigin;
      else return (origin) => optsOrigin === origin ? origin : null;
    } else if (typeof optsOrigin === "function") return optsOrigin;
    else return (origin) => optsOrigin.includes(origin) ? origin : null;
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") return async (origin, c) => (await optsAllowMethods(origin, c)).join(",");
    else if (Array.isArray(optsAllowMethods)) {
      const methodsStr = optsAllowMethods.join(",");
      return () => methodsStr;
    } else return () => "";
  })(opts.allowMethods);
  return async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) set("Access-Control-Allow-Origin", allowOrigin);
    if (opts.credentials) set("Access-Control-Allow-Credentials", "true");
    if (exposeHeadersStr) set("Access-Control-Expose-Headers", exposeHeadersStr);
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") c.res.headers.append("Vary", "Origin");
      if (opts.maxAge != null) set("Access-Control-Max-Age", opts.maxAge.toString());
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods) set("Access-Control-Allow-Methods", allowMethods);
      let headersStr = allowHeadersStr;
      if (!headersStr) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) headersStr = requestHeaders.split(",").map((h2) => h2.trim()).join(",");
      }
      if (headersStr) {
        set("Access-Control-Allow-Headers", headersStr);
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") c.header("Vary", "Origin", { append: true });
  };
};

// src/app.ts
init_config();
init_pool();

// src/ui.ts
var BASE_CSS = `
:root {
  color-scheme: light;

  /* Vercel dashboard canvas -------------------------------------------- */
  --bg: #fafafa;
  --surface: #ffffff;
  --surface-2: #f5f5f5;
  --surface-3: #eaeaea;
  --line: #eaeaea;
  --line-2: #d4d4d4;

  --text: #171717;
  --text-2: #525252;
  --text-3: #6b6b6b;

  --accent: #000000;
  --accent-hover: #333333;
  --accent-ink: #ffffff;
  --accent-wash: rgba(0, 0, 0, 0.05);

  --ok: #067647;
  --warn: #b54708;
  --bad: #dc2626;
  --neutral: #737373;

  --wash-ok: rgba(6, 118, 71, 0.08);
  --wash-warn: rgba(181, 71, 8, 0.08);
  --wash-bad: rgba(220, 38, 38, 0.07);
  --wash-neutral: rgba(115, 115, 115, 0.08);

  /* provider identity: muted Vercel-style hues, always paired with the word */
  --prov-gemini: #0057c2;
  --prov-gemini-wash: rgba(0, 87, 194, 0.08);
  --prov-elevenlabs: #7928ca;
  --prov-elevenlabs-wash: rgba(121, 40, 202, 0.08);
  --prov-whatstoken: #0a7d5a;
  --prov-whatstoken-wash: rgba(10, 125, 90, 0.08);
  --prov-custom: #171717;
  --prov-custom-wash: rgba(0, 0, 0, 0.05);

  /* top bar (the old rail, restyled) ----------------------------------- */
  --rail-bg: #ffffff;
  --rail-bg-2: #f5f5f5;
  --rail-line: #eaeaea;
  --rail-text: #171717;
  --rail-muted: #6b6b6b;
  --rail-active: #f5f5f5;

  --sans: "Geist", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --mono: "Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  --r-surface: 8px;
  --r-ctl: 6px;
  --r-pill: 999px;

  /* Spacing scale (4px base) and its jobs: caption 4 / tight 8 / half 12 /
     inner 16 / section 24 / loose 32 / deep 48. Page sections stack at 24,
     content inside a section stacks at 16, controls sit at 8, captions at 4.
     Layout rules below use these tokens, never raw px, so the rhythm holds
     on every page. */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-2h: 12px;
  --sp-3: 16px;
  --sp-4: 24px;
  --sp-5: 48px;
  --sp-6: 32px;
  --inset: 16px;

  --tap: 32px;
  --tap-sm: 28px;

  /* The rail is fixed; the canvas takes the rest of the viewport, so the
     layout is full-bleed by construction \u2014 no page max-width. */
  --rail: 232px;
  --gutter: 28px;
}

/* the light theme is the same system inverted, chosen explicitly ---------- */
:root[data-theme="light"] {
  color-scheme: light;

  /* Vercel dashboard canvas -------------------------------------------- */
  --bg: #fafafa;
  --surface: #ffffff;
  --surface-2: #f5f5f5;
  --surface-3: #eaeaea;
  --line: #eaeaea;
  --line-2: #d4d4d4;

  --text: #171717;
  --text-2: #525252;
  --text-3: #6b6b6b;

  --accent: #000000;
  --accent-hover: #333333;
  --accent-ink: #ffffff;
  --accent-wash: rgba(0, 0, 0, 0.05);

  --ok: #067647;
  --warn: #b54708;
  --bad: #dc2626;
  --neutral: #737373;

  --wash-ok: rgba(6, 118, 71, 0.08);
  --wash-warn: rgba(181, 71, 8, 0.08);
  --wash-bad: rgba(220, 38, 38, 0.07);
  --wash-neutral: rgba(115, 115, 115, 0.08);

  /* provider identity: muted Vercel-style hues, always paired with the word */
  --prov-gemini: #0057c2;
  --prov-gemini-wash: rgba(0, 87, 194, 0.08);
  --prov-elevenlabs: #7928ca;
  --prov-elevenlabs-wash: rgba(121, 40, 202, 0.08);
  --prov-whatstoken: #0a7d5a;
  --prov-whatstoken-wash: rgba(10, 125, 90, 0.08);
  --prov-custom: #171717;
  --prov-custom-wash: rgba(0, 0, 0, 0.05);

  /* top bar (the old rail, restyled) ----------------------------------- */
  --rail-bg: #ffffff;
  --rail-bg-2: #f5f5f5;
  --rail-line: #eaeaea;
  --rail-text: #171717;
  --rail-muted: #6b6b6b;
  --rail-active: #f5f5f5;

  /* Layout tokens stay on :root. Repeating them here made the light theme
     outrank every media query (a theme selector is more specific than
     :root), so a light-theme phone kept 28px gutters and 32px tap targets. */
}

:root[data-theme="dark"] {
  color-scheme: dark;

  --bg: #000000;
  --surface: #111111;
  --surface-2: #1a1a1a;
  --surface-3: #262626;
  --line: #333333;
  --line-2: #444444;

  --text: #ededed;
  --text-2: #a1a1a1;
  --text-3: #8a8a8a;

  --accent: #ffffff;
  --accent-hover: #e5e5e5;
  --accent-ink: #000000;
  --accent-wash: rgba(255, 255, 255, 0.08);

  --ok: #4ade80;
  --warn: #fbbf24;
  --bad: #f87171;
  --neutral: #a1a1a1;

  --wash-ok: rgba(74, 222, 128, 0.12);
  --wash-warn: rgba(251, 191, 36, 0.12);
  --wash-bad: rgba(248, 113, 113, 0.12);
  --wash-neutral: rgba(161, 161, 161, 0.12);

  --prov-gemini: #3291ff;
  --prov-gemini-wash: rgba(50, 145, 255, 0.12);
  --prov-elevenlabs: #a78bfa;
  --prov-elevenlabs-wash: rgba(167, 139, 250, 0.12);
  --prov-whatstoken: #34d399;
  --prov-whatstoken-wash: rgba(52, 211, 153, 0.12);
  --prov-custom: #ededed;
  --prov-custom-wash: rgba(255, 255, 255, 0.08);

  --rail-bg: #000000;
  --rail-bg-2: #1a1a1a;
  --rail-line: #333333;
  --rail-text: #ededed;
  --rail-muted: #a1a1a1;
  --rail-active: #1a1a1a;
}

*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; padding: 0; }
html { background: var(--bg); -webkit-text-size-adjust: 100%; }
/* Web Interface Guidelines: no double-tap zoom delay, an intentional tap
   highlight, and rubber-band suppression on fine pointers only, so touch
   keeps pull-to-refresh. */
body { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
@media (pointer: fine) {
  html { overscroll-behavior: none; }
}
#main { scroll-margin-top: var(--sp-5); }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.55;
  font-feature-settings: "cv05" 1, "ss01" 1;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
h1, h2, h3, h4 { margin: 0; line-height: 1.25; font-weight: 640; letter-spacing: -0.018em; }
p { margin: 0; }
a { color: inherit; text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 2px; }
b, strong { font-weight: 640; }
hr { border: 0; border-top: 1px solid var(--line); margin: 0; }
button, input, select, textarea { font: inherit; color: inherit; }
svg { display: block; }
code, kbd, samp { font-family: var(--mono); font-size: 0.92em; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
#main:focus, #main:focus-visible { outline: none; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* shell ------------------------------------------------------------------ */

.skip {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 200;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-ctl);
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 620;
}
.skip:focus { left: var(--sp-2h); top: var(--sp-2h); }

.shell {
  display: grid;
  grid-template-columns: var(--rail) minmax(0, 1fr);
  min-height: 100dvh;
}

/* the rail --------------------------------------------------------------- */

.rail {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  height: 100dvh;
  padding: var(--sp-3);
  overflow-y: auto;
  background: var(--rail-bg);
  color: var(--rail-text);
  border-right: 1px solid var(--rail-line);
}
/* Before the admin token is accepted the shell renders only the gate. The
   rail carries the section nav, so it must not
   exist in the document until reveal() runs. */
body[data-gate="locked"] .rail { display: none; }
body[data-gate="locked"] .app { display: none; }

.rail-brand {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0 var(--sp-2);
  min-height: var(--tap);
}
.rail-brand:hover { text-decoration: none; }
.rail-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--rail-text);
  color: var(--rail-bg);
  flex: none;
}
.rail-name { display: flex; flex-direction: column; line-height: 1.15; }
.rail-name b { font-size: 15px; font-weight: 660; letter-spacing: -0.02em; }
.rail-name span { font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--rail-muted); }
/* The provider strip under the wordmark. The console is a multi-provider
   gateway, so the rail names every provider it proxies, in that provider's
   own colour, before any page loads. */
.rail-providers { display: flex; flex-direction: column; gap: var(--sp-1); padding: 0 var(--sp-2); }
.rail-prov { display: flex; align-items: center; gap: var(--sp-2); font-size: 11.5px; color: var(--rail-muted); }
.rail-prov b { color: var(--rail-text); font-weight: 560; }

.rail-nav { display: flex; flex-direction: column; gap: var(--sp-3); }
.rail-group { display: flex; flex-direction: column; gap: var(--sp-1); }
.rail-label {
  padding: 0 var(--sp-2) var(--sp-1);
  font-size: 10px;
  font-weight: 620;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--rail-muted);
}
.rail-item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: var(--tap);
  padding: 0 var(--sp-2);
  border-left: 2px solid transparent;
  border-radius: 7px;
  color: var(--rail-muted);
  font-size: 13.5px;
  font-weight: 520;
  transition: background-color 140ms ease, color 140ms ease;
}
.rail-item svg { flex: none; opacity: 0.85; }
.rail-item:hover { background: var(--rail-bg-2); color: var(--rail-text); text-decoration: none; }
.rail-item[aria-current="page"] {
  background: var(--rail-active);
  color: var(--rail-text);
  border-left-color: var(--accent);
}
.rail-item[aria-current="page"] svg { opacity: 1; color: var(--accent); }

.rail-foot { margin-top: auto; display: flex; flex-direction: column; gap: var(--sp-1); }
.rail-state {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-2);
  font-size: 11.5px;
  color: var(--rail-muted);
}
.rail-state b { color: var(--rail-text); font-weight: 560; font-family: var(--mono); font-size: 11px; }
.rail-tools { display: flex; gap: var(--sp-1); padding: var(--sp-1) var(--sp-2) 0; }
.rail-tool {
  display: grid;
  place-items: center;
  width: var(--tap-sm);
  height: var(--tap-sm);
  border: 1px solid var(--rail-line);
  border-radius: 6px;
  background: transparent;
  color: var(--rail-muted);
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
}
.rail-tool:hover { color: var(--rail-text); border-color: var(--rail-muted); }
.rail-tool[aria-pressed="true"] { color: var(--rail-text); border-color: var(--accent); }

.rail-actions { display: flex; flex-wrap: wrap; gap: var(--sp-1); padding: var(--sp-1) var(--sp-2) 0; }
.rail-state[data-tone="warn"] b { color: var(--warn); }
.rail-state[data-tone="bad"] b { color: var(--bad); }

/* the canvas ------------------------------------------------------------- */

.canvas { display: flex; flex-direction: column; min-width: 0; }

.canvas-head {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 56px;
  padding: 0 var(--sp-4);
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}
.canvas-crumb {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-3);
}
.canvas-crumb b { color: var(--text); font-weight: 600; font-size: 13px; }
.head-actions { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }

.menu-btn { display: none; flex: none; }

.page {
  width: 100%;
  /* Full-bleed canvas: the sidebar is the only fixed column, so the page owns
     every remaining pixel. A centered max-width column wasted half of a wide
     screen and made tables scroll while the viewport sat empty. */
  padding: var(--sp-4) var(--gutter) var(--sp-5);
  min-width: 0;
}

/* page head -------------------------------------------------------------- */

.eyebrow {
  display: block;
  margin-bottom: var(--sp-2);
  font-size: 10.5px;
  font-weight: 640;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-3);
}
.page-head { display: flex; align-items: flex-end; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-4); }
.page-head-main { min-width: 0; flex: 1 1 320px; }
.page-title { font-size: 30px; letter-spacing: -0.03em; font-weight: 660; text-wrap: balance; }
.page-lede { margin-top: var(--sp-2); max-width: 68ch; color: var(--text-2); font-size: 13.5px; }
.page-head-side { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }

/* surfaces --------------------------------------------------------------- */

.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-surface);
  min-width: 0;
  overflow: hidden;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}
.panel-head h2, .panel-head h3 { font-size: 13.5px; font-weight: 620; letter-spacing: -0.01em; text-wrap: balance; }
.panel-head .meta { margin-left: auto; font-size: 12px; color: var(--text-3); }
.panel-body { padding: var(--inset); }
.panel-body.flush { padding: 0; }
.panel-foot { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--inset); border-top: 1px solid var(--line); flex-wrap: wrap; }
.panel-note { padding: var(--sp-2) var(--inset); border-top: 1px solid var(--line); font-size: 12px; color: var(--text-3); }

/* a zone: hairline header, no box */
.zone { border-top: 1px solid var(--line); padding-top: var(--sp-3); margin-top: var(--sp-4); }
.zone:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
.zone-head { display: flex; align-items: baseline; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-3); }
.zone-head h2 { font-size: 12px; font-weight: 640; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.zone-head .meta { margin-left: auto; font-size: 12px; color: var(--text-3); }

.grid { display: grid; gap: var(--sp-3); min-width: 0; }
/* Fluid columns: a wide screen gets more columns, not wider cells. auto-fit
   with a floor means a 1600px canvas shows three breakdowns side by side and a
   900px one shows a single stack, with no breakpoint bookkeeping. */
.grid-2 { grid-template-columns: repeat(auto-fit, minmax(620px, 1fr)); }
/* a grid of tables needs more room than a grid of panels: seven columns in a
   620px cell clipped the last one, so these pair up only when each gets 720px */
.grid-2:has(.table) { grid-template-columns: repeat(auto-fit, minmax(720px, 1fr)); }
.grid-3 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.grid-4 { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: var(--sp-3); align-items: start; }

/* figures ---------------------------------------------------------------- */

/* A KPI row is separate cards, never one full-width strip with dividers: the
   overview reads like a dashboard, and every figure carries its own surface so
   it can be compared at a glance. One width per card across every row: the
   card count changes per page, so a fixed 220px floor keeps a twelve-figure
   page at six columns and a five-figure page at five, rather than stretching
   whatever lands alone on the last row to the full width. */
.figures {
  display: grid;
  gap: var(--sp-3);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  min-width: 0;
}
.fig {
  padding: var(--sp-2h) var(--sp-3);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-surface);
  min-width: 0;
}
.fig-label {
  display: block; font-size: 11px; font-weight: 620; letter-spacing: 0.13em;
  text-transform: uppercase; color: var(--text-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.fig-value {
  display: block;
  margin-top: 2px;
  font-family: var(--mono);
  font-size: 24px;
  font-weight: 550;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
  word-break: break-word;
}
.fig-sub { display: block; margin-top: var(--sp-1); font-size: 12px; color: var(--text-2); }
.fig[data-tone="ok"] .fig-value { color: var(--ok); }
.fig[data-tone="warn"] .fig-value { color: var(--warn); }
.fig[data-tone="bad"] .fig-value { color: var(--bad); }
.fig[data-tone="prov-gemini"] .fig-value { color: var(--prov-gemini); }
.fig[data-tone="prov-elevenlabs"] .fig-value { color: var(--prov-elevenlabs); }
.fig[data-tone="prov-whatstoken"] .fig-value { color: var(--prov-whatstoken); }
.fig[data-tone="prov-custom"] .fig-value { color: var(--prov-custom); }

.kpi { padding: var(--sp-3); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-surface); }

/* The pool split is one card, not one card per provider: the pool is one
   pool and the split is a detail of it. A row of name / ready-of-total /
   bar per provider, all on one surface. */
.prov-split {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-4);
  padding: var(--sp-2h) var(--sp-3);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-surface); min-width: 0;
}
.split-head {
  flex: none; font-size: 11px; font-weight: 620; letter-spacing: 0.13em;
  text-transform: uppercase; color: var(--text-3); white-space: nowrap;
}
.split-cells { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2) var(--sp-5); flex: 1 1 auto; min-width: 0; }
.split-cell { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
.split-name { font-size: 12.5px; color: var(--text-2); white-space: nowrap; }
.split-count { font-family: var(--mono); font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.split-count b { font-weight: 600; color: var(--text); }
.split-bar { display: block; width: 56px; height: 3px; border-radius: 2px; background: var(--surface-3); overflow: hidden; flex: none; }
.split-bar i { display: block; height: 100%; border-radius: 2px; background: var(--text-3); }
.split-cell[data-tone="prov-gemini"] .split-bar i { background: var(--prov-gemini); }
.split-cell[data-tone="prov-elevenlabs"] .split-bar i { background: var(--prov-elevenlabs); }
.split-cell[data-tone="prov-whatstoken"] .split-bar i { background: var(--prov-whatstoken); }
.split-cell[data-tone="prov-custom"] .split-bar i { background: var(--prov-custom); }

/* controls --------------------------------------------------------------- */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: var(--tap);
  padding: 0 var(--sp-3);
  border: 1px solid var(--line-2);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 560;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}
.btn:hover { background: var(--surface-2); border-color: var(--text-3); }
.btn:active { background: var(--surface-3); }
.btn[disabled], .btn[aria-busy="true"] { opacity: 0.55; cursor: default; }
.btn svg { flex: none; opacity: 0.8; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn-primary svg { opacity: 1; }
.btn-danger { color: var(--bad); border-color: var(--line-2); }
.btn-danger:hover { background: var(--wash-bad); border-color: var(--bad); }
.btn-ghost { background: transparent; border-color: transparent; color: var(--text-2); }
.btn-ghost:hover { background: var(--surface-2); border-color: transparent; color: var(--text); }
.btn-sm { min-height: var(--tap-sm); padding: 0 var(--sp-2); font-size: 12.5px; }
.btn-block { width: 100%; }
.icon-btn { width: var(--tap); padding: 0; }
.icon-btn.btn-sm { width: var(--tap-sm); }

.field { display: block; margin-bottom: var(--sp-2); font-size: 12px; font-weight: 580; color: var(--text-2); }
.input, .select, .textarea {
  width: 100%;
  min-height: var(--tap);
  padding: 0 var(--sp-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  transition: border-color 140ms ease;
}
.textarea { padding: var(--sp-2); min-height: 96px; resize: vertical; line-height: 1.5; }
.input::placeholder, .textarea::placeholder { color: var(--text-3); }
.input:hover, .select:hover, .textarea:hover { border-color: var(--text-3); }
.input:focus, .select:focus, .textarea:focus { border-color: var(--accent); }
/* Text inputs dropped the ring and kept a 1px tint while every other control
   kept 2px. Measured 4.52:1 light / 4.56:1 dark: it cleared 1.4.11 but was a
   weaker indicator than the rest of the sheet, and the only inconsistency. */
.input:focus-visible, .select:focus-visible, .textarea:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 1px;
}
.select {
  appearance: none;
  padding-right: 28px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23636974' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 9px center;
}

.search { position: relative; min-width: 0; }
.search svg { position: absolute; left: var(--sp-2); top: 50%; transform: translateY(-50%); color: var(--text-3); pointer-events: none; }
.search .input { padding-left: var(--sp-4); }

.toolbar { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.toolbar .grow { flex: 1 1 200px; min-width: 0; }
/* Filter bar: a grid so every control is the same height on one baseline and
   the columns do not jump when the row wraps. Search takes the leftover
   space; the two selects are sized to their content; per-page stays narrow. */
.filter-grid {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(120px, max-content) minmax(120px, max-content) minmax(120px, max-content) minmax(96px, max-content);
  gap: var(--sp-2) var(--sp-3);
  align-items: end;
  flex: 1 1 auto;
  min-width: 0;
}
.filter-grid .field { margin-bottom: var(--sp-1); }
.filter-grid .select, .filter-grid .search .input { width: 100%; }
.filter-grid .filter-cell { display: flex; flex-direction: column; }
.filter-grid .search { flex: 1 1 auto; display: flex; }
.filter-grid .search .input { height: 100%; }
/* The select's intrinsic height + touch tap-target (min-height 44px on
   pointer:coarse) beats a plain height; pin both the height and the floor. */
.filter-grid .select, .filter-grid .search .input { height: var(--tap); min-height: var(--tap); box-sizing: border-box; }
.filter-size .select { min-width: 96px; }
@media (max-width: 900px) {
  .filter-grid { grid-template-columns: 1fr 1fr; }
  .filter-search, .filter-size { grid-column: 1 / -1; }
}
@media (max-width: 560px) {
  .filter-grid { grid-template-columns: 1fr; }
  .filter-size { grid-column: auto; }
}
.row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.grow { flex: 1 1 auto; min-width: 0; }
.spacer { flex: 1 1 auto; }
.hint { font-size: 12.5px; color: var(--text-2); line-height: 1.5; }
.muted { color: var(--text-3); }
.mono, .num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.num { text-align: right; }

/* Console inline editor (the settings rotation cap): a number field and its
   save button on one row, matching the panel rhythm. */
.inline-form { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
.text-input {
  min-height: var(--tap-sm);
  padding: 0 var(--sp-2);
  font: inherit;
  font-size: 13px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line-2);
  border-radius: var(--r-surface);
  min-width: 0;
  width: 6rem;
}
.text-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.check { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: 12.5px; color: var(--text-2); cursor: pointer; }
.check input[type="checkbox"] {
  appearance: none;
  width: 17px;
  height: 17px;
  margin: 0;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  background: var(--surface);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease;
}
.check input[type="checkbox"]:checked { background: var(--accent); border-color: var(--accent); }
.check input[type="checkbox"]:checked::after {
  content: "";
  width: 9px;
  height: 5px;
  border-left: 2px solid var(--accent-ink);
  border-bottom: 2px solid var(--accent-ink);
  transform: translateY(-1px) rotate(-45deg);
}
.check input[type="checkbox"]:indeterminate { background: var(--accent); border-color: var(--accent); }
.check input[type="checkbox"]:indeterminate::after {
  content: "";
  width: 9px;
  height: 2px;
  background: var(--accent-ink);
}

/* bare controls emitted by tables and toolbars get the same skin */
select:not(.select), td select {
  min-height: var(--tap-sm);
  padding: 0 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-ctl);
  background-color: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
}
select:not(.select):hover, td select:hover { border-color: var(--text-3); }
select:not(.select):focus-visible, td select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

/* The select-all box sits in a th, not a td, so it matched only the sizing
   rule and rendered in the UA default blue while every row checkbox used
   --accent. Two blues on one table. */
th input[type=checkbox],
td input[type=checkbox] {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
  vertical-align: middle;
}
td input[type=checkbox]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (pointer: coarse), (hover: none) {
  td input[type=checkbox] { width: 22px; height: 22px; }
}
.pickbox { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; cursor: pointer; }
/* The label that wraps the select-all checkbox is empty of text, so the
   accessible name came only from the input's own aria-label. Give the label a
   visible-in-a11y-tree text so the grouping reads correctly. */
.pickbox::after { content: ""; }
.pickbox input[type=checkbox] { width: 18px; height: 18px; margin: 0; cursor: pointer; }
@media (pointer: coarse), (hover: none) {
  .pickbox { min-width: var(--tap); min-height: var(--tap); }
  .pickbox input[type=checkbox] { width: 22px; height: 22px; }
}

.seg { display: inline-flex; padding: var(--sp-1); border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--surface); gap: var(--sp-1); }
.seg button {
  min-height: calc(var(--tap) - var(--sp-2));
  padding: 0 var(--sp-2);
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 560;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}
.seg button:hover { color: var(--text); background: var(--surface-2); }
.seg button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); }

/* tags ------------------------------------------------------------------- */

.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  max-width: 100%;
  padding: 2px var(--sp-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 560;
  line-height: 1.7;
  white-space: nowrap;
}
.tag .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
.tag[data-tone="ok"] { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 40%, var(--line)); background: var(--wash-ok); }
/* 4.16:1 on a hovered row in light theme, under 4.5 at 11.5px. Every other
   tone passed in both themes and both row states. */
.table tbody tr:hover .tag[data-tone="ok"] { color: color-mix(in srgb, var(--ok) 82%, var(--text)); }
.tag[data-tone="warn"] { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, var(--line)); background: var(--wash-warn); }
.tag[data-tone="bad"] { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 40%, var(--line)); background: var(--wash-bad); }
.tag[data-tone="neutral"] { color: var(--text-2); background: var(--wash-neutral); }
.tag[data-tone="accent"] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); background: var(--accent-wash); }
/* "plain" and "info" are two tones the runtime asks for that had no skin: the
   unlisted-tier badge and the rotated marker rendered as bare text. */
.tag[data-tone="plain"] { color: var(--text-3); border-color: var(--line-2); background: transparent; }
.tag.info { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); background: var(--accent-wash); }
.tag-mono { font-family: var(--mono); font-size: 11px; letter-spacing: -0.01em; }

/* provider identity ------------------------------------------------------- */

/* A provider badge: the colour AND the word, never the colour alone. */
.prov {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  max-width: 100%;
  padding: 2px var(--sp-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 560;
  line-height: 1.7;
  white-space: nowrap;
}
.prov .prov-dot { width: 6px; height: 6px; }
/* Specific providers first; the generic rules after them give any custom
   provider id the accent identity instead of the neutral grey. */
.prov[data-p="gemini"] { color: var(--prov-gemini); border-color: color-mix(in srgb, var(--prov-gemini) 40%, var(--line)); background: var(--prov-gemini-wash); }
.prov[data-p="elevenlabs"] { color: var(--prov-elevenlabs); border-color: color-mix(in srgb, var(--prov-elevenlabs) 40%, var(--line)); background: var(--prov-elevenlabs-wash); }
.prov[data-p="whatstoken"] { color: var(--prov-whatstoken); border-color: color-mix(in srgb, var(--prov-whatstoken) 40%, var(--line)); background: var(--prov-whatstoken-wash); }
.prov[data-p]:not([data-p="gemini"]):not([data-p="elevenlabs"]):not([data-p="whatstoken"]) { color: var(--prov-custom); border-color: color-mix(in srgb, var(--prov-custom) 40%, var(--line)); background: var(--prov-custom-wash); }
.prov-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--neutral); }
.prov-dot[data-p="gemini"] { background: var(--prov-gemini); }
.prov-dot[data-p="elevenlabs"] { background: var(--prov-elevenlabs); }
.prov-dot[data-p="whatstoken"] { background: var(--prov-whatstoken); }
.prov-dot[data-p]:not([data-p="gemini"]):not([data-p="elevenlabs"]):not([data-p="whatstoken"]) { background: var(--prov-custom); }

.chip { display: inline-flex; align-items: baseline; gap: var(--sp-2); }
.chip + .chip { margin-left: var(--sp-3); padding-left: var(--sp-3); border-left: 1px solid var(--line); }
.chip-k { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-3); }
.chip-v { font-family: var(--mono); font-size: 13px; font-variant-numeric: tabular-nums; }

/* tables ----------------------------------------------------------------- */

.table-wrap { width: 100%; overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: var(--sp-2) var(--inset);
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 640;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
}
.table td {
  padding: var(--sp-2) var(--inset);
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
  min-width: 0;
}
.table tbody tr:last-child td { border-bottom: 0; }
.table tbody tr { transition: background-color 120ms ease; }
.table tbody tr:hover { background: var(--surface-2); }
.table th.num, .table td.num { text-align: right; }
.table td.mono { font-family: var(--mono); font-size: 12.5px; }
.table .id-cell { font-family: var(--mono); font-size: 12px; color: var(--text-2); }
.table tbody tr[aria-selected="true"] { background: var(--accent-wash); }
.table .actions-cell { text-align: right; white-space: nowrap; }
/* A probe result must never change the row's height: "zero quota 429" wrapping
   to three lines made rows oscillate between 69px and 90px and broke vertical
   scanning. The full message stays in the title attribute. */
.table td[data-l="test"] { white-space: nowrap; }
.table td[data-l="test"] .mono { font-size: 11.5px; }
/* A key id is 12 hex characters. Without this it wrapped to one character per
   line and made its row 264px tall, four times a normal row. */
.table td[data-l="id"] { white-space: nowrap; }
.table td[data-l="id"] .mono { font-size: 12px; }
/* The credential itself, on the detail page. The value is the whole key in
   mono with a copy button beside it; it is never wrapped or truncated here. */
.credential {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.credential-value {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--mono);
  font-size: 15px;
  line-height: 1.5;
  color: var(--text);
  background: var(--accent-wash);
  border: 1px solid var(--line);
  border-radius: var(--r-sm, 6px);
  padding: var(--sp-2) var(--sp-3);
  overflow-wrap: anywhere;
  user-select: all;
}
.credential-value:empty::before { content: "\u2026"; color: var(--text-3); }

/* A definition list reads as a record, not as a dashboard. Three columns keep
   seven facts near 90px; two columns ran to 215px and lost to the KPI strip it
   replaced, because a label plus a value like "quota_exhausted" will not share
   a 156px column. */
/* Seven items in three columns leave the last row with one item and two empty
   cells. Auto-fit lets the grid choose the column count from the available
   width, so the final row either fills or carries an even remainder. */
/* Definition lists (settings): one column of label/value rows. The old
   auto-fit grid turned a three-key group into three cramped columns inside a
   half-width card; a stacked list reads at any card width. */
.defs { display: grid; grid-template-columns: minmax(0, 1fr); }
.def { display: flex; align-items: baseline; gap: var(--sp-3); padding: var(--sp-2) 0; border-top: 1px solid var(--line); min-width: 0; }
.def:first-child { border-top: 0; padding-top: 0; }
.def dt { flex: 0 0 132px; white-space: nowrap; font-size: 12.5px; color: var(--text-3); }
.def dd { flex: 1 1 auto; min-width: 0; font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 12.5px; color: var(--text); overflow-wrap: anywhere; }

/* The key column carries a 39-character mono value and a copy button. Without a
   width the cell demanded its full natural size and pushed the table into
   horizontal scroll; with one, the value ellipsizes and the button stays put.
   The full credential is always in the cell's title and in the copy button. */
.table td[data-l="key"] { width: 250px; max-width: 250px; white-space: nowrap; }
.table td[data-l="provider"] { width: 110px; max-width: 110px; white-space: nowrap; }
.table td[data-l="status"] { width: 230px; max-width: 230px; }
.table td[data-l="plan"] { width: 170px; max-width: 170px; }
/* Providers registry: every column keeps one line. The URL is the only cell
   allowed to ellipsize (host stays visible, full value in the title) so the
   action column never leaves the canvas at 1440. */
.providers-table th:nth-child(1) { width: 190px; }
.providers-table th:nth-child(2) { width: 205px; }
.providers-table th:nth-child(3) { width: auto; }
.providers-table th:nth-child(4) { width: 64px; }
.providers-table th:nth-child(5) { width: 76px; }
.providers-table th:nth-child(6) { width: 96px; }
.providers-table th:nth-child(7) { width: 1%; }
.providers-table td { white-space: nowrap; }
.providers-table td:nth-child(2) { max-width: 205px; overflow: hidden; }
.providers-table td:nth-child(3) .tag { padding: 2px 6px; font-size: 11px; }
.providers-table td[data-l="provider"] { width: 190px; max-width: 190px; }

/* Between 720 and 1400 the registry can still exceed the canvas. Pin the
   action column so Edit / Disable never scroll out of reach. */
@media screen and (max-width: 1400px) {
  .providers-table th:last-child,
  .providers-table td.actions {
    position: sticky; right: 0; z-index: 1;
    background: var(--surface);
    box-shadow: -1px 0 0 var(--line);
  }
  .providers-table th:last-child { z-index: 2; }
  .providers-table tbody tr:hover td.actions { background: var(--surface-2); }
}
.cell-inline { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }

/* Models catalog: the model name is the only column that wants to grow; every
   price and counter is a narrow numeric column pinned to the right. */
.models-table th:nth-child(1) { width: 140px; }
.models-table th:nth-child(3) { width: 120px; }
.models-table th:nth-child(4),
.models-table th:nth-child(5) { width: 116px; }
.models-table th:nth-child(6) { width: 96px; }
.models-table th:nth-child(7) { width: 92px; }
.models-table th:nth-child(8) { width: 1%; }
.trunc { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Stacked rows are full-width cards; the desktop caps above otherwise win on
   order (same specificity, later rule wins) and leave three rows narrower than
   the other six, with space-between pushing their values to a different edge.
   This must sit AFTER the base widths to take effect. */
@media (max-width: 720px) {
  .table td[data-l="key"], .table td[data-l="provider"], .table td[data-l="status"], .table td[data-l="plan"] {
    width: auto; max-width: none;
  }
}
/* The plan marker sentence is the longest text in the row. Without nowrap it
   wrapped to four lines when the column was squeezed, which took the row from
   65px to 101px; the full text stays in the hint's title. */
.table td .plan-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table td .provider-text {
  display: inline-block;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
}
.table .provider-cell {
  white-space: nowrap;
}
.table td .key-text {
  display: inline-block;
  max-width: 212px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
/* A switch, not a checkbox. The auto-refresh control sits beside the action it
   governs, and a square tick box beside a button read as another button. */
.switch { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: 12.5px; color: var(--text-2); cursor: pointer; user-select: none; min-height: var(--tap-sm); }
.switch input[type="checkbox"] {
  appearance: none;
  position: relative;
  flex: none;
  width: 34px;
  height: 19px;
  margin: 0;
  border: 1px solid var(--line-2);
  border-radius: 999px;
  background: var(--surface);
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease;
}
.switch input[type="checkbox"]::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 999px;
  background: var(--text-3);
  transition: transform 140ms ease, background-color 140ms ease;
}
.switch input[type="checkbox"]:checked { background: var(--accent); border-color: var(--accent); }
.switch input[type="checkbox"]:checked::after { transform: translateX(15px); background: var(--accent-ink); }
.switch input[type="checkbox"]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 560px) {
  .switch { min-height: var(--tap); }
  .switch input[type="checkbox"] { width: 40px; height: 23px; }
  .switch input[type="checkbox"]::after { width: 15px; height: 15px; }
  .switch input[type="checkbox"]:checked::after { transform: translateX(17px); }
}
/* Row height must be a property of the table, not of the data in a row. A
   status cell with a detail line made its row 116px while its neighbours sat
   at 65px, which is what made the pool table feel unreadable. One line with an
   ellipsis; the full text stays in the title attribute. */
.table td .hint { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.table td .sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.table tbody tr { height: 1px; }
.table tbody td { height: inherit; }

/* The pool table is nine columns wide, and the shrink-to-fit rule above does
   not grow a row whose cell content has wrapped. Three text action buttons
   needed 186px in a column that had 111px, so they stacked and spilled over
   the row beneath. Never let a cell of controls wrap; the actions are icons
   now, and this is the guarantee that they stay on one line. */
.table td.actions { flex-wrap: nowrap; white-space: nowrap; height: auto; }
.table td.actions > * { flex: none; }

/* 20px of padding either side of every cell is 29% of a nine-column table's
   width. The pool table spends it on the columns that need it. */
#keysBody .table th, #keysBody .table td { padding-inline: var(--sp-2); }

/* Scrolling right through nine columns loses the row you were acting on. The
   pick column stays put, so a selection made at the left is still visible at
   the right where the actions live. */
#keysBody .table th:first-child, #keysBody .table td:first-child {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--surface);
}
#keysBody .table th:first-child { z-index: 3; }
#keysBody .table tbody tr:hover td:first-child { background: var(--surface-2); }

/* Below this width the secondary columns go rather than squeezing the ones an
   operator reads first into ellipsis. */
/* display:none removes a column from the accessibility tree, so at the
   measured 1024px viewport the failures and last-used facts became
   unobtainable with nothing announcing the drop. Visually hidden keeps them
   available to a screen reader while the column disappears from the layout. */
@media (max-width: 1180px) {
  #keysBody .table th[data-l="fails"], #keysBody .table td[data-l="fails"],
  #keysBody .table th[data-l="last used"], #keysBody .table td[data-l="last used"] {
    /* Stay in flow. The classic visually-hidden pattern uses position:absolute,
       which removes these cells from the table's scroll container and they
       escaped #keysBody's overflow-x:auto, pushing the whole document 165px
       wider than the viewport. Collapsed in-flow cells are still read by a
       screen reader and stay inside the wrap. */
    width: 1px !important;
    padding: 0 !important;
    margin: 0 !important;
    border-width: 0 !important;
    font-size: 0 !important;
    line-height: 0 !important;
    color: transparent !important;
    overflow: hidden !important;
    white-space: nowrap !important;
  }
}
@media (max-width: 980px) {
  #keysBody .table th[data-l="cooldown"], #keysBody .table td[data-l="cooldown"],
  #keysBody .table th[data-l="plan"], #keysBody .table td[data-l="plan"] { display: none; }
}

/* One row, one height. The shrink-to-fit rule above leaves the row at the
   mercy of whichever cell happens to be tallest, and a fractional line-height
   on the status tag made that 65.5px on the first row; the last row then lost
   its bottom border and came out at 64.5px. Every cell is one line by design,
   so the height is stated rather than inferred, and the last row keeps its
   border so the arithmetic holds there too. */
#keysBody .table tbody tr { height: 64px; }
/* The fold below turns each row into stacked blocks. A fixed height there made
   every one of the nine cells inherit 65px, so a single key occupied ~585px of a
   phone screen instead of ~234px. */
@media (max-width: 720px) {
  #keysBody .table tbody tr,
  #keysBody .table tbody tr td { height: auto; }
}
#keysBody .table tbody tr:last-child td { border-bottom: 1px solid var(--line); }

/* Inline links. A table cell is often nothing but a link, so the link owns
   the cell's height and gives a full-width row of tap surface on touch. */
.link {
  color: var(--accent);
  text-decoration: none;
  border-radius: 3px;
  overflow-wrap: anywhere;
}
.link:hover { text-decoration: underline; text-underline-offset: 2px; }
.link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.table td > .link { display: inline-flex; align-items: center; min-height: var(--sp-4); }

.pager { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.pager .meta { font-size: 12px; color: var(--text-3); }
/* Paginated pager: compact numeric pills, Prev/Next as chevrons, gaps as dots. */
.pager .pages {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-left: auto;
}
.pager .pages .gap { color: var(--text-3); font-size: 12px; padding: 0 2px; user-select: none; }
.pager .pages .pagebtn {
  min-width: 32px;
  height: 32px;
  padding: 0 var(--sp-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--text-2);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
}
.pager .pages .pagebtn:hover:not(:disabled) { border-color: var(--text-3); color: var(--text); }
.pager .pages .pagebtn:disabled { opacity: 0.35; cursor: default; }
.pager .pages .pagebtn.active {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 640;
}
.pager .pages .pagebtn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* states ----------------------------------------------------------------- */

.state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-1);
  padding: var(--sp-4) var(--inset);
  color: var(--text-2);
  font-size: 13px;
}
.state b { color: var(--text); font-size: 13.5px; font-weight: 620; }
.state.error b { color: var(--bad); }
.state .retry { margin-top: var(--sp-3); }
.state-center { align-items: center; text-align: center; }

.sk { position: relative; overflow: hidden; background: var(--surface-2); border-radius: 4px; height: 12px; }
.sk-line { height: 10px; margin: var(--sp-2) 0; }
.sk-block { height: 96px; border-radius: 8px; }
@media (prefers-reduced-motion: no-preference) {
  .sk::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--surface-3);
    opacity: 0;
    animation: sk 1.2s ease-in-out infinite;
  }
  @keyframes sk {
    0%, 100% { opacity: 0; }
    50% { opacity: 0.55; }
  }
}

/* charts ----------------------------------------------------------------- */

.poolbar { display: flex; flex-direction: column; gap: var(--sp-2); }
.poolbar-track { display: flex; height: 10px; border-radius: var(--r-pill); overflow: hidden; background: var(--surface-3); }
.poolbar-track span { display: block; height: 100%; }
.poolbar-track .ok { background: var(--ok); }
.poolbar-track .warn { background: var(--warn); }
.poolbar-track .bad { background: var(--bad); }
.poolbar-track .neutral { background: var(--line-2); }
/* quota_exhausted: parked with no reset to wait for, which is neither the
   cooling amber nor the dead red. */
.poolbar-track .quota { background: var(--accent); }
.poolbar-track .prov-gemini { background: var(--prov-gemini); }
.poolbar-track .prov-elevenlabs { background: var(--prov-elevenlabs); }
.poolbar-track .prov-whatstoken { background: var(--prov-whatstoken); }
.poolbar-track .prov-custom { background: var(--prov-custom); }
/* one provider's pool as a row: badge, proportional bar, ready count */
.prov-pool { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2h) 0; border-top: 1px solid var(--line); min-width: 0; }
.prov-pool:first-child { border-top: 0; }
.prov-pool .poolbar { flex: 1 1 auto; min-width: 0; }
.prov-pool .count { flex: none; font-family: var(--mono); font-size: 12px; font-variant-numeric: tabular-nums; color: var(--text-2); white-space: nowrap; }
.legend { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-3); }
.legend-item { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: 12px; color: var(--text-2); }
.legend-item .dot { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.legend-item .dot.ok { background: var(--ok); }
.legend-item .dot.warn { background: var(--warn); }
.legend-item .dot.bad { background: var(--bad); }
.legend-item .dot.neutral { background: var(--line-2); }
.legend-item .dot.prov-gemini { background: var(--prov-gemini); }
.legend-item .dot.prov-elevenlabs { background: var(--prov-elevenlabs); }
.legend-item .dot.prov-whatstoken { background: var(--prov-whatstoken); }
.legend-item .dot.prov-custom { background: var(--prov-custom); }
.legend-item b { font-family: var(--mono); font-variant-numeric: tabular-nums; color: var(--text); font-weight: 560; }

.meter { display: flex; flex-direction: column; gap: var(--sp-1); }
.meter-head { display: flex; align-items: baseline; gap: var(--sp-2); font-size: 12.5px; }
.meter-head .v { margin-left: auto; font-family: var(--mono); font-variant-numeric: tabular-nums; color: var(--text-2); }
.meter-track { height: 6px; border-radius: var(--r-pill); background: var(--surface-3); overflow: hidden; }
.meter-fill { height: 100%; border-radius: var(--r-pill); background: var(--text-2); }
.meter-fill.ok { background: var(--ok); }
.meter-fill.warn { background: var(--warn); }
.meter-fill.bad { background: var(--bad); }
.meter-fill.info { background: var(--accent); }
/* provider tones: a meter of Gemini traffic is blue, ElevenLabs violet */
.meter-fill.prov-gemini { background: var(--prov-gemini); }
.meter-fill.prov-elevenlabs { background: var(--prov-elevenlabs); }
.meter-fill.prov-whatstoken { background: var(--prov-whatstoken); }
.meter-fill.prov-custom { background: var(--prov-custom); }

.bars { display: flex; flex-direction: column; gap: var(--sp-2); }
.bar-row { display: grid; grid-template-columns: 88px minmax(0, 1fr) 64px; align-items: center; gap: var(--sp-2); font-size: 12px; }
.bar-row .label { font-family: var(--mono); color: var(--text-2); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-track { height: 7px; border-radius: var(--r-pill); background: var(--surface-3); overflow: hidden; }
.bar-fill { height: 100%; border-radius: var(--r-pill); background: var(--accent); min-width: 2px; }
.bar-fill.ok { background: var(--ok); }
.bar-fill.warn { background: var(--warn); }
.bar-fill.bad { background: var(--bad); }
.bar-fill.neutral { background: var(--line-2); }
.bar-fill.prov-gemini { background: var(--prov-gemini); }
.bar-fill.prov-elevenlabs { background: var(--prov-elevenlabs); }
.bar-fill.prov-whatstoken { background: var(--prov-whatstoken); }
.bar-fill.prov-custom { background: var(--prov-custom); }
.bar-row .value { font-family: var(--mono); font-variant-numeric: tabular-nums; text-align: right; color: var(--text-2); }

.spark { width: 100%; height: 40px; overflow: visible; }
.spark polyline { fill: none; stroke: var(--accent); stroke-width: 1.6; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
.spark .base { stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.spark .fill { fill: var(--accent-wash); stroke: none; }

/* dashboard per-day provider bars (gemini vs elevenlabs, stacked columns) */
.daybars { display: flex; align-items: flex-end; gap: var(--sp-1); height: 96px; padding-bottom: var(--sp-3); }
.daybar { position: relative; flex: 1 1 0; min-width: 6px; max-width: 26px; height: 100%; display: flex; flex-direction: column-reverse; border-radius: 2px 2px 0 0; background: var(--surface-3); overflow: hidden; }
.daybar span { display: block; width: 100%; }
.daybar .ok { background: var(--ok); }
.daybar .warn { background: var(--warn); }
.daybar .prov-gemini { background: var(--prov-gemini); }
.daybar .prov-elevenlabs { background: var(--prov-elevenlabs); }
.daybar .prov-whatstoken { background: var(--prov-whatstoken); }
.daybar .prov-custom { background: var(--prov-custom); }
.daybar-label { position: absolute; left: 0; right: 0; bottom: -18px; font-size: 9.5px; color: var(--text-2); text-align: center; white-space: nowrap; }


/* hour-by-weekday heatmap. One label column, then 24 hour cells per row. */
.heat { display: grid; grid-template-columns: 26px repeat(24, minmax(0, 1fr)); gap: var(--sp-1); }
.heat .h { display: flex; align-items: center; font-size: 9.5px; color: var(--text-3); font-family: var(--mono); min-width: 0; overflow: hidden; white-space: nowrap; }
.heat .cell { aspect-ratio: 1 / 1; border-radius: 2px; background: var(--surface-3); }
.heat .cell[data-level="1"] { background: color-mix(in srgb, var(--accent) 25%, var(--surface-3)); }
.heat .cell[data-level="2"] { background: color-mix(in srgb, var(--accent) 45%, var(--surface-3)); }
.heat .cell[data-level="3"] { background: color-mix(in srgb, var(--accent) 68%, var(--surface-3)); }
.heat .cell[data-level="4"] { background: color-mix(in srgb, var(--accent) 85%, var(--surface-3)); }
.heat .cell[data-level="5"] { background: var(--accent); }
/* "show values" writes the count into every cell that carries traffic. Zero
   cells stay empty, so the grid does not turn into a field of zeroes. */
.heat.values .cell:not([data-v="0"])::after {
  content: attr(data-v);
  display: grid;
  place-items: center;
  height: 100%;
  font-family: var(--mono);
  font-size: 9px;
  color: var(--text);
}
.heat-axis { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: var(--sp-1); margin-top: var(--sp-2); font-size: 10px; color: var(--text-3); font-family: var(--mono); }
.heat-axis span { text-align: left; overflow: hidden; }

/* feed ------------------------------------------------------------------- */

.feed { display: flex; flex-direction: column; }

/* Attention items live inside a .feed but are links with two text lines and
   a CTA. Without this block the browser stacks title, detail and "Open" as
   bare inline text with zero spacing. The 16px side inset matches every other
   row surface in the console: flush-to-the-edge rows read as unstyled markup,
   and the hairline below still spans the full card width. */
.attn-item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2h) var(--inset);
  border-bottom: 1px solid var(--line);
  text-decoration: none;
  min-width: 0;
}
.attn-item:last-child { border-bottom: 0; }
.attn-item .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 8px; }
.attn-item > span:nth-child(2) { display: flex; flex-direction: column; gap: var(--sp-1); min-width: 0; }
.attn-item .t { color: var(--text); font-size: 13px; font-weight: 600; }
.attn-item .d { color: var(--text-2); font-size: 12.5px; }
.attn-item .go {
  margin-left: auto;
  flex: 0 0 auto;
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}
.attn-item:hover .go { text-decoration: underline; }
/* An audit row is the data the page exists to show. It was one flex line with
   nowrap + ellipsis on .what, and 99 of 100 rows were clipped - the worst lost
   275px, which is the entire tail of the detail ("applied quota_exhausted",
   the model, the counters). The action and the time stay on the first line;
   the target and detail get their own full-width line and wrap. The 16px side
   inset matches every other row surface: flush rows read as unstyled markup. */
.feed-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas:
    "act  .    time"
    "what what what"
    "who  who  who";
  align-items: baseline;
  gap: var(--sp-1) var(--sp-2);
  padding: var(--sp-2h) var(--inset);
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
  min-width: 0;
}
.feed-item:last-child { border-bottom: 0; }
.feed-item .act {
  grid-area: act;
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text);
  white-space: nowrap;
}
.feed-item .what {
  grid-area: what;
  color: var(--text-2);
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
/* The actor got grid-area:auto and auto-placed itself into the first row
   beside the action, so the row read as action / actor on one line and the
   target + detail on the next. It belongs after the detail, in its own row. */
.feed-item .what.meta {
  grid-area: who;
  color: var(--text-3);
  font-size: 11.5px;
  margin-top: var(--sp-1);
}
.feed-item time {
  grid-area: time;
  justify-self: end;
  color: var(--text-3);
  font-size: 11.5px;
  font-family: var(--mono);
  white-space: nowrap;
}

/* dialogs ---------------------------------------------------------------- */

/* A modal is a sheet, not a floating card: fixed header, scrolling body and a
   footer that stays put. Widths step 620 / 960; the radius, the shadow and the
   dimmed backdrop carry the depth, so no border tricks are needed. */
dialog {
  width: min(620px, calc(100vw - 40px));
  max-height: min(86dvh, 840px);
  padding: 0;
  border: 1px solid var(--line-2);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.16);
  overflow: hidden;
  overscroll-behavior: contain;
}
dialog[open] { display: flex; flex-direction: column; }
/* A sheet whose body scrolls keeps its footer pinned. The form is the flex
   child of the dialog, so the form has to be the column that shrinks and its
   own body has to be the scrolling one; without min-height: 0 the form kept
   its content height and the footer rendered past the bottom of a phone. */
dialog[open] > form { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
dialog[open] > form > .card-head,
dialog[open] > form > .panel-head { flex: none; }
dialog[open] > form > .card-body,
dialog[open] > form > .panel-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
dialog[open] > form > .card-foot,
dialog[open] > form > .panel-foot { flex: none; }
dialog::backdrop { background: rgba(6, 8, 12, 0.62); }
dialog.wide { width: min(960px, calc(100vw - 40px)); }
.card-head {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.card-head h2 { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; text-wrap: balance; }
.card-head .spacer { flex: 1 1 auto; }
.card-body { flex: 1 1 auto; min-height: 0; padding: var(--sp-4); overflow-y: auto; }
.card-foot {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-2h) var(--sp-4);
  border-top: 1px solid var(--line);
  background: var(--surface);
  flex-wrap: wrap;
}
/* Dialogs written before the sheet classes use the panel vocabulary; the
   same three bands apply so every modal in the console reads identically. */
dialog > form > .panel-head,
dialog > .panel-head { padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--line); }
dialog > form > .panel-body,
dialog > .panel-body { padding: var(--sp-4); overflow-y: auto; }
dialog > form > .panel-foot,
dialog > .panel-foot { padding: var(--sp-2h) var(--sp-4); border-top: 1px solid var(--line); }
/* Textareas in a sheet are lists of ids or keys, so they get the control's
   border, radius and padding and the mono face \u2014 an unstyled textarea sat at
   the UA's 2px padding with the browser's own border and resize grip. */
dialog textarea {
  width: 100%; min-height: 128px; padding: var(--sp-2) var(--sp-2h);
  border: 1px solid var(--line); border-radius: var(--r-ctl);
  background: var(--surface); color: var(--text);
  font-family: var(--mono); font-size: 12.5px; line-height: 1.65;
  resize: vertical; tab-size: 2;
}
dialog textarea::placeholder { color: var(--text-3); }
dialog textarea:hover { border-color: var(--line-2); }
dialog textarea:focus { border-color: var(--text); }
dialog textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
dialog .input, dialog .select { width: 100%; }
dialog .field:first-child { margin-top: 0; }

/* modal forms: two columns of labelled fields, grouped under a quiet heading.
   A long single column of ten inputs is the reason the Add provider sheet read
   as a scroll rather than a form. */
.card-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.card-sub { color: var(--text-3); font-size: 12.5px; font-weight: 400; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--sp-3) var(--sp-4); }
.form-grid .span-2 { grid-column: 1 / -1; }
.form-section + .form-section { margin-top: var(--sp-4); padding-top: var(--sp-4); border-top: 1px solid var(--line); }
/* side-by-side sections are columns, not a stack: no divider, no top gap */
.modal-split > .form-section + .form-section { margin-top: 0; padding-top: 0; border-top: 0; }
.form-h {
  margin: 0 0 var(--sp-2); font-size: 11px; font-weight: 640;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-3);
}
/* "(optional)" is a qualifier, not part of the shouted heading */
.form-h .hint { text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 11px; }
/* the first-keys box holds a handful of lines, not a catalog */
#pKeys { min-height: 88px; }
.modal-split { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: var(--sp-6); align-items: start; }
/* capability list: a permission list, not five loose checkboxes. One bordered
   surface, a hairline between rows, a drawn check so the state does not depend
   on the platform's checkbox glyph. */
.cap-set { margin: 0; padding: 0; border: 0; min-width: 0; }
.cap-list {
  display: grid; border: 1px solid var(--line); border-radius: var(--r-ctl);
  overflow: hidden; background: var(--surface);
}
.cap {
  display: grid; grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center; gap: var(--sp-2) var(--sp-2h);
  padding: 7px var(--sp-2h);
  cursor: pointer; min-width: 0;
}
.cap + .cap { border-top: 1px solid var(--line); }
.cap:hover { background: var(--surface-2); }
.cap:has(input:checked) { background: var(--accent-wash); }
.cap:has(input:disabled) { opacity: 0.55; cursor: default; }
.cap input { position: absolute; width: 1px; height: 1px; opacity: 0; margin: 0; pointer-events: none; }
.cap-box {
  position: relative; width: 16px; height: 16px; flex: none;
  border: 1.5px solid var(--line-2); border-radius: 4px;
  background: var(--surface); transition: background 120ms ease, border-color 120ms ease;
}
.cap-box::after {
  content: ""; position: absolute; left: 4px; top: 4px;
  width: 8px; height: 4px; margin-top: -1px;
  border-left: 2px solid var(--accent-ink); border-bottom: 2px solid var(--accent-ink);
  transform: rotate(-45deg) scale(0.4); opacity: 0;
  transition: transform 120ms ease, opacity 120ms ease;
}
.cap input:checked + .cap-box { background: var(--accent); border-color: var(--accent); }
.cap input:checked + .cap-box::after { transform: rotate(-45deg) scale(1); opacity: 1; }
.cap input:focus-visible + .cap-box { outline: 2px solid var(--accent); outline-offset: 2px; }
.cap-name { font-size: 12.5px; font-weight: 560; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cap-hint { font-size: 11.5px; color: var(--text-3); white-space: nowrap; }
/* a section heading with its action on the same line */
.form-row { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; }
.form-row .form-h { margin-bottom: 0; flex: 1 1 auto; }
.form-row + textarea { margin-top: var(--sp-2); }
@media screen and (max-width: 780px) {
  .modal-split { grid-template-columns: minmax(0, 1fr); }
  /* stacked, the two sections are a sequence again and want their rule */
  .modal-split > .form-section + .form-section {
    margin-top: var(--sp-4); padding-top: var(--sp-4); border-top: 1px solid var(--line);
  }
}

.help-h { margin: 0 0 var(--sp-2); font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.help-h + .help-list { margin-bottom: var(--sp-4); }
.help-list { display: grid; grid-template-columns: minmax(80px, auto) 1fr; gap: var(--sp-1) var(--sp-3); margin: 0; font-size: 12.5px; }
/* the glossary is long: two independent columns read top to bottom, so the
   eye follows one list instead of zig-zagging across a four-column grid */
.help-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--sp-3) var(--sp-5); align-items: start; }
@media screen and (max-width: 900px) {
  .help-cols { grid-template-columns: minmax(0, 1fr); }
}
.help-list dt { color: var(--text); font-weight: 560; }
.help-list dd { margin: 0; color: var(--text-2); }
.help-list kbd {
  display: inline-block;
  min-width: 22px;
  padding: 0 var(--sp-1);
  border: 1px solid var(--line-2);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--surface-2);
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.7;
  text-align: center;
}

/* toasts ----------------------------------------------------------------- */

.toasts {
  position: fixed;
  right: var(--sp-4);
  bottom: var(--sp-4);
  z-index: 120;
  display: flex;
  flex-direction: column-reverse;
  gap: var(--sp-2);
  width: min(400px, calc(100vw - 24px));
  pointer-events: none;
}
/* A thick coloured border on one side of a card is the single most
   recognisable "AI-generated UI" tell, and the toast's 3px left bar was the
   only thing carrying its tone. Tone now lives in a small leading dot plus a
   tinted surface, which reads the same at a glance and stops shouting. */
.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.45;
  pointer-events: auto;
}
.toast::before {
  content: "";
  flex: none;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 999px;
  background: var(--text-3);
}
.toast[data-tone="ok"] { background: color-mix(in srgb, var(--ok) 7%, var(--surface)); }
.toast[data-tone="ok"]::before { background: var(--ok); }
.toast[data-tone="warn"] { background: color-mix(in srgb, var(--warn) 7%, var(--surface)); }
.toast[data-tone="warn"]::before { background: var(--warn); }
.toast[data-tone="err"] { background: color-mix(in srgb, var(--bad) 7%, var(--surface)); }
.toast[data-tone="err"]::before { background: var(--bad); }
.toast-text { min-width: 0; flex: 1 1 auto; word-break: break-word; }
.toast-act {
  flex: none;
  /* Was 22x22 on a fine pointer: under the 24x24 minimum, and corrected only
     on coarse pointers, so the failure was desktop-mouse specific. */
  min-width: 24px;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 560;
  cursor: pointer;
}
.toast-act:hover { background: var(--surface-3); }
.toast-x {
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}
.toast-x:hover { background: var(--surface-2); color: var(--text); }

/* the inline notice strip, for a message that belongs beside a control ---- */
.notice {
  display: block;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-ctl);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.5;
}
.notice:empty { display: none; }

/* ---- legacy vocabulary mapped onto the new surfaces ---------------------
   Older pages still emit these names. Each one resolves to the same token as
   its modern counterpart, so a page written before the redesign lands on the
   new visual language instead of unstyled markup. */

.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-surface); min-width: 0; overflow: hidden; }
.card > .tablewrap:last-child, .card > .card-body:last-child { border-bottom: 0; }
.kpis { display: grid; gap: 0; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.tablewrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.sub { margin-top: 6px; max-width: 68ch; color: var(--text-2); font-size: 13.5px; }
.actions { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-left: auto; }
.sep { border-top: 1px solid var(--line); }
.scroll-y { max-height: 420px; overflow-y: auto; }
.heat-legend { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--text-3); }
.heat-legend i { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
.heat-scroll { overflow-x: auto; }
.u-full { width: 100%; }
.u-auto { width: auto; }
.u-tnum { font-variant-numeric: tabular-nums; }
.u-mb-0 { margin-bottom: 0; }
.u-gap-2 { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.u-rule-top { border-top: 1px solid var(--line); padding-top: var(--sp-3); }
.u-rule-gap { padding-top: var(--sp-3); }
.notice.err { border-color: color-mix(in srgb, var(--bad) 45%, var(--line)); color: var(--bad); }
.notice.ok { border-color: color-mix(in srgb, var(--ok) 45%, var(--line)); color: var(--ok); }

/* command palette -------------------------------------------------------- */

.palette { width: min(680px, calc(100vw - 32px)); }
.palette-top { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2h) var(--sp-3); border-bottom: 1px solid var(--line); }
.palette-top svg { color: var(--text-3); flex: none; }
.palette-input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: transparent;
  font-size: 15px;
  padding: var(--sp-1) 0;
}
/* This is the one control a keyboard user lands in after Ctrl K, and it had
   outline:none with border:0 and a transparent background - no indicator at
   all, overriding the global :focus-visible. WCAG 2.4.7 failure. */
.palette-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.palette-kbd { flex: none; font-family: var(--mono); font-size: 10.5px; color: var(--text-3); border: 1px solid var(--line-2); border-radius: 4px; padding: 1px 5px; }
.palette-list { padding: var(--sp-1); overflow-y: auto; max-height: min(60dvh, 480px); overscroll-behavior: contain; }
.palette-group { padding: var(--sp-2) var(--sp-2) var(--sp-1); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.palette-item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  padding: var(--sp-2);
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.palette-item svg { color: var(--text-3); flex: none; }
.palette-item .hint { margin-left: auto; color: var(--text-3); font-size: 11.5px; }
.palette-item[aria-selected="true"], .palette-item:hover { background: var(--accent-wash); }
.palette-item[aria-selected="true"] svg { color: var(--accent); }
.palette-empty { padding: 18px 10px; color: var(--text-3); font-size: 13px; }

/* drawer ----------------------------------------------------------------- */

.drawer-backdrop { position: fixed; inset: 0; z-index: 90; background: rgba(8, 10, 14, 0.5); }
.drawer {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  width: min(280px, 84vw);
  padding: var(--sp-3);
  background: var(--rail-bg);
  color: var(--rail-text);
  border-right: 1px solid var(--rail-line);
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* gate ------------------------------------------------------------------- */

.gate-wrap { display: grid; place-items: center; min-height: 62dvh; padding: var(--sp-4) 0; }
.login-page { display: grid; place-items: center; min-height: 100dvh; padding: var(--sp-5) var(--inset); }
.login-page .gate-wrap { min-height: 0; padding: 0; }
.gate { width: min(400px, 100%); }
/* brand above the card: the mark plus the wordmark, centred as one unit */
.gate-brand { display: flex; align-items: center; justify-content: center; gap: var(--sp-2h); margin-bottom: var(--sp-4); }
.gate-mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 9px; background: var(--text); color: var(--bg); flex: none; }
.gate-word { display: flex; flex-direction: column; line-height: 1.15; text-align: left; }
.gate-word b { font-size: 16px; font-weight: 660; letter-spacing: -0.02em; }
.gate-word span { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
/* the sign-in card: title, one line of intent, the token field, the action */
.gate-card { padding: var(--sp-4); }
.gate-title { font-size: 19px; letter-spacing: -0.02em; font-weight: 640; }
.gate-lede { margin-top: var(--sp-1); color: var(--text-2); font-size: 13px; line-height: 1.55; }
.gate-form { margin-top: var(--sp-4); }
.gate-field { position: relative; display: flex; }
.gate-field .input { width: 100%; padding-right: 40px; }
.gate-toggle {
  position: absolute; top: 50%; right: 4px; transform: translateY(-50%);
  display: grid; place-items: center; width: 28px; height: 28px;
  border: 0; border-radius: var(--r-ctl); background: transparent;
  color: var(--text-3); cursor: pointer;
}
.gate-toggle:hover { color: var(--text); background: var(--surface-2); }
.gate-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
/* the pools this gateway fronts, named under a hairline: the console is
   multi-provider, and the sign-in page says so before any token is typed */
.gate-foot {
  display: flex; align-items: center; gap: var(--sp-2h); flex-wrap: wrap;
  margin-top: var(--sp-4); padding-top: var(--sp-3); border-top: 1px solid var(--line);
  font-size: 11.5px; color: var(--text-3);
}
.gate-foot .rail-prov { font-size: 11.5px; }
.gate-foot .gate-foot-note { margin-left: auto; }

/* verdict strip: the overview's one-line answer, with a live status dot ----- */

.verdict { display: flex; align-items: center; gap: var(--sp-2h); flex-wrap: wrap; }
.verdict-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--ok); }
.verdict-dot[data-tone="warn"] { background: var(--warn); }
.verdict-dot[data-tone="bad"] { background: var(--bad); }
.verdict strong { font-size: 14px; font-weight: 620; }
.verdict-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.verdict-main strong { font-size: 15px; letter-spacing: -0.01em; }
.verdict-main .meta { font-size: 12px; }

/* hero ------------------------------------------------------------------- */

.hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--sp-4); align-items: center; }
.hero-main { min-width: 0; }
.hero-title { font-size: 26px; letter-spacing: -0.03em; font-weight: 660; }
.hero-figure { font-family: var(--mono); font-size: 40px; font-weight: 550; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }

/* utility ---------------------------------------------------------------- */

.u-mt-1 { margin-top: var(--sp-1); }
.u-mt-2 { margin-top: var(--sp-2); }
.u-mt-3 { margin-top: var(--sp-3); }
.u-mt-4 { margin-top: var(--sp-4); }
.u-mt-5 { margin-top: var(--sp-5); }
.u-mt-6 { margin-top: var(--sp-6); }
.u-mb-2 { margin-bottom: var(--sp-2); }
.u-mb-3 { margin-bottom: var(--sp-3); }
.u-mb-4 { margin-bottom: var(--sp-4); }
.u-warn { color: var(--warn); }
.u-bad { color: var(--bad); }
.u-ok { color: var(--ok); }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.nowrap { white-space: nowrap; }
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* responsive ------------------------------------------------------------- */

@media (max-width: 1180px) {
  .split { grid-template-columns: minmax(0, 1fr); }
  .grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 1100px) {
  .shell { grid-template-columns: minmax(0, 1fr); }
  .rail { display: none; }
  .menu-btn { display: inline-flex; }
  .canvas-head { padding: 0 var(--sp-3); }
  .page { padding: var(--sp-4) var(--sp-3); }
  .grid-3, .grid-2 { grid-template-columns: minmax(0, 1fr); }
  .figures { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 720px) {
  .canvas-head { min-height: 52px; gap: var(--sp-2); }
  .canvas-crumb { display: none; }
  .page-title { font-size: 24px; }
  .hero { grid-template-columns: minmax(0, 1fr); gap: var(--sp-4); }
  .hero-figure { font-size: 32px; }

  /* every table folds into labelled rows */
  .table-wrap { overflow-x: visible; }
  .table thead { display: none; }
  .table, .table tbody, .table tr, .table td { display: block; width: 100%; }
  /* the desktop row-height trick (height: 1px so every row shares the tallest
     cell) collapses a folded row to one line and lets the cells overlap;
     folded rows size themselves */
  .table tbody tr, .table tbody td { height: auto; }
  /* the row checkbox has no label of its own; pin it to the top-right corner
     of the folded card instead of leaving it alone on its own line */
  #keysBody .table tbody tr { position: relative; padding-right: 36px; }
  #keysBody .table tbody td:first-child {
    position: absolute; top: 6px; right: 0; width: auto; padding: 0;
  }
  #keysBody .table tbody td:first-child::before { content: none; }
  .table tr { padding: var(--sp-2) 0; border-bottom: 1px solid var(--line); }
  .table tr:last-child { border-bottom: 0; }
  .table td {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 2px var(--sp-3);
    padding: 2px 0;
    border: 0;
    text-align: left;
  }
  /* a cell with a value and a detail line stacks them instead of pushing the
     detail to the far edge of the card */
  .table td > * + * { flex-basis: 100%; }
  .table td .sub, .table td .hint { white-space: normal; overflow: visible; text-overflow: clip; }
  .table td.num { text-align: right; }
  .table td::before {
    content: attr(data-l);
    flex: none;
    font-size: 10px;
    font-weight: 620;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .table td:not([data-l])::before { content: none; }
  .table .actions-cell { justify-content: flex-end; }
  .heat { gap: var(--sp-1); }
  .heat-axis { display: none; }
  .toasts { right: var(--sp-3); left: var(--sp-3); bottom: var(--sp-3); width: auto; }
  .bar-row { grid-template-columns: 74px minmax(0, 1fr) 52px; }
  .panel-body { padding: var(--sp-3) var(--inset); }
}

@media (max-width: 400px) {
  /* two figures per row even on a phone: a full-width card with a
     three-digit number wastes a screen of scroll */
  .figures { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .toolbar .grow { flex-basis: 100%; }
}

@media (pointer: coarse), (hover: none) {
  :root { --tap: 44px; --tap-sm: 44px; }
  .rail-item { min-height: 44px; }
  .rail-tool { width: var(--tap); height: var(--tap); }
  .toast-x, .toast-act { min-height: 40px; min-width: 40px; }
  .btn, .btn-sm, .seg button { min-height: var(--tap-sm); }
  .icon-btn, .icon-btn.btn-sm { width: var(--tap); height: var(--tap); }
  input:not([type="checkbox"]):not([type="radio"]),
  select,
  textarea { min-height: var(--tap-sm); }
  select { font-size: 16px; }
  .check { min-height: var(--tap-sm); padding-block: 6px; }
  .check input[type="checkbox"] { width: 22px; height: 22px; }
  .table td select, .table td .btn-sm { min-height: var(--tap-sm); }
  .seg button { min-width: var(--tap-sm); }
  .table td > .link, .table td a.link, .feed-item a { min-height: var(--tap-sm); }
  td > label:has(input[type=checkbox]) { display: inline-flex; align-items: center; justify-content: center; min-width: var(--tap); min-height: var(--tap); }
  .table td input[type=checkbox] { width: 22px; height: 22px; }
}

@media print {
  .rail, .canvas-head, .toasts, .menu-btn { display: none; }
  .shell { display: block; }
  .page { max-width: none; padding: 0; }
  .panel, .fig { border-color: #bbb; }
}

/* Vercel dashboard restyle (total redesign) -------------------------------
   Same DOM ids/classes, new layout: the rail is a proper dashboard sidebar
   again \u2014 vertical, grouped, with the provider strip visible \u2014 panels are
   white cards, buttons/tables/forms follow the Vercel dashboard vocabulary.
   Below 1100px the sidebar steps aside for the drawer and the menu button.
   This block sits last in BASE_CSS so it wins over the earlier rules without
   renaming anything JS depends on. */

/* sidebar navigation */
.shell { display: grid; grid-template-columns: var(--rail) minmax(0, 1fr); min-height: 100dvh; }
.rail {
  position: sticky; top: 0; z-index: 40;
  display: flex; flex-direction: column; gap: var(--sp-4);
  height: 100dvh; padding: var(--sp-3);
  background: var(--rail-bg); color: var(--rail-text);
  border-right: 1px solid var(--rail-line);
  overflow-y: auto;
}
.rail-brand { padding: var(--sp-1) var(--sp-2); min-height: var(--tap); }
.rail-mark { background: var(--text); color: var(--bg); border-radius: 8px; }
.rail-name b { font-size: 15px; font-weight: 660; letter-spacing: -0.02em; }
.rail-name span {
  display: block; font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--rail-muted);
}
/* the provider strip returns: a multi-provider gateway names the pools it
   fronts in the sidebar, before any data loads */
.rail .rail-providers { display: flex; }
.rail-nav { flex-direction: column; gap: var(--sp-3); }
.rail-group { flex-direction: column; gap: var(--sp-1); }
/* group labels are visible again: the sidebar is tall enough for them, and
   Observe / Operate / System is the map of the console */
.rail-label {
  position: static; width: auto; height: auto; padding: 0 var(--sp-2) var(--sp-1);
  margin: 0; overflow: visible; clip: auto; white-space: normal; border: 0;
}
.rail-item {
  border-left: 0; border-radius: 7px; min-height: var(--tap); height: auto;
  padding: 0 var(--sp-2h); font-size: 13.5px; font-weight: 520; color: var(--rail-muted);
}
.rail-item:hover { background: var(--rail-bg-2); color: var(--rail-text); }
.rail-item[aria-current="page"] {
  background: var(--rail-active); color: var(--rail-text);
  border-left: 0; font-weight: 600;
}
.rail-item[aria-current="page"] svg { color: var(--text); }
.rail-foot { margin-top: auto; margin-left: 0; flex-direction: column; align-items: stretch; gap: var(--sp-2); flex: none; }
.rail-state { padding: var(--sp-1) var(--sp-2); }
.rail-tools { padding: var(--sp-1) var(--sp-2) 0; }
.rail-actions { padding: var(--sp-1) var(--sp-2) 0; }
.menu-btn { display: none !important; }

/* top bar: sticky, full-bleed, one hairline. The page scrolls under it, which
   is what makes the console feel like an app shell instead of a document. */
.canvas-head {
  position: sticky; top: 0; z-index: 30;
  display: flex; align-items: center; gap: var(--sp-3);
  min-height: 56px; padding: 0 var(--gutter);
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(10px);
}
.canvas-crumb { font-size: 12px; }
.canvas-crumb b { font-size: 12px; }
.page { padding: var(--sp-4) var(--gutter) var(--sp-5); }
.eyebrow {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-3);
}
.page-head { margin-bottom: var(--sp-4); align-items: flex-start; }
.page-title { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
.page-lede { font-size: 14px; }

/* white cards on the grey canvas */
.panel {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-surface); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.panel-head { padding: var(--inset); border-bottom: 1px solid var(--line); }
.panel-head h2, .panel-head h3 { font-size: 13px; font-weight: 600; }
.panel-body { padding: var(--inset); }
.panel-foot, .panel-note { border-top: 1px solid var(--line); }
.kpi, .fig {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-surface); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.fig-value { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }

/* one vertical rhythm for every page: the direct sections of the console
   stack at exactly 24px, so no page can drift into 16px here and 32px there.
   The id selector wins over the u-mt-* utilities by design \u2014 the rhythm is
   a property of the layout, not of whichever class a section happens to carry. */
#console > * + * { margin-top: var(--sp-4); }

/* buttons: black primary, neutral secondary */
.btn {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-ctl); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  font-weight: 500;
}
.btn:hover { background: var(--surface-2); border-color: var(--line-2); }
.btn-primary { background: #000; border-color: #000; color: #fff; }
.btn-primary:hover { background: #333; border-color: #333; }
:root[data-theme="dark"] .btn-primary { background: #fff; border-color: #fff; color: #000; }
:root[data-theme="dark"] .btn-primary:hover { background: #e5e5e5; border-color: #e5e5e5; }

/* forms */
.input, .select, .textarea {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-ctl);
}
.input:focus, .select:focus, .textarea:focus { border-color: var(--text); }

/* tables: sticky header, row hover, mono ids */
.table-wrap { overflow-x: auto; }
.table th {
  position: sticky; top: 0; z-index: 1; background: var(--surface);
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--text-3);
  border-bottom: 1px solid var(--line); white-space: nowrap;
}
.table td { border-bottom: 1px solid var(--surface-2); }
.table tbody tr:hover { background: var(--bg); }
.table .id-cell, .table td.mono, .key-text, .credential-value {
  font-family: var(--mono); overflow-wrap: anywhere;
}

/* pills: status + provider, dot + word */
.tag, .prov {
  border-radius: var(--r-pill); padding: 2px var(--sp-2);
  font-size: 11px; font-weight: 500;
}
.tag .dot, .prov .prov-dot { width: 6px; height: 6px; }

/* masked credential on the key-detail page: never a full raw value */
.credential-value { overflow-wrap: anywhere; word-break: break-all; }

/* empty / loading / error states as centred white cards */
.state {
  background: var(--surface); border: 1px dashed var(--line-2);
  border-radius: var(--r-surface); padding: var(--sp-6) var(--inset); text-align: center;
}

/* dialogs + toasts: white cards, one shadow */
.dialog, .toast {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-surface); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* responsive: the sidebar steps aside for the drawer below 1100px \u2014 the menu
   button returns, the drawer stacks the same sections vertically with the
   same aria-current marker, and the canvas takes the full width */
@media screen and (max-width: 1100px) {
  .shell { display: block; }
  .rail { display: none; }
  .canvas-head { padding: 0 var(--sp-3); }
  .page { padding: var(--sp-3) var(--sp-3) var(--sp-5); }
}
@media screen and (max-width: 720px) {
  .page-title { font-size: 20px; }
  .grid-4, .grid-3, .grid-2, .split { grid-template-columns: minmax(0, 1fr); }
  /* The 720px floor that keeps a desktop breakdown readable (ui.ts, .grid-2:has)
     is more specific than .grid-2, so it survived the fold and made Stats and
     Logs 720px wide inside a 390px phone. Re-assert the fold here. */
  .grid-2:has(.table) { grid-template-columns: minmax(0, 1fr); }
}

/* drawer navigation: below 1100px the menu button opens this panel, which
   stacks the same sections vertically with the same aria-current marker the
   sidebar uses. The drawer strip is NOT hidden here: scoping the restyle
   hide to .rail leaves the base column style in place for it. */
.drawer .rail-nav { flex-direction: column; align-items: stretch; gap: var(--sp-1); }
.drawer .rail-group { flex-direction: column; align-items: stretch; gap: var(--sp-1); }
.drawer .rail-item { width: 100%; }
.drawer .rail-foot { margin-left: 0; margin-top: auto; }
.drawer .rail-tools { padding: 0; }
@media screen and (max-width: 1100px) {
  .menu-btn { display: inline-flex !important; }
}

/* full-bleed canvas -------------------------------------------------------
   The console is a shell, not a document: the sidebar owns a fixed column and
   every page owns the rest of the viewport. Nothing is centred and nothing is
   capped, so a 27" monitor shows the whole table instead of a 1200px ribbon
   with two empty margins. Wide screens gain columns (auto-fit above), narrow
   ones lose the gutters. */

.page { padding: var(--sp-4) var(--gutter) var(--sp-5); }
.canvas-head { padding: 0 var(--gutter); }

/* the page head sits on the same gutter as the panels below it */
.page-head { align-items: flex-start; }
.page-head-side { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; justify-content: flex-end; }

/* A full-width table has room for a wider first column and a tighter numeric
   tail; the cells share the leftover space instead of hugging their content. */
.table th, .table td { padding: var(--sp-2) var(--sp-3); }
.table th:first-child, .table td:first-child { padding-left: var(--inset); }
.table th:last-child, .table td:last-child { padding-right: var(--inset); }

/* panels that hold a table get no body padding, so the table can reach the
   card edge and use every pixel */
.panel > .table-wrap { border-radius: 0 0 var(--r-surface) var(--r-surface); }

/* a feed of audit rows keeps its grid: action, detail and actor on their own
   lines, the timestamp pinned to the right edge of the card */
.feed-item { column-gap: var(--sp-3); }

@media screen and (max-width: 1400px) {
  :root { --gutter: 24px; }
}
/* below 720px every table folds into labelled rows; the fixed column widths
   and nowrap of the registry tables must stand down or the folded cells
   overlap each other */
@media screen and (max-width: 720px) {
  .providers-table th,
  .providers-table td,
  .providers-table td[data-l="provider"],
  .providers-table td:nth-child(2),
  .providers-table td:nth-child(3) {
    width: auto;
    max-width: none;
    white-space: normal;
  }
  .models-table th { width: auto; }
}

@media screen and (max-width: 1100px) {
  :root { --gutter: 16px; }
  .page { padding: var(--sp-3) var(--gutter) var(--sp-5); }
  .canvas-head { padding: 0 var(--gutter); }
}
`;
var ICON_PATHS = {
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  key: '<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M17 17l2-2M14 20l2-2"/>',
  plug: '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 01-10 0V7zM12 16v5"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>',
  command: '<path d="M9 6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 103 3V6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3"/>',
  check: '<path d="M4 12.5l5 5L20 6"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4L3 5z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 118 0v3"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.2A9.9 9.9 0 0112 5c6.4 0 10 7 10 7a17.6 17.6 0 01-2.4 3.3M6.5 6.6A17.3 17.3 0 002 12s3.6 7 10 7c1.6 0 3-.4 4.2-1M9.9 9.9a3 3 0 004.2 4.2"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>'
};
function icon(name, cls = "icon", size = 16) {
  const path = ICON_PATHS[name] ?? ICON_PATHS.arrow;
  return '<svg class="' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + "</svg>";
}
var NAV_GROUPS = [
  {
    label: "Observe",
    items: [
      { href: "/pengatur", label: "Overview", icon: "pulse" },
      { href: "/pengatur/logs", label: "Logs", icon: "list" },
      { href: "/pengatur/stats", label: "Statistics", icon: "chart" }
    ]
  },
  {
    label: "Operate",
    items: [
      { href: "/pengatur/keys", label: "Keys", icon: "key" },
      { href: "/pengatur/providers", label: "Providers", icon: "plug" },
      { href: "/pengatur/models", label: "Models", icon: "cube" }
    ]
  },
  {
    label: "System",
    items: [
      { href: "/pengatur/settings", label: "Settings", icon: "sliders" },
      { href: "/pengatur/audit", label: "Audit", icon: "shield" }
    ]
  }
];
var NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
var SECTION_LABELS = {
  "/pengatur": "Overview",
  "/pengatur/logs": "Logs",
  "/pengatur/stats": "Statistics",
  "/pengatur/keys": "Keys",
  "/pengatur/providers": "Providers",
  "/pengatur/models": "Models",
  "/pengatur/settings": "Settings",
  "/pengatur/audit": "Audit"
};
function normaliseActive(active) {
  if (active.startsWith("/pengatur/keys/")) return "/pengatur/keys";
  return SECTION_LABELS[active] ? active : "/pengatur";
}
function navMarkup(active, idPrefix) {
  const current = normaliseActive(active);
  return NAV_GROUPS.map((group) => {
    const items = group.items.map((item) => {
      const on = item.href === current;
      return '<a class="rail-item" href="' + item.href + '"' + (on ? ' aria-current="page"' : "") + ">" + icon(item.icon, "icon", 17) + "<span>" + escapeHtml(item.label) + "</span></a>";
    }).join("");
    return '<div class="rail-group" role="group" aria-labelledby="' + idPrefix + "-" + group.label.toLowerCase() + '"><span class="rail-label" id="' + idPrefix + "-" + group.label.toLowerCase() + '">' + group.label + "</span>" + items + "</div>";
  }).join("");
}
function navRail(active, actions = "") {
  const providerStrip = '<div class="rail-providers" id="railProviders"><span class="rail-prov"><span class="prov-dot" data-p="gemini"></span><span>Gemini</span></span><span class="rail-prov"><span class="prov-dot" data-p="elevenlabs"></span><span>ElevenLabs</span></span><span class="rail-prov"><span class="prov-dot" data-p="whatstoken"></span><span>WhatsToken</span></span></div>';
  return '<aside class="rail" aria-label="Sections"><a class="rail-brand" href="/pengatur"><span class="rail-mark">' + icon("command", "icon", 17) + '</span><span class="rail-name"><b>OmniProxy</b><span>Gateway</span></span></a>' + providerStrip + '<nav class="rail-nav" aria-label="Console sections">' + navMarkup(active, "nav") + '</nav><div class="rail-foot"><div class="rail-tools"><button class="rail-tool" type="button" id="themeBtn" aria-label="Switch light and dark theme" title="Theme">' + icon("sun", "icon", 15) + '</button><button class="rail-tool" type="button" id="helpBtn" aria-label="Shortcuts and words" title="Help (?)">' + icon("help", "icon", 15) + '</button><span class="spacer"></span></div>' + (actions ? '<div class="rail-actions">' + actions + "</div>" : "") + "</div></aside>";
}
function consolePage(o) {
  const section = SECTION_LABELS[normaliseActive(o.active)] ?? o.title;
  const head = '<header class="canvas-head"><button class="btn btn-ghost btn-sm icon-btn menu-btn" type="button" id="menuBtn" aria-label="Open sections" aria-expanded="false" aria-controls="drawer">' + icon("menu", "icon", 18) + '</button><div class="canvas-crumb"><span class="rail-mark" style="width:20px;height:20px;border-radius:5px;background:var(--text);color:var(--bg)">' + icon("command", "icon", 12) + '</span><span>OmniProxy</span><span aria-hidden="true">/</span><b>' + escapeHtml(section) + '</b></div><div class="head-actions"><button class="btn btn-ghost btn-sm" type="button" id="paletteBtn" aria-keyshortcuts="Control+K">' + icon("search", "icon", 14) + '<span class="palette-kbd">Ctrl K</span></button>' + (o.actions ?? "") + "</div></header>";
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="robots" content="noindex, nofollow">\n<meta name="color-scheme" content="light dark">\n<meta name="theme-color" content="#000000">\n<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">\n<title>' + escapeHtml(o.title) + ' \xB7 OmniProxy</title>\n<link rel="icon" href="/favicon.ico" sizes="32x32">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="/favicon.svg">\n<script>try{var t=localStorage.getItem("omniproxy.theme");document.documentElement.setAttribute("data-theme",t||"dark");}catch(e){}</script>\n<script>' + AUTH_GUARD_JS + "</script>\n<style>" + BASE_CSS + '</style>\n</head>\n<body data-gate="locked">\n<a class="skip" href="#main">Skip to content</a>\n<div class="shell">\n' + navRail(o.active) + '<div class="canvas">\n' + head + '<main id="main" class="page" tabindex="-1">\n' + o.body + "\n</main>\n</div>\n</div>\n" + drawerMarkup(o.active) + helpDialog() + confirmDialog() + paletteDialog() + toastMount() + "<script>" + CLIENT_JS + "</script>\n" + (o.script ? "<script>\n" + o.script + "\n</script>\n" : "") + "</body>\n</html>";
}
function drawerMarkup(active) {
  const providerStrip = '<div class="rail-providers" id="drawerProviders"><span class="rail-prov"><span class="prov-dot" data-p="gemini"></span><span>Gemini</span></span><span class="rail-prov"><span class="prov-dot" data-p="elevenlabs"></span><span>ElevenLabs</span></span><span class="rail-prov"><span class="prov-dot" data-p="whatstoken"></span><span>WhatsToken</span></span></div>';
  return '<div class="drawer-backdrop" id="drawerBackdrop" hidden></div><div class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Sections" hidden><div class="rail-brand" style="padding:0 8px"><span class="rail-mark">' + icon("command", "icon", 17) + '</span><span class="rail-name"><b>OmniProxy</b><span>Gateway</span></span></div>' + providerStrip + '<nav class="rail-nav" aria-label="Console sections">' + navMarkup(active, "drawer") + '</nav><div class="rail-foot"><div class="rail-tools"><button class="rail-tool" type="button" id="drawerTheme" aria-label="Switch light and dark theme">' + icon("sun", "icon", 15) + '</button><button class="rail-tool" type="button" id="drawerHelp" aria-label="Shortcuts and words">' + icon("help", "icon", 15) + "</button></div></div></div>";
}
function escapeHtml(v2) {
  return String(v2 ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
function stateBlock(kind, message, detail, action) {
  const cls = kind === "error" ? "state error" : "state";
  return '<div class="' + cls + '"><b>' + escapeHtml(message) + "</b>" + (detail ? '<p class="hint">' + escapeHtml(detail) + "</p>" : "") + (action ? '<div class="retry">' + action + "</div>" : "") + "</div>";
}
function toastMount() {
  return '<div id="toasts" class="toasts" role="status" aria-live="polite" aria-atomic="false"></div>';
}
function noticeBand() {
  return "";
}
var AUTH_GUARD_JS = `
(function () {
  "use strict";
  try {
    if (!localStorage.getItem("omniproxy.admin.token")) {
      var here = location.pathname + location.search;
      location.replace("/pengatur/login?next=" + encodeURIComponent(here));
    }
  } catch (e) {}
})();
`;
function loginPage() {
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="robots" content="noindex, nofollow">\n<meta name="color-scheme" content="light dark">\n<meta name="theme-color" content="#000000">\n<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">\n<title>Sign in \xB7 OmniProxy</title>\n<link rel="icon" href="/favicon.ico" sizes="32x32">\n<script>try{var t=localStorage.getItem("omniproxy.theme");document.documentElement.setAttribute("data-theme",t||"dark");}catch(e){}</script>\n<style>' + BASE_CSS + '</style>\n</head>\n<body>\n<main class="login-page">\n' + authGate() + "</main>\n<script>" + LOGIN_JS + "</script>\n</body>\n</html>";
}
var LOGIN_JS = `
(function () {
  "use strict";
  var form = document.getElementById("gateForm");
  var input = document.getElementById("token");
  var button = document.getElementById("connect");
  var msg = document.getElementById("gateMsg");
  var toggle = document.getElementById("tokenToggle");
  var STORE = "omniproxy.admin.token";
  var EYE = ${JSON.stringify(icon("eye", "icon", 15))};
  var EYE_OFF = ${JSON.stringify(icon("eyeOff", "icon", 15))};

  function next() {
    var n = new URLSearchParams(location.search).get("next");
    if (!n || n.charAt(0) !== "/" || n.charAt(1) === "/") return "/pengatur";
    return n;
  }
  function say(text, tone) {
    if (!msg) return;
    msg.textContent = text;
    msg.className = "hint u-mt-3" + (tone ? " u-" + tone : "");
  }

  /* Already holding a valid token? Skip the form entirely. */
  try { if (localStorage.getItem(STORE)) { location.replace(next()); return; } } catch (e) {}

  if (!form) return;

  /* Show/hide the token: a pasted token is impossible to proofread as dots,
     and a mistyped character otherwise only surfaces as a rejected sign-in. */
  if (toggle && input) {
    toggle.addEventListener("click", function () {
      var hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      toggle.innerHTML = hidden ? EYE_OFF : EYE;
      toggle.setAttribute("aria-pressed", hidden ? "true" : "false");
      toggle.setAttribute("aria-label", hidden ? "Hide the token" : "Show the token");
      input.focus();
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = input ? input.value.trim() : "";
    if (!value) { say("Paste the token first.", "bad"); return; }
    button.disabled = true;
    button.textContent = "Checking\u2026";
    fetch("/pengatur/keys/list", { headers: { Authorization: "Bearer " + value } })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "rejected" : "unreachable");
        try { localStorage.setItem(STORE, value); } catch (e) {}
        location.replace(next());
      })
      .catch(function (err) {
        button.disabled = false;
        button.textContent = "Connect";
        say(err.message === "rejected" ? "That token was rejected."
          : "Could not reach the deployment: " + err.message, "bad");
      });
  });
  if (input) input.focus();
})();
`;
function authGate() {
  return '<section class="gate-wrap" id="gate"><div class="gate"><div class="gate-brand"><span class="gate-mark">' + icon("command", "icon", 18) + '</span><span class="gate-word"><b>OmniProxy</b><span>Gateway console</span></span></div><div class="panel gate-card"><h1 class="gate-title">Sign in</h1><p class="gate-lede">This console reads every provider pool, the ledger and the settings of this deployment. The token stays in this browser.</p><form id="gateForm" autocomplete="off" class="gate-form"><label class="field" for="token">Deployment admin token</label><div class="gate-field"><input id="token" class="input mono" type="password" spellcheck="false" placeholder="ADMIN_TOKEN" autocomplete="off"><button id="tokenToggle" class="gate-toggle" type="button" aria-label="Show the token" aria-pressed="false">' + icon("eye", "icon", 15) + '</button></div><button id="connect" class="btn btn-primary btn-block u-mt-3" type="submit">Connect</button><div id="gateMsg" class="hint u-mt-3" role="status" aria-live="polite"></div></form><div class="gate-foot"><span class="rail-prov"><span class="prov-dot" data-p="gemini"></span><span>Gemini</span></span><span class="rail-prov"><span class="prov-dot" data-p="elevenlabs"></span><span>ElevenLabs</span></span><span class="rail-prov"><span class="prov-dot" data-p="whatstoken"></span><span>WhatsToken</span></span><span class="gate-foot-note">plus custom upstreams</span></div></div></div></section>';
}
function helpDialog() {
  const keys = [
    ["Ctrl K", "Open the command palette"],
    ["/", "Focus the filter of this page"],
    ["r", "Refresh the data on this page"],
    ["?", "Open this help"],
    ["Esc", "Clear the filter, or close a dialog"],
    ["Tab", "Move through the table, row by row"]
  ];
  const words = [
    ["ready", "The key can serve a request right now"],
    ["cooling", "The key hit its quota and is parked until the cooldown ends"],
    ["dead", "The key was revoked or has no quota left"],
    ["rotated", "The gateway handed the request to another key"],
    ["429", "The upstream rate limit answered"],
    ["WIB", "The timezone the daily rollup and the heatmap use"],
    ["ring", "1h and 24h read the live ring: the last requests in this process"],
    ["rollup", "7d and 30d read the daily rollup, one row per day"],
    ["memory", "The pool and the ledger live in this process. A restart empties them"],
    ["masked key", "The raw key never reaches the browser, only its masked form and its sha256 id"],
    ["gemini", "The Google Generative Language pool. Chat, TTS, image and embeddings"],
    ["elevenlabs", "The ElevenLabs pool. Text to speech and voices, routed by the model name on /v1/audio/speech"],
    ["whatstoken", "The WhatsToken pool. An OpenAI-compatible gateway fronted for the DeepSeek family only, on the chat route"],
    ["custom", "An operator-added OpenAI-compatible upstream. Its id is its name, and it serves the routes its capabilities allow"],
    ["capability", "What a provider can serve: llm, tts, image, video or embeddings. A route refuses a provider without it"],
    ["provider/model", "Explicit routing: `whatstoken/deepseek-v4.1-flash-1017` names the pool AND the model. A bare id is resolved by catalog"],
    ["import", "Reading a provider's own /v1/models into the console, so its models can be picked instead of typed"],
    ["provider", "Which upstream pool a key, a model or a request belongs to. Every badge shows the colour and the name"]
  ];
  const keyRows = keys.map(([k, v2]) => "<dt><kbd>" + escapeHtml(k) + "</kbd></dt><dd>" + escapeHtml(v2) + "</dd>").join("");
  const half = Math.ceil(words.length / 2);
  const wordColumn = (list3) => list3.map(([k, v2]) => "<dt>" + escapeHtml(k) + "</dt><dd>" + escapeHtml(v2) + "</dd>").join("");
  return '<dialog id="helpDialog" class="wide" aria-labelledby="helpTitle"><div class="card-head"><h2 id="helpTitle">Shortcuts and words</h2><span class="spacer"></span><button class="btn btn-ghost btn-sm icon-btn" type="button" id="helpClose" aria-label="Close">' + icon("close") + '</button></div><div class="card-body"><h3 class="help-h">Keyboard</h3><dl class="help-list">' + keyRows + '</dl><h3 class="help-h">What the words mean</h3><div class="help-cols"><dl class="help-list help-words">' + wordColumn(words.slice(0, half)) + '</dl><dl class="help-list help-words">' + wordColumn(words.slice(half)) + "</dl></div></div></dialog>";
}
function confirmDialog() {
  return '<dialog id="confirmDialog" aria-labelledby="confirmTitle" aria-describedby="confirmMessage"><div class="card-head"><h2 id="confirmTitle">Are you sure?</h2></div><div class="card-body"><p id="confirmMessage" class="hint"></p></div><div class="card-foot"><span class="spacer"></span><button id="confirmCancel" class="btn" type="button">Cancel</button><button id="confirmOk" class="btn btn-danger" type="button">Confirm</button></div></dialog>';
}
function paletteDialog() {
  return '<dialog id="palette" class="palette" aria-label="Command palette"><div class="palette-top">' + icon("search", "icon", 16) + '<input id="paletteInput" class="palette-input" type="text" role="combobox" aria-expanded="false" aria-controls="paletteList" aria-autocomplete="list" placeholder="Jump to a section or run an action" autocomplete="off" spellcheck="false"><span class="palette-kbd">Esc</span></div><div id="paletteList" class="palette-list" role="listbox" aria-label="Commands"></div></dialog>';
}
var CLIENT_JS = `
(function () {
  "use strict";

  var STORE = "omniproxy.admin.token";
  var THEME = "omniproxy.theme";

  var ICON = {
    close: ${JSON.stringify(icon("close", "icon", 14))},
    arrow: ${JSON.stringify(icon("arrow", "icon", 14))},
    check: ${JSON.stringify(icon("check", "icon", 14))},
    copy: ${JSON.stringify(icon("copy", "icon", 14))}
  };

  var GX = {
    token: function () {
      try { return localStorage.getItem(STORE) || ""; } catch (e) { return ""; }
    },
    setToken: function (value) {
      try { localStorage.setItem(STORE, value); } catch (e) {}
    },
    clearToken: function () {
      try { localStorage.removeItem(STORE); } catch (e) {}
    },

    /* One fetch helper. It attaches the bearer token, parses JSON, and turns
       every failure into an Error with a status and one readable sentence. */
    api: function (path, opts) {
      opts = opts || {};
      var headers = { "Accept": "application/json" };
      var token = GX.token();
      if (token) headers["Authorization"] = "Bearer " + token;
      var init = { method: opts.method || "GET", headers: headers, cache: "no-store" };
      if (opts.body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(opts.body);
      }
      return fetch(path, init).then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          if (text) {
            try { data = JSON.parse(text); } catch (e) { data = null; }
          }
          if (!res.ok) {
            var message = "Request failed (" + res.status + ").";
            if (data && data.error && data.error.message) message = data.error.message;
            else if (text) message = text.split("\\n")[0].slice(0, 200);
            var err = new Error(message);
            err.status = res.status;
            err.data = data;
            throw err;
          }
          return data;
        });
      });
    },

    download: function (path, filename) {
      var headers = {};
      var token = GX.token();
      if (token) headers["Authorization"] = "Bearer " + token;
      return fetch(path, { headers: headers, cache: "no-store" }).then(function (res) {
        if (!res.ok) throw new Error("Export failed (" + res.status + ").");
        return res.blob();
      }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        GX.toast("Exported " + filename + ".", "ok");
      });
    },

    /* Entry point for every console page. Authentication is settled by the
       head guard: a page without a token never renders here. All that is left
       is to reveal the shell, run the page's first fetch, and send the
       operator back to /pengatur/login if the stored token is rejected. */
    gate: function (opts) {
      opts = opts || {};
      document.body.setAttribute("data-gate", "open");
      var main = document.getElementById("main");
      if (main) main.focus();
      /* The rail strip names the builtin providers; the registry adds the
         custom ones so the multi-provider shape is visible on every page. */
      GX.api("/pengatur/providers/list").then(function (d) {
        if (d && d.providers) GX.railProviders(d.providers);
      }).catch(function () {});
      var result = opts.onSuccess ? opts.onSuccess() : null;
      if (result && result.catch) {
        result.catch(function (err) {
          if (err && (err.status === 401 || err.status === 403)) GX.lock();
        });
      }
    },

    /* Force the gate back open, e.g. after a 401 on a refresh. */
    lock: function (reason) {
      GX.clearToken();
      location.replace("/pengatur/login?next=" + encodeURIComponent(location.pathname));
    },

    el: function (tag, attrs, kids) {
      var node = document.createElement(tag);
      if (attrs) {
        Object.keys(attrs).forEach(function (key) {
          var value = attrs[key];
          if (value === null || value === undefined || value === false) return;
          if (key === "text") node.textContent = value;
          else if (key === "class") node.className = value;
          else if (key === "html") node.innerHTML = value;
          else if (key === "style") node.setAttribute("style", value);
          else if (key.slice(0, 2) === "on" && typeof value === "function") node.addEventListener(key.slice(2), value);
          else node.setAttribute(key, value === true ? "" : String(value));
        });
      }
      (Array.isArray(kids) ? kids : kids ? [kids] : []).forEach(function (kid) {
        if (kid === null || kid === undefined || kid === false) return;
        node.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
      });
      return node;
    },

    /* status pill: a dot plus a word, never a painted block */
    tag: function (text, tone, mono) {
      return GX.el("span", { class: "tag" + (mono ? " tag-mono" : ""), "data-tone": tone || "neutral" }, [
        GX.el("span", { class: "dot" }),
        GX.el("span", { text: text })
      ]);
    },

    /* Provider identity: the provider's colour AND its word. The colour is
       never the only signal, so a badge always names the provider it marks.
       Any id renders \u2014 a custom provider keeps its own id as the word. */
    /* Canonical provider word: builtin ids render their registry label;
       a custom provider keeps its own id as the word. */
    providerLabel: function (provider) {
      var p = String(provider || "");
      if (p === "gemini") return "Gemini";
      if (p === "elevenlabs") return "ElevenLabs";
      if (p === "whatstoken") return "WhatsToken";
      if (p === "groq") return "Groq";
      if (p === "cerebras") return "Cerebras";
      if (p === "openrouter") return "OpenRouter";
      return p;
    },

    providerTag: function (provider) {
      var p = String(provider || "");
      var shown = p || "unknown";
      return GX.el("span", { class: "prov", "data-p": shown }, [
        GX.el("span", { class: "prov-dot", "data-p": shown }),
        GX.el("span", { text: p ? GX.providerLabel(p) : "Unknown" })
      ]);
    },

    providerDot: function (provider) {
      var p = String(provider || "");
      return GX.el("span", { class: "prov-dot", "data-p": p || "unknown", title: p ? GX.providerLabel(p) : "Unknown" });
    },

    /* Legacy fallback only: which pool served a row when the ledger row
       carries no recorded provider. Call sites prefer the recorded
       provider first; this heuristic defaults unmatched models to gemini,
       so legacy WhatsToken/custom rows still land in the Gemini bucket. */
    providerFromModel: function (model) {
      var m = String(model || "");
      var slash = m.indexOf("/");
      if (slash > 0 && /^[a-z][a-z0-9-]*$/.test(m.slice(0, slash))) return m.slice(0, slash);
      return /eleven/i.test(m) ? "elevenlabs" : "gemini";
    },

    /* one figure: label, tabular value, one line of context */
    stat: function (label, value, sub, tone) {
      /* String(value) printed the literal word "undefined" at 27px whenever a
         pool field was missing. A missing figure is not a figure. */
      var shown = value === null || value === undefined || value === "" ? "unknown" : String(value);
      return GX.el("div", { class: "fig", "data-tone": tone || "" }, [
        GX.el("span", { class: "fig-label", text: label }),
        GX.el("span", { class: "fig-value", text: shown }),
        sub ? GX.el("span", { class: "fig-sub", text: sub }) : null
      ]);
    },
    kpi: function (label, value, sub, tone) { return GX.stat(label, value, sub, tone); },

    chip: function (label, value) {
      return GX.el("span", { class: "chip" }, [
        GX.el("span", { class: "chip-k", text: label }),
        GX.el("span", { class: "chip-v", text: value })
      ]);
    },

    meter: function (label, value, total, tone) {
      var pct = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
      return GX.el("div", { class: "meter" }, [
        GX.el("div", { class: "meter-head" }, [
          GX.el("span", { text: label }),
          GX.el("span", { class: "v", text: GX.fmt.num(value) })
        ]),
        GX.el("div", { class: "meter-track", role: "presentation" }, [
          GX.el("div", { class: "meter-fill " + (tone || ""), style: "width:" + pct.toFixed(1) + "%" })
        ])
      ]);
    },

    /* the pool as one proportional bar plus a legend: the shape of the pool
       is readable in one glance and every count is still written out */
    poolBar: function (parts) {
      var total = 0;
      parts.forEach(function (p) { total += Math.max(0, p.value); });
      var track = GX.el("div", { class: "poolbar-track", role: "img", "aria-label": parts.map(function (p) { return p.value + " " + p.label; }).join(", ") });
      var legend = GX.el("div", { class: "legend" });
      parts.forEach(function (p) {
        if (p.value > 0) track.appendChild(GX.el("span", { class: p.tone, style: "width:" + ((p.value / total) * 100).toFixed(2) + "%" }));
        legend.appendChild(GX.el("span", { class: "legend-item" }, [
          GX.el("span", { class: "dot " + p.tone }),
          GX.el("span", { text: p.label }),
          GX.el("b", { text: GX.fmt.num(p.value) })
        ]));
      });
      return GX.el("div", { class: "poolbar" }, [track, legend]);
    },

    /* one provider's pool: its badge, its proportional bar, its ready count.
       The per-provider health of a multi-provider gateway is the first thing
       an operator looks for, so each provider gets its own row. */
    providerPool: function (provider, snap) {
      snap = snap || {};
      /* Never collapse a provider: WhatsToken/custom rows used to be
         labelled Gemini here. Every provider keeps its own tag; only a
         missing value falls back to the generic custom tag. */
      var p = provider || "custom";
      var ready = Number(snap.ready) || 0;
      var total = Number(snap.total) || 0;
      var parts = [
        { label: "ready", value: ready, tone: "ok" },
        { label: "cooling", value: Number(snap.cooling) || 0, tone: "warn" },
        { label: "quota", value: Number(snap.quota_exhausted) || 0, tone: "quota" },
        { label: "dead", value: Number(snap.dead) || 0, tone: "bad" },
        { label: "unverified", value: Number(snap.unverified) || 0, tone: "neutral" }
      ];
      return GX.el("div", { class: "prov-pool", "data-p": p }, [
        GX.providerTag(p),
        GX.poolBar(parts),
        GX.el("span", { class: "count", text: ready + "/" + total + " ready" })
      ]);
    },

    spark: function (values, width, height) {
      width = width || 240; height = height || 40;
      var max = 0;
      values.forEach(function (v) { if (v > max) max = v; });
      if (!max) max = 1;
      var step = values.length > 1 ? width / (values.length - 1) : width;
      var pts = values.map(function (v, i) {
        var x = i * step;
        var y = height - (v / max) * (height - 2) - 1;
        return x.toFixed(1) + "," + y.toFixed(1);
      });
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "spark");
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "series of " + values.length + " points, peak " + max);
      var base = document.createElementNS("http://www.w3.org/2000/svg", "line");
      base.setAttribute("class", "base");
      base.setAttribute("x1", "0"); base.setAttribute("x2", String(width));
      base.setAttribute("y1", String(height - 1)); base.setAttribute("y2", String(height - 1));
      svg.appendChild(base);
      if (pts.length > 1) {
        var fill = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        fill.setAttribute("class", "fill");
        fill.setAttribute("points", "0," + (height - 1) + " " + pts.join(" ") + " " + width + "," + (height - 1));
        svg.appendChild(fill);
      }
      var line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      line.setAttribute("points", pts.join(" "));
      svg.appendChild(line);
      return svg;
    },

    state: function (kind, message, detail, action) {
      var node = GX.el("div", { class: "state" + (kind === "error" ? " error" : "") }, [
        GX.el("b", { text: message }),
        detail ? GX.el("p", { class: "hint", text: detail }) : null
      ]);
      if (action) node.appendChild(GX.el("div", { class: "retry", html: action }));
      return node;
    },

    /* a table cell. The label rides along so the row folds into a labelled
       list on a narrow screen. */
    cell: function (row, text, cls, label) {
      var td = GX.el("td", { class: cls || "", "data-l": label || null });
      td.textContent = text === null || text === undefined ? "" : String(text);
      row.appendChild(td);
      return td;
    },

    fmt: {
      num: function (n) {
        if (n === null || n === undefined || isNaN(n)) return "-";
        return Number(n).toLocaleString("en-GB");
      },
      compact: function (n) {
        if (n === null || n === undefined || isNaN(n)) return "-";
        var v = Number(n);
        if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1).replace(/\\.0$/, "") + "B";
        if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\\.0$/, "") + "M";
        if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(1).replace(/\\.0$/, "") + "k";
        return v.toLocaleString("en-GB");
      },
      money: function (n) {
        if (n === null || n === undefined || isNaN(n)) return "-";
        var v = Number(n);
        if (v === 0) return "$0.00";
        if (Math.abs(v) < 0.01) return "$" + v.toFixed(4);
        if (Math.abs(v) < 1) return "$" + v.toFixed(3);
        return "$" + v.toFixed(2);
      },
      pct: function (part, whole, digits) {
        if (!whole) return "-";
        return ((part / whole) * 100).toFixed(digits === undefined ? 1 : digits) + "%";
      },
      left: function (ms) {
        if (ms === null || ms === undefined) return "-";
        var v = Number(ms);
        if (!isFinite(v)) return "-";
        if (v <= 0) return "now";
        /* A key parked for good carries Number.MAX_SAFE_INTEGER as its
           deadline, which is 285,619 years rather than a duration. Anything
           past a few millennia is that sentinel and not a wait. */
        if (v > 1e14) return "permanent";
        var s = Math.ceil(v / 1000);
        if (s < 60) return s + "s";
        var m = Math.floor(s / 60);
        if (m < 60) return m + "m " + (s % 60) + "s";
        var h = Math.floor(m / 60);
        if (h < 48) return h + "h " + (m % 60) + "m";
        var d = Math.floor(h / 24);
        if (d < 365) return d + "d " + (h % 24) + "h";
        return Math.floor(d / 365) + "y";
      },
      time: function (ts) {
        if (!ts) return "-";
        return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
      },
      clock: function (ts) {
        if (!ts) return "-";
        var d = new Date(ts);
        return d.toLocaleTimeString("en-GB", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
      },
      date: function (ts) {
        if (!ts) return "-";
        return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      },
      day: function (day) {
        if (!day) return "-";
        var parts = String(day).split("-");
        if (parts.length !== 3) return String(day);
        return parts[2] + "/" + parts[1];
      },
      /* how long ago, in the unit a person would say it in */
      age: function (ts) {
        if (!ts) return "never";
        var delta = Date.now() - Number(ts);
        if (delta < 0) delta = 0;
        var s = Math.floor(delta / 1000);
        if (s < 45) return "just now";
        if (s < 90) return "1m ago";
        var m = Math.floor(s / 60);
        if (m < 60) return m + "m ago";
        var h = Math.floor(m / 60);
        if (h < 24) return h + "h ago";
        var d = Math.floor(h / 24);
        if (d < 30) return d + "d ago";
        return GX.fmt.date(ts);
      },
      /* a full timestamp for a log line: date, then time to the second */
      stamp: function (ts) {
        if (!ts) return "-";
        var d = new Date(ts);
        var day = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
        return day + " " + d.toLocaleTimeString("en-GB", { hour12: false });
      }
    },


    /* The rail and drawer strips name the builtin providers server-side;
       custom ones only exist once the registry answers, so they are appended
       here after the token is accepted. Idempotent: a provider already on a
       strip is never duplicated. */
    railProviders: function (providers) {
      /* Both strips: the sidebar's and the drawer's. They name the same
         pools, so a custom provider appears wherever the nav appears. */
      ["railProviders", "drawerProviders"].forEach(function (mountId) {
        var mount = document.getElementById(mountId);
        if (!mount) return;
        (providers || []).forEach(function (p) {
          if (!p || !p.id) return;
          if (mount.querySelector('[data-p="' + p.id + '"]')) return;
          var item = GX.el("span", { class: "rail-prov", "data-id": p.id }, [
            GX.el("span", { class: "prov-dot", "data-p": p.id }),
            GX.el("span", { text: p.label || p.id })
          ]);
          mount.appendChild(item);
        });
      });
    },

    debounce: function (fn, ms) {
      var t = null;
      return function () {
        var args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, ms || 150);
      };
    },

    every: function (ms, fn) {
      var id = setInterval(fn, ms);
      return function () { clearInterval(id); };
    },

    openDialog: function (node) {
      if (!node) return;
      if (typeof node.showModal === "function") { if (!node.open) node.showModal(); }
      else node.setAttribute("open", "");
      /* showModal focuses the first focusable node, which is the close button:
         the sheet opened with a focus ring on an X and the caret nowhere. Put
         it in the first field instead. */
      var field = node.querySelector("input:not([type=hidden]), select, textarea");
      if (field) field.focus();
    },
    closeDialog: function (node) {
      if (!node) return;
      if (typeof node.close === "function") { if (node.open) node.close(); }
      else node.removeAttribute("open");
    },

    busy: function (button, label) {
      if (!button) return;
      button.setAttribute("aria-busy", "true");
      button.disabled = true;
      if (label) {
        if (!button.dataset.label) button.dataset.label = button.textContent;
        button.textContent = label;
      }
    },
    idle: function (button) {
      if (!button) return;
      button.removeAttribute("aria-busy");
      button.disabled = false;
      if (button.dataset.label) {
        button.textContent = button.dataset.label;
        delete button.dataset.label;
      }
    },

    /* An inline message, next to the control that produced it.
       Preserve the node's own classes: callers mount this on a .notice
       container and replacing className would silently delete the container's
       padding, border and background. Only the tone class changes. */
    say: function (node, text, kind) {
      if (!node) return;
      node.textContent = text || "";
      var tones = ["u-ok", "u-bad", "u-warn"];
      for (var i = 0; i < tones.length; i++) node.classList.remove(tones[i]);
      if (kind === "ok") node.classList.add("u-ok");
      else if (kind === "err") node.classList.add("u-bad");
      else if (kind === "warn") node.classList.add("u-warn");
    },

    confirm: function (opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var dialog = document.getElementById("confirmDialog");
        if (!dialog) { resolve(window.confirm(opts.message || "Are you sure?")); return; }
        var title = document.getElementById("confirmTitle");
        var message = document.getElementById("confirmMessage");
        var ok = document.getElementById("confirmOk");
        var cancel = document.getElementById("confirmCancel");
        if (title) title.textContent = opts.title || "Are you sure?";
        if (message) message.textContent = opts.message || "";
        if (ok) ok.textContent = opts.confirmLabel || "Confirm";
        var done = false;
        function finish(value) {
          if (done) return;
          done = true;
          ok.removeEventListener("click", onOk);
          cancel.removeEventListener("click", onCancel);
          dialog.removeEventListener("close", onClose);
          GX.closeDialog(dialog);
          resolve(value);
        }
        function onOk() { finish(true); }
        function onCancel() { finish(false); }
        function onClose() { finish(false); }
        ok.addEventListener("click", onOk);
        cancel.addEventListener("click", onCancel);
        dialog.addEventListener("close", onClose);
        GX.openDialog(dialog);
        ok.focus();
      });
    },

    /* A table with no rows must not draw a frame. The state takes its place. */
    tableState: function (table, emptyNode, isEmpty, stateNode) {
      if (table) table.hidden = isEmpty;
      if (emptyNode) {
        emptyNode.textContent = "";
        if (isEmpty && stateNode) emptyNode.appendChild(stateNode);
      }
    },

    /* URL state. A filtered view is a link the operator can share, and a
       reload lands on the same view. */
    url: {
      read: function () {
        var out = {};
        var q = new URLSearchParams(location.search);
        q.forEach(function (value, key) { out[key] = value; });
        return out;
      },
      write: function (values) {
        var q = new URLSearchParams();
        Object.keys(values).forEach(function (key) {
          var value = values[key];
          if (value !== undefined && value !== null && value !== "") q.set(key, value);
        });
        var next = q.toString();
        history.replaceState(null, "", location.pathname + (next ? "?" + next : ""));
      }
    },

    /* Toasts. Fixed to the viewport; they never move the page. A failure
       stays until dismissed, because a failure that vanishes was never read. */
    toast: function (text, kind, action) {
      var host = document.getElementById("toasts");
      if (!host) return;
      var node = GX.el("div", { class: "toast", "data-tone": kind || "neutral", role: "status" });
      node.appendChild(GX.el("span", { class: "toast-text", text: text }));
      if (action && action.label) {
        var act = GX.el("button", { class: "toast-act", type: "button", text: action.label });
        act.addEventListener("click", function () { try { action.run(); } finally { node.remove(); } });
        node.appendChild(act);
      }
      var x = GX.el("button", { class: "toast-x", type: "button", "aria-label": "Dismiss", html: ICON.close });
      x.addEventListener("click", function () { node.remove(); });
      node.appendChild(x);
      host.appendChild(node);
      while (host.children.length > 4) host.removeChild(host.firstChild);
      if (kind !== "err" && kind !== "warn") {
        setTimeout(function () { node.remove(); }, 5200);
      }
      return node;
    },

    /* GX.notice keeps the old call shape: every outcome is a toast. */
    notice: function (text, kind) {
      if (!text) return;
      var tone = kind === "err" || kind === "bad" ? "err" : kind === "ok" ? "ok" : kind === "warn" ? "warn" : "neutral";
      GX.toast(text, tone);
    },

    copy: function (text, label) {
      var done = function () { GX.toast((label || "Value") + " copied.", "ok"); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { GX.toast("Could not copy.", "err"); });
        return;
      }
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); done(); } catch (e) { GX.toast("Could not copy.", "err"); }
      area.remove();
    },

    /* Theme survives a reload. Dark is the console default; light is an explicit toggle. */
    theme: {
      get: function () {
        var set = document.documentElement.getAttribute("data-theme");
        if (set) return set;
        return "dark";
      },
      set: function (value) {
        document.documentElement.setAttribute("data-theme", value);
        try { localStorage.setItem(THEME, value); } catch (e) {}
        GX._syncTools();
      },
      toggle: function () {
        var next = GX.theme.get() === "dark" ? "light" : "dark";
        GX.theme.set(next);
        GX.toast(next === "dark" ? "Dark theme." : "Light theme.", "neutral");
      }
    },

    /* the command palette */
    palette: {
      items: [],
      register: function (list) { GX.palette.items = GX.palette.items.concat(list || []); },
      open: function () {
        var dialog = document.getElementById("palette");
        if (!dialog) return;
        GX.palette.render("");
        GX.openDialog(dialog);
        var input = document.getElementById("paletteInput");
        if (input) { input.value = ""; input.focus(); }
      },
      close: function () { GX.closeDialog(document.getElementById("palette")); },
      all: function () {
        var nav = ${JSON.stringify(NAV_ITEMS)}.map(function (item) {
          return { group: "Go to", label: item.label, hint: item.href, run: function () { location.href = item.href; } };
        });
        var tools = [
          { group: "Tools", label: "Refresh this page", hint: "r", run: function () { var b = document.getElementById("refreshBtn"); if (b) b.click(); else location.reload(); } },
          { group: "Tools", label: "Copy this link", hint: "", run: function () { GX.copy(location.href, "Link"); } },
          { group: "Tools", label: "Switch theme", hint: "", run: function () { GX.theme.toggle(); } },
          { group: "Tools", label: "Shortcuts and words", hint: "?", run: function () { GX.openDialog(document.getElementById("helpDialog")); } }
        ];
        return tools.concat(nav).concat(GX.palette.items);
      },
      render: function (query) {
        var list = document.getElementById("paletteList");
        if (!list) return;
        var q = String(query || "").trim().toLowerCase();
        var items = GX.palette.all().filter(function (item) {
          if (!q) return true;
          return (item.label + " " + (item.group || "")).toLowerCase().indexOf(q) >= 0;
        });
        list.textContent = "";
        GX._paletteItems = items;
        GX._paletteIndex = 0;
        var pi = document.getElementById("paletteInput");
        if (!items.length) {
          list.appendChild(GX.el("div", { class: "palette-empty", text: "Nothing matches that." }));
          /* An empty result list is not an expanded listbox; a screen reader
             announced the hardcoded aria-expanded="true" with nothing in it. */
          if (pi) { pi.setAttribute("aria-expanded", "false"); pi.removeAttribute("aria-activedescendant"); }
          return;
        }
        if (pi) pi.setAttribute("aria-expanded", "true");
        var lastGroup = "";
        items.forEach(function (item, index) {
          if (item.group && item.group !== lastGroup) {
            lastGroup = item.group;
            list.appendChild(GX.el("div", { class: "palette-group", text: item.group }));
          }
          var button = GX.el("button", {
            class: "palette-item",
            type: "button",
            role: "option",
            "aria-selected": index === 0 ? "true" : "false",
            "data-index": index
          }, [
            GX.el("span", { html: ICON.arrow }),
            GX.el("span", { text: item.label }),
            item.hint ? GX.el("span", { class: "hint", text: item.hint }) : null
          ]);
          button.addEventListener("click", function () { GX.palette.run(index); });
          list.appendChild(button);
        });
      },
      run: function (index) {
        var item = (GX._paletteItems || [])[index];
        if (!item) return;
        GX.palette.close();
        setTimeout(function () { item.run(); }, 0);
      },
      move: function (delta) {
        var items = GX._paletteItems || [];
        var input = document.getElementById("paletteInput");
        if (!items.length) return;
        GX._paletteIndex = (GX._paletteIndex + delta + items.length) % items.length;
        var list = document.getElementById("paletteList");
        if (!list) return;
        Array.prototype.forEach.call(list.querySelectorAll(".palette-item"), function (node) {
          var on = Number(node.getAttribute("data-index")) === GX._paletteIndex;
          node.setAttribute("aria-selected", on ? "true" : "false");
          /* aria-activedescendant could never point at the active option
             because the options carried no id. Give each one a stable id and
             keep the combobox pointing at the highlighted row, so a screen
             reader follows the arrow keys. */
          if (!node.id) node.id = "palette-opt-" + node.getAttribute("data-index");
          if (on) input.setAttribute("aria-activedescendant", node.id);
          if (on && node.scrollIntoView) node.scrollIntoView({ block: "nearest" });
        });
      }
    },

    /* Keyboard shortcuts. They never fire while the operator is typing. */
    shortcuts: function (opts) {
      opts = opts || {};
      var filter = opts.filter ? document.getElementById(opts.filter) : null;
      var refresh = opts.refresh ? document.getElementById(opts.refresh) : null;
      /* A modal <dialog> makes the rest of the document inert, so a keydown
         that starts inside it can stop reaching a document-level bubble
         listener - which is why Escape appeared dead while every dialog was
         open. Capture on the window sees the event first, whatever the target
         and whatever the modal state. */
      window.addEventListener("keydown", function (event) {
        var target = event.target;
        var typing = target && (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        );
        if ((event.metaKey || event.ctrlKey) && !event.altKey && (event.key === "k" || event.key === "K")) {
          event.preventDefault();
          GX.palette.open();
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === "Escape") {
          var palette = document.getElementById("palette");
          if (palette && palette.open) { GX.palette.close(); return; }
          /* The help sheet is a modal <dialog>, and relying on the browser's
             own Escape handling did not work: the keydown lands inside the
             dialog, this document-level listener sees it first and returned
             without closing anything. Close the open modal explicitly. */
          var openModal = document.querySelector("dialog[open]");
          if (openModal && openModal.id !== "palette" && typeof openModal.close === "function") {
            openModal.close();
            return;
          }
          if (opts.onEscape) opts.onEscape();
          return;
        }
        if (typing) return;
        if (event.key === "/") {
          if (!filter) return;
          event.preventDefault();
          filter.focus();
          filter.select();
          return;
        }
        if (event.key === "r" || event.key === "R") {
          if (!refresh) return;
          event.preventDefault();
          refresh.click();
          return;
        }
        if (event.key === "?") {
          event.preventDefault();
          GX.openDialog(document.getElementById("helpDialog"));
          return;
        }
        if (event.key === "c" || event.key === "C") {
          return;
        }
      });

      var help = document.getElementById("helpBtn");
      if (help) help.addEventListener("click", function () { GX.openDialog(document.getElementById("helpDialog")); });
      var close = document.getElementById("helpClose");
      if (close) close.addEventListener("click", function () { GX.closeDialog(document.getElementById("helpDialog")); });

      var paletteBtn = document.getElementById("paletteBtn");
      if (paletteBtn) paletteBtn.addEventListener("click", function () { GX.palette.open(); });
      var paletteInput = document.getElementById("paletteInput");
      if (paletteInput) {
        paletteInput.addEventListener("input", function () { GX.palette.render(paletteInput.value); });
        paletteInput.addEventListener("keydown", function (event) {
          if (event.key === "ArrowDown") { event.preventDefault(); GX.palette.move(1); }
          else if (event.key === "ArrowUp") { event.preventDefault(); GX.palette.move(-1); }
          else if (event.key === "Enter") { event.preventDefault(); GX.palette.run(GX._paletteIndex || 0); }
        });
      }
      var paletteDialogNode = document.getElementById("palette");
      if (paletteDialogNode) {
        paletteDialogNode.addEventListener("click", function (event) {
          if (event.target === paletteDialogNode) GX.palette.close();
        });
      }
    },

    _syncTools: function () {
      var dark = GX.theme.get() === "dark";
      ["themeBtn", "drawerTheme"].forEach(function (id) {
        var node = document.getElementById(id);
        if (node) node.innerHTML = dark
          ? '<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/></svg>'
          : '<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
      });
    }
  };

  window.GX = GX;

  function wireChrome() {
    var themeBtn = document.getElementById("themeBtn");
    if (themeBtn) themeBtn.addEventListener("click", function () { GX.theme.toggle(); });
    var drawerTheme = document.getElementById("drawerTheme");
    if (drawerTheme) drawerTheme.addEventListener("click", function () { GX.theme.toggle(); });
    var drawerHelp = document.getElementById("drawerHelp");
    if (drawerHelp) drawerHelp.addEventListener("click", function () { GX.openDialog(document.getElementById("helpDialog")); });

    var drawer = document.getElementById("drawer");
    var backdrop = document.getElementById("drawerBackdrop");
    var menuBtn = document.getElementById("menuBtn");
    function openDrawer() {
      if (!drawer || !backdrop) return;
      drawer.hidden = false;
      backdrop.hidden = false;
      if (menuBtn) menuBtn.setAttribute("aria-expanded", "true");
      var first = drawer.querySelector(".rail-item");
      if (first) first.focus();
    }
    function closeDrawer() {
      if (!drawer || !backdrop) return;
      drawer.hidden = true;
      backdrop.hidden = true;
      if (menuBtn) { menuBtn.setAttribute("aria-expanded", "false"); menuBtn.focus(); }
    }
    if (menuBtn) menuBtn.addEventListener("click", openDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && drawer && !drawer.hidden) closeDrawer();
    });

    GX._syncTools();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireChrome);
  else wireChrome();
})();
`;
var LOGIN_HTML = loginPage();

// src/admin-ui.ts
var OVERVIEW_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <h1 class="page-title">Overview</h1>
      <p class="page-lede">Whether the pool can serve right now, what is blocking it, and what the traffic is doing.</p>
    </div>
  </header>

  <section class="panel">
    <div class="panel-body">
      <div class="verdict">
        <span class="verdict-dot" id="verdictDot" data-tone="ok"></span>
        <div class="verdict-main">
          <strong id="verdictText">-</strong>
          <span class="meta" id="verdictState">-</span>
        </div>
        <span class="spacer"></span>
        <label class="check"><input id="auto" type="checkbox" checked> Refresh every 15s</label>
        <span class="meta" id="updated">-</span>
      </div>
    </div>
  </section>

  <div class="figures" id="poolKpis"></div>

  <div class="figures" id="kpis"></div>

  <section class="panel">
    <div class="panel-head">
      <h2>Needs attention</h2>
      <span class="meta" id="attnMeta">-</span>
    </div>
    <div class="feed" id="attn"></div>
    <div class="panel-foot" id="attnFoot">
      <button id="testAllBtn" class="btn btn-sm" type="button">${icon("test")}Test all live keys</button>
      <span class="meta" id="testAllNote">one live call per key, eight at a time</span>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <h2>Pool health</h2>
      <span class="meta" id="healthMeta">-</span>
    </div>
    <div class="panel-body">
      <div id="poolBar" class="u-mb-3"></div>
      <div id="providerPools" class="u-mt-3"></div>
    </div>
  </section>

  <div class="split">
    <section class="panel">
      <div class="panel-head">
        <h2>Traffic trend</h2>
        <span class="meta">daily, WIB</span>
      </div>
      <div class="panel-body">
        <div id="providerDays"></div>
        <div class="bars u-mt-3" id="providerMix"></div>
        <div class="meta u-mt-2" id="providerTotal"></div>
        <p class="hint u-mt-2">Split by the provider recorded in the request ledger.</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Plan mix</h2>
        <span class="meta" id="planDeclared">-</span>
      </div>
      <div class="panel-body">
        <div class="bars" id="planMix"></div>
        <p class="hint u-mt-2" id="planPct"></p>
        <p class="hint u-mt-2">Plans are declared by the operator: no provider reports a project plan over the API, so declare it on the Keys page; the models page prices a test run against it.</p>
      </div>
    </section>
  </div>

  <section class="panel">
    <div class="panel-head">
      <h2>Recent activity</h2>
      <a class="meta" href="/pengatur/audit">audit log</a>
    </div>
    <div class="feed" id="activity"></div>
  </section>

  <section class="panel">
    <div class="panel-body">
      <div class="row">
        <button id="addBtnFoot" class="btn btn-sm btn-primary" type="button">${icon("plus")}Add keys</button>
        <a class="btn btn-sm" href="/pengatur/keys">View keys</a>
        <button id="testAllBtnFoot" class="btn btn-sm" type="button">${icon("test")}Test all live keys</button>
        <span class="meta" id="testAllNoteFoot">one live call per key, eight at a time</span>
      </div>
    </div>
  </section>
</div>

<dialog id="addDialog" aria-labelledby="addTitle">
  <form id="addForm" method="dialog">
    <div class="card-head">
      <div class="card-title">
        <h2 id="addTitle">Add keys</h2>
        <span class="card-sub">Paste one key per line. Every key is probed before it joins the pool.</span>
      </div>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm icon-btn" type="button" id="addClose" aria-label="Close">${icon("close")}</button>
    </div>
    <div class="card-body">
      <label class="field" for="newKeys">Keys</label>
      <textarea id="newKeys" class="textarea" spellcheck="false" placeholder="key one&#10;key two"></textarea>
      <p class="hint u-mt-1">One per line, or separated by commas.</p>
      <div id="addMsg" class="hint u-mt-3" role="status" aria-live="polite"></div>
    </div>
    <div class="card-foot">
      <span id="addCount" class="hint"></span>
      <span class="spacer"></span>
      <button id="addCancel" class="btn" type="button">Cancel</button>
      <button id="addSubmit" class="btn btn-primary" type="submit">Add to pool</button>
    </div>
  </form>
</dialog>
`;
var OVERVIEW_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    updated: document.getElementById("updated"),
    verdictText: document.getElementById("verdictText"),
    verdictState: document.getElementById("verdictState"),
    verdictDot: document.getElementById("verdictDot"),
    poolKpis: document.getElementById("poolKpis"),
    healthMeta: document.getElementById("healthMeta"),
    attn: document.getElementById("attn"),
    attnMeta: document.getElementById("attnMeta"),
    attnFoot: document.getElementById("attnFoot"),
    testAllBtn: document.getElementById("testAllBtn"),
    auto: document.getElementById("auto"),
    testAllNote: document.getElementById("testAllNote"),
    kpis: document.getElementById("kpis"),
    addDialog: document.getElementById("addDialog"),
    addClose: document.getElementById("addClose"),
    addCancel: document.getElementById("addCancel"),
    addForm: document.getElementById("addForm"),
    addSubmit: document.getElementById("addSubmit"),
    addBtn: document.getElementById("addBtn"),
    addBtnFoot: document.getElementById("addBtnFoot"),
    testAllBtnFoot: document.getElementById("testAllBtnFoot"),
    testAllNoteFoot: document.getElementById("testAllNoteFoot"),
    refreshBtn: document.getElementById("refreshBtn"),
    newKeys: document.getElementById("newKeys"),
    addCount: document.getElementById("addCount"),
    addMsg: document.getElementById("addMsg"),
    planMix: document.getElementById("planMix"),
    planDeclared: document.getElementById("planDeclared"),
    planPct: document.getElementById("planPct"),
    providerMix: document.getElementById("providerMix"),
    providerDays: document.getElementById("providerDays"),
    providerTotal: document.getElementById("providerTotal"),
    providerPools: document.getElementById("providerPools"),
    activity: document.getElementById("activity")
  };

  var state = { tiers: null, timer: null };


  function safe(promise) {
    return promise.catch(function () { return null; });
  }

  function renderHero(pool, tiers, stats) {
    if (el.poolBar) {
      el.poolBar.textContent = "";
      el.poolBar.appendChild(GX.poolBar([
        { label: "ready", value: pool.ready, tone: "ok" },
        { label: "cooling", value: pool.cooling, tone: "warn" },
        { label: "dead", value: pool.dead, tone: "bad" }
      ]));
    }

    /* The verdict strip is the one-line answer: dot tone, counts, state word.
       The pool KPI cards below carry the same census as figures. */
    var ready = pool.ready || 0;
    var cooling = pool.cooling || 0;
    var dead = pool.dead || 0;
    var total = pool.total || 0;
    el.verdictText.textContent = pool.degraded ? "Degraded" : "Ready to serve";
    el.verdictState.textContent = ready + "/" + total + " serving \xB7 " + cooling + " cooling \xB7 " + dead + " dead";
    el.verdictDot.setAttribute("data-tone", dead > 0 ? "bad" : cooling > 0 ? "warn" : "ok");
    el.healthMeta.textContent = pool.degraded
      ? "Degraded \xB7 " + dead + " dead \xB7 " + cooling + " cooling"
      : "Ready";

    /* Per-provider pool health. A multi-provider gateway is only as healthy
       as its weakest pool, so each provider gets its own bar and count. */
    el.providerPools.textContent = "";
    var byProvider = pool.byProvider || pool.providers || {};
    var provNames = Object.keys(byProvider).sort(function (a, b) {
      if (a === b) return 0;
      return a === "gemini" ? -1 : b === "gemini" ? 1 : a < b ? -1 : 1;
    });
    provNames.forEach(function (prov) {
      el.providerPools.appendChild(GX.providerPool(prov, byProvider[prov]));
    });
  }

  /* The pool as a row of figure cards: the census an operator checks first,
     each number on its own surface instead of one full-width strip. */
  function renderPoolKpis(pool, tiers) {
    el.poolKpis.textContent = "";
    var ready = pool.ready || 0;
    var cooling = pool.cooling || 0;
    var dead = pool.dead || 0;
    var total = pool.total || 0;
    el.poolKpis.appendChild(GX.stat("Ready now", String(ready), total ? "of " + total + " in the pool" : "the pool is empty", ready ? "ok" : "bad"));
    el.poolKpis.appendChild(GX.stat("Cooling", String(cooling), cooling ? "next free in " + GX.fmt.left(pool.soonestReadyMs) : "none parked", cooling ? "warn" : ""));
    el.poolKpis.appendChild(GX.stat("Dead", String(dead), dead ? "revoked or out of quota" : "none retired", dead ? "bad" : ""));
    var t = tiers || { free: 0, paid: 0, pro: 0, unknown: 0 };
    var declared = (t.free || 0) + (t.paid || 0) + (t.pro || 0);
    var keys = declared + (t.unknown || 0);
    el.poolKpis.appendChild(GX.stat(
      "Unverified",
      String(pool.unverified || 0),
      pool.unverified ? "not probed yet" : "every key has a verdict",
      pool.unverified ? "warn" : ""
    ));
    el.poolKpis.appendChild(GX.stat(
      "Plans declared",
      declared + "/" + keys,
      t.unknown ? t.unknown + " without a plan" : "every key declares a plan",
      t.unknown ? "warn" : "ok"
    ));
  }

  function renderAttention(pool, tiers) {
    var items = [];
    /* Per provider where the census allows it: "2 gemini keys are dead" is
       actionable, "5 keys are dead" across two pools is not. */
    var byProvider = pool.byProvider || pool.providers || {};
    var provNames = Object.keys(byProvider).sort(function (a, b) {
      if (a === b) return 0;
      return a === "gemini" ? -1 : b === "gemini" ? 1 : a < b ? -1 : 1;
    });
    provNames.forEach(function (prov) {
      var p = byProvider[prov] || {};
      if (p.dead > 0) {
        items.push({
          tone: "bad",
          title: p.dead + (p.dead === 1 ? " " + prov + " key is dead" : " " + prov + " keys are dead"),
          detail: "Revoked or out of quota. Remove them to shrink the pool.",
          href: "/pengatur/keys?provider=" + encodeURIComponent(prov)
        });
      }
      if (p.cooling > 0) {
        items.push({
          tone: "warn",
          title: p.cooling + (p.cooling === 1 ? " " + prov + " key is cooling" : " " + prov + " keys are cooling"),
          detail: "Free tier quota is exhausted. Longest wait is " + GX.fmt.left(pool.soonestReadyMs) + ".",
          href: "/pengatur/keys?provider=" + encodeURIComponent(prov)
        });
      }
    });
    /* No per-provider census (older server): fall back to the global counts. */
    if (!provNames.length) {
      if (pool.dead > 0) {
        items.push({
          tone: "bad",
          title: pool.dead + (pool.dead === 1 ? " key is dead" : " keys are dead"),
          detail: "Revoked or out of quota. Remove them to shrink the pool.",
          href: "/pengatur/keys"
        });
      }
      if (pool.cooling > 0) {
        items.push({
          tone: "warn",
          title: pool.cooling + (pool.cooling === 1 ? " key is cooling" : " keys are cooling"),
          detail: "Free tier quota is exhausted. Longest wait is " + GX.fmt.left(pool.soonestReadyMs) + ".",
          href: "/pengatur/keys"
        });
      }
    }
    var unset = tiers ? tiers.unknown || 0 : 0;
    if (unset > 0) {
      items.push({
        tone: "info",
        title: unset + (unset === 1 ? " key has no plan" : " keys have no plan"),
        detail: "Pricing on the models page stays unknown for these.",
        href: "/pengatur/keys"
      });
    }

    el.attn.textContent = "";
    /* The head meta counts the items; the feed keeps its rows in both states.
       An all-clear panel is one row, not a header with a floating hairline
       and 16px of empty card below it \u2014 the spacing stays identical whether
       the pool needs attention or not. Test all stays reachable from the
       footer actions row, so collapsing the foot here loses no action. */
    el.attnMeta.textContent = items.length
      ? items.length + (items.length === 1 ? " item" : " items")
      : "all clear";
    el.attn.hidden = false;
    el.attnFoot.hidden = !items.length;
    if (!items.length) {
      el.attn.appendChild(GX.el("div", { class: "attn-item" }, [
        GX.el("span", { class: "dot", style: "background:var(--ok)" }),
        GX.el("span", null, [
          GX.el("span", { class: "t", text: "Nothing needs attention" }),
          GX.el("span", { class: "d", text: "Every key is ready and every plan is declared." })
        ])
      ]));
      return;
    }
    items.forEach(function (item) {
      /* "info" is a runtime tone with no CSS variable of its own; the dot
         reads it as the accent colour. */
      var dotTone = item.tone === "info" ? "accent" : item.tone;
      var link = GX.el("a", { class: "attn-item", href: item.href }, [
        GX.el("span", { class: "dot", style: "background:var(--" + dotTone + ")" }),
        GX.el("span", null, [
          GX.el("span", { class: "t", text: item.title }),
          GX.el("span", { class: "d", text: item.detail })
        ]),
        GX.el("span", { class: "go", text: "Open" })
      ]);
      el.attn.appendChild(link);
    });
  }

  function renderKpis(stats) {
    el.kpis.textContent = "";
    if (!stats) {
      el.kpis.appendChild(GX.kpi("Requests", "-", "statistics unavailable"));
      el.kpis.appendChild(GX.kpi("Errors", "-", "statistics unavailable"));
      el.kpis.appendChild(GX.kpi("Tokens", "-", "statistics unavailable"));
      el.kpis.appendChild(GX.kpi("Estimated cost", "-", "statistics unavailable"));
      el.kpis.appendChild(GX.kpi("p95", "-", "statistics unavailable"));
      return;
    }
    var t = stats.totals || {};
    var requests = t.requests || 0;
    var errors = t.errors || 0;
    var share = requests > 0 ? ((errors / requests) * 100).toFixed(1) + "% of traffic" : "no traffic in range";
    el.kpis.appendChild(GX.kpi("Requests", GX.fmt.num(requests), "last 30 days"));
    el.kpis.appendChild(GX.kpi("Errors", GX.fmt.num(errors), share));
    el.kpis.appendChild(GX.kpi("Tokens", GX.fmt.compact(t.totalTokens), "prompt, output and cached"));
    el.kpis.appendChild(GX.kpi("Estimated cost", GX.fmt.money(t.costUsd), "projected " + GX.fmt.money(stats.projectedMonthlyUsd) + " per 30 days"));
    /* p95 moved here from the pool chips: latency belongs with the traffic
       figures, not with the pool census. */
    el.kpis.appendChild(GX.kpi("p95", GX.fmt.num(t.p95Ms) + " ms", "95th percentile response time"));
  }

  /* Provider split: aggregate meters + one stacked bar per WIB day. Each
     provider carries its own colour, so the split reads the same everywhere
     in the console. Bars stay plain CSS so a failed stats fetch degrades to
     the "unavailable" state, never a broken canvas. Known providers get
     their registry colour; anything else falls back to the custom accent. */
  function provTone(prov) {
    if (prov === "gemini") return "prov-gemini";
    if (prov === "elevenlabs") return "prov-elevenlabs";
    if (prov === "whatstoken") return "prov-whatstoken";
    return "prov-custom";
  }

  function renderProviderMix(stats) {
    el.providerMix.textContent = "";
    el.providerDays.textContent = "";
    if (!stats) {
      el.providerMix.appendChild(GX.state("empty", "Statistics unavailable", "The stats endpoint did not answer."));
      el.providerTotal.textContent = "";
      return;
    }
    var buckets = stats.byProvider || [];
    var total = 0;
    buckets.forEach(function (b) { total += b.requests; });
    if (!total) {
      el.providerMix.appendChild(GX.state("empty", "No traffic in this range", "Nothing was routed in the last 30 days."));
      el.providerTotal.textContent = "Total 0 requests in the last 30 days";
      return;
    }
    var byProv = {};
    buckets.forEach(function (b) { byProv[b.key] = b.requests; });
    var order = Object.keys(byProv).sort(function (a, b) {
      if (a === b) return 0;
      return a === "gemini" ? -1 : b === "gemini" ? 1 : a < b ? -1 : 1;
    });
    order.forEach(function (prov) {
      el.providerMix.appendChild(GX.meter(GX.providerLabel(prov), byProv[prov] || 0, total, provTone(prov)));
    });
    el.providerTotal.textContent = "Total " + GX.fmt.num(total) + " requests in the last 30 days";

    var days = stats.byProviderDay || [];
    if (!days.length) return;
    var byDay = {};
    var maxDay = 0;
    days.forEach(function (r) {
      if (!byDay[r.day]) byDay[r.day] = {};
      byDay[r.day][r.provider] = (byDay[r.day][r.provider] || 0) + r.requests;
      var sum = 0;
      order.forEach(function (p) { sum += byDay[r.day][p] || 0; });
      if (sum > maxDay) maxDay = sum;
    });
    var chart = GX.el("div", { class: "daybars", role: "img", "aria-label": "requests per day by provider" });
    Object.keys(byDay).sort().forEach(function (day) {
      var col = GX.el("div", { class: "daybar", title: day + " \xB7 " + order.map(function (p) { return GX.providerLabel(p) + " " + (byDay[day][p] || 0); }).join(" \xB7 ") });
      order.forEach(function (p) {
        col.appendChild(GX.el("span", { class: provTone(p), style: "height:" + (maxDay ? (((byDay[day][p] || 0) / maxDay) * 100).toFixed(1) : 0) + "%" }));
      });
      col.appendChild(GX.el("span", { class: "daybar-label", text: day.slice(5) }));
      chart.appendChild(col);
    });
    el.providerDays.appendChild(chart);
    var legend = GX.el("div", { class: "legend" });
    order.forEach(function (p) {
      var n = byProv[p] || 0;
      var pct = total ? ((n / total) * 100).toFixed(1) : "0.0";
      legend.appendChild(GX.el("span", { class: "legend-item" }, [
        GX.el("span", { class: "dot " + provTone(p) }),
        GX.el("span", { text: GX.providerLabel(p) }),
        GX.el("b", { text: GX.fmt.num(n) + " (" + pct + "%)" })
      ]));
    });
    el.providerDays.appendChild(legend);
  }

  function renderPlanMix(tiers) {
    el.planMix.textContent = "";
    var t = tiers || { free: 0, paid: 0, pro: 0, unknown: 0 };
    var total = (t.free || 0) + (t.paid || 0) + (t.pro || 0) + (t.unknown || 0);
    el.planMix.appendChild(GX.meter("Free tier", t.free || 0, total, "ok"));
    el.planMix.appendChild(GX.meter("Pay as you go", t.paid || 0, total, "info"));
    el.planMix.appendChild(GX.meter("AI Pro / Ultra", t.pro || 0, total, "info"));
    el.planMix.appendChild(GX.meter("Unspecified", t.unknown || 0, total, "warn"));
    /* Plans declared moved here from the pool hero: the count belongs with
       the mix it summarises. Meters carry no % text, so the shares are
       written out in full below them. */
    var declared = (t.free || 0) + (t.paid || 0) + (t.pro || 0);
    el.planDeclared.textContent = total ? declared + " of " + total + " keys declared" : "the pool is empty";
    if (!total) {
      el.planPct.textContent = "No keys in the pool";
      return;
    }
    el.planPct.textContent = [
      ["Free tier", t.free || 0],
      ["Pay as you go", t.paid || 0],
      ["AI Pro / Ultra", t.pro || 0],
      ["Unspecified", t.unknown || 0]
    ].map(function (row) {
      return row[0] + " " + ((row[1] / total) * 100).toFixed(1) + "%";
    }).join(" \xB7 ");
  }

  function renderActivity(payload) {
    el.activity.textContent = "";
    var rows = payload && payload.rows ? payload.rows : [];
    if (!rows.length) {
      el.activity.appendChild(GX.state("empty", "No admin action yet", "Key changes and exports land here the moment they happen."));
      return;
    }
    rows.slice(0, 6).forEach(function (r) {
      var what = r.target ? r.target : "";
      if (r.detail && r.detail.updated !== undefined) what += " (" + r.detail.updated + " updated)";
      el.activity.appendChild(GX.el("div", { class: "feed-item" }, [
        GX.el("span", { class: "act", text: r.action }),
        GX.el("span", { class: "what", text: what }),
        /* Same actor row the audit page uses: a time-only stamp hid which
           day a cross-day event happened on, so the full stamp lands here. */
        GX.el("span", { class: "what meta", text: r.actor ? "by " + r.actor : "by unknown actor" }),
        GX.el("time", { text: GX.fmt.stamp(r.ts) })
      ]));
    });
  }

  function testAll(btn, note) {
    btn = btn || el.testAllBtn;
    note = note || el.testAllNote;
    GX.busy(btn, "Testing\u2026");
    note.textContent = "one live call per key, eight at a time";
    GX.api("/pengatur/keys/test-all", { method: "POST" })
      .then(function (data) {
        var results = data.results || [];
        var ok = results.filter(function (r) { return r.probe.status === "ok"; }).length;
        GX.notice("Probed " + data.tested + " keys, " + ok + " serving.", ok ? "ok" : "");
        return reload();
      })
      .catch(function (err) {
        GX.notice("Test all failed: " + err.message, "err");
      })
      .then(function () {
        GX.idle(btn);
        note.textContent = "one live call per key, eight at a time";
      });
  }

  function addKeys() {
    var raw = el.newKeys.value;
    var keys = raw.split(/[\\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!keys.length) { GX.say(el.addMsg, "Nothing to add.", "err"); return; }
    GX.busy(el.addSubmit, "Adding\u2026");
    GX.api("/pengatur/keys", { method: "POST", body: { keys: keys } })
      .then(function (data) {
        el.newKeys.value = "";
        el.addCount.textContent = "";
        GX.say(el.addMsg, "Sent " + data.received + ", added " + data.added + ".", data.added ? "ok" : "");
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

  function refresh() {
    return Promise.all([
      GX.api("/pengatur/keys/list"),
      safe(GX.api("/pengatur/stats/data?range=30d")),
      safe(GX.api("/pengatur/audit/data?limit=6"))
    ]).then(function (res) {
      var pool = res[0].pool || {};
      state.tiers = res[0].tiers;
      renderHero(pool, state.tiers, res[1]);
      renderPoolKpis(pool, state.tiers);
      renderAttention(pool, state.tiers);
      renderKpis(res[1]);
      renderProviderMix(res[1]);
      renderPlanMix(state.tiers);
      renderActivity(res[2]);
      el.updated.textContent = "updated " + new Date().toLocaleTimeString("en-GB", { hour12: false });
      el.console.hidden = false;
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403) {
        GX.lock(err.message + " Re-enter the token.");
        throw err;
      }
      /* A failed load left #console hidden, so the operator got a blank page
         plus a toast and no way to retry except reloading the whole app.
         Paint the failure into the console footprint, like the list page does,
         and offer the retry where the data would be. */
      el.console.hidden = false;
      el.console.textContent = "";
      var box = GX.el("div", { class: "panel-body" }, [
        GX.state("error", "Could not load the overview", err.message),
        GX.el("div", { class: "u-mt-3" }, [
          GX.el("button", { class: "btn btn-sm", type: "button", text: "Try again", onclick: function () { reload(); } })
        ])
      ]);
      el.console.appendChild(box);
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

  function openAdd() {
    GX.say(el.addMsg, "");
    GX.openDialog(el.addDialog);
    if (el.newKeys) el.newKeys.focus();
  }

  el.addBtn.addEventListener("click", openAdd);
  el.addBtnFoot.addEventListener("click", openAdd);
  el.refreshBtn.addEventListener("click", function () { reload(); });
  el.addClose.addEventListener("click", function () { GX.closeDialog(el.addDialog); });
  if (el.addCancel) el.addCancel.addEventListener("click", function () { GX.closeDialog(el.addDialog); });
  el.addForm.addEventListener("submit", function (event) { event.preventDefault(); addKeys(); });
  el.newKeys.addEventListener("input", function () {
    var n = el.newKeys.value.split(/[\\s,]+/).filter(function (s) { return s.trim(); }).length;
    el.addCount.textContent = n ? n + " key" + (n === 1 ? "" : "s") + " detected" : "";
  });
  el.testAllBtn.addEventListener("click", function () { testAll(); });
  el.testAllBtnFoot.addEventListener("click", function () {
    GX.confirm({
      title: "Test all live keys?",
      message: "One live call per key, eight at a time.",
      confirmLabel: "Test all live keys"
    }).then(function (ok) {
      if (ok) testAll(el.testAllBtnFoot, el.testAllNoteFoot);
    });
  });
  el.auto.addEventListener("change", function () {
    if (el.auto.checked) startAuto(); else stopAuto();
  });

  GX.shortcuts({
    refresh: "refreshBtn"
  });

  GX.gate({
    onSuccess: function () {
      return refresh().then(function () { startAuto(); });
    }
  });
})();
`;
var ADMIN_HTML = consolePage({
  title: "Overview",
  active: "/pengatur",
  actions: '<button id="refreshBtn" class="btn btn-sm" type="button">' + icon("refresh") + 'Refresh</button><button id="addBtn" class="btn btn-sm btn-primary" type="button">' + icon("plus") + "Add keys</button>",
  body: OVERVIEW_BODY,
  script: OVERVIEW_SCRIPT
});

// src/favicon.ts
var TILE = "#0a0c0f";
var ACCENT = "#4fb0c4";
var FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Key rotator">
  <rect width="32" height="32" rx="7" fill="${TILE}"/>
  <path d="M9 20l5-9 4 6 5-3" fill="none" stroke="${ACCENT}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
var CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 4294967295;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function hex(h2) {
  return [parseInt(h2.slice(1, 3), 16), parseInt(h2.slice(3, 5), 16), parseInt(h2.slice(5, 7), 16)];
}
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
var SIZE = 32;
var SS = 4;
function renderRgba() {
  const [tr2, tg, tb] = hex(TILE);
  const [ar, ag, ab] = hex(ACCENT);
  const pts = [
    [9, 20],
    [14, 11],
    [18, 17],
    [23, 14]
  ];
  const radius = 1.3;
  const corner = 7;
  const px = new Uint8Array(SIZE * SIZE * 4);
  for (let y2 = 0; y2 < SIZE; y2++) {
    for (let x2 = 0; x2 < SIZE; x2++) {
      let tileHits = 0;
      let accentHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x2 + (sx + 0.5) / SS;
          const fy = y2 + (sy + 0.5) / SS;
          const qx = Math.max(corner - fx, fx - (SIZE - corner), 0);
          const qy = Math.max(corner - fy, fy - (SIZE - corner), 0);
          if (Math.hypot(qx, qy) <= corner) tileHits++;
          let d = Infinity;
          for (let i2 = 0; i2 < pts.length - 1; i2++) {
            d = Math.min(d, distToSegment(fx, fy, pts[i2][0], pts[i2][1], pts[i2 + 1][0], pts[i2 + 1][1]));
          }
          if (d <= radius) accentHits++;
        }
      }
      const total = SS * SS;
      const alpha = tileHits / total;
      const accent = accentHits / total;
      const i = (y2 * SIZE + x2) * 4;
      px[i] = Math.round((ar * accent + tr2 * (1 - accent)) * alpha);
      px[i + 1] = Math.round((ag * accent + tg * (1 - accent)) * alpha);
      px[i + 2] = Math.round((ab * accent + tb * (1 - accent)) * alpha);
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}
function buildFaviconIco(deflate) {
  const rgba = renderRgba();
  const raw2 = new Uint8Array(SIZE * (SIZE * 4 + 1));
  for (let y2 = 0; y2 < SIZE; y2++) {
    raw2[y2 * (SIZE * 4 + 1)] = 0;
    raw2.set(rgba.subarray(y2 * SIZE * 4, (y2 + 1) * SIZE * 4), y2 * (SIZE * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, SIZE);
  dv.setUint32(4, SIZE);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflate(raw2);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0))
  ];
  const pngLen = parts.reduce((n, p2) => n + p2.length, 0);
  const png = new Uint8Array(pngLen);
  let off = 0;
  for (const p2 of parts) {
    png.set(p2, off);
    off += p2.length;
  }
  const ico = new Uint8Array(22 + png.length);
  const iv = new DataView(ico.buffer);
  iv.setUint16(0, 0, true);
  iv.setUint16(2, 1, true);
  iv.setUint16(4, 1, true);
  ico[6] = SIZE;
  ico[7] = SIZE;
  ico[8] = 0;
  ico[9] = 0;
  iv.setUint16(10, 1, true);
  iv.setUint16(12, 32, true);
  iv.setUint32(14, png.length, true);
  iv.setUint32(18, 22, true);
  ico.set(png, 22);
  return ico;
}

// src/models-ui.ts
var MODELS_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Catalog</span>
      <h1 class="page-title">Models &amp; Voices</h1>
      <p class="page-lede">Unified inventory across providers: Gemini models, ElevenLabs voices, WhatsToken models and custom upstreams in one place.</p>
    </div>
    <div class="page-head-side">
      <span class="meta" id="asOf">-</span>
    </div>
  </header>

  ${noticeBand()}

  <div class="figures" id="kpis"></div>

  <section class="panel u-mt-4">
    <div class="panel-head">
      <h2>Find</h2>
      <div class="actions">
        <button id="reloadBtn" class="btn btn-sm" type="button">${icon("refresh")}Refresh all</button>
      </div>
    </div>
    <div class="panel-body">
      <div class="toolbar">
        <div class="grow">
          <label class="field" for="q">Search</label>
          <div class="search">
            ${icon("search", "icon", 14)}
            <input id="q" class="input" type="search" spellcheck="false" placeholder="gemini, eleven, tts, voice, multilingual">
          </div>
        </div>
        <div class="grow">
          <label class="field" for="provider">Provider</label>
          <select id="provider" class="select">
            <option value="">all</option>
            <option value="gemini">gemini</option>
            <option value="elevenlabs">elevenlabs</option>
          </select>
        </div>
        <div class="grow">
          <label class="field" for="kind">Type</label>
          <select id="kind" class="select">
            <option value="">all</option>
            <option value="text">text</option>
            <option value="tts">tts/voice</option>
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
          <select id="size" class="select"><option>10</option><option selected>25</option><option>50</option><option>100</option></select>
        </div>
      </div>
      <div class="toolbar u-mt-3">
        <span class="field u-mb-0">Your plan</span>
        <div class="seg" id="tier" role="group" aria-label="Billing plan">
          <button type="button" data-tier="free" aria-pressed="true">Free tier</button>
          <button type="button" data-tier="paid" aria-pressed="false">Pay as you go</button>
          <button type="button" data-tier="pro" aria-pressed="false">AI Pro / Ultra</button>
          <button type="button" data-tier="any" aria-pressed="false">Everything</button>
        </div>
      </div>
      <p class="hint u-mt-3" id="tierNote"></p>
      <div id="msg" class="notice u-mt-2" role="status" aria-live="polite"></div>
    </div>
  </section>

  <section class="panel u-mt-4">
    <div class="panel-head">
      <h2>Unified catalog</h2>
    </div>
    <div id="body" class="table-wrap">${stateBlock("loading", "Loading catalog\u2026")}</div>
    <div class="panel-foot">
      <div id="pager" class="pager u-full"></div>
      <div id="rowMsg" class="notice" role="status" aria-live="polite"></div>
    </div>
  </section>
</div>
`;
var MODELS_SCRIPT = `
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
    provider: document.getElementById("provider"),
    size: document.getElementById("size"),
    reloadBtn: document.getElementById("reloadBtn"),
    body: document.getElementById("body"),
    pager: document.getElementById("pager"),
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

  var state = { models: [], census: {}, page: 1, size: 25, tier: "free", testing: {}, pendingProvider: "" };

  /* Prices use the shared money format; null stays null so unpriced models
     keep an empty cell instead of a dash. */
  function money(v) {
    if (v === null || v === undefined) return null;
    return GX.fmt.money(v);
  }

  function tierMatches(m) {
    if (state.tier === "any") return true;
    if (m.free === true) return true;
    if (m.free === false) return state.tier !== "free";
    return true;
  }

  function writeUrl() {
    GX.url.write({
      q: el.q.value.trim(),
      kind: el.kind.value,
      provider: el.provider.value,
      tier: state.tier,
      size: state.size !== 25 ? state.size : "",
      page: state.page > 1 ? state.page : ""
    });
  }

  function readUrl() {
    var params = GX.url.read();
    if (params.q) el.q.value = params.q;
    if (params.kind) el.kind.value = params.kind;
    /* The provider filter only holds the hardcoded options until the census
       arrives, so validation waits for it: the wanted value is parked here
       and applied by syncProviderFilter once the catalog answers. A provider
       the census never names still gets its own option, so the table filters
       to zero rows instead of crashing or silently dropping the filter. */
    if (params.provider) {
      state.pendingProvider = params.provider;
      if (el.provider.querySelector('option[value="' + params.provider + '"]')) {
        el.provider.value = params.provider;
      }
    }
    if (params.tier && TIER_LABELS[params.tier]) state.tier = params.tier;
    /* Per-page persists the same way Keys does; an unknown size is ignored
       rather than leaving the select blank. */
    if (params.size) {
      var sizeOpt = null;
      Array.prototype.forEach.call(el.size.options, function (o) {
        if (o.value === params.size || o.text === params.size) sizeOpt = o;
      });
      if (sizeOpt) { el.size.value = sizeOpt.value; state.size = Number(sizeOpt.value) || 25; }
    }
    state.page = Number(params.page) || 1;
  }

  function visible() {
    var q = el.q.value.trim().toLowerCase();
    var kind = el.kind.value;
    var prov = el.provider.value;
    return state.models.filter(function (m) {
      if (prov && (m.provider || "gemini") !== prov) return false;
      // "tts/voice" is one user-facing capability: Gemini TTS models and
      // ElevenLabs voices answer the same POST /v1/audio/speech call.
      if (kind === "tts") {
        if (m.kind !== "tts" && m.kind !== "voice") return false;
      } else if (kind && m.kind !== kind) return false;
      if (!tierMatches(m)) return false;
      if (!q) return true;
      return (m.id + " " + m.displayName + " " + m.description + " " + (m.provider || "")).toLowerCase().indexOf(q) >= 0;
    });
  }

  /* The provider filter and the per-provider cards are built from the
     catalog's own census, so every provider in the registry (gemini,
     elevenlabs, whatstoken, customs) appears without hardcoding. */
  function provTone(p) {
    if (p === "gemini") return "prov-gemini";
    if (p === "elevenlabs") return "prov-elevenlabs";
    if (p === "whatstoken") return "prov-whatstoken";
    return "prov-custom";
  }

  function syncProviderFilter(census) {
    if (!el.provider) return;
    var current = el.provider.value;
    el.provider.textContent = "";
    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "all";
    el.provider.appendChild(allOpt);
    Object.keys(census || {}).sort(function (a, b) {
      if (a === b) return 0;
      return a === "gemini" ? -1 : b === "gemini" ? 1 : a < b ? -1 : 1;
    }).forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p;
      var lbl = GX.providerLabel(p);
      opt.textContent = (lbl !== p ? lbl + " (" + p + ")" : p) + (census[p] ? " (" + census[p] + ")" : "");
      el.provider.appendChild(opt);
    });
    if (current && el.provider.querySelector('option[value="' + current + '"]')) el.provider.value = current;
    /* A provider parked by readUrl before the census arrived: if the census
       names it, it is already an option above; if not, it still gets an
       option of its own, so the filter holds and the table shows zero rows
       instead of silently reverting to "all". */
    if (state.pendingProvider) {
      var want = state.pendingProvider;
      state.pendingProvider = "";
      if (!el.provider.querySelector('option[value="' + want + '"]')) {
        var extra = document.createElement("option");
        extra.value = want;
        var wlbl = GX.providerLabel(want);
        extra.textContent = wlbl !== want ? wlbl + " (" + want + ")" : want;
        el.provider.appendChild(extra);
      }
      el.provider.value = want;
    }
  }

  function renderKpis(shown, census) {
    el.kpis.textContent = "";
    /* The strip answers two different questions and says which is which: how big
       the catalog is, and how many rows are on screen right now. */
    el.kpis.appendChild(GX.kpi("Showing", GX.fmt.num(shown), shown === state.models.length ? "the whole catalog" : "match the filters below"));
    el.kpis.appendChild(GX.kpi("Catalog", GX.fmt.num(state.models.length), "across all providers"));
    Object.keys(census || {}).sort(function (a, b) {
      if (a === b) return 0;
      return a === "gemini" ? -1 : b === "gemini" ? 1 : a < b ? -1 : 1;
    }).forEach(function (p) {
      el.kpis.appendChild(GX.kpi(GX.providerLabel(p), GX.fmt.num(census[p] || 0), p + " models", provTone(p)));
    });
    el.kpis.appendChild(GX.kpi("Free tier", GX.fmt.num(state.models.filter(function (m) { return m.free === true; }).length), "usable without billing", "ok"));
    el.kpis.appendChild(GX.kpi("Paid only", GX.fmt.num(state.models.filter(function (m) { return m.free === false; }).length), "need billing enabled", "warn"));
    el.kpis.appendChild(GX.kpi("Tested", GX.fmt.num(Object.keys(state.testing).length), "probed from this browser"));
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

    renderKpis(rows.length, state.census);

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

    var table = GX.el("table", { class: "table models-table" });
    var head = GX.el("thead", null, GX.el("tr", null, [
      GX.el("th", { text: "Provider" }),
      GX.el("th", { text: "Model / Voice" }),
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

      var prov = m.provider || "gemini";
      var provCell = GX.el("td", { "data-l": "provider" });
      provCell.appendChild(GX.providerTag(prov));
      tr.appendChild(provCell);

      var idCell = GX.el("td", { "data-l": "model" });
      idCell.appendChild(GX.el("span", { class: "mono", text: m.id }));
      var bits = [m.displayName];
      if (m.kind && m.kind !== "text") bits.push(m.kind);
      if (m.voiceCategory) bits.push(m.voiceCategory);
      if (m.methods && m.methods.length) bits.push(m.methods.join("/"));
      var sub = GX.el("div", { class: "sub", text: bits.join(" \xB7 ") });
      sub.title = bits.join(" \xB7 ");
      idCell.appendChild(sub);
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
      if ((m.provider || "gemini") === "gemini" && m.kind === "text") {
        var btn = GX.el("button", { class: "btn btn-sm", type: "button", text: "Test" });
        btn.addEventListener("click", function () { testModel(m, btn, pv); });
        actions.appendChild(btn);
      } else {
        actions.appendChild(GX.el("span", { class: "sub", text: (m.kind === "voice" || m.provider === "elevenlabs") ? "voices serve via /v1/audio/speech" : "probe supports Gemini text models only" }));
      }
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
    GX.busy(el.reloadBtn, "Loading\u2026");
    var url = "/pengatur/models/list" + (force ? "?refresh=1" : "");
    return GX.api(url)
      .then(function (data) {
        state.models = data.models || [];
        state.census = data.providers || {};
        syncProviderFilter(state.census);
        var source = data.source || "upstream";
        var provMsg = Object.keys(state.census).length
          ? " (" + Object.keys(state.census).sort(function (a, b) {
              if (a === b) return 0;
              return a === "gemini" ? -1 : b === "gemini" ? 1 : a < b ? -1 : 1;
            }).map(function (p) { return p + " " + state.census[p]; }).join(", ") + ")"
          : "";
        GX.say(el.msg, state.models.length + " rows from " + source + (data.cached ? " (cached)" : "") + provMsg + (data.degraded ? " \xB7 Gemini " + data.degradedReason : ""), data.degraded ? "" : "ok");
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
        renderKpis(0, {});
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
    node.textContent = "testing\u2026";
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
        renderKpis(visible().length, state.census);
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
    writeUrl();
    render();
  });
  el.q.addEventListener("input", GX.debounce(function () {
    state.page = 1;
    writeUrl();
    render();
  }, 140));
  el.kind.addEventListener("change", function () {
    state.page = 1;
    writeUrl();
    render();
  });
  Array.prototype.forEach.call(el.tier.querySelectorAll("button"), function (button) {
    button.addEventListener("click", function () {
      state.tier = button.getAttribute("data-tier");
      try { localStorage.setItem("omniproxy.tier", state.tier); } catch (e) {}
      Array.prototype.forEach.call(el.tier.querySelectorAll("button"), function (other) {
        other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      el.tierNote.textContent = TIER_NOTES[state.tier];
      state.page = 1;
      writeUrl();
      render();
    });
  });

  var savedTier = null;
  try { savedTier = localStorage.getItem("omniproxy.tier"); } catch (e) {}
  if (savedTier && TIER_LABELS[savedTier]) {
    state.tier = savedTier;
    Array.prototype.forEach.call(el.tier.querySelectorAll("button"), function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-tier") === savedTier ? "true" : "false");
    });
  }
  el.tierNote.textContent = TIER_NOTES[state.tier];

  GX.shortcuts({ filter: "q", refresh: "reloadBtn" });

  GX.gate({
    onSuccess: function () {
      readUrl();
      Array.prototype.forEach.call(el.tier.querySelectorAll("button"), function (button) {
        button.setAttribute("aria-pressed", button.getAttribute("data-tier") === state.tier ? "true" : "false");
      });
      el.tierNote.textContent = TIER_NOTES[state.tier];
      el.provider.addEventListener("change", function () {
        state.page = 1;
        writeUrl();
        render();
      });
      return load();
    }
  });
})();
`;
var MODELS_HTML = consolePage({
  title: "Models",
  active: "/pengatur/models",
  body: MODELS_BODY,
  script: MODELS_SCRIPT
});

// src/models.ts
init_config();
init_pool();

// src/models-catalog.ts
var PRICING_AS_OF = "2026-10-19";
var CATALOG = [
  { "id": "gemini-4-argon", "name": "Gemini 4 Argon", "kind": "text", "free": false, "freeLabel": "Not available", "inUsd": 2, "outUsd": 10, "inRaw": "$2.00 through November 30, 2026. | $4.00 starting December 1, 2026.", "outRaw": "$10.00 through November 30, 2026. | $20.00 starting December 1, 2026." },
  { "id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.75, "outUsd": 3.75, "inRaw": "$0.75 through December 31, 2026. | $1.50 starting January 1, 2027.", "outRaw": "$3.75 through December 31, 2026. | $7.50 starting January 1, 2027." },
  { "id": "gemini-3.6-flash", "name": "Gemini 3.6 Flash", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.75, "outUsd": 3.75, "inRaw": "$0.75 through December 31, 2026. | $1.50 starting January 1, 2027.", "outRaw": "$3.75 through December 31, 2026. | $7.50 starting January 1, 2027." },
  { "id": "gemini-3.8-live", "name": "Gemini 3.8 Live, Gemini 3.8 Live Extended Thinking, and Gemini 3.1 Flash Live Preview", "kind": "live", "free": true, "freeLabel": "Free of charge", "inUsd": 0.75, "outUsd": 4.5, "inRaw": "$0.75 (text) | $3.00 or $0.005/min (audio) | $1.00 or $0.002/min (image/video)", "outRaw": "$4.50 (text) | $12.00 or $0.018/min (audio)" },
  { "id": "gemini-3.5-live-translate-preview", "name": "Gemini 3.5 Live Translate", "kind": "live", "free": true, "freeLabel": "Free of charge", "inUsd": 3.5, "outUsd": 21, "inRaw": "$3.50 or $0.0053/min* (audio)", "outRaw": "$21.00 or $0.0315/min* (audio)" },
  { "id": "gemini-3.5-transcribe-live", "name": "Gemini 3.5 Transcribe Live", "kind": "live", "free": true, "freeLabel": "Free of charge", "inUsd": 3.5, "outUsd": 21, "inRaw": "$3.50 or $0.005/min* (audio)", "outRaw": "$21.00 or $0.004/min* (text)" },
  { "id": "gemini-3.5-transcribe", "name": "Gemini 3.5 Transcribe", "kind": "transcribe", "free": true, "freeLabel": "Free of charge", "inUsd": 2, "outUsd": 12, "inRaw": "$2.00 or $0.003/min* (audio)", "outRaw": "$12.00 or $0.002/min* (text)" },
  { "id": "gemini-3.5-flash-lite", "name": "Gemini 3.5 Flash-Lite", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.3, "outUsd": 2.5, "inRaw": "$0.30 (text / image / video / audio)", "outRaw": "$2.50" },
  { "id": "gemini-3.1-flash-lite", "name": "Gemini 3.1 Flash-Lite", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.25, "outUsd": 1.5, "inRaw": "$0.25 (text / image / video) | $0.50 (audio)", "outRaw": "$1.50" },
  { "id": "gemini-omni-1.1-flash", "name": "Gemini Omni Flash", "kind": "omni", "free": false, "freeLabel": "Not available", "inUsd": 1.5, "outUsd": 9, "inRaw": "$1.50 (text / image / video / audio)", "outRaw": "$9.00 (text) | $17.50 (video)*" },
  { "id": "gemini-omni-flash-preview", "name": "Gemini Omni Flash Preview", "kind": "omni", "free": false, "freeLabel": "Not available", "inUsd": 1.5, "outUsd": 9, "inRaw": "$1.50 (text / image / video / audio)", "outRaw": "$9.00 (text) | $17.50 (video)*" },
  { "id": "gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro Preview", "kind": "text", "free": false, "freeLabel": "Not available", "inUsd": 2, "outUsd": 12, "inRaw": "$2.00, prompts 200k tokens", "outRaw": "$12.00, prompts 200k" },
  { "id": "gemini-nano-banana-2.1", "name": "Gemini Nano Banana 2.1 \u{1F34C}", "kind": "text", "free": false, "freeLabel": "Not available", "inUsd": 1.5, "outUsd": 7.5, "inRaw": "$1.50 (text/image/video)", "outRaw": "$7.50 (text and thinking) | $30.00 (images) | Equivalent to $0.0336 per 1K image*, | $0.0504 per 2K image*, | and $0.113 per 4K image*." },
  { "id": "gemini-3.1-flash-image", "name": "Gemini 3.1 Flash Image (Nano Banana 2) \u{1F34C}", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 0.5, "outUsd": 3, "inRaw": "$0.50 (text/image)", "outRaw": "$3 (text and thinking) | $60.00 (images) | Equivalent to $0.045 per 0.5K image* | $0.067 per 1K image*, $0.101 per 2K image*, and $0.151 per 4K image*." },
  { "id": "gemini-3.1-flash-lite-image", "name": "Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite) \u{1F34C}", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 0.25, "outUsd": 1.5, "inRaw": "$0.25 (text/image/video)", "outRaw": "$1.50 (text and thinking) | $30.00 (images) | Equivalent to $0.0336 per 1K resolution image*" },
  { "id": "gemini-3.8-flash-tts", "name": "Gemini 3.8 Flash TTS", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 9, "inRaw": "$0.50 (text) through December 31, 2026. | $1.00 (text) starting January 1, 2027.", "outRaw": "$9.00 (audio) through December 31, 2026. | $18.00 (audio) starting January 1, 2027. | Equivalent to $0.00225 per 10s audio* through December 31, 2026. | Equivalent to $0.0045 per 10s audio* starting January 1, 2027." },
  { "id": "gemini-3.8-flash-lite-tts", "name": "Gemini 3.8 Flash-Lite TTS", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 6, "inRaw": "$0.50 (text) through December 31, 2026. | $1.00 (text) starting January 1, 2027.", "outRaw": "$6.00 (audio) through December 31, 2026. | $12.00 (audio) starting January 1, 2027. | Equivalent to $0.0015 per 10s audio* through December 31, 2026. | Equivalent to $0.003 per 10s audio* starting January 1, 2027." },
  { "id": "gemini-3.1-flash-tts-preview", "name": "Gemini 3.1 Flash TTS Preview", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 1, "outUsd": 20, "inRaw": "$1.00 (text)", "outRaw": "$20.00 (audio)" },
  { "id": "gemini-3-flash-preview", "name": "Gemini 3 Flash Preview", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 3, "inRaw": "$0.50 (text / image / video) | $1.00 (audio)", "outRaw": "$3.00" },
  { "id": "gemini-3-pro-image", "name": "Gemini 3 Pro Image (Nano Banana Pro) \u{1F34C}", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 2, "outUsd": 12, "inRaw": "$2.00 (text/image), | equivalent to $0.0011 per image*", "outRaw": "$12.00 (text and thinking) | $120.00 (images) | Equivalent to $0.134 per 1K/2K image** | and $0.24 per 4K image**" },
  { "id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 1.25, "outUsd": 10, "inRaw": "$1.25, prompts 200k tokens", "outRaw": "$10.00, prompts 200k" },
  { "id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.3, "outUsd": 2.5, "inRaw": "$0.30 (text / image / video) | $1.00 (audio)", "outRaw": "$2.50" },
  { "id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash-Lite", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.1, "outUsd": 0.4, "inRaw": "$0.10 (text / image / video) | $0.30 (audio)", "outRaw": "$0.40" },
  { "id": "gemini-2.5-flash-native-audio", "name": "Gemini 2.5 Flash Native Audio (Live API)", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 2, "inRaw": "$0.50 (text) | $3.00 (audio / video)", "outRaw": "$2.00 (text) | $12.00 (audio)" },
  { "id": "gemini-2.5-flash-image", "name": "Gemini 2.5 Flash Image (Nano Banana) \u{1F34C}", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 0.3, "outUsd": 0.039, "inRaw": "$0.30 (text / image)", "outRaw": "$0.039 per image*" },
  { "id": "gemini-2.5-flash-preview-tts", "name": "Gemini 2.5 Flash Preview TTS", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 10, "inRaw": "$0.50 (text)", "outRaw": "$10.00 (audio)" },
  { "id": "gemini-2.5-pro-preview-tts", "name": "Gemini 2.5 Pro Preview TTS", "kind": "tts", "free": false, "freeLabel": "Not available", "inUsd": 1, "outUsd": 20, "inRaw": "$1.00 (text)", "outRaw": "$20.00 (audio)" },
  { "id": "veo-3.1", "name": "Veo 3.1", "kind": "video", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": "" },
  { "id": "lyria-3-5", "name": "Lyria 3.5", "kind": "audio", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": "" },
  { "id": "lyria-3", "name": "Lyria 3", "kind": "audio", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": "" },
  { "id": "gemini-embedding-2", "name": "Gemini Embedding 2", "kind": "embedding", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": "" },
  { "id": "gemini-robotics-er-2", "name": "Gemini Robotics ER 2 Preview", "kind": "robotics", "free": true, "freeLabel": "Free of charge", "inUsd": 1, "outUsd": 5, "inRaw": "$1.00 (text / image / video / audio) through December 31, 2026. | $2.00 (text / image / video / audio) starting January 1, 2027.", "outRaw": "$5.00 through December 31, 2026. | $10.00 starting January 1, 2027." },
  { "id": "gemini-robotics-er-2-streaming", "name": "Gemini Robotics ER 2 Streaming Preview", "kind": "robotics", "free": true, "freeLabel": "Free of charge", "inUsd": 1, "outUsd": 5, "inRaw": "$1.00 (text / image / video / audio) through December 31, 2026. | $2.00 (text / image / video / audio) starting January 1, 2027.", "outRaw": "$5.00 through December 31, 2026. | $10.00 starting January 1, 2027." }
];
var BY_ID = new Map(CATALOG.map((m) => [m.id, m]));
function catalogFor(id) {
  return BY_ID.get(id.replace(/^models\//, "")) ?? null;
}

// src/upstream.ts
init_config();
init_log();
init_metrics();

// src/settings-store.ts
init_config();
init_db();
var CACHE_TTL_MS = 1e4;
var cache = { at: 0, values: /* @__PURE__ */ new Map() };
async function load() {
  if (Date.now() - cache.at < CACHE_TTL_MS) return cache.values;
  const values = /* @__PURE__ */ new Map();
  if (dbEnabled()) {
    const res = await sql("select key, value from gateway_settings", []);
    if (res.ok) for (const row of res.rows) values.set(row.key, row.value);
  }
  cache = { at: Date.now(), values };
  return values;
}
async function getSetting(key) {
  return (await load()).get(key) ?? null;
}
async function setSetting(key, value) {
  if (!dbEnabled()) throw new Error("storage disabled: no DATABASE_URL");
  const res = await sql(
    "insert into gateway_settings (key, value, updated_at) values ($1, $2, now()) on conflict (key) do update set value = excluded.value, updated_at = now()",
    [key, value]
  );
  if (!res.ok) throw new Error(res.message ?? "write failed");
  cache.values.set(key, value);
  cache.at = Date.now();
}
var clamp = (n, lo, hi2) => Math.min(hi2, Math.max(lo, n));
var MAX_ATTEMPTS_KEY = "max_key_attempts";
var MAX_ATTEMPTS_RANGE = { min: 1, max: 50 };
async function rotationCap() {
  const raw2 = await getSetting(MAX_ATTEMPTS_KEY);
  const n = raw2 === null ? cfg.maxAttempts : Number(raw2);
  return Number.isFinite(n) ? clamp(Math.round(n), MAX_ATTEMPTS_RANGE.min, MAX_ATTEMPTS_RANGE.max) : cfg.maxAttempts;
}
async function rotationSetting() {
  const stored = await getSetting(MAX_ATTEMPTS_KEY) !== null;
  return {
    maxKeyAttempts: await rotationCap(),
    envDefault: cfg.maxAttempts,
    stored,
    min: MAX_ATTEMPTS_RANGE.min,
    max: MAX_ATTEMPTS_RANGE.max
  };
}

// src/upstream.ts
init_pool();

// src/verdict.ts
var asObject = (v2) => typeof v2 === "object" && v2 !== null && !Array.isArray(v2) ? v2 : null;
var asString = (v2) => typeof v2 === "string" && v2.length > 0 ? v2 : null;
function parseBody2(body) {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body);
    return asObject(parsed);
  } catch {
    return null;
  }
}
function errorOf(root) {
  if (!root) return null;
  return asObject(root.error) ?? root;
}
function detailsOf(err2) {
  const raw2 = err2?.details;
  if (!Array.isArray(raw2)) return [];
  return raw2.map(asObject).filter((d) => d !== null);
}
function detailOfType(details, name) {
  for (const d of details) {
    const type = asString(d["@type"]);
    if (type && type.endsWith(name)) return d;
  }
  return null;
}
function violationsOf(details) {
  const failure = detailOfType(details, "google.rpc.QuotaFailure");
  const raw2 = failure?.violations;
  if (!Array.isArray(raw2)) return [];
  return raw2.map(asObject).filter((v2) => v2 !== null);
}
function metadataOf(details) {
  const info = detailOfType(details, "google.rpc.ErrorInfo");
  return asObject(info?.metadata) ?? {};
}
function retryDelayOf(details) {
  const info = detailOfType(details, "google.rpc.RetryInfo");
  const raw2 = asString(info?.retryDelay);
  if (!raw2) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(raw2.trim());
  if (!m) return null;
  const secs = Number(m[1]);
  if (!Number.isFinite(secs) || secs < 0) return null;
  return Math.round(secs * 1e3);
}
function retryDelayMs(body) {
  return retryDelayOf(detailsOf(errorOf(parseBody2(body))));
}
function nextMonthStart(from = Date.now()) {
  const d = new Date(from);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0);
}
function retryAfterHeaderMs(headers) {
  if (!headers) return null;
  let raw2;
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "retry-after") raw2 = value;
  }
  if (!raw2) return null;
  const secs = Number(raw2);
  if (Number.isFinite(secs) && secs > 0) return Math.round(secs * 1e3);
  const at = Date.parse(raw2);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return null;
}
function projectOf(consumer) {
  if (!consumer) return null;
  const m = /(?:projects\/|project_number:)(\d+)/.exec(consumer);
  return m ? m[1] : null;
}
function windowOf(quotaId, limit) {
  const text = `${quotaId ?? ""} ${limit ?? ""}`;
  if (/per_?day|PerDay|FreeTier/i.test(text)) return "per_day_per_project_per_model";
  if (/per_?minute|PerMinute/i.test(text)) return "per_minute_per_project_per_region";
  return null;
}
var isFreeQuotaId = (v2) => v2 !== null && /FreeTier/i.test(v2);
var isFreeQuotaMetric = (v2) => v2 !== null && /_free_tier_requests/i.test(v2);
function parseQuotaDetail(body, headers) {
  const details = detailsOf(errorOf(parseBody2(body)));
  const violations = violationsOf(details);
  const meta = metadataOf(details);
  const quotaId = asString(violations[0]?.quotaId);
  const quotaMetric = asString(violations[0]?.quotaMetric);
  const metric = asString(meta.quota_metric);
  const limit = asString(meta.quota_limit);
  const limitValue = asString(meta.quota_limit_value);
  const consumer = asString(meta.consumer);
  const dimensions = asObject(violations[0]?.quotaDimensions);
  const model = asString(dimensions?.model) ?? asString(meta.model);
  if (!quotaId && !quotaMetric && !metric && !limit && !consumer && !model) return null;
  const fromBody = retryDelayOf(details);
  const retryAfterMs = fromBody ?? retryAfterHeaderMs(headers) ?? 0;
  return {
    metric,
    quotaId,
    quotaMetric,
    limit,
    limitValue,
    model,
    window: windowOf(quotaId, limit),
    location: asString(meta.quota_location),
    consumer,
    project: projectOf(consumer),
    resetAt: retryAfterMs > 0 ? Date.now() + retryAfterMs : null,
    retryAfterMs,
    freeTier: isFreeQuotaId(quotaId) || isFreeQuotaMetric(quotaMetric)
  };
}
function isModelScopedQuota(quota) {
  if (quota.model === null) return false;
  if (quota.consumer !== null || quota.limitValue !== null) return false;
  return quota.freeTier || /-FreeTier$/i.test(quota.quotaId ?? "");
}
function tierEvidenceFrom(body) {
  const details = detailsOf(errorOf(parseBody2(body)));
  const violations = violationsOf(details);
  const meta = metadataOf(details);
  const quotaId = asString(violations[0]?.quotaId);
  const quotaMetric = asString(violations[0]?.quotaMetric);
  const consumer = asString(meta.consumer);
  const observedAt = Date.now();
  if (isFreeQuotaId(quotaId) || isFreeQuotaMetric(quotaMetric)) {
    return { tier: "free", source: "violations", quotaId, quotaMetric, consumer, observedAt };
  }
  if (consumer) {
    return { tier: "paid", source: "consumer", quotaId, quotaMetric, consumer, observedAt };
  }
  return null;
}
var MODEL_UNAVAILABLE = /no longer available to new users|is not found for API version|not supported for generateContent|does not support generateContent|MODEL_NOT_FOUND|is not supported|experiencing high demand|currently unavailable/i;
var INVALID_KEY = /reported as leaked|API_KEY_INVALID|API key not valid|API key expired|invalid.?api.?key|expected oauth 2 access token|invalid authentication credentials|wrong.?api.?key|user not found/i;
function isInvalidKeyBody(body) {
  return INVALID_KEY.test(body);
}
function classifyResponse(status, body, headers) {
  const none = { quota: null, tierEvidence: null };
  if (status === 0) return { verdict: "network_error", ...none };
  if (status >= 200 && status < 300) return { verdict: "ok", ...none };
  if (status === 401) {
    return INVALID_KEY.test(body) ? { verdict: "invalid", ...none } : { verdict: "unexpected", ...none };
  }
  if (status === 403) {
    return INVALID_KEY.test(body) ? { verdict: "invalid", ...none } : { verdict: "unexpected", ...none };
  }
  if (status === 429) {
    const quota = parseQuotaDetail(body, headers);
    const evidence = tierEvidenceFrom(body);
    if (!quota || quota.freeTier) {
      return { verdict: "rate_limited", quota, tierEvidence: evidence };
    }
    const verdict = quota.limitValue === "0" ? "quota_exhausted" : "rate_limited";
    return { verdict, quota, tierEvidence: evidence };
  }
  if (status === 404) return { verdict: "unexpected", ...none };
  if (status === 400 && MODEL_UNAVAILABLE.test(body)) return { verdict: "unexpected", ...none };
  if (status === 400) {
    return INVALID_KEY.test(body) ? { verdict: "invalid", ...none } : { verdict: "unexpected", ...none };
  }
  if (status >= 500) return { verdict: "server_error", ...none };
  return { verdict: "unexpected", ...none };
}
function classifyElevenLabsResponse(status, body, headers) {
  const none = { quota: null, tierEvidence: null };
  if (status === 0) return { verdict: "network_error", ...none };
  if (status >= 200 && status < 300) {
    let tier = "unknown";
    let limit = null;
    let count = null;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.subscription?.tier) {
        tier = String(parsed.subscription.tier);
      }
      if (parsed?.subscription?.character_limit !== void 0) {
        limit = String(parsed.subscription.character_limit);
      }
      if (parsed?.subscription?.character_count !== void 0) {
        count = String(parsed.subscription.character_count);
      }
    } catch {
    }
    const evidence = {
      tier,
      source: "subscription",
      quotaId: count !== null ? `chars_${count}` : null,
      quotaMetric: "characters",
      consumer: limit,
      observedAt: Date.now()
    };
    const limitN = limit === null ? NaN : Number(limit);
    const countN = count === null ? NaN : Number(count);
    if (Number.isFinite(limitN) && Number.isFinite(countN) && limitN - countN <= 0) {
      const resetAt = nextMonthStart();
      return {
        verdict: "quota_exhausted",
        quota: {
          metric: "characters",
          quotaId: count !== null ? `chars_${count}` : null,
          quotaMetric: "characters",
          limit,
          limitValue: String(limitN - countN),
          window: null,
          location: null,
          consumer: limit,
          project: null,
          resetAt,
          retryAfterMs: Math.max(0, resetAt - Date.now()),
          model: null,
          freeTier: tier === "free"
        },
        tierEvidence: evidence
      };
    }
    return { verdict: "ok", quota: null, tierEvidence: evidence };
  }
  if (status === 401) {
    return { verdict: "invalid", ...none };
  }
  if (status === 403) {
    return /invalid|expired|revoked/i.test(body) ? { verdict: "invalid", ...none } : { verdict: "unexpected", ...none };
  }
  if (status === 429) {
    let retryAfterMs = 0;
    if (headers) {
      for (const [name, val] of Object.entries(headers)) {
        if (name.toLowerCase() === "retry-after") {
          const secs = Number(val);
          if (Number.isFinite(secs) && secs > 0) retryAfterMs = secs * 1e3;
        }
      }
    }
    try {
      const parsed = JSON.parse(body);
      const resetUnix = parsed?.detail?.next_character_count_reset_unix ?? parsed?.next_character_count_reset_unix;
      if (typeof resetUnix === "number" && resetUnix > 0) {
        const diffMs = resetUnix * 1e3 - Date.now();
        if (diffMs > 0) retryAfterMs = Math.max(retryAfterMs, diffMs);
      }
    } catch {
    }
    const quota = {
      metric: "characters",
      quotaId: "elevenlabs_quota",
      quotaMetric: "characters",
      limit: null,
      limitValue: null,
      window: null,
      location: null,
      consumer: null,
      project: null,
      resetAt: retryAfterMs > 0 ? Date.now() + retryAfterMs : null,
      retryAfterMs,
      model: null,
      freeTier: false
    };
    return { verdict: "rate_limited", quota, tierEvidence: null };
  }
  if (status >= 500) return { verdict: "server_error", ...none };
  return { verdict: "unexpected", ...none };
}

// src/upstream.ts
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function parseRetryAfter(res, body) {
  const structured = retryDelayMs(body);
  if (structured !== null) return structured;
  const h2 = res.headers.get("retry-after");
  if (h2) {
    const secs = Number(h2);
    if (Number.isFinite(secs) && secs > 0) return secs * 1e3;
    const date = Date.parse(h2);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  const m = /(?:retry|reset|try again)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds)/i.exec(body);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return m[2] === "ms" ? n : n * 1e3;
  }
  return null;
}
function isQuotaText(body) {
  return /RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded/i.test(body);
}
function isInvalidKeyText(body) {
  return isInvalidKeyBody(body);
}
function isZeroQuota(body) {
  const value = /"quota_limit_value"\s*:\s*"?(\d+)"?/.exec(body);
  if (!value) {
    return /quota_limit_value[:=]\s*0\b/.test(body);
  }
  return value[1] === "0";
}
function isModelUnavailable(body) {
  return /no longer available to new users|is not found for API version|not supported for generateContent|does not support generateContent|MODEL_NOT_FOUND|is not supported|experiencing high demand|currently unavailable/i.test(
    body
  );
}
function headersFor(src, key) {
  const h2 = new Headers();
  for (const [name, value] of src.entries()) {
    const n = name.toLowerCase();
    if (n === "host" || n === "content-length" || n === "connection") continue;
    if (n === "x-goog-api-key" || n === "authorization") continue;
    if (n === "accept-encoding") continue;
    h2.set(name, value);
  }
  if (key.startsWith("ya29.") || key.startsWith("Bearer ")) {
    h2.set("authorization", key.startsWith("Bearer ") ? key : `Bearer ${key}`);
  } else if (key.startsWith("sk-") || key.startsWith("sk_")) {
    h2.set("authorization", `Bearer ${key}`);
  } else {
    h2.set("x-goog-api-key", key);
  }
  return h2;
}
function urlWithoutKey(raw2) {
  const u = new URL(raw2);
  u.searchParams.delete("key");
  return u.toString();
}
function attemptSignal(client2, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = client2 ? AbortSignal.any([client2, timeout]) : timeout;
  return { signal, timeout };
}
async function execute(url, init, path, signal, opts) {
  const tried = /* @__PURE__ */ new Set();
  const deadline2 = Date.now() + cfg.maxWaitMs;
  const provider = opts?.provider ?? "gemini";
  const maxAttempts = await rotationCap();
  const quotaRefused = /* @__PURE__ */ new Set();
  const modelRefusedKeys = /* @__PURE__ */ new Set();
  let attempts = 0;
  let rotated = false;
  if (signal?.aborted) return aborted();
  for (; ; ) {
    let st = await pick(tried, opts?.model, provider);
    if (!st && opts?.model) {
      const block = modelBlock(tried, opts.model, provider);
      if (block.kind === "model_refusal") {
        counters.poolExhausted++;
        log("warn", "model.quota_refused_all", {
          path,
          keys: block.keys.map(maskKey),
          model: opts.model
        });
        return {
          response: jsonError(
            429,
            "model_zero_quota",
            "This model has no quota left on any key in the pool."
          ),
          key: "",
          attempts,
          rotated,
          modelRefused: true
        };
      }
    }
    while (!st) {
      const snap = await snapshot();
      if (snap.total === 0) {
        counters.poolExhausted++;
        return {
          response: jsonError(503, "no_api_keys", "The key pool is empty."),
          key: "",
          attempts,
          rotated
        };
      }
      const wait = Math.max(120, Math.min(snap.soonestReadyMs || 500, 2e3));
      if (Date.now() + wait > deadline2 || signal?.aborted) {
        counters.poolExhausted++;
        if (modelRefusedKeys.size > 0) {
          log("warn", "model.quota_refused_all", { path, keys: [...modelRefusedKeys].map(maskKey), model: opts?.model ?? "" });
          return {
            response: jsonError(
              429,
              "model_zero_quota",
              "This model has no quota left on any key in the pool."
            ),
            key: "",
            attempts,
            rotated,
            modelRefused: true
          };
        }
        if (quotaRefused.size > 0) {
          return {
            response: jsonError(
              429,
              "model_zero_quota",
              "This model has no quota left on any key in the pool."
            ),
            key: "",
            attempts,
            rotated,
            quotaRefused: true,
            quotaRefusedKeys: [...quotaRefused]
          };
        }
        log("warn", "pool.exhausted", {
          path,
          total: snap.total,
          cooling: snap.cooling,
          dead: snap.dead,
          soonestReadyMs: snap.soonestReadyMs
        });
        return {
          response: jsonError(
            429,
            "pool_exhausted",
            `All ${snap.total} key${snap.total === 1 ? "" : "s"} are rate limited. Retry in ${Math.ceil(snap.soonestReadyMs / 1e3)}s.`
          ),
          key: "",
          attempts,
          rotated
        };
      }
      await sleep(wait);
      st = await pick(tried, opts?.model, provider);
    }
    if (attempts > 0) {
      rotated = true;
      counters.rotations++;
    }
    if (attempts >= maxAttempts) {
      counters.poolExhausted++;
      return {
        response: jsonError(429, "max_attempts", "Every key attempt failed."),
        key: st.key,
        attempts,
        rotated
      };
    }
    attempts++;
    tried.add(st.key);
    const headers = headersFor(new Headers(init.headers), st.key);
    const target = urlWithoutKey(url);
    const { signal: attempt, timeout } = attemptSignal(signal, opts?.timeoutMs ?? cfg.upstreamTimeoutMs);
    let res;
    counters.upstreamRequests++;
    try {
      res = await fetch(target, {
        // Carry the caller's body (and `duplex` for streamed bodies) through
        // unchanged; only the credential headers are swapped.
        ...init,
        headers,
        // Never follow redirects into a different credential scope.
        redirect: "manual",
        signal: attempt
      });
    } catch (err2) {
      if (signal?.aborted) {
        counters.clientAborts++;
        log("warn", "client.aborted", { path, attempt: attempts, key: maskKey(st.key) });
        return aborted();
      }
      if (timeout.aborted) {
        counters.networkErrors++;
        log("warn", "model.timeout", {
          path,
          key: maskKey(st.key),
          attempt: attempts,
          timeoutMs: opts?.timeoutMs ?? cfg.upstreamTimeoutMs
        });
        return {
          response: jsonError(
            504,
            "model_timeout",
            `The upstream did not answer within ${opts?.timeoutMs ?? cfg.upstreamTimeoutMs}ms.`
          ),
          key: st.key,
          attempts,
          rotated,
          modelRefused: true
        };
      }
      counters.networkErrors++;
      await markSoftError(st.key, cfg.serverErrCooldownMs);
      log("warn", "upstream.network_error", {
        path,
        key: maskKey(st.key),
        attempt: attempts,
        error: err2 instanceof Error ? err2.message : String(err2)
      });
      if (attempts >= maxAttempts) {
        return {
          response: jsonError(
            502,
            "upstream_error",
            `Upstream did not answer after ${attempts} attempt${attempts === 1 ? "" : "s"}.`
          ),
          key: st.key,
          attempts,
          rotated
        };
      }
      continue;
    }
    await markUsed(st.key);
    const status = res.status;
    if (status === 429) {
      counters.upstream429++;
      const body = await safeText(res);
      const quota = parseQuotaDetail(body, Object.fromEntries(res.headers));
      const scopeModel = opts?.model ?? quota?.model ?? "";
      if (quota !== null && scopeModel !== "" && isModelScopedQuota(quota)) {
        await markModelRefused(st.key, scopeModel, quota);
        modelRefusedKeys.add(st.key);
        log("warn", "model.quota_refused", {
          path,
          key: maskKey(st.key),
          model: scopeModel,
          retryAfterMs: quota.retryAfterMs
        });
        if (attempts >= maxAttempts) {
          return {
            response: rebuild(res, body),
            key: st.key,
            attempts,
            rotated,
            modelRefused: true
          };
        }
        continue;
      }
      if (isZeroQuota(body)) {
        quotaRefused.add(st.key);
        if (!opts?.deferQuotaRetire) {
          const claimed = await markInvalid(st.key);
          log("warn", "key.zero_quota", { path, key: maskKey(st.key), first: claimed });
        } else {
          log("warn", "model.zero_quota", { path, key: maskKey(st.key) });
        }
        if (attempts >= maxAttempts) {
          return {
            response: rebuild(res, body),
            key: st.key,
            attempts,
            rotated,
            quotaRefused: true,
            quotaRefusedKeys: [...quotaRefused]
          };
        }
        continue;
      }
      const cd = parseRetryAfter(res, body) ?? cfg.cooldownMs;
      await mark429(st.key, Math.max(cfg.cooldownMs, cd));
      log("info", "key.cooldown", { path, key: maskKey(st.key), status, cooldownMs: Math.max(cfg.cooldownMs, cd) });
      if (attempts >= maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }
    if (status === 401 || status === 403) {
      const body = await safeText(res);
      if (isInvalidKeyText(body)) {
        const claimed = await markInvalid(st.key);
        log("warn", "key.invalid", { path, key: maskKey(st.key), status, first: claimed });
      } else if (status === 401) {
        await markSoftError(st.key, cfg.serverErrCooldownMs);
        log("warn", "key.auth_cooldown", { path, key: maskKey(st.key), status });
        if (attempts >= maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
        continue;
      } else if (isQuotaText(body)) {
        const quota = parseQuotaDetail(body, Object.fromEntries(res.headers));
        const scopeModel = opts?.model ?? quota?.model ?? "";
        if (quota !== null && scopeModel !== "" && isModelScopedQuota(quota)) {
          await markModelRefused(st.key, scopeModel, quota);
          modelRefusedKeys.add(st.key);
          log("warn", "model.quota_refused", {
            path,
            key: maskKey(st.key),
            model: scopeModel,
            retryAfterMs: quota.retryAfterMs
          });
          if (attempts >= maxAttempts) {
            return {
              response: rebuild(res, body),
              key: st.key,
              attempts,
              rotated,
              modelRefused: true
            };
          }
          continue;
        }
        if (isZeroQuota(body)) {
          quotaRefused.add(st.key);
          if (!opts?.deferQuotaRetire) {
            const claimed = await markInvalid(st.key);
            log("warn", "key.zero_quota", { path, key: maskKey(st.key), first: claimed });
          } else {
            log("warn", "model.zero_quota", { path, key: maskKey(st.key) });
          }
          if (attempts >= maxAttempts) {
            return {
              response: rebuild(res, body),
              key: st.key,
              attempts,
              rotated,
              quotaRefused: true,
              quotaRefusedKeys: [...quotaRefused]
            };
          }
          continue;
        }
        const cd = parseRetryAfter(res, body) ?? cfg.cooldownMs;
        await mark429(st.key, Math.max(cfg.cooldownMs, cd));
        log("info", "key.cooldown", { path, key: maskKey(st.key), status, cooldownMs: Math.max(cfg.cooldownMs, cd) });
      } else {
        return { response: rebuild(res, body), key: st.key, attempts, rotated };
      }
      if (attempts >= maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }
    if (status === 400 || status === 404) {
      const body = await safeText(res);
      if (isInvalidKeyText(body)) {
        const claimed = await markInvalid(st.key);
        log("warn", "key.invalid", { path, key: maskKey(st.key), status, first: claimed });
        if (attempts >= maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
        continue;
      }
      if (isModelUnavailable(body)) {
        log("warn", "model.unavailable", { path, key: maskKey(st.key), status });
        return { response: rebuild(res, body), key: st.key, attempts, rotated, modelRefused: true };
      }
      return { response: rebuild(res, body), key: st.key, attempts, rotated };
    }
    if (status >= 500) {
      counters.upstream5xx++;
      const body = await safeText(res);
      if (isModelUnavailable(body)) {
        log("warn", "model.unavailable", { path, key: maskKey(st.key), status });
        return { response: rebuild(res, body), key: st.key, attempts, rotated, modelRefused: true };
      }
      await markSoftError(st.key, cfg.serverErrCooldownMs);
      log("warn", "key.soft_error", { path, key: maskKey(st.key), status, attempt: attempts });
      if (attempts >= maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }
    return { response: res, key: st.key, attempts, rotated };
  }
}
function aborted() {
  return {
    response: new Response(null, { status: 499 }),
    key: "",
    attempts: 0,
    rotated: false
  };
}
async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
function rebuild(res, body) {
  const h2 = new Headers(res.headers);
  h2.delete("content-encoding");
  h2.delete("content-length");
  h2.delete("transfer-encoding");
  if (res.status < 400) return new Response(body, { status: res.status, headers: h2 });
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const g = parsed?.error;
  const message = g?.message ?? (body.slice(0, 400) || `Upstream returned HTTP ${res.status}.`);
  const type = res.status === 429 ? "rate_limit_error" : res.status === 404 ? "not_found_error" : res.status === 401 || res.status === 403 ? "auth_error" : res.status >= 500 ? "upstream_error" : "invalid_request_error";
  h2.set("content-type", "application/json");
  return new Response(
    JSON.stringify({
      error: {
        type,
        code: g?.status ?? `http_${res.status}`,
        message,
        status: res.status,
        upstream: parsed ?? body.slice(0, 2e3)
      }
    }),
    { status: res.status, headers: h2 }
  );
}
function jsonError(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" }
  });
}
function modelChain(primary) {
  return [primary, ...cfg.modelFallback].filter((m, i, all) => Boolean(m) && all.indexOf(m) === i);
}
async function executeWithFallback(models, build, signal, opts) {
  const chain = models.length ? models : [cfg.defaultModel];
  const chainDeadline = Date.now() + cfg.modelChainBudgetMs;
  let last = null;
  let lastModel = chain[0];
  const quotaRefusedBy = /* @__PURE__ */ new Map();
  let chainQuotaRefused = false;
  for (const [index, model] of chain.entries()) {
    if (index > 0) {
      const left = chainDeadline - Date.now();
      if (left <= 0) break;
    }
    const timeoutMs = index === 0 ? cfg.upstreamTimeoutMs : Math.max(1e3, Math.min(cfg.fallbackTimeoutMs, chainDeadline - Date.now()));
    const { url, init, path } = build(model);
    const result = await execute(url, init, path, signal, {
      timeoutMs,
      deferQuotaRetire: true,
      model,
      provider: opts?.provider
    });
    last = result;
    lastModel = model;
    if (result.quotaRefused) {
      chainQuotaRefused = true;
      for (const key of result.quotaRefusedKeys ?? []) {
        const seen = quotaRefusedBy.get(key) ?? /* @__PURE__ */ new Set();
        seen.add(model);
        quotaRefusedBy.set(key, seen);
      }
    }
    if (!result.modelRefused && !result.quotaRefused) return { ...result, model };
    if (result.modelRefused) {
      log("warn", "model.fallback", { path, model, status: result.response.status });
    } else {
      log("warn", "model.quota_fallback", { path, model, status: result.response.status });
    }
  }
  if (chainQuotaRefused) {
    for (const [key, seen] of quotaRefusedBy) {
      if (seen.size >= chain.length) {
        const claimed = await markInvalid(key);
        log("warn", "key.zero_quota", { key: maskKey(key), models: [...seen], first: claimed });
      }
    }
  }
  return { ...last, model: lastModel };
}

// src/models.ts
init_log();
var CACHE_MS = Number(process.env.MODELS_CACHE_MS ?? 3e5);
var TIMEOUT_MS = Number(process.env.MODELS_TIMEOUT_MS ?? 1e4);
var cache2 = null;
function upstreamMessage(body, status) {
  try {
    const parsed = JSON.parse(body);
    const msg = parsed?.error?.message ?? parsed?.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 180);
  } catch {
  }
  const flat = body.replace(/\s+/g, " ").trim();
  return flat ? flat.slice(0, 180) : `HTTP ${status}`;
}
function kindOf(id, methods) {
  const c = catalogFor(id);
  if (c) return c.kind;
  const m = id.toLowerCase();
  if (m.includes("embedding")) return "embedding";
  if (m.includes("tts")) return "tts";
  if (m.includes("image") || m.includes("imagen") || m.includes("banana")) return "image";
  if (m.includes("veo")) return "video";
  if (m.includes("lyria")) return "audio";
  if (m.includes("live")) return "live";
  if (m.includes("transcribe")) return "transcribe";
  if (methods.some((x2) => /predict|generateVideo/i.test(x2))) return "video";
  if (methods.some((x2) => /embedContent|embedText/i.test(x2))) return "embedding";
  return "text";
}
var leakedForListing = /* @__PURE__ */ new Set();
var knownGoodForListing = /* @__PURE__ */ new Set();
var DISCOVERY_BACKOFF_MS = 3e5;
var discoveryBlockedUntil = 0;
var PROBE_CAP = 100;
async function candidateKeys(limit = 12) {
  const states = [];
  const seen = /* @__PURE__ */ new Set();
  for (; ; ) {
    const st = await pick(seen, void 0, "gemini");
    if (!st) break;
    seen.add(st.key);
    states.push(st);
  }
  const rank = (s) => knownGoodForListing.has(s.key) ? 0 : leakedForListing.has(s.key) ? 4 : s.status === "ready" && s.key.startsWith("AIzaSy") ? 1 : s.status === "ready" ? 2 : 3;
  states.sort(
    (a2, b2) => rank(a2) - rank(b2) || (a2.key < b2.key ? -1 : a2.key > b2.key ? 1 : 0)
  );
  const out = states.slice(0, limit).map((s) => s.key);
  lastCandidateDebug = {
    out: out.length,
    walked: states.length,
    ready: states.filter((s) => s.status === "ready").length,
    aiPrefix: states.filter((s) => s.key.startsWith("AIzaSy")).length,
    aiReady: states.filter((s) => s.status === "ready" && s.key.startsWith("AIzaSy")).length,
    aiLeaked: states.filter((s) => leakedForListing.has(s.key) && s.key.startsWith("AIzaSy")).length,
    firstOut: out[0] ? out[0].slice(0, 8) : "",
    firstAi: states.find((s) => s.key.startsWith("AIzaSy"))?.key.slice(0, 8) ?? "",
    maxFail: Math.max(0, ...states.map((s) => s.failures)),
    pool: poolSize()
  };
  return out;
}
var lastCandidateDebug = null;
async function fetchWithKey(key) {
  const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/models?pageSize=1000`;
  return fetch(url, {
    method: "GET",
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
}
async function listLiveModels(force = false) {
  if (!force && cache2 && Date.now() - cache2.at < CACHE_MS) {
    return { models: cache2.models, source: cache2.source, cached: true };
  }
  if (Date.now() < discoveryBlockedUntil) {
    const err2 = new Error(
      `Model discovery blocked: every pooled key is flagged leaked. (known=${leakedForListing.size}, pool=${poolSize()})`
    );
    err2.code = "leaked_pool";
    throw err2;
  }
  const keys = await candidateKeys(40);
  if (!keys.length) {
    const err2 = new Error(
      `Pool has no selectable key, cannot query the model list. (pool=${poolSize()}, ready=${readyCount()}, leaked=${leakedForListing.size}, cand=${JSON.stringify(lastCandidateDebug)})`
    );
    err2.code = "empty_pool";
    throw err2;
  }
  let lastErr = "";
  let probed = 0;
  for (let i = 0; i < PROBE_CAP; i++) {
    const key = keys[i];
    if (!key) break;
    let res;
    try {
      res = await fetchWithKey(key);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      continue;
    }
    probed++;
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      lastErr = `HTTP ${res.status}: ${upstreamMessage(body, res.status)}`;
      log("warn", "models.list_key_failed", { status: res.status, zeroQuota: isZeroQuota(body) });
      if (res.status === 403 && /reported as leaked/i.test(body)) {
        leakedForListing.add(key);
        knownGoodForListing.delete(key);
        log("info", "models.key_skipped_leaked", {});
        const next = await pick(new Set(keys));
        if (next) keys.push(next.key);
      }
      continue;
    }
    knownGoodForListing.add(key);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      lastErr = "Upstream returned non-JSON model list.";
      continue;
    }
    const models = (payload.models ?? []).map((raw2) => {
      const full = String(raw2.name ?? "");
      const id = full.replace(/^models\//, "");
      const methods = Array.isArray(raw2.supportedGenerationMethods) ? raw2.supportedGenerationMethods : [];
      const cat = catalogFor(id);
      return {
        id,
        provider: "gemini",
        name: full,
        displayName: String(raw2.displayName ?? id),
        description: String(raw2.description ?? ""),
        version: String(raw2.version ?? ""),
        methods,
        inputTokenLimit: typeof raw2.inputTokenLimit === "number" ? raw2.inputTokenLimit : null,
        outputTokenLimit: typeof raw2.outputTokenLimit === "number" ? raw2.outputTokenLimit : null,
        kind: kindOf(id, methods),
        free: cat?.free ?? null,
        freeLabel: cat?.freeLabel ?? "not published",
        inUsd: cat?.inUsd ?? null,
        outUsd: cat?.outUsd ?? null,
        inRaw: cat?.inRaw ?? "",
        outRaw: cat?.outRaw ?? ""
      };
    });
    models.sort((a2, b2) => a2.id.localeCompare(b2.id));
    cache2 = { at: Date.now(), models, source: "generativelanguage.googleapis.com" };
    return { models, source: cache2.source, cached: false };
  }
  if (cache2) return { models: cache2.models, source: cache2.source + " (stale)", cached: true };
  if (probed >= PROBE_CAP && leakedForListing.size >= poolSize()) {
    discoveryBlockedUntil = Date.now() + DISCOVERY_BACKOFF_MS;
  }
  throw new Error(
    lastErr ? `${lastErr} (probed=${probed}, good=${knownGoodForListing.size})` : "Could not list models with any pooled key."
  );
}
function catalogModels() {
  return CATALOG.map((c) => ({
    id: c.id,
    provider: "gemini",
    name: c.id,
    displayName: c.name,
    description: "",
    version: "",
    methods: [],
    inputTokenLimit: null,
    outputTokenLimit: null,
    kind: c.kind,
    free: c.free,
    freeLabel: c.freeLabel,
    inUsd: c.inUsd,
    outUsd: c.outUsd,
    inRaw: c.inRaw,
    outRaw: c.outRaw
  }));
}
async function testModel(modelId, rawKey, tier = "unknown") {
  const id = modelId.replace(/^models\//, "").trim();
  const cat = catalogFor(id);
  const freeTier = cat ? cat.free : null;
  let key = rawKey?.trim() ?? "";
  const pooled = !key;
  if (!key) {
    const st = await pick(/* @__PURE__ */ new Set(), void 0, "gemini");
    if (!st) {
      return {
        id,
        status: "error",
        httpStatus: 0,
        latencyMs: 0,
        reply: "",
        message: "No selectable key in the pool.",
        pooled: true,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        freeTier
      };
    }
    key = st.key;
    if (tier === "unknown") tier = st.tier;
  }
  const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(id)}:generateContent`;
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with exactly: OK" }] }],
        // Thinking models spend output tokens on reasoning before emitting text;
        // 64 tokens can end in finishReason=MAX_TOKENS with an empty reply.
        generationConfig: { maxOutputTokens: 512, temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (e) {
    return {
      id,
      status: "error",
      httpStatus: 0,
      latencyMs: Date.now() - started,
      reply: "",
      message: e instanceof Error ? e.message : String(e),
      pooled,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      freeTier
    };
  }
  const latencyMs = Date.now() - started;
  const body = await res.text().catch(() => "");
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const errMsg = (() => {
    const e = parsed?.error ?? {};
    return e.message ?? body.replace(/\s+/g, " ").slice(0, 220);
  })();
  const usage = parsed?.usageMetadata ?? null;
  const inputTokens = typeof usage?.promptTokenCount === "number" ? usage.promptTokenCount : null;
  const outputTokens = typeof usage?.candidatesTokenCount === "number" ? usage.candidatesTokenCount + (typeof usage.thoughtsTokenCount === "number" ? usage.thoughtsTokenCount : 0) : null;
  const billable = tier !== "free";
  const costUsd = billable && cat && cat.inUsd !== null && cat.outUsd !== null && inputTokens !== null && outputTokens !== null ? inputTokens / 1e6 * cat.inUsd + outputTokens / 1e6 * cat.outUsd : null;
  const base = { id, latencyMs, pooled, inputTokens, outputTokens, costUsd, freeTier };
  if (res.ok) {
    const cands = parsed?.candidates ?? [];
    const text = (cands[0]?.content?.parts ?? []).map((p2) => p2.text ?? "").join("").trim();
    return { ...base, status: "ok", httpStatus: res.status, reply: text.slice(0, 200), message: "serving" };
  }
  if (res.status === 404) {
    return { ...base, status: "unsupported", httpStatus: 404, reply: "", message: errMsg || "model not available to this key" };
  }
  if (res.status === 429) {
    return { ...base, status: isZeroQuota(body) ? "zero_quota" : "rate_limited", httpStatus: 429, reply: "", message: errMsg || "rate limited" };
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    return { ...base, status: "invalid", httpStatus: res.status, reply: "", message: errMsg || "key rejected" };
  }
  return { ...base, status: "error", httpStatus: res.status, reply: "", message: errMsg || `HTTP ${res.status}` };
}
function pricingMeta() {
  return { asOf: PRICING_AS_OF, entries: CATALOG.length };
}

// src/probe.ts
init_config();

// src/tts.ts
init_config();

// src/body.ts
var cache3 = /* @__PURE__ */ new WeakMap();
function bodyText(req) {
  let pending2 = cache3.get(req);
  if (!pending2) {
    pending2 = req.text();
    cache3.set(req, pending2);
  }
  return pending2;
}
async function bodyJson(req) {
  try {
    return JSON.parse(await bodyText(req));
  } catch {
    return void 0;
  }
}

// src/tts.ts
init_pool();

// src/ledger.ts
init_config();
init_db();
init_log();
import { createHash as createHash2 } from "node:crypto";
init_pool();
var KEY_SHAPED2 = /AIza[0-9A-Za-z_-]{10,}|ya29\.[0-9A-Za-z._-]{10,}/;
function ledgerKeyId(masked) {
  return createHash2("sha256").update(`masked:${masked}`).digest("hex").slice(0, 12);
}
var tail = [];
var pending = [];
var oldestPending = 0;
var timer = null;
var flushing = false;
var dropped = 0;
var batchCap = Math.max(1, cfg.ledgerMaxRows);
var overflowCap = batchCap * 2;
function scheduleFlush() {
  if (timer !== null || !dbEnabled() || pending.length === 0) return;
  const wait = Math.max(0, oldestPending + cfg.ledgerFlushMs - Date.now());
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, wait);
  if (typeof timer === "object" && timer !== null && "unref" in timer) timer.unref();
}
function toEvent(row) {
  return {
    ts: row.ts,
    reqId: row.id,
    route: row.route,
    model: row.model,
    provider: row.provider ?? "gemini",
    keyId: row.keyId,
    status: row.status,
    attempts: row.attempts,
    rotated: row.rotated,
    stream: row.stream,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    costUsd: row.costUsd,
    latencyMs: row.latencyMs,
    errorCode: row.errorCode
  };
}
function record(row) {
  try {
    tail.unshift(row);
    if (tail.length > cfg.ledgerTailRows) tail.length = cfg.ledgerTailRows;
    if (!dbEnabled()) return;
    if (pending.length === 0) oldestPending = row.ts;
    pending.push(toEvent(row));
    if (pending.length > overflowCap) {
      const excess = pending.length - overflowCap;
      pending.splice(0, excess);
      dropped += excess;
      oldestPending = pending.length ? pending[0].ts : 0;
      log("warn", "ledger.overflow_drop", { dropped: excess, totalDropped: dropped });
    }
    if (pending.length >= batchCap) void flush();
    else scheduleFlush();
  } catch (err2) {
    log("warn", "ledger.record_failed", {
      error: err2 instanceof Error ? err2.message : String(err2)
    });
  }
}
var CHUNK = 100;
function insertStatement(rows) {
  const cols = 16;
  const tuples = [];
  const params = [];
  rows.forEach((e, i) => {
    const base = i * cols;
    tuples.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16})`);
    params.push(
      new Date(e.ts).toISOString(),
      e.reqId,
      e.route,
      e.model,
      e.provider,
      e.keyId,
      e.status,
      e.attempts,
      e.rotated,
      e.stream,
      e.promptTokens,
      e.completionTokens,
      e.totalTokens,
      e.costUsd,
      e.latencyMs,
      e.errorCode
    );
  });
  const text = "insert into usage_events (ts, req_id, route, model, provider, key_id, status, attempts, rotated, stream, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, error_code) values " + tuples.join(",");
  return { text, params };
}
async function flush() {
  if (flushing || pending.length === 0) return;
  if (!dbEnabled()) {
    pending = [];
    oldestPending = 0;
    return;
  }
  flushing = true;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const batch = pending;
  pending = [];
  oldestPending = 0;
  try {
    for (let i = 0; i < batch.length; i += CHUNK) {
      const { text, params } = insertStatement(batch.slice(i, i + CHUNK));
      const res = await sql(text, params);
      if (!res.ok) {
        requeue(batch.slice(i));
        log("warn", "ledger.flush_failed", { reason: res.reason, rows: batch.length - i });
        return;
      }
    }
  } finally {
    flushing = false;
    if (pending.length) scheduleFlush();
  }
}
function requeue(rows) {
  const merged = rows.concat(pending);
  const cap = overflowCap;
  if (merged.length > cap) {
    dropped += merged.length - cap;
    merged.splice(0, merged.length - cap);
  }
  pending = merged;
  oldestPending = pending.length ? pending[0].ts : 0;
  if (pending.length >= batchCap) void flush();
  else scheduleFlush();
}
var collectors = /* @__PURE__ */ new WeakMap();
function costFor(model, promptTokens, completionTokens) {
  const entry = catalogFor(model);
  if (!entry || entry.inUsd === null || entry.outUsd === null) return null;
  const cost = promptTokens / 1e6 * entry.inUsd + completionTokens / 1e6 * entry.outUsd;
  return Number.isFinite(cost) ? cost : null;
}
function routeOf(path) {
  if (path.startsWith("/pengatur") || path.startsWith("/admin")) return null;
  if (path === "/" || path === "/health" || path === "/metrics" || path === "/favicon.ico") return null;
  if (path === "/internal/rollup") return null;
  if (path === "/v1/chat/completions") return "chat.completions";
  if (path === "/v1/audio/speech") return "audio.speech";
  if (path === "/v1/images/generations") return "images.generations";
  if (path === "/v1/embeddings") return "embeddings";
  if (path === "/v1/models") return "models.list";
  if (path.startsWith("/v1beta/models")) return "gemini.passthrough";
  if (path.startsWith("/v1")) return "other";
  return null;
}
function beginUsage(req, path, route) {
  const c = {
    startedAt: Date.now(),
    path,
    method: req.method,
    route,
    model: "",
    provider: "",
    keyId: "",
    keyMasked: "",
    attempts: 0,
    rotated: false,
    stream: false,
    errorCode: null,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    committed: false
  };
  collectors.set(req, c);
  return c;
}
function noteUsage(req, patch) {
  const c = collectors.get(req);
  if (!c || c.committed) return;
  if (patch.provider) c.provider = patch.provider;
  if (patch.keyRaw) {
    c.keyMasked = maskKey(patch.keyRaw);
    c.keyId = ledgerKeyId(c.keyMasked);
  }
  if (patch.keyMasked) {
    c.keyMasked = patch.keyMasked;
    if (!patch.keyId) c.keyId = ledgerKeyId(patch.keyMasked);
  }
  if (patch.keyId) c.keyId = patch.keyId;
  if (patch.model) c.model = patch.model;
  if (typeof patch.attempts === "number") c.attempts = patch.attempts;
  if (typeof patch.rotated === "boolean") c.rotated = patch.rotated;
  if (typeof patch.stream === "boolean") c.stream = patch.stream;
  if (patch.errorCode !== void 0) c.errorCode = patch.errorCode;
  if (typeof patch.promptTokens === "number") c.promptTokens = patch.promptTokens;
  if (typeof patch.completionTokens === "number") c.completionTokens = patch.completionTokens;
  if (typeof patch.totalTokens === "number") c.totalTokens = patch.totalTokens;
  if (typeof patch.cachedTokens === "number") c.cachedTokens = patch.cachedTokens;
}
function commitUsage(req, status) {
  const c = collectors.get(req);
  if (!c || c.committed) return null;
  if (c.stream) return null;
  c.committed = true;
  let masked = c.keyMasked;
  if (KEY_SHAPED2.test(masked)) {
    masked = maskKey(masked);
    c.keyMasked = masked;
    c.keyId = ledgerKeyId(masked);
  }
  KEY_SHAPED2.lastIndex = 0;
  const promptTokens = c.promptTokens;
  const completionTokens = c.completionTokens;
  const totalTokens = c.totalTokens || promptTokens + completionTokens;
  const row = {
    id: crypto.randomUUID(),
    ts: c.startedAt,
    route: c.route,
    path: c.path,
    method: c.method,
    model: c.model || "unknown",
    provider: c.provider || "gemini",
    keyId: c.keyId,
    keyMasked: c.keyMasked,
    status,
    ok: status >= 200 && status < 400,
    errorCode: c.errorCode,
    attempts: c.attempts,
    rotated: c.rotated,
    stream: false,
    latencyMs: Date.now() - c.startedAt,
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens: c.cachedTokens,
    costUsd: costFor(c.model, promptTokens, completionTokens)
  };
  record(row);
  return row;
}
function finalizeStream(req, status = 200, errorCode) {
  const c = collectors.get(req);
  if (!c || c.committed) return;
  if (errorCode) c.errorCode = errorCode;
  c.stream = false;
  commitUsage(req, status);
}
var capacity = (() => {
  const n = Number(process.env.USAGE_ROWS ?? 1e3);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1e3;
})();
var emptyTotals = () => ({
  requests: 0,
  ok: 0,
  errors: 0,
  rotated: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedTokens: 0,
  costUsd: 0,
  avgLatencyMs: 0
});
function addInto(acc, row) {
  acc.requests += 1;
  if (row.ok) acc.ok += 1;
  else acc.errors += 1;
  if (row.rotated) acc.rotated += 1;
  acc.promptTokens += row.promptTokens;
  acc.completionTokens += row.completionTokens;
  acc.totalTokens += row.totalTokens;
  acc.cachedTokens += row.cachedTokens;
  if (row.costUsd !== null) acc.costUsd = (acc.costUsd ?? 0) + row.costUsd;
  acc.avgLatencyMs += row.latencyMs;
}
function finish(acc) {
  acc.avgLatencyMs = acc.requests ? Math.round(acc.avgLatencyMs / acc.requests) : 0;
  if (acc.costUsd !== null) acc.costUsd = Number(acc.costUsd.toFixed(6));
  return acc;
}
function sumRows(list3) {
  const acc = emptyTotals();
  for (const r of list3) addInto(acc, r);
  return finish(acc);
}
function bucketBy(list3, keyOf) {
  const map = /* @__PURE__ */ new Map();
  const prov = /* @__PURE__ */ new Map();
  for (const r of list3) {
    const k = keyOf(r) || "unknown";
    let acc = map.get(k);
    if (!acc) {
      acc = emptyTotals();
      map.set(k, acc);
      prov.set(k, /* @__PURE__ */ new Map());
    }
    addInto(acc, r);
    if (r.provider) {
      const counts = prov.get(k);
      if (counts) counts.set(r.provider, (counts.get(r.provider) || 0) + 1);
    }
  }
  return [...map.entries()].map(([key, acc]) => {
    let provider = "";
    let best = 0;
    const counts = prov.get(key);
    if (counts) counts.forEach((n, p2) => {
      if (n > best) {
        best = n;
        provider = p2;
      }
    });
    return { key, provider, ...finish(acc) };
  }).sort((a2, b2) => b2.requests - a2.requests || b2.totalTokens - a2.totalTokens);
}
var dayOf = (ts2) => new Date(ts2).toISOString().slice(0, 10);
function filterRows(list3, f) {
  return list3.filter((r) => {
    if (f.day && dayOf(r.ts) !== f.day) return false;
    if (f.model && r.model !== f.model) return false;
    if (f.provider && r.provider !== f.provider) return false;
    if (f.key && r.keyId !== f.key && r.keyMasked !== f.key) return false;
    if (f.route && r.route !== f.route) return false;
    if (f.status === "ok" && !r.ok) return false;
    if (f.status === "error" && r.ok) return false;
    if (f.status === "rotated" && !r.rotated) return false;
    return true;
  });
}
function pageOf(items, page, pageSize) {
  const p2 = Math.max(1, Math.floor(page) || 1);
  const n = Math.min(Math.max(1, Math.floor(pageSize) || 25), 200);
  return items.slice((p2 - 1) * n, p2 * n);
}
function usageOverview(page = 1, pageSize = 25, filter = {}) {
  const filtered = filterRows(tail, filter);
  return {
    mode: "memory",
    capacity,
    rows: pageOf(filtered, page, pageSize),
    page: Math.max(1, Math.floor(page) || 1),
    pageSize: Math.min(Math.max(1, Math.floor(pageSize) || 25), 200),
    totalRows: filtered.length,
    totals: sumRows(filtered),
    byModel: bucketBy(filtered, (r) => r.model),
    byKey: bucketBy(filtered, (r) => r.keyMasked || r.keyId),
    byDay: bucketBy(filtered, (r) => dayOf(r.ts)),
    byRoute: bucketBy(filtered, (r) => r.route),
    since: tail.length ? tail[tail.length - 1].ts : null
  };
}
function allRows() {
  return tail.slice();
}
function toCsv(list3) {
  const cols = [
    "id",
    "ts",
    "route",
    "path",
    "method",
    "model",
    "provider",
    "keyId",
    "keyMasked",
    "status",
    "ok",
    "errorCode",
    "attempts",
    "rotated",
    "stream",
    "latencyMs",
    "promptTokens",
    "completionTokens",
    "totalTokens",
    "cachedTokens",
    "costUsd"
  ];
  const esc = (v2) => {
    if (v2 === null || v2 === void 0) return "";
    const s = String(v2);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of list3) lines.push(cols.map((c) => esc(r[c])).join(","));
  return lines.join("\n") + "\n";
}

// src/tts.ts
var ELEVENLABS_KEY_REGEX = /^sk_[a-fA-F0-9]{40,64}$/;
function isValidElevenLabsKey(key) {
  return ELEVENLABS_KEY_REGEX.test((key ?? "").trim());
}
var TIMEOUT_MS2 = Number(process.env.PROBE_TIMEOUT_MS ?? 8e3);
async function probeElevenLabs(rawKey, timeoutMs = TIMEOUT_MS2) {
  const started = Date.now();
  const k = rawKey.trim();
  if (!isValidElevenLabsKey(k)) {
    return {
      status: "invalid",
      httpStatus: 400,
      latencyMs: 0,
      retryAfterMs: 0,
      message: "Invalid ElevenLabs API key format (must be sk_ followed by 40-64 hex chars)",
      quota: null,
      tierEvidence: null
    };
  }
  const url = "https://api.elevenlabs.io/v1/user";
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "xi-api-key": k,
        accept: "application/json"
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err2) {
    return {
      status: "network_error",
      httpStatus: 0,
      latencyMs: Date.now() - started,
      retryAfterMs: 0,
      message: err2 instanceof Error ? err2.message : String(err2),
      quota: null,
      tierEvidence: null
    };
  }
  const latencyMs = Date.now() - started;
  const body = await res.text().catch(() => "");
  const headers = Object.fromEntries(res.headers.entries());
  const classified = classifyElevenLabsResponse(res.status, body, headers);
  return {
    status: classified.verdict === "invalid" ? "invalid" : classified.verdict === "quota_exhausted" ? "quota_exhausted" : classified.verdict === "rate_limited" ? "rate_limited" : classified.verdict === "ok" ? "ok" : classified.verdict === "server_error" ? "server_error" : "unexpected",
    httpStatus: res.status,
    latencyMs,
    retryAfterMs: classified.quota?.retryAfterMs ?? 0,
    message: classified.verdict === "quota_exhausted" ? "allowance spent: character_count reached character_limit" : res.status === 200 ? "serving" : body.slice(0, 220) || `HTTP ${res.status}`,
    quota: classified.quota,
    tierEvidence: classified.tierEvidence
  };
}
function toElevenLabsBody(bodyText2) {
  let parsed;
  try {
    parsed = JSON.parse(bodyText2);
  } catch {
    return bodyText2;
  }
  if (!parsed || typeof parsed !== "object") return bodyText2;
  const isNative = typeof parsed.text === "string";
  const hasModelId = typeof parsed.model_id === "string";
  if (isNative && hasModelId) return bodyText2;
  const out = { ...parsed };
  const text = parsed.input ?? parsed.text ?? parsed.prompt;
  if (typeof text === "string") out.text = text;
  delete out.input;
  delete out.prompt;
  const model = parsed.model_id ?? parsed.model;
  if (typeof model === "string") out.model_id = model;
  delete out.model;
  const voice = parsed.voice_id ?? parsed.voice;
  if (typeof voice === "string") out.voice_id = voice;
  delete out.voice;
  const fmt = parsed.response_format;
  if (typeof fmt === "string" && !out.output_format) {
    out.output_format = fmt === "wav" ? "pcm_44100" : `mp3_44100_${fmt === "opus" ? "64" : "128"}`;
  }
  delete out.response_format;
  const speed = typeof parsed.speed === "number" ? parsed.speed : void 0;
  delete out.speed;
  const vs2 = typeof parsed.voice_settings === "object" && parsed.voice_settings || {};
  out.voice_settings = speed === void 0 ? vs2 : { ...vs2, speed };
  return JSON.stringify(out);
}
async function serveElevenLabs(req, key) {
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const raw2 = hasBody ? await bodyText(req) : "";
  let voiceId = "21m00Tcm4TlvDq8ikWAM";
  try {
    const parsed = JSON.parse(raw2);
    if (typeof parsed.voice_id === "string" && parsed.voice_id) voiceId = parsed.voice_id;
    else if (typeof parsed.voice === "string" && parsed.voice) voiceId = parsed.voice;
  } catch {
  }
  const url = new URL(req.url);
  const pathVoiceMatch = /\/text-to-speech\/([^/?]+)/.exec(url.pathname);
  if (pathVoiceMatch?.[1]) voiceId = pathVoiceMatch[1];
  else if (url.searchParams.get("voice_id")) voiceId = url.searchParams.get("voice_id");
  else if (url.searchParams.get("voice")) voiceId = url.searchParams.get("voice");
  const upstreamUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}${url.search}`;
  const payload = toElevenLabsBody(raw2);
  const tried = /* @__PURE__ */ new Set();
  const deadline2 = Date.now() + cfg.maxWaitMs;
  let attempts = 0;
  for (; ; ) {
    let rawKey = key && !tried.has(key) ? await rawKeyById(key) || key : void 0;
    if (!rawKey) {
      const st = await pick(tried, void 0, "elevenlabs");
      if (st) rawKey = await rawKeyById(st.key) || st.key;
    }
    if (!rawKey) {
      return new Response(JSON.stringify({ error: { message: "No available ElevenLabs API keys in pool." } }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    }
    tried.add(rawKey);
    attempts++;
    const res = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xi-api-key": rawKey
      },
      body: payload,
      // A stalled upstream must not hold the invocation: the caller's own
      // disconnect still wins, the gateway timeout is the backstop.
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(cfg.upstreamTimeoutMs)])
    });
    if (res.status === 429 && attempts < 3 && Date.now() < deadline2) {
      const body = await res.text().catch(() => "");
      await mark429(rawKey, Math.max(cfg.cooldownMs, parseRetryAfter(res, body) ?? 0));
      continue;
    }
    if (res.status === 401 && attempts < 3 && Date.now() < deadline2) {
      await markInvalid(rawKey);
      continue;
    }
    noteUsage(req, {
      model: "elevenlabs",
      provider: "elevenlabs",
      keyRaw: rawKey,
      attempts,
      rotated: attempts > 1,
      errorCode: res.ok ? null : `http_${res.status}`
    });
    const respHeaders = new Headers(res.headers);
    respHeaders.delete("content-encoding");
    respHeaders.delete("content-length");
    respHeaders.delete("transfer-encoding");
    return new Response(res.body, {
      status: res.status,
      headers: respHeaders
    });
  }
}
async function listElevenLabsInventory() {
  const st = await pick(/* @__PURE__ */ new Set(), void 0, "elevenlabs");
  if (!st) return null;
  const rawKey = await rawKeyById(st.key) || st.key;
  const fetchJson = async (path) => {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/${path}`, {
        headers: { "xi-api-key": rawKey },
        signal: AbortSignal.timeout(TIMEOUT_MS2)
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };
  const [voices, models] = await Promise.all([
    fetchJson("voices"),
    fetchJson("models")
  ]);
  return {
    voices: voices?.voices ?? [],
    models: models ?? []
  };
}

// src/probe.ts
init_providers();
var TIMEOUT_MS3 = Number(process.env.PROBE_TIMEOUT_MS ?? 8e3);
var MAX_TOKENS = 64;
function messageOf(body) {
  try {
    const parsed = JSON.parse(body);
    const msg = parsed.error?.message ?? parsed.error?.status ?? "";
    if (msg) return msg.slice(0, 220);
  } catch {
  }
  return body.replace(/\s+/g, " ").trim().slice(0, 220);
}
function probeChain(model) {
  return [model ?? cfg.defaultModel, ...cfg.probeModels].filter(
    (m, i, all) => Boolean(m) && all.indexOf(m) === i
  );
}
function isModelLevelFailure(res) {
  if (res.httpStatus !== 400 && res.httpStatus !== 404 && res.httpStatus !== 503) return false;
  return isModelUnavailable(res.message);
}
function nextCandidate(chain, current) {
  const at = chain.indexOf(current);
  if (at < 0) return null;
  return chain[at + 1] ?? null;
}
function reconcile(first, second) {
  if (second.status === "ok") return second;
  if (first.status === "invalid" || second.status === "invalid") {
    return first.status === "invalid" ? first : second;
  }
  if (first.status === "rate_limited" || second.status === "rate_limited") {
    return first.status === "rate_limited" ? first : second;
  }
  if (first.status === "zero_quota" || second.status === "zero_quota") {
    return first.status === "zero_quota" ? first : second;
  }
  return first;
}
async function probeLeak(rawKey, timeoutMs = TIMEOUT_MS3) {
  const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/cachedContents`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": rawKey },
      body: JSON.stringify({
        model: `models/${cfg.defaultModel}`,
        contents: [{ parts: [{ text: "cache probe" }] }]
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    return false;
  }
  if (res.status !== 403) return false;
  const body = await res.text().catch(() => "");
  return /reported as leaked/i.test(body);
}
async function probeKey(rawKey, model, provider) {
  const providers = await allProviders();
  const named = (provider ?? "").trim();
  const id = named || detectProvider(rawKey, providers) || "gemini";
  const entry = providers.find((p2) => p2.id === id) ?? null;
  if (id === "elevenlabs" || entry?.wire === "elevenlabs") {
    return probeElevenLabs(rawKey);
  }
  if (entry?.wire === "openai") {
    return probeOpenAICompatible(rawKey, baseUrlOf(entry));
  }
  const result = await probeModels(rawKey, model);
  if (result.status !== "zero_quota") return result;
  if (!await probeLeak(rawKey)) return result;
  return {
    ...result,
    status: "invalid",
    message: "upstream reported the API key as leaked",
    quota: null,
    tierEvidence: null
  };
}
async function probeOpenAICompatible(rawKey, baseUrl, timeoutMs = TIMEOUT_MS3) {
  const started = Date.now();
  const k = rawKey.trim();
  if (!baseUrl) {
    return {
      status: "unexpected",
      httpStatus: 0,
      latencyMs: 0,
      retryAfterMs: 0,
      message: "provider has no base URL configured"
    };
  }
  let res;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { authorization: `Bearer ${k}`, accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err2) {
    return {
      status: "network_error",
      httpStatus: 0,
      latencyMs: Date.now() - started,
      retryAfterMs: 0,
      message: err2 instanceof Error ? err2.message : String(err2)
    };
  }
  const latencyMs = Date.now() - started;
  if (res.status === 429) {
    const body = await res.text().catch(() => "");
    return {
      status: "rate_limited",
      httpStatus: 429,
      latencyMs,
      retryAfterMs: parseRetryAfter(res, body) ?? cfg.cooldownMs,
      message: body.slice(0, 220) || "rate limited"
    };
  }
  if (res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => "");
    return {
      status: "invalid",
      httpStatus: res.status,
      latencyMs,
      retryAfterMs: 0,
      message: body.slice(0, 220) || `HTTP ${res.status}`
    };
  }
  if (res.status >= 500) {
    return {
      status: "server_error",
      httpStatus: res.status,
      latencyMs,
      retryAfterMs: 0,
      message: `HTTP ${res.status}`
    };
  }
  let count = 0;
  try {
    const payload = await res.json();
    count = Array.isArray(payload.data) ? payload.data.length : 0;
  } catch {
  }
  return {
    status: res.ok ? "ok" : "unexpected",
    httpStatus: res.status,
    latencyMs,
    retryAfterMs: 0,
    message: res.ok ? `serving (${count} models)` : `HTTP ${res.status}`
  };
}
async function probeModels(rawKey, model) {
  const chain = probeChain(model);
  let candidate = chain[0] ?? null;
  let refused = null;
  while (candidate) {
    const res = await probeOnce(rawKey, candidate);
    if (res.status === "ok") return res;
    if (isModelLevelFailure(res)) {
      refused = res;
      candidate = nextCandidate(chain, candidate);
      continue;
    }
    if (res.status === "rate_limited" || res.status === "server_error" || res.status === "network_error") {
      return res;
    }
    const next = nextCandidate(chain, candidate);
    if (!next) return res;
    const other = await probeOnce(rawKey, next);
    if (other.status === "ok") return other;
    if (isModelLevelFailure(other)) return res;
    return reconcile(res, other);
  }
  return refused ?? {
    status: "unexpected",
    httpStatus: 0,
    latencyMs: 0,
    retryAfterMs: 0,
    message: "no probe model was accepted"
  };
}
async function probeOnce(rawKey, model) {
  const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/models/${model}:generateContent`;
  const started = Date.now();
  const signal = AbortSignal.timeout(TIMEOUT_MS3);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": rawKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0 }
      }),
      redirect: "manual",
      signal
    });
  } catch (err2) {
    return {
      status: "network_error",
      httpStatus: 0,
      latencyMs: Date.now() - started,
      retryAfterMs: 0,
      message: err2 instanceof Error ? err2.message : String(err2)
    };
  }
  const latencyMs = Date.now() - started;
  const body = await res.text().catch(() => "");
  const classified = classifyResponse(res.status, body, Object.fromEntries(res.headers.entries()));
  const serving = res.status >= 200 && res.status < 300;
  return {
    status: PROBE_STATUS[classified.verdict],
    httpStatus: res.status,
    latencyMs,
    retryAfterMs: res.status === 429 ? parseRetryAfter(res, body) ?? cfg.cooldownMs : 0,
    message: serving ? "serving" : messageOf(body) || `HTTP ${res.status}`,
    quota: classified.quota,
    tierEvidence: classified.tierEvidence
  };
}
var PROBE_STATUS = {
  ok: "ok",
  rate_limited: "rate_limited",
  quota_exhausted: "zero_quota",
  invalid: "invalid",
  server_error: "server_error",
  network_error: "network_error",
  unexpected: "unexpected"
};
async function probeTier(rawKey, timeoutMs = TIMEOUT_MS3) {
  const models = cfg.tierProbeModels.filter(Boolean);
  let last = {
    verdict: "unexpected",
    tierEvidence: null,
    quota: null,
    httpStatus: 0,
    message: "no tier probe model configured"
  };
  for (const model of models) {
    const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/models/${model}:generateContent`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": rawKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0 }
        }),
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err2) {
      last = {
        verdict: "network_error",
        tierEvidence: null,
        quota: null,
        httpStatus: 0,
        message: err2 instanceof Error ? err2.message : String(err2)
      };
      continue;
    }
    const body = await res.text().catch(() => "");
    const classified = classifyResponse(res.status, body, Object.fromEntries(res.headers.entries()));
    last = {
      verdict: classified.verdict,
      tierEvidence: classified.tierEvidence,
      quota: classified.quota,
      httpStatus: res.status,
      message: messageOf(body) || `HTTP ${res.status}`
    };
    if (res.status === 404 || isModelUnavailable(body)) continue;
    return last;
  }
  return last;
}
async function verifyIngestKeys(keys, opts = {}) {
  const limit = Math.max(1, Math.floor(opts.concurrency ?? 8));
  const out = [];
  for (let i = 0; i < keys.length; i += limit) {
    const slice = keys.slice(i, i + limit);
    const batch = await Promise.all(
      slice.map(async ({ key, provider }) => {
        const r = await probeKey(key, void 0, provider);
        return { key, provider, status: r.status, retryAfterMs: r.retryAfterMs, message: r.message };
      })
    );
    out.push(...batch);
  }
  return out;
}

// src/app.ts
import { deflateSync } from "node:zlib";

// src/gemini.ts
init_config();
var up = () => cfg.upstream.replace(/\/$/, "");
async function geminiPassthrough(req, path) {
  const url = new URL(req.url);
  const upstreamUrl = `${up()}${path}${url.search}`;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : void 0;
  const r = await execute(
    upstreamUrl,
    {
      method: req.method,
      headers: req.headers,
      body
    },
    path,
    req.signal,
    { provider: "gemini" }
  );
  const model = /\/models\/([^:/?]+)/.exec(path)?.[1] ?? "";
  noteUsage(req, {
    model,
    provider: "gemini",
    keyRaw: r.key,
    attempts: r.attempts,
    rotated: r.rotated,
    errorCode: r.response.ok ? null : `http_${r.response.status}`
  });
  return withMeta(r.response, r);
}
function withMeta(res, meta) {
  const h2 = new Headers(res.headers);
  h2.delete("content-encoding");
  h2.delete("content-length");
  h2.delete("transfer-encoding");
  h2.set("x-omniproxy-attempts", String(meta.attempts));
  h2.set("x-omniproxy-rotated", meta.rotated ? "1" : "0");
  return new Response(res.body, { status: res.status, headers: h2 });
}
async function speech(req, resolvedModel) {
  let body;
  try {
    body = JSON.parse(await bodyText(req));
  } catch {
    return badRequest("Body must be JSON.");
  }
  const text = (body.input ?? "").trim();
  if (!text) return badRequest("`input` is required.");
  if (resolvedModel !== void 0) {
    const m = resolvedModel.replace(/^models\//, "");
    if (!m.toLowerCase().startsWith("gemini")) {
      return badRequest(`Model \`${resolvedModel}\` is not a Gemini model and cannot be served on the Gemini TTS route.`);
    }
  }
  const model = resolvedModel !== void 0 ? resolvedModel.replace(/^models\//, "") : body.model && body.model.startsWith("gemini") ? body.model : cfg.defaultTtsModel;
  const voice = VOICE_MAP[(body.voice ?? "").toLowerCase()] ?? body.voice ?? cfg.defaultVoice;
  const fmt = (body.response_format ?? "wav").toLowerCase();
  const payload = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
    }
  };
  const path = `/v1beta/models/${model}:generateContent`;
  const result = await execute(
    `${up()}${path}`,
    {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        accept: "application/json"
      }),
      body: JSON.stringify(payload)
    },
    path,
    req.signal,
    { model, provider: "gemini" }
  );
  if (result.response.status === 499) {
    return new Response(null, { status: 499 });
  }
  noteUsage(req, {
    model,
    provider: "gemini",
    keyRaw: result.key,
    attempts: result.attempts,
    rotated: result.rotated,
    errorCode: result.response.ok ? null : `http_${result.response.status}`
  });
  if (!result.response.ok) return result.response;
  let json2;
  try {
    json2 = await result.response.json();
  } catch {
    return new Response("Upstream returned non-JSON audio response.", { status: 502 });
  }
  const part = json2.candidates?.[0]?.content?.parts?.find((p2) => p2?.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) {
    return Response.json(
      { error: { code: "no_audio", message: "Upstream returned no audio part." } },
      { status: 502 }
    );
  }
  const mime = part?.inlineData?.mimeType ?? "audio/L16;rate=24000";
  const pcm = Buffer.from(b64, "base64");
  const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24e3);
  if (fmt === "pcm") {
    return new Response(new Uint8Array(pcm), {
      headers: {
        "content-type": "audio/L16",
        "x-omniproxy-attempts": String(result.attempts)
      }
    });
  }
  const wav = pcmToWav(pcm, rate, 1, 16);
  return new Response(new Uint8Array(wav), {
    headers: {
      "content-type": "audio/wav",
      "content-length": String(wav.byteLength),
      "x-omniproxy-attempts": String(result.attempts),
      "x-omniproxy-rotated": result.rotated ? "1" : "0",
      "x-omniproxy-voice": voice
    }
  });
}
function pcmToWav(pcm, rate, channels, bits) {
  const blockAlign = channels * bits / 8;
  const byteRate = rate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
function badRequest(message) {
  return Response.json({ error: { code: "bad_request", message } }, { status: 400 });
}

// src/openai.ts
init_config();
init_metrics();
var up2 = () => cfg.upstream.replace(/\/$/, "");
var partText = (p2) => "text" in p2 && typeof p2.text === "string" ? p2.text : "";
var textOf = (c) => {
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c.map(partText).filter(Boolean).join("\n");
};
function toGeminiSchema(node) {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const src = node;
  const out = {};
  for (const [k, v2] of Object.entries(src)) {
    if (k === "$schema" || k === "additionalProperties" || k === "strict" || k === "title") continue;
    if (k === "type" && typeof v2 === "string") {
      out.type = v2.toUpperCase();
      continue;
    }
    if (k === "properties" && v2 && typeof v2 === "object" && !Array.isArray(v2)) {
      const props = {};
      for (const [pk, pv] of Object.entries(v2)) props[pk] = toGeminiSchema(pv);
      out.properties = props;
      continue;
    }
    out[k] = toGeminiSchema(v2);
  }
  return out;
}
function toolDeclarations(tools) {
  const decls = [];
  for (const t of tools ?? []) {
    if (t?.type !== "function" || !t.function?.name) continue;
    const d = { name: t.function.name };
    if (t.function.description) d.description = t.function.description;
    if (t.function.parameters) d.parameters = toGeminiSchema(t.function.parameters);
    decls.push(d);
  }
  return decls;
}
function imagePart(url) {
  if (!url) return null;
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (m) {
    const mime = m[1] || "application/octet-stream";
    const data = m[2] ? m[3] : Buffer.from(decodeURIComponent(m[3])).toString("base64");
    return { inlineData: { mimeType: mime, data } };
  }
  if (/^https?:|^gs:|^files\//.test(url)) {
    const ext = /\.(png|jpe?g|webp|heic|heif|gif|bmp)(?:\?|$)/i.exec(url)?.[1];
    const mime = ext ? `image/${ext.toLowerCase().replace("jpg", "jpeg")}` : "application/octet-stream";
    return { fileData: { mimeType: mime, fileUri: url } };
  }
  return null;
}
function partsOf(c) {
  if (typeof c === "string") return c ? [{ text: c }] : [];
  if (!Array.isArray(c)) return [];
  const parts = [];
  for (const p2 of c) {
    const t = partText(p2);
    if (t) parts.push({ text: t });
    else if (p2?.type === "image_url") {
      const part = imagePart(p2.image_url?.url ?? "");
      if (part) parts.push(part);
    }
  }
  return parts;
}
function jsonArgs(raw2) {
  if (!raw2) return {};
  try {
    const v2 = JSON.parse(raw2);
    return v2 && typeof v2 === "object" && !Array.isArray(v2) ? v2 : {};
  } catch {
    return {};
  }
}
function geminiModelOrNull(resolved) {
  const m = resolved.replace(/^models\//, "").trim();
  return m.toLowerCase().startsWith("gemini") ? m : null;
}
function toGemini(body, resolvedModel) {
  const msgs = body.messages ?? [];
  const systemParts = [];
  const contents = [];
  const callNames = /* @__PURE__ */ new Map();
  for (const m of msgs) {
    if (m.role === "system") {
      const text = textOf(m.content);
      if (text) systemParts.push({ text });
      continue;
    }
    if (m.role === "assistant") {
      const parts2 = partsOf(m.content);
      for (const call of m.tool_calls ?? []) {
        const name = call.function?.name ?? "";
        if (!name) continue;
        if (call.id) callNames.set(call.id, name);
        parts2.push({ functionCall: { name, args: jsonArgs(call.function?.arguments) } });
      }
      if (parts2.length) contents.push({ role: "model", parts: parts2 });
      continue;
    }
    if (m.role === "tool") {
      const name = callNames.get(m.tool_call_id ?? "") ?? m.name ?? "tool";
      const text = textOf(m.content);
      let response;
      try {
        const v2 = JSON.parse(text);
        response = v2 && typeof v2 === "object" && !Array.isArray(v2) ? v2 : { result: v2 };
      } catch {
        response = { result: text };
      }
      contents.push({ role: "user", parts: [{ functionResponse: { name, response } }] });
      continue;
    }
    const parts = partsOf(m.content);
    if (parts.length) contents.push({ role: "user", parts });
  }
  const wantsSearch = Boolean(body.web_search ?? body.search);
  const model = resolvedModel !== void 0 ? resolvedModel.replace(/^models\//, "") : body.model && body.model.startsWith("gemini") ? body.model : wantsSearch ? cfg.searchModel : cfg.defaultModel;
  const gen = {};
  if (typeof body.temperature === "number") gen.temperature = body.temperature;
  if (typeof body.top_p === "number") gen.topP = body.top_p;
  const maxTokens = body.max_completion_tokens ?? body.max_tokens;
  if (typeof maxTokens === "number") gen.maxOutputTokens = maxTokens;
  if (body.stop) gen.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  if (body.response_format?.type === "json_object") gen.responseMimeType = "application/json";
  const decls = toolDeclarations(body.tools);
  const tools = [];
  if (decls.length) tools.push({ functionDeclarations: decls });
  if (wantsSearch) tools.push({ google_search: {} });
  const payload = { contents };
  if (systemParts.length) payload.systemInstruction = { parts: systemParts };
  if (Object.keys(gen).length) payload.generationConfig = gen;
  if (tools.length) payload.tools = tools;
  return { model, payload, wantsSearch };
}
var newCallId = () => `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
function parseCandidate(cand) {
  const parts = cand?.content?.parts ?? [];
  let text = "";
  const toolCalls = [];
  for (const p2 of parts) {
    if (typeof p2.text === "string") text += p2.text;
    else if (p2.functionCall?.name) {
      toolCalls.push({
        id: newCallId(),
        name: String(p2.functionCall.name),
        args: JSON.stringify(p2.functionCall.args ?? {})
      });
    }
  }
  if (toolCalls.length) counters.toolCalls += toolCalls.length;
  return { text, grounding: cand?.groundingMetadata ?? null, toolCalls };
}
var metaHeaders = (attempts, rotated) => ({
  "x-omniproxy-attempts": String(attempts),
  "x-omniproxy-rotated": rotated ? "1" : "0"
});
async function chatCompletions(req, resolvedModel) {
  let body;
  try {
    body = JSON.parse(await bodyText(req));
  } catch {
    return err(400, "invalid_request_error", "Body must be JSON.");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return err(400, "invalid_request_error", "`messages` must be a non-empty array.");
  }
  if (resolvedModel !== void 0 && geminiModelOrNull(resolvedModel) === null) {
    return err(
      400,
      "invalid_request_error",
      `Model \`${resolvedModel}\` is not a Gemini model and cannot be served on the Gemini route.`
    );
  }
  const { model: requested, payload, wantsSearch } = toGemini(body, resolvedModel);
  const stream = Boolean(body.stream);
  const method = stream ? "streamGenerateContent" : "generateContent";
  const search = stream ? "?alt=sse" : "";
  const result = await executeWithFallback(
    modelChain(requested),
    (candidate) => ({
      url: `${up2()}/v1beta/models/${candidate}:${method}${search}`,
      init: {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
          accept: stream ? "text/event-stream" : "application/json"
        }),
        body: JSON.stringify(payload),
        // Bun wants `duplex` on a streaming body; the DOM `RequestInit` does
        // not declare it, so the cast keeps the intent without silencing the
        // whole literal.
        duplex: "half"
      },
      path: `/v1beta/models/${candidate}:${method}`
    }),
    req.signal,
    { provider: "gemini" }
  );
  const model = result.model;
  noteUsage(req, {
    provider: "gemini",
    model,
    keyRaw: result.key,
    attempts: result.attempts,
    rotated: result.rotated,
    stream,
    errorCode: result.response.ok ? null : `http_${result.response.status}`
  });
  if (result.response.status === 499) return err(499, "client_closed_request", "Client disconnected.");
  if (!result.response.ok) return result.response;
  const id = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1e3);
  if (!stream) {
    let json2;
    try {
      json2 = await result.response.json();
    } catch {
      return err(502, "upstream_error", "Upstream returned non-JSON.");
    }
    const cand = json2.candidates?.[0];
    if (!json2.candidates?.length || (cand?.finishReason === "SAFETY" || cand?.finishReason === "PROHIBITED_CONTENT") && !cand?.content?.parts?.length) {
      return err(400, "content_filter", "Upstream blocked the prompt (safety filter).");
    }
    const { text, grounding, toolCalls } = parseCandidate(cand);
    const usage = json2.usageMetadata ?? {};
    const thoughts = usage.thoughtsTokenCount ?? 0;
    const promptTokens = usage.promptTokenCount ?? 0;
    const completionTokens = (usage.candidatesTokenCount ?? 0) + thoughts;
    const totalTokens = usage.totalTokenCount ?? promptTokens + completionTokens;
    noteUsage(req, {
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens: usage.cachedContentTokenCount ?? 0
    });
    const message = {
      role: "assistant",
      content: text || (toolCalls.length ? null : "")
    };
    if (toolCalls.length) {
      message.tool_calls = toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.args }
      }));
    }
    return Response.json(
      {
        id,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message,
            finish_reason: toolCalls.length ? "tool_calls" : mapFinish(cand?.finishReason)
          }
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          ...thoughts ? { completion_tokens_details: { reasoning_tokens: thoughts } } : {}
        },
        ...wantsSearch && grounding ? { grounding } : {}
      },
      { headers: metaHeaders(result.attempts, result.rotated) }
    );
  }
  const encoder = new TextEncoder();
  const upstream = result.response.body;
  if (!upstream) return err(502, "upstream_error", "Upstream returned no stream.");
  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}

`));
      send({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
      });
      const reader = upstream.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finish2 = null;
      const toolCalls = [];
      let sPrompt = 0;
      let sCompletion = 0;
      let sThoughts = 0;
      let sTotal = 0;
      let sCached = 0;
      let streamErr = null;
      try {
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split(/\r?\n\r?\n/);
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split(/\r?\n/).find((l) => l.startsWith("data:"));
            if (!line) continue;
            const raw2 = line.slice(5).trim();
            if (!raw2 || raw2 === "[DONE]") continue;
            let json2;
            try {
              json2 = JSON.parse(raw2);
            } catch {
              continue;
            }
            const cand = json2.candidates?.[0];
            const { text, toolCalls: calls } = parseCandidate(cand);
            const fr2 = cand?.finishReason;
            if (json2.usageMetadata) {
              const u = json2.usageMetadata;
              if (u.promptTokenCount) sPrompt = u.promptTokenCount;
              if (u.candidatesTokenCount) sCompletion = u.candidatesTokenCount;
              if (u.thoughtsTokenCount) sThoughts = u.thoughtsTokenCount;
              if (u.totalTokenCount) sTotal = u.totalTokenCount;
              if (u.cachedContentTokenCount) sCached = u.cachedContentTokenCount;
            }
            if (fr2) finish2 = mapFinish(fr2);
            if (text) {
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
              });
            }
            for (const c of calls) {
              const index = toolCalls.length;
              toolCalls.push(c);
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index,
                          id: c.id,
                          type: "function",
                          function: { name: c.name, arguments: c.args }
                        }
                      ]
                    },
                    finish_reason: null
                  }
                ]
              });
            }
          }
        }
        if (buf.trim()) {
          const tailLine = buf.split(/\r?\n/).find((l) => l.startsWith("data:"));
          const tailRaw = tailLine ? tailLine.slice(5).trim() : "";
          if (tailRaw && tailRaw !== "[DONE]") {
            try {
              const tail2 = JSON.parse(tailRaw);
              const tailCand = tail2.candidates?.[0];
              const tailParsed = parseCandidate(tailCand);
              if (tailCand?.finishReason) finish2 = mapFinish(tailCand.finishReason);
              if (tailParsed.text) {
                send({
                  id,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [{ index: 0, delta: { content: tailParsed.text }, finish_reason: null }]
                });
              }
              for (const c of tailParsed.toolCalls) {
                const index = toolCalls.length;
                toolCalls.push(c);
                send({
                  id,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index,
                            id: c.id,
                            type: "function",
                            function: { name: c.name, arguments: c.args }
                          }
                        ]
                      },
                      finish_reason: null
                    }
                  ]
                });
              }
            } catch {
            }
          }
          buf = "";
        }
        send({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: toolCalls.length ? "tool_calls" : finish2 ?? "stop"
            }
          ]
        });
        if (body.stream_options?.include_usage) {
          const completion = sCompletion + sThoughts;
          send({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [],
            usage: {
              prompt_tokens: sPrompt,
              completion_tokens: completion,
              total_tokens: sTotal || sPrompt + completion,
              ...sThoughts ? { completion_tokens_details: { reasoning_tokens: sThoughts } } : {},
              ...sCached ? { prompt_tokens_details: { cached_tokens: sCached } } : {}
            }
          });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        streamErr = "stream_error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: { message: String(e) } })}

`)
        );
      } finally {
        noteUsage(req, {
          promptTokens: sPrompt,
          completionTokens: sCompletion + sThoughts,
          totalTokens: sTotal || sPrompt + sCompletion + sThoughts,
          cachedTokens: sCached
        });
        finalizeStream(req, streamErr ? 502 : 200, streamErr ?? void 0);
        controller.close();
        reader.releaseLock();
      }
    },
    cancel(reason) {
      return upstream.cancel(reason);
    }
  });
  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...metaHeaders(result.attempts, result.rotated)
    }
  });
}
function mapFinish(reason) {
  switch (reason) {
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "PROHIBITED_CONTENT":
      return "content_filter";
    default:
      return "stop";
  }
}
var asTextList = (input) => {
  if (typeof input === "string") return input ? [input] : [];
  if (Array.isArray(input)) return input.map((v2) => typeof v2 === "string" ? v2 : JSON.stringify(v2));
  return [];
};
function base64Float32(values) {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v2, i) => buf.writeFloatLE(v2, i * 4));
  return buf.toString("base64");
}
async function embeddings(req, resolvedModel) {
  counters.embeddings++;
  let body;
  try {
    body = JSON.parse(await bodyText(req));
  } catch {
    return err(400, "invalid_request_error", "Body must be JSON.");
  }
  const texts = asTextList(body.input);
  if (texts.length === 0) {
    return err(400, "invalid_request_error", "`input` must be a string or an array of strings.");
  }
  if (resolvedModel !== void 0) {
    const m = resolvedModel.replace(/^models\//, "");
    if (!(m.includes("embed") || m.toLowerCase().startsWith("gemini"))) {
      return err(
        400,
        "invalid_request_error",
        `Model \`${resolvedModel}\` is not an embeddings model and cannot be served on the Gemini embeddings route.`
      );
    }
  }
  const model = resolvedModel !== void 0 ? resolvedModel.replace(/^models\//, "") : body.model && (body.model.includes("embed") || body.model.startsWith("gemini")) ? body.model : cfg.defaultEmbedModel;
  const payload = {
    requests: texts.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      ...typeof body.dimensions === "number" ? { outputDimensionality: body.dimensions } : {}
    }))
  };
  const path = `/v1beta/models/${model}:batchEmbedContents`;
  const result = await execute(
    `${up2()}${path}`,
    {
      method: "POST",
      headers: new Headers({ "content-type": "application/json", accept: "application/json" }),
      body: JSON.stringify(payload)
    },
    path,
    req.signal,
    { model, provider: "gemini" }
  );
  noteUsage(req, {
    provider: "gemini",
    model,
    keyRaw: result.key,
    attempts: result.attempts,
    rotated: result.rotated,
    errorCode: result.response.ok ? null : `http_${result.response.status}`
  });
  if (result.response.status === 499) return err(499, "client_closed_request", "Client disconnected.");
  if (!result.response.ok) return result.response;
  let json2;
  try {
    json2 = await result.response.json();
  } catch {
    return err(502, "upstream_error", "Upstream returned non-JSON.");
  }
  const vectors = json2.embeddings ?? (json2.embedding ? [json2.embedding] : []);
  if (vectors.length === 0) {
    return err(502, "upstream_error", "Upstream returned no embeddings.");
  }
  if (vectors.length !== texts.length) {
    return err(
      502,
      "upstream_error",
      `Upstream returned ${vectors.length} embedding(s) for ${texts.length} input(s).`
    );
  }
  const wantsBase64 = body.encoding_format === "base64";
  const data = vectors.map((v2, index) => ({
    object: "embedding",
    index,
    embedding: wantsBase64 ? base64Float32(v2.values ?? []) : v2.values ?? []
  }));
  const tokens = json2.usageMetadata?.promptTokenCount ?? 0;
  noteUsage(req, { promptTokens: tokens, totalTokens: tokens });
  return Response.json(
    {
      object: "list",
      data,
      model,
      usage: { prompt_tokens: tokens, total_tokens: tokens }
    },
    { headers: metaHeaders(result.attempts, result.rotated) }
  );
}
function visibleModels(ids) {
  const retired = new Set(cfg.retiredModels.map((m) => m.replace(/^models\//, "").toLowerCase()));
  return ids.filter((id) => !retired.has(id.replace(/^models\//, "").toLowerCase()));
}
async function geminiModelRows() {
  const fallback = visibleModels([
    cfg.defaultModel,
    cfg.searchModel,
    cfg.defaultTtsModel,
    cfg.defaultEmbedModel,
    "gemini-3-flash-preview",
    "gemini-2.0-flash"
  ]);
  let live = [];
  let degraded = false;
  try {
    const r = await listLiveModels();
    live = r.models.filter((m) => visibleModels([m.id]).length > 0);
  } catch {
    degraded = true;
  }
  if (!live.length) {
    return {
      rows: [...new Set(fallback)].map((id) => ({
        id,
        object: "model",
        created: 17e8,
        owned_by: "google"
      })),
      live: 0,
      degraded
    };
  }
  return {
    rows: live.map((m) => {
      const c = catalogFor(m.id);
      return {
        id: m.id,
        object: "model",
        created: 17e8,
        owned_by: "google",
        // OpenAI clients ignore unknown fields; these are additive.
        display_name: m.displayName,
        kind: m.kind,
        free: m.free,
        context_window: m.inputTokenLimit,
        max_output_tokens: m.outputTokenLimit,
        pricing: c ? { input_per_1m_usd: c.inUsd, output_per_1m_usd: c.outUsd, as_of: PRICING_AS_OF } : null
      };
    }),
    live: live.length,
    degraded
  };
}
function err(status, type, message) {
  return Response.json({ error: { type, message } }, { status });
}

// src/passthrough.ts
init_providers();
var PATHS = {
  chat: "/chat/completions",
  embeddings: "/embeddings",
  images: "/images/generations",
  audio: "/audio/speech"
};
var METERED = ["chat", "embeddings"];
async function openaiWire(req, provider, route, model, signal) {
  const base = baseUrlOf(provider);
  const raw2 = req.method === "GET" || req.method === "HEAD" ? "" : await bodyText(req);
  let body = raw2;
  let stream = false;
  try {
    const parsed = JSON.parse(raw2);
    if (parsed && typeof parsed === "object") {
      if (model) parsed.model = model;
      stream = Boolean(parsed.stream);
      body = JSON.stringify(parsed);
    }
  } catch {
  }
  const result = await execute(
    `${base}${PATHS[route]}`,
    {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        accept: stream ? "text/event-stream" : "application/json"
      }),
      body
    },
    PATHS[route],
    signal,
    { provider: provider.id, model }
  );
  noteUsage(req, {
    provider: provider.id,
    model,
    keyRaw: result.key,
    attempts: result.attempts,
    rotated: result.rotated,
    errorCode: result.response.ok ? null : `http_${result.response.status}`
  });
  if (result.response.status === 499) {
    return new Response(JSON.stringify({ error: { type: "client_closed_request", message: "Client disconnected." } }), {
      status: 499,
      headers: { "content-type": "application/json" }
    });
  }
  if (!result.response.ok) return result.response;
  const meter = METERED.includes(route);
  if (stream && result.response.body) {
    noteUsage(req, { stream: true });
    const tapped = tapUsage(result.response.body, (usage) => {
      noteUsage(req, {
        promptTokens: usage.prompt,
        completionTokens: usage.completion,
        totalTokens: usage.total
      });
      finalizeStream(req, 200);
    });
    const headers = new Headers(result.response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    headers.delete("transfer-encoding");
    return new Response(tapped, { status: result.response.status, headers });
  }
  if (meter && result.response.body) {
    try {
      const copy = result.response.clone();
      const json2 = await copy.json();
      const u = json2.usage ?? {};
      noteUsage(req, {
        promptTokens: u.prompt_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0,
        totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0)
      });
    } catch {
    }
  }
  return result.response;
}
function tapUsage(upstream, onDone) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";
  let usage = { prompt: 0, completion: 0, total: 0 };
  let reported = false;
  const report = () => {
    if (reported) return;
    reported = true;
    onDone(usage);
  };
  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split(/\r?\n\r?\n/);
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split(/\r?\n/).find((l) => l.startsWith("data:"));
            if (!line) continue;
            const raw2 = line.slice(5).trim();
            if (!raw2 || raw2 === "[DONE]") continue;
            try {
              const json2 = JSON.parse(raw2);
              if (json2.usage) {
                usage = {
                  prompt: json2.usage.prompt_tokens ?? usage.prompt,
                  completion: json2.usage.completion_tokens ?? usage.completion,
                  total: json2.usage.total_tokens ?? usage.total
                };
              }
            } catch {
            }
          }
        }
      } catch {
      } finally {
        report();
        try {
          controller.close();
        } catch {
        }
        reader.releaseLock();
      }
    },
    cancel(reason) {
      report();
      return upstream.cancel(reason);
    }
  });
}
async function openaiModelList(provider, rawKey) {
  const base = baseUrlOf(provider);
  if (!base) return [];
  try {
    const res = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${rawKey}`, accept: "application/json" },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) return [];
    const payload = await res.json();
    return (payload.data ?? []).map((m) => ({ id: String(m.id ?? "").trim(), ownedBy: String(m.owned_by ?? provider.id) })).filter((m) => m.id);
  } catch {
    return [];
  }
}

// src/app.ts
init_providers();

// src/rollup.ts
init_config();
init_db();
var WIB_OFFSET_MS = 7 * 60 * 60 * 1e3;
var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
function wibDayOf(ts2) {
  return new Date(ts2 + WIB_OFFSET_MS).toISOString().slice(0, 10);
}
function yesterdayWib(now2 = Date.now()) {
  return wibDayOf(now2 - 24 * 60 * 60 * 1e3);
}
function dayStart(day) {
  return /* @__PURE__ */ new Date(`${day}T00:00:00.000+07:00`);
}
function normalizeDay(day) {
  if (!day) return yesterdayWib();
  if (DAY_RE.test(day)) {
    const t = Date.parse(`${day}T00:00:00.000Z`);
    if (Number.isFinite(t)) return day;
  }
  return null;
}
async function rollupDay(day) {
  const target = normalizeDay(day);
  if (target === null) {
    return {
      day: day ?? "",
      buckets: 0,
      ok: false,
      error: `invalid day \`${day}\`: expected YYYY-MM-DD`
    };
  }
  if (!dbEnabled()) return { day: target, buckets: 0, ok: false, error: "database disabled" };
  const start = dayStart(target);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1e3);
  const cleared = await sql("delete from usage_daily where day = $1::date", [target]);
  if (!cleared.ok) {
    return { day: target, buckets: 0, ok: false, error: `${cleared.reason}: ${cleared.message}` };
  }
  const text = `
insert into usage_daily (
  day, route, model, key_id, provider,
  requests, errors, rotated,
  prompt_tokens, completion_tokens,
  cost_usd, p50_ms, p95_ms
)
select
  $1::date,
  route,
  coalesce(model, ''),
  coalesce(key_id, ''),
  coalesce(provider, 'gemini'),
  count(*)::int,
  (count(*) filter (where status >= 400))::int,
  (count(*) filter (where rotated))::int,
  coalesce(sum(prompt_tokens), 0)::bigint,
  coalesce(sum(completion_tokens), 0)::bigint,
  coalesce(sum(cost_usd), 0)::numeric,
  percentile_cont(0.5) within group (order by latency_ms)::int,
  percentile_cont(0.95) within group (order by latency_ms)::int
from usage_events
where ts >= $2::timestamptz and ts < $3::timestamptz
group by route, coalesce(model, ''), coalesce(key_id, ''), coalesce(provider, 'gemini')
on conflict (day, route, model, key_id, provider) do update set
  requests = excluded.requests,
  errors = excluded.errors,
  rotated = excluded.rotated,
  prompt_tokens = excluded.prompt_tokens,
  completion_tokens = excluded.completion_tokens,
  cost_usd = excluded.cost_usd,
  p50_ms = excluded.p50_ms,
  p95_ms = excluded.p95_ms
returning 1`;
  const res = await sql(text, [target, start.toISOString(), end.toISOString()]);
  if (!res.ok) return { day: target, buckets: 0, ok: false, error: `${res.reason}: ${res.message}` };
  return { day: target, buckets: res.rows.length, ok: true };
}
async function pruneOlderThan(days = cfg.retentionDays) {
  if (!dbEnabled()) return { pruned: 0, ok: false, error: "database disabled" };
  const keep = Number.isFinite(days) && days > 0 ? Math.floor(days) : cfg.retentionDays;
  const res = await sql(
    "delete from usage_events where ts < now() - make_interval(days => $1::int) returning 1",
    [keep]
  );
  if (!res.ok) return { pruned: 0, ok: false, error: `${res.reason}: ${res.message}` };
  return { pruned: res.rows.length, ok: true };
}
function defaultDay(now2 = Date.now()) {
  return yesterdayWib(now2);
}

// src/audit.ts
init_db();
var KEY_SHAPED3 = /AIza[0-9A-Za-z_-]{10,}|ya29\.[0-9A-Za-z._-]{10,}/g;
var DETAIL_MAX = 2e3;
var ACTOR_MAX = 120;
function actorFrom(ua) {
  const s = (ua ?? "").trim();
  return (s || "api").slice(0, ACTOR_MAX);
}
function safeDetail(detail) {
  if (!detail) return null;
  const json2 = JSON.stringify(detail).replace(KEY_SHAPED3, "[redacted]");
  if (json2.length > DETAIL_MAX) {
    return JSON.stringify({ truncated: true, chars: json2.length, head: json2.slice(0, DETAIL_MAX) });
  }
  return json2;
}
async function recordNow(action, input = {}) {
  if (!dbEnabled()) return;
  try {
    await sql(
      `insert into admin_audit (actor, action, target, detail)
       values ($1, $2, $3, $4::jsonb)`,
      [
        (input.actor ?? "api").slice(0, ACTOR_MAX),
        action,
        input.target ? input.target.slice(0, 200) : null,
        safeDetail(input.detail)
      ]
    );
  } catch {
  }
}
async function list2(filter = {}) {
  if (!dbEnabled()) return { ok: true, rows: [] };
  const params = [];
  const where = [];
  if (filter.action) {
    params.push(`${filter.action}%`);
    where.push(`action like $${params.length}`);
  }
  if (filter.since) {
    params.push(filter.since);
    where.push(`ts >= $${params.length}::timestamptz`);
  }
  const limit = Math.min(Math.max(1, Math.floor(filter.limit ?? 100) || 100), 500);
  params.push(limit);
  const res = await sql(
    `select id, ts, actor, action, target, detail
       from admin_audit
       ${where.length ? `where ${where.join(" and ")}` : ""}
       order by ts desc, id desc
       limit $${params.length}`,
    params
  );
  if (!res.ok) {
    if (res.reason === "disabled") return { ok: true, rows: [] };
    return { ok: false, rows: [], error: res.message };
  }
  return {
    ok: true,
    rows: res.rows.map((r) => ({
      id: Number(r.id),
      ts: new Date(r.ts).toISOString(),
      actor: r.actor,
      action: r.action,
      target: r.target,
      detail: r.detail && typeof r.detail === "object" ? r.detail : null
    }))
  };
}

// src/app.ts
init_log();

// src/stats-ui.ts
var STATS_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Observe</span>
      <h1 class="page-title">Statistics</h1>
      <p class="page-lede" id="meta">-</p>
    </div>
    <div class="page-head-side">
      <div class="seg" id="range" role="group" aria-label="Time range"></div>
      <span class="meta" id="stamp">-</span>
    </div>
  </header>

  <div id="dataErr" class="notice u-mb-3" role="status" aria-live="polite"></div>

  <div class="figures" id="kpis"></div>

  <div class="zone">
    <div class="zone-head"><h2>Breakdowns</h2><span class="meta">where the traffic went in this range</span></div>

    <div class="grid grid-2">
      <section class="panel">
        <div class="panel-head">
          <h2>By model</h2>
          <span class="meta" id="byModelMeta"></span>
        </div>
        <div class="table-wrap">
          <table class="table" id="byModel">
            <thead><tr><th>Model</th><th>Provider</th><th class="num">Req</th><th class="num">Err</th><th class="num">Total tokens</th><th class="num">Estimated cost</th><th class="num">Avg ms</th></tr></thead>
            <tbody></tbody>
          </table>
          <div id="byModelEmpty"></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>By key</h2>
          <span class="meta" id="byKeyMeta"></span>
        </div>
        <div class="table-wrap">
          <table class="table" id="byKey">
            <thead><tr><th>Key id</th><th class="num">Req</th><th class="num">Err</th><th class="num">Rot</th><th class="num">Total tokens</th><th class="num">Estimated cost</th><th class="num">Avg ms</th></tr></thead>
            <tbody></tbody>
          </table>
          <div id="byKeyEmpty"></div>
        </div>
      </section>
    </div>

    <div class="grid grid-2 u-mt-3">
      <section class="panel">
        <div class="panel-head">
          <h2>By route</h2>
          <span class="meta" id="byRouteMeta"></span>
        </div>
        <div class="table-wrap">
          <table class="table" id="byRoute">
            <thead><tr><th>Route</th><th class="num">Req</th><th class="num">Err</th><th class="num">Total tokens</th><th class="num">Estimated cost</th></tr></thead>
            <tbody></tbody>
          </table>
          <div id="byRouteEmpty"></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>By status</h2>
          <span class="meta" id="byStatusMeta"></span>
        </div>
        <div class="table-wrap">
          <table class="table" id="byStatus">
            <thead><tr><th>Status</th><th class="num">Req</th><th class="num">%</th></tr></thead>
            <tbody></tbody>
          </table>
          <div id="byStatusEmpty"></div>
        </div>
      </section>
    </div>
  </div>

  <section class="panel u-mt-4">
    <div class="panel-head">
      <h2>Hour and weekday heatmap <span class="meta">WIB</span></h2>
      <label class="check"><input id="heatValues" type="checkbox"> show values</label>
      <div class="legend" aria-hidden="true">
        <span class="meta">low</span>
        <span class="legend-item"><i class="dot neutral"></i></span>
        <span class="legend-item"><i class="dot" style="background:color-mix(in srgb,var(--accent) 30%,var(--surface-3))"></i></span>
        <span class="legend-item"><i class="dot" style="background:color-mix(in srgb,var(--accent) 55%,var(--surface-3))"></i></span>
        <span class="legend-item"><i class="dot" style="background:color-mix(in srgb,var(--accent) 78%,var(--surface-3))"></i></span>
        <span class="legend-item"><i class="dot" style="background:var(--accent)"></i></span>
        <span class="meta">high</span>
      </div>
    </div>
    <div class="panel-body">
      <div class="heat-scroll"><div id="heat" class="heat" role="img" aria-label="Requests by hour and weekday"></div></div>
      <div class="sr-only"><table id="heatTable"></table></div>
      <p class="hint u-mt-3" id="heatNote"></p>
      <div id="heatEmpty"></div>
    </div>
  </section>
</div>
`;
var STATS_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    meta: document.getElementById("meta"),
    heat: document.getElementById("heat"),
    heatNote: document.getElementById("heatNote"),
    heatEmpty: document.getElementById("heatEmpty"),
    heatValues: document.getElementById("heatValues"),
    err: document.getElementById("dataErr"),
    refresh: document.getElementById("refreshBtn"),
    stamp: document.getElementById("stamp")
  };

  var RANGES = [
    { value: "1h", label: "1h" },
    { value: "24h", label: "24h" },
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" }
  ];

  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var state = { range: "24h" };

  /* Range to source, from stats.ts: 1h/24h come from raw request events
     (or the in-memory ring when no database is configured), 7d/30d from
     the usage_daily rollup. The old fallback labelled every non-ring
     source "usage_daily rollup", which mislabelled the event ranges. */
  function sourceLabel(source) {
    if (source === "ring") return "in-memory ring";
    if (source === "usage_events") return "request events";
    if (source === "usage_daily") return "usage_daily rollup";
    return source || "unknown";
  }

  function renderKpis(d) {
    var t = d.totals || {};
    el.kpis.textContent = "";
    el.kpis.appendChild(GX.kpi("Requests", GX.fmt.num(t.requests), sourceLabel(d.source)));
    el.kpis.appendChild(GX.kpi("Errors", GX.fmt.num(t.errors), t.requests ? ((t.errors / t.requests) * 100).toFixed(1) + "% of traffic" : "no traffic in range", t.errors ? "bad" : "ok"));
    el.kpis.appendChild(GX.kpi("Rotated", GX.fmt.num(t.rotated), "keys handed over"));
    el.kpis.appendChild(GX.kpi("Tokens", GX.fmt.compact(t.totalTokens), "prompt and completion"));
    el.kpis.appendChild(GX.kpi("Estimated cost", GX.fmt.money(t.costUsd), "in this window"));
    el.kpis.appendChild(GX.kpi("Projected", GX.fmt.money(d.projectedMonthlyUsd), "per 30 days"));
  }

  function fillBucket(tableId, emptyId, metaId, rows, cols) {
    var table = document.getElementById(tableId);
    var body = table.querySelector("tbody");
    body.textContent = "";
    var empty = document.getElementById(emptyId);
    document.getElementById(metaId).textContent = rows && rows.length ? rows.length + (rows.length === 1 ? " row" : " rows") : "";
    GX.tableState(
      table,
      empty,
      !rows || !rows.length,
      GX.state("empty", "Nothing in this range", "No request matched the selected window.")
    );
    if (!rows || !rows.length) return;
    rows.forEach(function (r) {
      var tr = GX.el("tr");
      cols.forEach(function (c, index) {
        /* A column may carry a node (the provider badge) instead of text. */
        if (c.node) {
          var nodeCell = GX.el("td", { "data-l": c.label || null });
          nodeCell.appendChild(c.node(r));
          tr.appendChild(nodeCell);
          return;
        }
        var td = GX.el("td", { class: index > 0 ? "num" : "", "data-l": c.label || null });
        td.textContent = c.value(r);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function fillStatus(rows, total) {
    var table = document.getElementById("byStatus");
    var body = table.querySelector("tbody");
    body.textContent = "";
    var empty = document.getElementById("byStatusEmpty");
    document.getElementById("byStatusMeta").textContent = rows && rows.length ? rows.length + " codes" : "";
    GX.tableState(
      table,
      empty,
      !rows || !rows.length,
      GX.state("empty", "Nothing in this range", "No request matched the selected window.")
    );
    if (!rows || !rows.length) return;
    rows.forEach(function (r) {
      var tr = GX.el("tr");
      GX.cell(tr, r.key, "", "status");
      GX.cell(tr, GX.fmt.num(r.requests), "num", "requests");
      GX.cell(tr, total ? ((r.requests / total) * 100).toFixed(1) + "%" : "-", "num", "%");
      body.appendChild(tr);
    });
  }

  function fillHeat(cells) {
    el.heat.textContent = "";
    el.heatEmpty.textContent = "";
    if (!cells || !cells.length) {
      el.heatEmpty.appendChild(GX.state("empty", "No hourly data", "This range has no events with hourly granularity."));
      el.heatNote.textContent = "";
      return;
    }

    var max = 0;
    var peak = null;
    var grid = {};
    cells.forEach(function (c) {
      grid[c.weekday + ":" + c.hour] = c.requests;
      if (c.requests > max) {
        max = c.requests;
        peak = c;
      }
    });

    el.heat.appendChild(GX.el("div", { class: "h", text: "" }));
    for (var h = 0; h < 24; h++) {
      el.heat.appendChild(GX.el("div", { class: "h", text: h % 3 === 0 ? String(h) : "" }));
    }

    for (var d = 0; d < 7; d++) {
      el.heat.appendChild(GX.el("div", { class: "h", text: DAYS[d] }));
      for (var hour = 0; hour < 24; hour++) {
        var value = grid[d + ":" + hour] || 0;
        var level = value === 0 ? 0 : Math.max(1, Math.min(5, Math.ceil((value / max) * 5)));
        el.heat.appendChild(GX.el("div", {
          class: "cell",
          "data-level": level,
          "data-v": value,
          title: DAYS[d] + " " + (hour < 10 ? "0" + hour : hour) + ":00, " + value + " requests"
        }));
      }
    }

    el.heatNote.textContent = peak
      ? "Peak: " + DAYS[peak.weekday] + " " + (peak.hour < 10 ? "0" + peak.hour : peak.hour) +
        ":00 with " + GX.fmt.num(peak.requests) + " requests. " + GX.fmt.num(cells.length) + " cells carry traffic."
      : "";

    /* The same numbers as a table, for anyone who cannot read a colour map. */
    var sr = document.getElementById("heatTable");
    if (sr) {
      sr.textContent = "";
      sr.appendChild(GX.el("caption", { text: "Requests by hour and weekday" }));
      var head = GX.el("tr", null, [GX.el("th", { text: "Day" })]);
      for (var hr = 0; hr < 24; hr++) head.appendChild(GX.el("th", { text: (hr < 10 ? "0" + hr : hr) + ":00" }));
      sr.appendChild(GX.el("thead", null, head));
      var body = GX.el("tbody");
      for (var d = 0; d < 7; d++) {
        var row = GX.el("tr", null, [GX.el("th", { scope: "row", text: DAYS[d] })]);
        for (var h = 0; h < 24; h++) row.appendChild(GX.el("td", { text: String(grid[d + ":" + h] || 0) }));
        body.appendChild(row);
      }
      sr.appendChild(body);
    }
  }

  function paint(d) {
    renderKpis(d);
    el.meta.textContent = "Source: " + sourceLabel(d.source) + ". " + (d.note || "");
    el.stamp.textContent = "updated " + GX.fmt.time(Date.now());
    fillHeat(d.heatmap);
    fillBucket("byModel", "byModelEmpty", "byModelMeta", d.byModel, [
      { label: "model", value: function (r) { return r.key; } },
      { label: "provider", node: function (r) { return GX.providerTag(r.provider || GX.providerFromModel(r.key)); } },
      { label: "req", value: function (r) { return GX.fmt.num(r.requests); } },
      { label: "err", value: function (r) { return GX.fmt.num(r.errors); } },
      { label: "total tokens", value: function (r) { return GX.fmt.compact(r.totalTokens); } },
      { label: "estimated cost", value: function (r) { return GX.fmt.money(r.costUsd); } },
      { label: "ms", value: function (r) { return GX.fmt.num(r.avgLatencyMs); } }
    ]);
    fillBucket("byKey", "byKeyEmpty", "byKeyMeta", d.byKey, [
      { label: "key", value: function (r) { return r.key; } },
      { label: "provider", node: function (r) { return GX.providerTag(r.provider); } },
      { label: "req", value: function (r) { return GX.fmt.num(r.requests); } },
      { label: "err", value: function (r) { return GX.fmt.num(r.errors); } },
      { label: "rot", value: function (r) { return GX.fmt.num(r.rotated); } },
      { label: "total tokens", value: function (r) { return GX.fmt.compact(r.totalTokens); } },
      { label: "estimated cost", value: function (r) { return GX.fmt.money(r.costUsd); } },
      { label: "ms", value: function (r) { return GX.fmt.num(r.avgLatencyMs); } }
    ]);
    fillBucket("byRoute", "byRouteEmpty", "byRouteMeta", d.byRoute, [
      { label: "route", value: function (r) { return r.key; } },
      { label: "req", value: function (r) { return GX.fmt.num(r.requests); } },
      { label: "err", value: function (r) { return GX.fmt.num(r.errors); } },
      { label: "total tokens", value: function (r) { return GX.fmt.compact(r.totalTokens); } },
      { label: "estimated cost", value: function (r) { return GX.fmt.money(r.costUsd); } }
    ]);
    fillStatus(d.byStatus, (d.totals || {}).requests || 0);
  }

  function load() {
    return GX.api("/pengatur/stats/data?range=" + encodeURIComponent(state.range))
      .then(function (d) {
        if (d.ok === false) throw new Error(d.error && d.error.message ? d.error.message : "Statistics unavailable.");
        paint(d);
        el.console.hidden = false;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        el.console.hidden = false;
        GX.say(el.err, err.message, "err");
      });
  }

  function reload() {
    return load().catch(function () {});
  }

  function writeUrl() {
    GX.url.write({ range: state.range });
  }

  function readUrl() {
    var params = GX.url.read();
    if (params.range && ["1h", "24h", "7d", "30d"].indexOf(params.range) >= 0) state.range = params.range;
  }

  function buildRange() {
    var box = document.getElementById("range");
    box.textContent = "";
    RANGES.forEach(function (r) {
      var b = GX.el("button", {
        type: "button",
        text: r.label,
        "aria-pressed": r.value === state.range ? "true" : "false"
      });
      b.addEventListener("click", function () {
        state.range = r.value;
        Array.prototype.forEach.call(box.querySelectorAll("button"), function (other) {
          other.setAttribute("aria-pressed", other === b ? "true" : "false");
        });
        writeUrl();
        load();
      });
      box.appendChild(b);
    });
  }

  el.heatValues.addEventListener("change", function () {
    el.heat.classList.toggle("values", el.heatValues.checked);
  });

  el.refresh.addEventListener("click", function () { reload(); });

  buildRange();
  GX.shortcuts({ refresh: "refreshBtn" });
  GX.gate({
    onSuccess: function () {
      readUrl();
      buildRange();
      return load();
    }
  });
})();
`;
var STATS_HTML = consolePage({
  title: "Statistics",
  active: "/pengatur/stats",
  actions: '<button id="refreshBtn" class="btn btn-sm" type="button">' + icon("refresh") + "Refresh</button>",
  body: STATS_BODY,
  script: STATS_SCRIPT
});

// src/stats.ts
init_db();
init_config();
var STATS_RANGES = ["1h", "24h", "7d", "30d"];
var isStatsRange = (v2) => v2 !== null && v2 !== void 0 && STATS_RANGES.includes(v2);
var RANGE_MS = {
  "1h": 60 * 60 * 1e3,
  "24h": 24 * 60 * 60 * 1e3,
  "7d": 7 * 24 * 60 * 60 * 1e3,
  "30d": 30 * 24 * 60 * 60 * 1e3
};
var WIB_OFFSET_MS2 = 7 * 60 * 60 * 1e3;
function providerOf(model) {
  const m = (model ?? "").toLowerCase();
  return m === "elevenlabs" || m.startsWith("elevenlabs:") || m.startsWith("eleven_") ? "elevenlabs" : "gemini";
}
function percentile(sorted, p2) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p2 / 100 * sorted.length) - 1));
  return sorted[idx];
}
var emptyTotals2 = () => ({
  requests: 0,
  errors: 0,
  rotated: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  p50Ms: 0,
  p95Ms: 0
});
function bucketRows(list3, keyOf) {
  const map = /* @__PURE__ */ new Map();
  const prov = /* @__PURE__ */ new Map();
  for (const r of list3) {
    const k = keyOf(r) || "unknown";
    let acc = map.get(k);
    if (!acc) {
      acc = { key: k, provider: "", requests: 0, errors: 0, rotated: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, avgLatencyMs: 0 };
      map.set(k, acc);
      prov.set(k, /* @__PURE__ */ new Map());
    }
    acc.requests++;
    if (!r.ok) acc.errors++;
    if (r.rotated) acc.rotated++;
    acc.promptTokens += r.promptTokens;
    acc.completionTokens += r.completionTokens;
    acc.totalTokens += r.totalTokens;
    acc.costUsd += r.costUsd ?? 0;
    acc.avgLatencyMs += r.latencyMs;
    if (r.provider) {
      const counts = prov.get(k);
      if (counts) counts.set(r.provider, (counts.get(r.provider) || 0) + 1);
    }
  }
  const out = [...map.values()];
  for (const b2 of out) {
    b2.avgLatencyMs = b2.requests ? Math.round(b2.avgLatencyMs / b2.requests) : 0;
    let best = 0;
    const counts = prov.get(b2.key);
    if (counts) counts.forEach((n, p2) => {
      if (n > best) {
        best = n;
        b2.provider = p2;
      }
    });
  }
  return out.sort((a2, b2) => b2.requests - a2.requests || b2.totalTokens - a2.totalTokens);
}
function providerDayFromRing(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const day = wibDayOf(r.ts);
    const provider = r.provider || providerOf(r.model);
    const k = day + "|" + provider;
    let acc = map.get(k);
    if (!acc) {
      acc = { day, provider, requests: 0, errors: 0 };
      map.set(k, acc);
    }
    acc.requests++;
    if (!r.ok) acc.errors++;
  }
  return [...map.values()].sort((a2, b2) => a2.day.localeCompare(b2.day) || a2.provider.localeCompare(b2.provider));
}
function wibHourWeekday(ts2) {
  const d = new Date(ts2 + WIB_OFFSET_MS2);
  return { hour: d.getUTCHours(), weekday: d.getUTCDay() };
}
function heatmapFromRing(rows) {
  const grid = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const { hour, weekday } = wibHourWeekday(r.ts);
    const idx = weekday * 24 + hour;
    grid.set(idx, (grid.get(idx) ?? 0) + 1);
  }
  return [...grid.entries()].map(([idx, requests]) => ({ weekday: Math.floor(idx / 24), hour: idx % 24, requests })).sort((a2, b2) => a2.weekday - b2.weekday || a2.hour - b2.hour);
}
function statsFromRing(range, now2) {
  const since = now2 - RANGE_MS[range];
  const rows = allRows().filter((r) => r.ts >= since);
  const totals = sumRows(rows);
  const latencies = rows.map((r) => r.latencyMs).sort((a2, b2) => a2 - b2);
  const statusMap = /* @__PURE__ */ new Map();
  for (const r of rows) statusMap.set(String(r.status), (statusMap.get(String(r.status)) ?? 0) + 1);
  const costUsd = totals.costUsd ?? 0;
  const observedDays = RANGE_MS[range] / (24 * 60 * 60 * 1e3);
  const projected = observedDays > 0 ? costUsd / observedDays * 30 : 0;
  return {
    ok: true,
    range,
    source: "ring",
    since,
    until: now2,
    totals: {
      requests: totals.requests,
      errors: totals.errors,
      rotated: totals.rotated,
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      totalTokens: totals.totalTokens,
      costUsd,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95)
    },
    byModel: bucketRows(rows, (r) => r.model),
    byKey: bucketRows(rows, (r) => r.keyId || r.keyMasked),
    byRoute: bucketRows(rows, (r) => r.route),
    byProvider: bucketRows(rows, (r) => r.provider || providerOf(r.model)),
    byProviderDay: providerDayFromRing(rows),
    byStatus: [...statusMap.entries()].map(([key, requests]) => ({ key, requests })).sort((a2, b2) => b2.requests - a2.requests),
    heatmap: heatmapFromRing(rows),
    projectedMonthlyUsd: Number(projected.toFixed(6)),
    ...rows.length ? {} : { note: "No traffic in this range." }
  };
}
var num2 = (v2) => {
  const n = Number(v2);
  return Number.isFinite(n) ? n : 0;
};
function dailyBucket(rows, keyOf) {
  const map = /* @__PURE__ */ new Map();
  const prov = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const k = keyOf(r) || "unknown";
    let acc = map.get(k);
    if (!acc) {
      acc = { key: k, provider: "", requests: 0, errors: 0, rotated: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, avgLatencyMs: 0 };
      map.set(k, acc);
      prov.set(k, /* @__PURE__ */ new Map());
    }
    if (r.provider) {
      const counts = prov.get(k);
      if (counts) counts.set(r.provider, (counts.get(r.provider) || 0) + 1);
    }
    const requests = num2(r.requests);
    acc.requests += requests;
    acc.errors += num2(r.errors);
    acc.rotated += num2(r.rotated);
    acc.promptTokens += num2(r.prompt_tokens);
    acc.completionTokens += num2(r.completion_tokens);
    acc.totalTokens += num2(r.prompt_tokens) + num2(r.completion_tokens);
    acc.costUsd += num2(r.cost_usd);
    acc.avgLatencyMs += requests * num2(r.p50_ms);
  }
  const out = [...map.values()];
  for (const b2 of out) {
    b2.avgLatencyMs = b2.requests ? Math.round(b2.avgLatencyMs / b2.requests) : 0;
    let best = 0;
    const counts = prov.get(b2.key);
    if (counts) counts.forEach((n, p2) => {
      if (n > best) {
        best = n;
        b2.provider = p2;
      }
    });
  }
  for (const b2 of out) b2.costUsd = Number(b2.costUsd.toFixed(6));
  return out.sort((a2, b2) => b2.requests - a2.requests);
}
function providerDayFromDaily(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const provider = r.provider || providerOf(r.model);
    const k = r.day + "|" + provider;
    let acc = map.get(k);
    if (!acc) {
      acc = { day: r.day, provider, requests: 0, errors: 0 };
      map.set(k, acc);
    }
    acc.requests += num2(r.requests);
    acc.errors += num2(r.errors);
  }
  return [...map.values()].sort((a2, b2) => a2.day.localeCompare(b2.day) || a2.provider.localeCompare(b2.provider));
}
async function statsFromDaily(range, now2) {
  const since = now2 - RANGE_MS[range];
  const base = {
    ok: true,
    range,
    source: "usage_daily",
    since,
    until: now2,
    byStatus: [],
    heatmap: [],
    projectedMonthlyUsd: 0
  };
  const sinceDay = wibDayOf(since);
  const daily = await sql(
    `select day::text as day, route, model, coalesce(provider, 'gemini') as provider, key_id,
            requests, errors, rotated,
            prompt_tokens, completion_tokens, cost_usd, p50_ms, p95_ms
       from usage_daily
      where day >= $1::date
      order by day`,
    [sinceDay]
  );
  if (!daily.ok) {
    if (daily.reason === "disabled") {
      return {
        ...base,
        totals: emptyTotals2(),
        byModel: [],
        byKey: [],
        byRoute: [],
        byProvider: [],
        byProviderDay: [],
        note: "Daily history needs Postgres; DATABASE_URL is not set."
      };
    }
    return { ...base, ok: false, totals: emptyTotals2(), byModel: [], byKey: [], byRoute: [], byProvider: [], byProviderDay: [], error: daily.message };
  }
  const rows = daily.rows;
  const requests = rows.reduce((s, r) => s + num2(r.requests), 0);
  const errors = rows.reduce((s, r) => s + num2(r.errors), 0);
  const rotated = rows.reduce((s, r) => s + num2(r.rotated), 0);
  const promptTokens = rows.reduce((s, r) => s + num2(r.prompt_tokens), 0);
  const completionTokens = rows.reduce((s, r) => s + num2(r.completion_tokens), 0);
  const costUsd = Number(rows.reduce((s, r) => s + num2(r.cost_usd), 0).toFixed(6));
  let p50Num = 0;
  let p95Num = 0;
  for (const r of rows) {
    const w = num2(r.requests);
    p50Num += w * num2(r.p50_ms);
    p95Num += w * num2(r.p95_ms);
  }
  const p50Ms = requests ? Math.round(p50Num / requests) : 0;
  const p95Ms = requests ? Math.round(p95Num / requests) : 0;
  const observedDays = RANGE_MS[range] / (24 * 60 * 60 * 1e3);
  const projectedMonthlyUsd = Number((costUsd / observedDays * 30).toFixed(6));
  const heat = await sql(
    `select extract(hour from ts at time zone 'Asia/Jakarta')::int as hour,
            extract(dow from ts at time zone 'Asia/Jakarta')::int as weekday,
            count(*)::int as requests
       from usage_events
      where ts >= $1
      group by 1, 2`,
    [new Date(since).toISOString()]
  );
  if (!heat.ok) {
    return { ...base, ok: false, totals: emptyTotals2(), byModel: [], byKey: [], byRoute: [], byProvider: [], byProviderDay: [], error: heat.message };
  }
  const note = rows.length ? "Status codes are aggregated to ok/error for this range; p50/p95 are requests-weighted bucket means." : `No usage_daily rows for this range (rollup runs daily via /internal/rollup).`;
  return {
    ...base,
    totals: { requests, errors, rotated, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, costUsd, p50Ms, p95Ms },
    byModel: dailyBucket(rows, (r) => r.model),
    byKey: dailyBucket(rows, (r) => r.key_id),
    byRoute: dailyBucket(rows, (r) => r.route),
    byProvider: dailyBucket(rows, (r) => r.provider || providerOf(r.model)),
    byProviderDay: providerDayFromDaily(rows),
    byStatus: [
      { key: "ok", requests: Math.max(0, requests - errors) },
      { key: "error", requests: errors }
    ].filter((b2) => b2.requests > 0),
    heatmap: heat.rows.map((r) => ({ weekday: num2(r.weekday), hour: num2(r.hour), requests: num2(r.requests) })).sort((a2, b2) => a2.weekday - b2.weekday || a2.hour - b2.hour),
    projectedMonthlyUsd,
    note
  };
}
async function statsFromEvents(range, now2) {
  if (!dbEnabled()) return statsFromRing(range, now2);
  const since = new Date(now2 - RANGE_MS[range]);
  const base = {
    ok: true,
    range,
    source: "usage_events",
    since: since.getTime(),
    until: now2,
    byStatus: [],
    heatmap: [],
    projectedMonthlyUsd: 0
  };
  const [agg, heat] = await Promise.all([
    sql(
      `select to_char(ts at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as day,
              route,
              coalesce(model, '') as model,
              coalesce(provider, 'gemini') as provider,
              coalesce(key_id, '') as key_id,
              count(*)::int as requests,
              (count(*) filter (where status >= 400))::int as errors,
              (count(*) filter (where rotated))::int as rotated,
              coalesce(sum(prompt_tokens), 0)::bigint as prompt_tokens,
              coalesce(sum(completion_tokens), 0)::bigint as completion_tokens,
              coalesce(sum(cost_usd), 0)::numeric as cost_usd,
              coalesce(percentile_cont(0.5) within group (order by latency_ms), 0)::int as p50_ms,
              coalesce(percentile_cont(0.95) within group (order by latency_ms), 0)::int as p95_ms
         from usage_events
        where ts >= $1
        group by 1, 2, 3, 4, 5`,
      [since.toISOString()]
    ),
    sql(
      `select extract(hour from ts at time zone 'Asia/Jakarta')::int as hour,
              extract(dow from ts at time zone 'Asia/Jakarta')::int as weekday,
              count(*)::int as requests
         from usage_events
        where ts >= $1
        group by 1, 2`,
      [since.toISOString()]
    )
  ]);
  if (!agg.ok) {
    return { ...base, ok: false, totals: emptyTotals2(), byModel: [], byKey: [], byRoute: [], byProvider: [], byProviderDay: [], error: agg.message };
  }
  if (!heat.ok) {
    return { ...base, ok: false, totals: emptyTotals2(), byModel: [], byKey: [], byRoute: [], byProvider: [], byProviderDay: [], error: heat.message };
  }
  const rows = agg.rows;
  const requests = rows.reduce((s, r) => s + num2(r.requests), 0);
  const errors = rows.reduce((s, r) => s + num2(r.errors), 0);
  const rotated = rows.reduce((s, r) => s + num2(r.rotated), 0);
  const promptTokens = rows.reduce((s, r) => s + num2(r.prompt_tokens), 0);
  const completionTokens = rows.reduce((s, r) => s + num2(r.completion_tokens), 0);
  const costUsd = Number(rows.reduce((s, r) => s + num2(r.cost_usd), 0).toFixed(6));
  let p50Num = 0;
  let p95Num = 0;
  for (const r of rows) {
    const w = num2(r.requests);
    p50Num += w * num2(r.p50_ms);
    p95Num += w * num2(r.p95_ms);
  }
  const p50Ms = requests ? Math.round(p50Num / requests) : 0;
  const p95Ms = requests ? Math.round(p95Num / requests) : 0;
  const observedDays = RANGE_MS[range] / (24 * 60 * 60 * 1e3);
  const projectedMonthlyUsd = Number((costUsd / observedDays * 30).toFixed(6));
  const note = rows.length ? "Status codes are aggregated to ok/error for this range; p50/p95 are requests-weighted bucket means." : `No usage_events rows for this range (events are retained ${cfg.retentionDays} days).`;
  return {
    ...base,
    totals: { requests, errors, rotated, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, costUsd, p50Ms, p95Ms },
    byModel: dailyBucket(rows, (r) => r.model),
    byKey: dailyBucket(rows, (r) => r.key_id),
    byRoute: dailyBucket(rows, (r) => r.route),
    byProvider: dailyBucket(rows, (r) => r.provider || providerOf(r.model)),
    byProviderDay: providerDayFromDaily(rows),
    byStatus: [
      { key: "ok", requests: Math.max(0, requests - errors) },
      { key: "error", requests: errors }
    ].filter((b2) => b2.requests > 0),
    heatmap: heat.rows.map((r) => ({ weekday: num2(r.weekday), hour: num2(r.hour), requests: num2(r.requests) })).sort((a2, b2) => a2.weekday - b2.weekday || a2.hour - b2.hour),
    projectedMonthlyUsd,
    note
  };
}
async function statsSnapshot(range, now2 = Date.now()) {
  if (range === "1h" || range === "24h") return statsFromEvents(range, now2);
  if (!dbEnabled()) {
    return {
      ok: true,
      range,
      source: "usage_daily",
      since: now2 - RANGE_MS[range],
      until: now2,
      totals: emptyTotals2(),
      byModel: [],
      byKey: [],
      byRoute: [],
      byProvider: [],
      byProviderDay: [],
      byStatus: [],
      heatmap: [],
      projectedMonthlyUsd: 0,
      note: "Daily history needs Postgres; DATABASE_URL is not set."
    };
  }
  return statsFromDaily(range, now2);
}

// src/usage-ui.ts
var USAGE_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Observe</span>
      <h1 class="page-title">Logs</h1>
      <p class="page-lede">Every request that passed through the gateway, with the filters that produced it in the URL.</p>
    </div>
    <div class="page-head-side">
      <label class="check"><input id="auto" type="checkbox"> Auto refresh every 60s</label>
      <span class="meta" id="stamp">-</span>
    </div>
  </header>

  <div class="figures" id="kpis"></div>

  <section class="panel u-mt-4">
    <div class="panel-head">
      <h2>Filters</h2>
      <span class="meta">the selection survives a reload</span>
    </div>
    <div class="panel-body">
      <div class="toolbar">
        <div class="grow">
          <label class="field" for="fDay">Day</label>
          <select id="fDay" class="select"><option value="">all</option></select>
        </div>
        <div class="grow">
          <label class="field" for="fModel">Model</label>
          <select id="fModel" class="select"><option value="">all</option></select>
        </div>
        <div class="grow">
          <label class="field" for="fKey">Key</label>
          <select id="fKey" class="select"><option value="">all</option></select>
        </div>
        <div class="grow">
          <label class="field" for="fRoute">Route</label>
          <select id="fRoute" class="select"><option value="">all</option></select>
        </div>
        <div class="grow">
          <label class="field" for="fStatus">Status</label>
          <select id="fStatus" class="select">
            <option value="">all</option>
            <option value="ok">ok</option>
            <option value="error">error</option>
            <option value="rotated">rotated</option>
          </select>
        </div>
        <div class="toolbar">
          <button id="apply" class="btn btn-primary" type="button">Apply</button>
          <button id="reset" class="btn" type="button">Reset</button>
        </div>
      </div>
      <div id="err" class="notice u-mt-3" role="status" aria-live="polite"></div>
    </div>
  </section>

  <section class="panel u-mt-4">
    <div class="panel-head">
      <h2>Request log</h2>
      <span class="meta" id="logMeta"></span>
    </div>
    <div class="table-wrap">
      <table class="table" id="log">
        <thead><tr>
          <th>Time</th><th>Route</th><th>Model</th><th>Provider</th><th>Key</th><th>Status</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Total</th><th class="num">Cost</th><th class="num">ms</th>
        </tr></thead>
        <tbody></tbody>
      </table>
      <div id="logEmpty"></div>
    </div>
    <div class="panel-foot">
      <div id="pager" class="pager u-full"></div>
    </div>
  </section>

  <div class="zone">
    <div class="zone-head"><h2>Breakdowns</h2><span class="meta">same filter, four groupings</span></div>
    <div class="grid grid-2">
      <section class="panel">
        <div class="panel-head">
          <h2>By model</h2>
          <span class="meta" id="byModelMeta"></span>
        </div>
        <div class="table-wrap">
          <table class="table" id="byModel">
            <thead><tr>
              <th>Model</th><th>Provider</th><th class="num">Req</th><th class="num">Err</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cached</th><th class="num">Cost</th><th class="num">Avg ms</th>
            </tr></thead>
            <tbody></tbody>
          </table>
          <div id="byModelEmpty"></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>By key</h2>
          <span class="meta" id="byKeyMeta"></span>
        </div>
        <div class="table-wrap">
          <table class="table" id="byKey">
            <thead><tr>
              <th>Key</th><th class="num">Req</th><th class="num">Err</th><th class="num">Rot</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cost</th><th class="num">Avg ms</th>
            </tr></thead>
            <tbody></tbody>
          </table>
          <div id="byKeyEmpty"></div>
        </div>
      </section>
    </div>

    <section class="panel u-mt-3">
      <div class="panel-head">
        <h2>By day</h2>
        <span class="meta" id="byDayMeta"></span>
      </div>
      <div class="table-wrap">
        <table class="table" id="byDay">
          <thead><tr>
            <th>Day</th><th class="num">Req</th><th class="num">Err</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cost</th>
          </tr></thead>
          <tbody></tbody>
        </table>
        <div id="byDayEmpty"></div>
      </div>
    </section>

    <section class="panel u-mt-3">
      <div class="panel-head">
        <h2>By route</h2>
        <span class="meta" id="byRouteMeta"></span>
      </div>
      <div class="table-wrap">
        <table class="table" id="byRoute">
          <thead><tr>
            <th>Route</th><th class="num">Req</th><th class="num">Err</th><th class="num">Rot</th><th class="num">Prompt</th><th class="num">Output</th><th class="num">Cost</th><th class="num">Avg ms</th>
          </tr></thead>
          <tbody></tbody>
        </table>
        <div id="byRouteEmpty"></div>
      </div>
    </section>
  </div>
</div>
`;
var USAGE_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    stamp: document.getElementById("stamp"),
    fDay: document.getElementById("fDay"),
    fModel: document.getElementById("fModel"),
    fKey: document.getElementById("fKey"),
    fRoute: document.getElementById("fRoute"),
    fStatus: document.getElementById("fStatus"),
    apply: document.getElementById("apply"),
    reset: document.getElementById("reset"),
    byModel: document.getElementById("byModel"),
    byKey: document.getElementById("byKey"),
    byDay: document.getElementById("byDay"),
    byRoute: document.getElementById("byRoute"),
    byModelMeta: document.getElementById("byModelMeta"),
    byKeyMeta: document.getElementById("byKeyMeta"),
    byDayMeta: document.getElementById("byDayMeta"),
    byRouteMeta: document.getElementById("byRouteMeta"),
    log: document.getElementById("log"),
    logMeta: document.getElementById("logMeta"),
    pager: document.getElementById("pager"),
    refresh: document.getElementById("refreshBtn"),
    csv: document.getElementById("csvBtn"),
    auto: document.getElementById("auto"),
    err: document.getElementById("err")
  };

  var state = { page: 1, size: 25, filter: { day: "", model: "", key: "", route: "", status: "" }, timer: null };

  function writeUrl() {
    GX.url.write({
      day: state.filter.day,
      model: state.filter.model,
      key: state.filter.key,
      route: state.filter.route,
      status: state.filter.status,
      page: state.page > 1 ? state.page : ""
    });
  }

  function readUrl() {
    var params = GX.url.read();
    state.filter.day = params.day || "";
    state.filter.model = params.model || "";
    state.filter.key = params.key || "";
    state.filter.route = params.route || "";
    state.filter.status = params.status || "";
    state.page = Number(params.page) || 1;
  }

  function query() {
    var q = ["page=" + state.page, "pageSize=" + state.size];
    for (var k in state.filter) {
      if (state.filter[k]) q.push(k + "=" + encodeURIComponent(state.filter[k]));
    }
    return "/pengatur/logs/data?" + q.join("&");
  }

  function filterQuery() {
    var q = [];
    for (var k in state.filter) {
      if (state.filter[k]) q.push(k + "=" + encodeURIComponent(state.filter[k]));
    }
    return q.length ? "?" + q.join("&") : "";
  }

  function fillSelect(sel, items) {
    var keep = sel.value;
    var seen = {};
    sel.textContent = "";
    sel.appendChild(GX.el("option", { value: "", text: "all" }));
    (items || []).forEach(function (item) {
      var v = item.key;
      if (!v || seen[v]) return;
      seen[v] = true;
      sel.appendChild(GX.el("option", { value: v, text: v }));
    });
    sel.value = keep;
  }

  function renderKpis(data) {
    var t = data.totals || {};
    el.kpis.textContent = "";
    el.kpis.appendChild(GX.kpi("Errors", GX.fmt.num(t.errors), t.requests ? ((t.errors / t.requests) * 100).toFixed(1) + "% of traffic" : "no traffic yet", t.errors ? "bad" : "ok"));
    el.kpis.appendChild(GX.kpi("Requests", GX.fmt.num(t.requests), data.mode + " ring, capacity " + GX.fmt.num(data.capacity)));
    el.kpis.appendChild(GX.kpi("Rotated", GX.fmt.num(t.rotated), "keys handed over"));
    el.kpis.appendChild(GX.kpi("Latency", GX.fmt.num(t.avgLatencyMs) + " ms", "average per request"));
    el.kpis.appendChild(GX.kpi("Prompt tokens", GX.fmt.compact(t.promptTokens), "input side"));
    el.kpis.appendChild(GX.kpi("Output tokens", GX.fmt.compact(t.completionTokens), "completion side"));
    el.kpis.appendChild(GX.kpi("Estimated cost", GX.fmt.money(t.costUsd), "in this view"));
  }

  function renderBuckets(table, emptyId, metaId, buckets, cols) {
    var body = table.querySelector("tbody");
    body.textContent = "";
    var empty = document.getElementById(emptyId);
    document.getElementById(metaId).textContent = buckets.length + (buckets.length === 1 ? " row" : " rows");
    GX.tableState(
      table,
      empty,
      !buckets.length,
      GX.state("empty", "No traffic in this view", "Send a request through the gateway and it shows up here.")
    );
    if (!buckets.length) return;
    buckets.forEach(function (b) {
      var tr = GX.el("tr");
      cols.forEach(function (c) {
        /* A column may carry a node (the provider badge) instead of text. */
        if (c.node) {
          var nodeCell = GX.el("td", { "data-l": c.label || null });
          nodeCell.appendChild(c.node(b));
          tr.appendChild(nodeCell);
          return;
        }
        var value = c.fmt ? c.fmt(b[c.k], b) : b[c.k];
        GX.cell(tr, value === undefined || value === null ? "-" : String(value), c.num ? "num" : "", c.label);
      });
      body.appendChild(tr);
    });
  }

  function renderLog(rows) {
    var body = el.log.querySelector("tbody");
    body.textContent = "";
    var empty = document.getElementById("logEmpty");
    GX.tableState(
      el.log,
      empty,
      !rows.length,
      GX.state("empty", "No request matches", "Loosen the filter or send traffic through the gateway.")
    );
    if (!rows.length) return;
    rows.forEach(function (r) {
      var tr = GX.el("tr");
      GX.cell(tr, GX.fmt.stamp(r.ts), "mono nowrap", "time");
      GX.cell(tr, r.route, "mono", "route");
      GX.cell(tr, r.model || "-", "mono", "model");
      /* The ledger records the provider; the model-name heuristic is only
         the fallback for rows written before that column existed. */
      var provCell = GX.el("td", { "data-l": "provider" });
      provCell.appendChild(GX.providerTag(r.provider || GX.providerFromModel(r.model)));
      tr.appendChild(provCell);
      GX.cell(tr, r.keyMasked || "-", "mono", "key");
      var statusCell = GX.el("td", { "data-l": "status" });
      statusCell.appendChild(GX.tag(String(r.status) + (r.errorCode ? " " + r.errorCode : ""), r.ok ? "ok" : "bad"));
      if (r.rotated) statusCell.appendChild(GX.el("span", { class: "tag info", text: "rotated", style: "margin-left:6px" }));
      tr.appendChild(statusCell);
      GX.cell(tr, GX.fmt.num(r.promptTokens), "num", "prompt");
      GX.cell(tr, GX.fmt.num(r.completionTokens), "num", "output");
      GX.cell(tr, GX.fmt.num(r.totalTokens), "num", "total");
      GX.cell(tr, GX.fmt.money(r.costUsd), "num", "cost");
      GX.cell(tr, GX.fmt.num(r.latencyMs), "num", "ms");
      body.appendChild(tr);
    });
  }

  function renderPager(data) {
    el.pager.textContent = "";
    var total = data.totalRows;
    var pages = Math.max(1, Math.ceil(total / data.pageSize));
    el.pager.appendChild(GX.el("span", {
      text: total === 0
        ? "0 rows"
        : "rows " + ((data.page - 1) * data.pageSize + 1) + "-" + Math.min(total, data.page * data.pageSize) + " of " + total
    }));
    if (pages <= 1) return;

    var box = GX.el("div", { class: "pages" });
    function pageBtn(label, n, active, disabled) {
      var b = GX.el("button", {
        class: active ? "active" : "",
        type: "button",
        text: label,
        disabled: disabled ? true : null
      });
      if (active) b.setAttribute("aria-current", "page");
      if (!active && !disabled) b.addEventListener("click", function () { state.page = n; load(); });
      box.appendChild(b);
    }
    pageBtn("first", 1, false, data.page === 1);
    pageBtn("prev", data.page - 1, false, data.page === 1);
    var lo = Math.max(1, data.page - 2);
    var hi = Math.min(pages, lo + 4);
    lo = Math.max(1, hi - 4);
    for (var p = lo; p <= hi; p++) pageBtn(String(p), p, p === data.page, false);
    pageBtn("next", data.page + 1, false, data.page === pages);
    pageBtn("last", pages, false, data.page === pages);
    el.pager.appendChild(box);
  }

  function paint(data) {
    renderKpis(data);
    fillSelect(el.fDay, data.byDay);
    fillSelect(el.fModel, data.byModel);
    fillSelect(el.fKey, data.byKey);
    fillSelect(el.fRoute, data.byRoute);

    renderBuckets(el.byModel, "byModelEmpty", "byModelMeta", data.byModel || [], [
      { k: "key", label: "model" },
      { label: "provider", node: function (b) { return GX.providerTag(b.provider || GX.providerFromModel(b.key)); } },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "cachedTokens", num: true, label: "cached" },
      { k: "costUsd", num: true, fmt: GX.fmt.money, label: "cost" },
      { k: "avgLatencyMs", num: true, label: "ms" }
    ]);

    renderBuckets(el.byKey, "byKeyEmpty", "byKeyMeta", data.byKey || [], [
      { k: "key", label: "key" },
      { label: "provider", node: function (b) { return GX.providerTag(b.provider); } },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "rotated", num: true, label: "rot" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "costUsd", num: true, fmt: GX.fmt.money, label: "cost" },
      { k: "avgLatencyMs", num: true, label: "ms" }
    ]);

    renderBuckets(el.byDay, "byDayEmpty", "byDayMeta", data.byDay || [], [
      { k: "key", label: "day" },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "costUsd", num: true, fmt: GX.fmt.money, label: "cost" }
    ]);

    renderBuckets(el.byRoute, "byRouteEmpty", "byRouteMeta", data.byRoute || [], [
      { k: "key", label: "route" },
      { k: "requests", num: true, label: "req" },
      { k: "errors", num: true, label: "err" },
      { k: "rotated", num: true, label: "rot" },
      { k: "promptTokens", num: true, label: "prompt" },
      { k: "completionTokens", num: true, label: "output" },
      { k: "costUsd", num: true, fmt: GX.fmt.money, label: "cost" },
      { k: "avgLatencyMs", num: true, label: "ms" }
    ]);

    renderLog(data.rows || []);
    renderPager(data);
    el.logMeta.textContent = (data.rows || []).length + " rows on this page";
    el.stamp.textContent = "updated " + new Date().toLocaleTimeString("en-GB", { hour12: false });
  }

  function load() {
    return GX.api(query())
      .then(function (data) {
        GX.say(el.err, "");
        paint(data);
        el.console.hidden = false;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        GX.say(el.err, err.message, "err");
        el.console.hidden = false;
      });
  }

  function reload() {
    return load().catch(function () {});
  }

  function exportCsv() {
    GX.busy(el.csv, "Exporting\u2026");
    GX.download("/pengatur/logs/export.csv" + filterQuery(), "omniproxy-usage.csv")
      .catch(function (err) { GX.say(el.err, err.message, "err"); })
      .then(function () { GX.idle(el.csv); });
  }

  el.apply.addEventListener("click", function () {
    state.filter.day = el.fDay.value;
    state.filter.model = el.fModel.value;
    state.filter.key = el.fKey.value;
    state.filter.route = el.fRoute.value;
    state.filter.status = el.fStatus.value;
    state.page = 1;
    writeUrl();
    load();
  });
  el.reset.addEventListener("click", function () {
    state.filter = { day: "", model: "", key: "", route: "", status: "" };
    el.fDay.value = "";
    el.fModel.value = "";
    el.fKey.value = "";
    el.fRoute.value = "";
    el.fStatus.value = "";
    state.page = 1;
    writeUrl();
    load();
  });
  el.refresh.addEventListener("click", function () { reload(); });
  el.csv.addEventListener("click", exportCsv);
  el.auto.addEventListener("change", function () {
    if (state.timer) { state.timer(); state.timer = null; }
    if (el.auto.checked) state.timer = GX.every(60000, reload);
  });

  GX.shortcuts({
    refresh: "refreshBtn",
    onEscape: function () {
      if (!state.filter.day && !state.filter.model && !state.filter.key && !state.filter.route && !state.filter.status) return;
      state.filter = { day: "", model: "", key: "", route: "", status: "" };
      el.fDay.value = "";
      el.fModel.value = "";
      el.fKey.value = "";
      el.fRoute.value = "";
      el.fStatus.value = "";
      state.page = 1;
      writeUrl();
      load();
    }
  });

  GX.gate({
    onSuccess: function () {
      readUrl();
      return load();
    }
  });
})();
`;
var USAGE_HTML = consolePage({
  title: "Logs",
  active: "/pengatur/logs",
  actions: '<button id="csvBtn" class="btn btn-sm" type="button">' + icon("download") + 'Export CSV</button><button id="refreshBtn" class="btn btn-sm" type="button">' + icon("refresh") + "Refresh</button>",
  body: USAGE_BODY,
  script: USAGE_SCRIPT
});

// src/keys-ui.ts
var KEYS_BODY = `

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
  <div class="u-mt-3" id="provSplit"></div>

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

    <div id="keysBody" class="table-wrap">${stateBlock("loading", "Loading the pool\u2026")}</div>

    <div class="panel-foot">
      <div id="keyPager" class="pager u-full"></div>
    </div>
  </section>
</div>

${confirmDialog()}

<dialog id="addDialog" aria-labelledby="addTitle">
  <form id="addForm" method="dialog">
    <div class="card-head">
      <div class="card-title">
        <h2 id="addTitle">Add keys</h2>
        <span class="card-sub">Paste one key per line. Every key is probed before it joins the pool.</span>
      </div>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm icon-btn" type="button" id="addClose" aria-label="Close">${icon("close")}</button>
    </div>
    <div class="card-body">
      <div class="form-grid">
        <div class="span-2">
          <label class="field" for="newProvider">Provider</label>
          <select id="newProvider" class="select"></select>
          <p class="hint u-mt-1" id="newProviderHint"></p>
        </div>
        <div class="span-2">
          <label class="field" for="newKeys">Keys</label>
          <textarea id="newKeys" spellcheck="false" placeholder="key one&#10;key two"></textarea>
          <p class="hint u-mt-1">One per line, or separated by commas. Raw values are never returned by the API: the console only ever holds the id and the masked form.</p>
        </div>
      </div>
      <div id="addMsg" class="notice u-mt-3" role="status" aria-live="polite"></div>
    </div>
    <div class="card-foot">
      <span id="addCount" class="hint"></span>
      <span class="spacer"></span>
      <button id="addCancel" class="btn" type="button">Cancel</button>
      <button id="addSubmit" class="btn btn-primary" type="submit">Add to pool</button>
    </div>
  </form>
</dialog>
`;
var KEYS_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    provSplit: document.getElementById("provSplit"),
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
    addCancel: document.getElementById("addCancel"),
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
    return parts.join(" \xB7 ");
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
    return text.slice(0, text.length - 3) + "\u2026";
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
        opt.textContent = ids[p] ? name + " \xB7 " + ids[p] : name;
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
        var caps = registry[p] && registry[p].caps.length ? " \xB7 " + registry[p].caps.join("/") : "";
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
      el.newProviderHint.textContent = "Each key is matched to a provider by its format (AIza\u2026 Google, sk_\u2026 ElevenLabs, sk-\u2026 OpenAI-compatible gateways).";
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
    el.provSplit.textContent = "";
    el.kpis.appendChild(GX.kpi("Ready", GX.fmt.num(pool.ready), "selectable right now", "ok"));
    el.kpis.appendChild(GX.kpi("Cooling", GX.fmt.num(pool.cooling), "waiting out a quota", pool.cooling ? "warn" : ""));
    el.kpis.appendChild(GX.kpi("Dead", GX.fmt.num(pool.dead), "revoked or no quota", pool.dead ? "bad" : ""));
    el.kpis.appendChild(GX.kpi("Keys in pool", GX.fmt.num(pool.total), pool.degraded ? "degraded" : "across every provider"));
    /* Per-provider counts, in each provider's colour. A multi-provider pool
       is several pools wearing one number; the split is the first thing
       asked. It used to be one card per provider, which read as four
       unrelated numbers and pushed the table a row further down \u2014 the pool
       is one pool, so the split is one surface holding every provider. */
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
      return hit && hit.label ? hit.label : p;
    };
    var names = Object.keys(byProvider).sort(function (a, b) {
      if (a === b) return 0;
      return a === "gemini" ? -1 : b === "gemini" ? 1 : a < b ? -1 : 1;
    });
    if (names.length) {
      var cells = names.map(function (p) {
        var snap = byProvider[p] || {};
        var total = Number(snap.total) || 0;
        var ready = Number(snap.ready) || 0;
        var pct = total ? Math.max(0, Math.min(100, (ready / total) * 100)) : 0;
        var cell = GX.el("div", { class: "split-cell", "data-tone": tone(p) }, [
          GX.el("span", { class: "split-name", text: label(p) }),
          GX.el("span", { class: "split-count" }, [
            GX.el("b", { text: GX.fmt.num(ready) }),
            GX.el("span", { text: "/" + GX.fmt.num(total) })
          ]),
          GX.el("span", { class: "split-bar", role: "presentation" },
            GX.el("i", { style: "width:" + pct.toFixed(0) + "%" }))
        ]);
        cell.title = ready + " of " + total + " " + label(p) + " keys are ready";
        return cell;
      });
      el.provSplit.appendChild(GX.el("div", { class: "prov-split" }, [
        GX.el("span", { class: "split-head", text: "By provider" }),
        GX.el("div", { class: "split-cells" }, cells)
      ]));
    }
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
    box.appendChild(mk("\u2039", state.page - 1, state.page === 1, false, "Previous page"));
    var win = 5;
    var from = Math.max(1, state.page - Math.floor(win / 2));
    var to = Math.min(pages, from + win - 1);
    from = Math.max(1, to - win + 1);
    if (from > 1) {
      box.appendChild(mk("1", 1, false, state.page === 1));
      if (from > 2) box.appendChild(GX.el("span", { class: "gap", text: "\u2026", "aria-hidden": "true" }));
    }
    for (var p = from; p <= to; p++) box.appendChild(mk(String(p), p, false, p === state.page));
    if (to < pages) {
      if (to < pages - 1) box.appendChild(GX.el("span", { class: "gap", text: "\u2026", "aria-hidden": "true" }));
      box.appendChild(mk(String(pages), pages, false, state.page === pages));
    }
    box.appendChild(mk("\u203A", state.page + 1, state.page === pages, false, "Next page"));
    el.keyPager.appendChild(box);
  }

  /* The plan is what the upstream answer proves, so a bulk action asks the
     upstream rather than declaring a tier. There is no operator dropdown. */
  function validateSelectedPlans(control) {
    var ids = selectedIds();
    if (!ids.length) { GX.notice("Select at least one key.", "err"); return; }
    GX.busy(control, "Validating\u2026");
    GX.api("/pengatur/keys/validate-plan", { method: "POST", body: { ids: ids } })
      .then(function (data) {
        var list = (data && (data.results || data.keys)) || [];
        var ok = 0, failed = 0, skipped = 0;
        list.forEach(function (row) {
          if (!row) return;
          if (row.error) failed += 1;
          else if (row.planValidated) ok += 1;
          else skipped += 1;
        });
        if (!list.length) ok = data && data.updated ? data.updated : 0;
        var note = "Validated " + ok + " key(s)";
        if (skipped) note += ", " + skipped + " have no published plan";
        if (failed) note += ", " + failed + " could not be read";
        GX.notice(note + ".", failed ? "warn" : skipped ? "warn" : "ok");
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
    GX.busy(btn, "Validating\u2026");
    GX.api("/pengatur/keys/validate-plan", { method: "POST", body: { ids: [k.id] } })
      .then(function (data) {
        var row = pickValidation(data, k.id);
        if (row.error) { GX.notice(k.key + ": " + row.error, "err"); return; }
        /* "tier" is always present and "unknown" is still a value, so the
           verdict gates the message: a provider that publishes no plan must
           not be reported as if it had declared "Unspecified". */
        if (row.planValidated && (row.plan || row.tier)) {
          GX.notice(k.key + ": plan is " + tierLabel(row.plan || row.tier) + ".", "ok");
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
    return k.key + ": " + parts.join(" \xB7 ");
  }

  function purgeDead() {
    GX.confirm({
      title: "Purge dead keys?",
      message: "Delete every retired key (invalid or leaked). Quota-exhausted keys are live and stay.",
      confirmLabel: "Purge dead keys"
    }).then(function (ok) {
      if (!ok) return;
      GX.busy(el.purgeDeadBtn, "Purging\u2026");
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
    GX.busy(el.testAllBtn, "Testing\u2026");
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
    GX.busy(el.bulkRemove, "Removing\u2026");
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
    var keys = raw.split(/[s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!keys.length) { GX.say(el.addMsg, "Nothing to add.", "err"); return; }
    GX.busy(el.addSubmit, "Adding\u2026");
    GX.api("/pengatur/keys", { method: "POST", body: { keys: keys, provider: provider } })
      .then(function (data) {
        el.newKeys.value = "";
        el.addCount.textContent = "";
        var byProvider = data.providers || {};
        var split = Object.keys(byProvider).map(function (p) { return p + " \xD7" + byProvider[p]; }).join(", ");
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
  if (el.addCancel) el.addCancel.addEventListener("click", function () { GX.closeDialog(el.addDialog); });
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
var DETAIL_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Govern \xB7 Key</span>
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
        <code class="credential-value" id="keyRaw">\u2026</code>
        <button class="btn btn-sm" id="keyCopy" type="button">${icon("copy")}Copy</button>
      </div>
    </div>
  </section>

  <div class="grid grid-2 u-mt-4">
    <section class="panel">
      <div class="panel-head">
        <h2>State</h2>
        <span class="meta" id="stateNote"></span>
      </div>
      <div class="panel-body">
        <dl class="defs" id="summary"></dl>
      </div>
    </section>

    <section class="panel" id="eventsPanel">
      <div class="panel-head">
        <h2>Cooldown timeline</h2>
        <span class="meta" id="cooldownNote"></span>
      </div>
      <div id="eventsFeed" class="feed"></div>
    </section>
  </div>

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


  <p class="hint u-mt-3" id="noHistory"></p>
</div>
`;
var DETAIL_SCRIPT = `
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
    return parts.join(" \xB7 ");
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
    return (detailMasked ? detailMasked + ": " : "") + parts.join(" \xB7 ");
  }

  /* Relative cooldown plus the absolute reset moment beside it. The detail
     endpoint carries both: cooldownLeftMs (the wait) and cooldownUntil (the
     instant). With no live cooldown the row keeps its old single value. */
  function cooldownText(k) {
    var rel = GX.fmt.left(k.cooldownLeftMs);
    if (k.cooldownLeftMs && k.cooldownUntil) {
      var abs = whenText(k.cooldownUntil);
      if (abs) return rel + " \xB7 until " + abs;
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
        GX.el("span", { class: "what", text: e.errorCode ? e.errorCode + (e.rotated ? " \xB7 rotated to another key" : "") : (e.rotated ? "rotated to another key" : "failed") }),
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
    el.keyPath.appendChild(document.createTextNode(" \xB7 id " + k.id));
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
var KEYS_HTML = consolePage({
  title: "Keys",
  active: "/pengatur/keys",
  actions: '<button id="refreshBtn" class="btn btn-sm" type="button">' + icon("refresh") + 'Refresh</button><button id="addBtn" class="btn btn-sm btn-primary" type="button">' + icon("plus") + "Add keys</button>",
  body: KEYS_BODY,
  script: KEYS_SCRIPT
});
var KEY_DETAIL_HTML = consolePage({
  title: "Key",
  active: "/pengatur/keys",
  body: DETAIL_BODY,
  script: DETAIL_SCRIPT
});

// src/providers-ui.ts
var CAPABILITY_OPTIONS = [
  { id: "llm", label: "Chat", hint: "completions, tools" },
  { id: "tts", label: "Speech", hint: "text to audio" },
  { id: "image", label: "Image", hint: "image generation" },
  { id: "video", label: "Video", hint: "video generation" },
  { id: "embeddings", label: "Embeddings", hint: "vector search" }
];
var PROVIDERS_BODY = `

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
    <div class="panel-body">
      <div class="toolbar">
        <div class="filter-grid">
          <div class="filter-cell filter-search">
            <label class="field" for="pFilter">Search</label>
            <div class="search">
              ${icon("search", "icon", 14)}
              <input id="pFilter" class="input" type="search" spellcheck="false" placeholder="id, label or base URL">
            </div>
          </div>
          <div class="filter-cell">
            <label class="field" for="pState">State</label>
            <select id="pState" class="select">
              <option value="">all</option>
              <option value="enabled">enabled</option>
              <option value="disabled">disabled</option>
            </select>
          </div>
          <div class="filter-cell">
            <button id="pReset" class="btn btn-sm" type="button" hidden>Reset filters</button>
          </div>
        </div>
      </div>
    </div>
    <div id="body" class="table-wrap">${stateBlock("loading", "Loading the registry\u2026")}</div>
    <div class="panel-foot">
      <p class="hint">A provider is routable by naming its models as <code>provider/model</code> (for example <code>whatstoken/deepseek-v4.1-flash-1017</code>). A bare model id is resolved through the provider's own catalog.</p>
    </div>
  </section>
</div>

${confirmDialog()}

<dialog id="providerDialog" class="wide" aria-labelledby="providerDialogTitle">
  <form id="providerForm" method="dialog">
    <div class="card-head">
      <div class="card-title">
        <h2 id="providerDialogTitle">Add provider</h2>
        <span class="card-sub" id="providerDialogSub">An OpenAI-compatible upstream the gateway can route to.</span>
      </div>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm icon-btn" type="button" id="providerClose" aria-label="Close">${icon("close")}</button>
    </div>

    <div class="card-body">
      <div class="modal-split">
        <section class="form-section">
          <h3 class="form-h">Identity</h3>
          <div class="form-grid">
            <div>
              <label class="field" for="pLabel">Label</label>
              <input id="pLabel" class="input" type="text" spellcheck="false" autocomplete="off" placeholder="My Gateway">
            </div>
            <div>
              <label class="field" for="pId">Id</label>
              <input id="pId" class="input mono" type="text" spellcheck="false" autocomplete="off" placeholder="my-gateway">
            </div>
            <div class="span-2">
              <label class="field" for="pBaseUrl">Base URL</label>
              <input id="pBaseUrl" class="input mono" type="url" spellcheck="false" autocomplete="off" placeholder="https://api.example.com/v1">
              <p class="hint u-mt-1">The id is the <code>provider/</code> route prefix: lowercase letters, digits and dashes.</p>
            </div>
            <div class="span-2">
              <label class="field" for="pKeyPattern">Key format <span class="hint">(optional)</span></label>
              <input id="pKeyPattern" class="input mono" type="text" spellcheck="false" autocomplete="off" placeholder="^sk-[A-Za-z0-9_-]{16,}$">
              <p class="hint u-mt-1">A regex that recognises this provider's keys, so a pasted key lands in the right pool.</p>
            </div>
            <div class="span-2">
              <label class="field" for="pNote">Note</label>
              <input id="pNote" class="input" type="text" spellcheck="false" autocomplete="off" placeholder="what this upstream is for">
            </div>
          </div>
        </section>

        <section class="form-section">
          <fieldset class="cap-set">
            <legend class="form-h">Capabilities</legend>
            <div class="cap-list" id="pCaps">
              ${CAPABILITY_OPTIONS.map(
  (c) => '<label class="cap" for="pCap-' + c.id + '"><input id="pCap-' + c.id + '" type="checkbox" value="' + c.id + '"><span class="cap-box" aria-hidden="true"></span><span class="cap-name">' + c.label + '</span><span class="cap-hint">' + c.hint + "</span></label>"
).join("")}
            </div>
            <p class="hint u-mt-2">A route refuses a provider without the capability it needs.</p>
          </fieldset>

          <div class="form-row u-mt-4">
            <h3 class="form-h">Models</h3>
            <button id="pImport" class="btn btn-sm" type="button">${icon("download")}Import</button>
          </div>
          <textarea id="pModels" spellcheck="false" rows="5" placeholder="deepseek-v4.1-flash-1017&#10;gpt-4o"></textarea>
          <p class="hint u-mt-1" id="pImportHint">One model id per line. A bare id resolves here.</p>

          <div id="pKeysRow">
            <h3 class="form-h u-mt-4">First keys <span class="hint">(optional)</span></h3>
            <textarea id="pKeys" spellcheck="false" rows="3" placeholder="sk-\u2026"></textarea>
            <p class="hint u-mt-1">Added to the pool under this provider in the same step.</p>
          </div>
        </section>
      </div>

      <div id="pMsg" class="notice u-mt-3" role="status" aria-live="polite"></div>
    </div>

    <div class="card-foot">
      <span id="pCount" class="hint"></span>
      <span class="spacer"></span>
      <button id="providerCancel" class="btn" type="button">Cancel</button>
      <button id="pSubmit" class="btn btn-primary" type="submit">Add provider</button>
    </div>
  </form>
</dialog>
`;
var PROVIDERS_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    listMeta: document.getElementById("listMeta"),
    countMeta: document.getElementById("countMeta"),
    body: document.getElementById("body"),
    filter: document.getElementById("pFilter"),
    stateSel: document.getElementById("pState"),
    resetBtn: document.getElementById("pReset"),
    reloadBtn: document.getElementById("reloadBtn"),
    addBtn: document.getElementById("addBtn"),
    dialog: document.getElementById("providerDialog"),
    form: document.getElementById("providerForm"),
    dialogTitle: document.getElementById("providerDialogTitle"),
    closeBtn: document.getElementById("providerClose"),
    cancelBtn: document.getElementById("providerCancel"),
    subtitle: document.getElementById("providerDialogSub"),
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
    importHint: document.getElementById("pImportHint"),
    submit: document.getElementById("pSubmit"),
    count: document.getElementById("pCount"),
    msg: document.getElementById("pMsg")
  };

  var state = { providers: [], editId: "", q: "", st: "" };

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

  /* Registry filters, following the Keys page: search matches id, label or
     base URL; state matches the enabled flag; both persist to the URL so a
     filtered view is a shareable link and survives a reload. KPIs stay
     registry totals; only the table and its count narrow. */
  function filtersActive() { return Boolean(state.q || state.st); }

  function visibleProviders() {
    return state.providers.filter(function (p) {
      if (state.st === "enabled" && !p.enabled) return false;
      if (state.st === "disabled" && p.enabled) return false;
      if (state.q) {
        var hay = ((p.id || "") + " " + (p.label || "") + " " + (p.baseUrl || "")).toLowerCase();
        if (hay.indexOf(state.q) < 0) return false;
      }
      return true;
    });
  }

  function writeUrl() {
    GX.url.write({ q: state.q, state: state.st });
  }

  function readUrl() {
    var params = GX.url.read();
    state.q = (params.q || "").toLowerCase();
    state.st = params.state === "enabled" || params.state === "disabled" ? params.state : "";
    if (el.filter) el.filter.value = params.q || "";
    if (el.stateSel) el.stateSel.value = state.st;
  }

  function applyFilters() {
    writeUrl();
    drawTable();
  }

  function drawTable() {
    el.body.textContent = "";
    if (!state.providers.length) {
      el.body.appendChild(GX.state("empty", "No providers", "The registry is empty."));
      el.countMeta.textContent = "0 providers";
      if (el.resetBtn) el.resetBtn.hidden = true;
      return;
    }
    var visible = visibleProviders();
    if (!visible.length) {
      el.body.appendChild(GX.state("empty", "No matches", "No provider matches the current filters."));
      el.countMeta.textContent = "0 of " + state.providers.length + " providers";
      if (el.resetBtn) el.resetBtn.hidden = !filtersActive();
      return;
    }
    var table = GX.el("table", { class: "table providers-table" });
    table.appendChild(GX.el("thead", null, tableHead()));
    var body = GX.el("tbody");
    visible.forEach(function (p) {
      var tr = GX.el("tr", { "data-provider": p.id });

      /* One line per cell: the badge already names the provider, so the
         second line only ever repeated it. The label stays as the title. */
      var prov = GX.el("td", { "data-l": "provider" }, [
        GX.el("div", { class: "cell-inline" }, [
          GX.providerTag(p.id),
          GX.el("span", { class: "sub", text: p.builtin ? "builtin" : "custom" })
        ])
      ]);
      prov.title = (p.label || p.id) + (p.builtin ? " \xB7 built in, model list only" : "");
      tr.appendChild(prov);

      /* Base URL is the column. The wire type is already carried by the
         provider id and the edit sheet, so repeating it as a tag here only
         stole width from the URL. The full value stays in the title. */
      var urlCell = GX.el("td", { "data-l": "base url" });
      var urlText = GX.el("div", {
        class: "sub mono trunc",
        text: p.baseUrl || "runtime-resolved"
      });
      urlText.title = p.baseUrl || "Built-in provider: the base URL is resolved at request time";
      urlCell.appendChild(urlText);
      tr.appendChild(urlCell);

      var caps = GX.el("td", { "data-l": "caps" });
      (p.capabilities || []).forEach(function (c) { caps.appendChild(capTag(c)); });
      if (!(p.capabilities || []).length) caps.appendChild(GX.el("span", { class: "sub", text: "none" }));
      tr.appendChild(caps);

      var keysCell = GX.el("td", { class: "u-tnum num", "data-l": "keys" });
      keysCell.appendChild(GX.el("a", {
        class: "link",
        href: "/pengatur/keys?provider=" + encodeURIComponent(p.id),
        text: (p.ready || 0) + "/" + (p.keys || 0)
      }));
      tr.appendChild(keysCell);
      var modelsCell = GX.el("td", { class: "u-tnum num", "data-l": "models" });
      modelsCell.appendChild(GX.el("a", {
        class: "link",
        href: "/pengatur/models?provider=" + encodeURIComponent(p.id),
        text: String((p.models || []).length)
      }));
      tr.appendChild(modelsCell);
      tr.appendChild(GX.el("td", { "data-l": "state" }, [
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
    el.countMeta.textContent = filtersActive()
      ? visible.length + " of " + state.providers.length + " providers"
      : state.providers.length + " provider" + (state.providers.length === 1 ? "" : "s");
    if (el.resetBtn) el.resetBtn.hidden = !filtersActive();
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

  var IMPORT_HINT = "One model id per line. A bare id resolves here.";

  function resetDialog() {
    el.form.reset();
    state.editId = "";
    el.dialogTitle.textContent = "Add provider";
    if (el.subtitle) el.subtitle.textContent = "An OpenAI-compatible upstream the gateway can route to.";
    el.submit.textContent = "Add provider";
    el.id.disabled = false;
    el.keysRow.hidden = false;
    el.count.textContent = "";
    if (el.importHint) el.importHint.textContent = IMPORT_HINT;
    GX.say(el.msg, "");
  }

  function openDialog(p) {
    resetDialog();
    if (p) {
      state.editId = p.id;
      el.dialogTitle.textContent = "Edit " + p.label;
      if (el.subtitle) el.subtitle.textContent = p.builtin
        ? "Built in: the console curates its models and its enabled flag."
        : "Change what this upstream is called, where it lives and what it may serve.";
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
      /* A disabled Import used to carry no explanation. The button's state
         rule is unchanged; only the reason is now visible. */
      if (el.importHint) el.importHint.textContent = p.wire !== "openai"
        ? "Import is available for OpenAI-compatible wires only."
        : "";
    } else {
      Array.prototype.forEach.call(el.caps.querySelectorAll("input"), function (box) {
        box.disabled = false;
      });
      el.label.disabled = false;
      el.baseUrl.disabled = false;
      el.keyPattern.disabled = false;
      el.importBtn.disabled = true;
      if (el.importHint) el.importHint.textContent = "Import is available after the provider is saved.";
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
    GX.busy(el.submit, "Saving\u2026");
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

  /* Import overwrites the textarea, so a non-empty list goes through the
     shared confirm dialog first; an empty list imports straight away. The
     fetch itself is untouched. */
  function importModels() {
    if (!state.editId) return;
    if (!el.models.value.trim()) { importModelsNow(); return; }
    GX.confirm({
      title: "Replace the model list?",
      message: "Import from /v1/models will replace the current model list. Review and save after import.",
      confirmLabel: "Replace and import"
    }).then(function (ok) { if (ok) importModelsNow(); });
  }

  function importModelsNow() {
    if (!state.editId) return;
    GX.busy(el.importBtn, "Importing\u2026");
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

  if (el.filter) el.filter.addEventListener("input", function () {
    state.q = el.filter.value.trim().toLowerCase();
    applyFilters();
  });
  if (el.stateSel) el.stateSel.addEventListener("change", function () {
    state.st = el.stateSel.value;
    applyFilters();
  });
  if (el.resetBtn) el.resetBtn.addEventListener("click", function () {
    state.q = "";
    state.st = "";
    if (el.filter) el.filter.value = "";
    if (el.stateSel) el.stateSel.value = "";
    applyFilters();
  });

  el.addBtn.addEventListener("click", function () { openDialog(null); });
  el.closeBtn.addEventListener("click", function () { GX.closeDialog(el.dialog); });
  if (el.cancelBtn) el.cancelBtn.addEventListener("click", function () { GX.closeDialog(el.dialog); });
  el.submit.addEventListener("click", function (ev) { ev.preventDefault(); submitDialog(); });
  el.importBtn.addEventListener("click", importModels);
  el.models.addEventListener("input", countModels);
  el.reloadBtn.addEventListener("click", function () { reload(); });

  GX.shortcuts({ refresh: "reloadBtn" });
  readUrl();
  GX.gate({ onSuccess: reload });
})();
`;
var PROVIDERS_HTML = consolePage({
  title: "Providers",
  active: "/pengatur/providers",
  body: PROVIDERS_BODY,
  script: PROVIDERS_SCRIPT
});

// src/app.ts
init_keys_repo();

// src/settings-ui.ts
var SETTINGS_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Govern</span>
      <h1 class="page-title">Settings</h1>
      <p class="page-lede">The effective configuration of this deployment. The rotation cap is editable; the rest is deploy-time.</p>
    </div>
  </header>

  ${noticeBand()}

  <div class="figures" id="kpis"></div>

  <div class="grid grid-3">
    <section class="panel">
      <div class="panel-head"><h2>Defaults</h2></div>
      <div class="panel-body"><dl class="defs" id="defaults"></dl></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Limits</h2></div>
      <div class="panel-body"><dl class="defs" id="limits"></dl></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Ledger</h2></div>
      <div class="panel-body"><dl class="defs" id="ledger"></dl></div>
    </section>
  </div>

  <section class="panel">
    <div class="panel-head">
      <h2>Key rotation</h2>
      <span class="meta" id="rotationMeta"></span>
    </div>
    <div class="panel-body">
      <p class="hint">
        How many keys one request may try before the pool gives up. A 429 rotates to the next
        still-valid key and parks the throttled one until its rate-limit window ends, so a
        bigger cap survives more simultaneous throttles at the cost of more upstream calls.
      </p>
      <div class="inline-form u-mt-2">
        <input class="text-input" id="rotationCap" type="number" min="1" max="50" step="1" inputmode="numeric" aria-label="Max key rotation" />
        <button id="rotationSave" class="btn btn-sm btn-primary" type="button">Save</button>
      </div>
      <div id="rotationMsg" class="notice u-mt-2" role="status" aria-live="polite"></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <h2>Client API keys</h2>
      <span class="meta" id="clientKeysMeta"></span>
    </div>
    <div class="panel-body">
      <p class="hint">
        The credential a client sends to <code>/v1</code>. Each key can be revoked on its own, so a
        consumer does not need the deployment-wide token. A key is shown once, when it is created.
      </p>
      <div class="inline-form u-mt-2">
        <input class="text-input" id="clientKeyLabel" type="text" maxlength="80" placeholder="Label (who is it for?)" aria-label="Client key label" />
        <button id="clientKeyCreate" class="btn btn-sm btn-primary" type="button">Create key</button>
      </div>
      <div id="clientKeyMsg" class="notice u-mt-2" role="status" aria-live="polite"></div>

      <div id="clientKeySecret" class="notice u-mt-2" role="status" aria-live="polite" hidden>
        <div class="defs"><div class="def"><dt>New key</dt><dd class="mono" id="clientKeySecretValue"></dd></div></div>
        <div class="inline-form u-mt-2">
          <button id="clientKeyCopy" class="btn btn-sm" type="button">Copy</button>
          <button id="clientKeyDismiss" class="btn btn-sm" type="button">Done</button>
        </div>
      </div>

      <div class="table-wrap scroll-y u-mt-2">
        <table class="table" id="clientKeysTable">
          <thead><tr><th>Key</th><th>Label</th><th>Created</th><th>Last used</th><th>Actions</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <h2>Environment</h2>
      <span class="meta">values are never shown</span>
    </div>
    <div class="table-wrap scroll-y">
      <table class="table" id="envTable">
        <thead><tr><th>Name</th><th>State</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Caveats</h2></div>
    <div class="panel-body">
      <p class="hint" id="note"></p>
      <div id="msg" class="notice u-mt-2" role="status" aria-live="polite"></div>
    </div>
  </section>
</div>
`;
var SETTINGS_SCRIPT = `
(function () {
  "use strict";

  var el = {
    console: document.getElementById("console"),
    kpis: document.getElementById("kpis"),
    defaults: document.getElementById("defaults"),
    limits: document.getElementById("limits"),
    ledger: document.getElementById("ledger"),
    envTable: document.getElementById("envTable"),
    note: document.getElementById("note"),
    msg: document.getElementById("msg"),
    rotationCap: document.getElementById("rotationCap"),
    rotationSave: document.getElementById("rotationSave"),
    rotationMeta: document.getElementById("rotationMeta"),
    rotationMsg: document.getElementById("rotationMsg"),
    clientKeysMeta: document.getElementById("clientKeysMeta"),
    clientKeysTable: document.getElementById("clientKeysTable"),
    clientKeyLabel: document.getElementById("clientKeyLabel"),
    clientKeyCreate: document.getElementById("clientKeyCreate"),
    clientKeyMsg: document.getElementById("clientKeyMsg"),
    clientKeySecret: document.getElementById("clientKeySecret"),
    clientKeySecretValue: document.getElementById("clientKeySecretValue"),
    clientKeyCopy: document.getElementById("clientKeyCopy"),
    clientKeyDismiss: document.getElementById("clientKeyDismiss"),
    refresh: document.getElementById("refreshBtn"),
    exportBtn: document.getElementById("exportBtn")
  };

  function defs(node, obj) {
    node.textContent = "";
    var keys = Object.keys(obj || {});
    if (!keys.length) {
      node.appendChild(GX.state("empty", "Nothing reported", "This group is empty in the current configuration."));
      return 0;
    }
    keys.forEach(function (key) {
      node.appendChild(GX.el("div", { class: "def" }, [
        GX.el("dt", { text: key }),
        GX.el("dd", { text: obj[key] === null || obj[key] === undefined ? "-" : String(obj[key]) })
      ]));
    });
    return keys.length;
  }

  function renderEnv(rows) {
    var body = el.envTable.querySelector("tbody");
    body.textContent = "";
    (rows || []).forEach(function (row) {
      var tr = GX.el("tr");
      GX.cell(tr, row.name, "mono", "name");
      var stateCell = GX.el("td", { "data-l": "state" });
      stateCell.appendChild(GX.tag(row.state === "set" ? "set" : "unset", row.state === "set" ? "ok" : "plain"));
      tr.appendChild(stateCell);
      body.appendChild(tr);
    });
  }

  function rotationMeta(r) {
    el.rotationMeta.textContent = r.stored
      ? "operator override (env default " + r.envDefault + ")"
      : "env default " + r.envDefault;
  }

  function when(ms) {
    if (!ms) return "never";
    return new Date(ms).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function renderClientKeys(d) {
    var body = el.clientKeysTable.querySelector("tbody");
    body.textContent = "";

    var keys = d.keys || [];
    el.clientKeysMeta.textContent = keys.length
      ? keys.length + " key" + (keys.length === 1 ? "" : "s")
      : "none yet";

    if (!keys.length) {
      var tr = GX.el("tr");
      var td = GX.el("td", { colspan: "5" });
      td.appendChild(GX.state(
        "empty",
        "No client keys",
        d.storage
          ? "Create one above, then send it as Authorization: Bearer <key>."
          : "Storage is disabled (no DATABASE_URL), so keys cannot be stored."
      ));
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    keys.forEach(function (k) {
      var row = GX.el("tr");
      GX.cell(row, k.prefix + "\u2026", "mono", "key");
      GX.cell(row, k.label || "-", "", "label");
      GX.cell(row, when(k.createdAt), "", "created");
      GX.cell(row, when(k.lastUsedAt), "", "last used");

      var actions = GX.el("td", { "data-l": "actions" });
      var btn = GX.el("button", { class: "btn btn-sm btn-danger", type: "button", text: "Revoke" });
      btn.addEventListener("click", function () {
        GX.confirm({
          title: "Revoke this key?",
          message: "Any client still using " + k.prefix + "\u2026 will be refused on /v1 immediately.",
          confirmLabel: "Revoke"
        }).then(function (ok) {
          if (!ok) return;
          GX.busy(btn, "Revoking\u2026");
          GX.api("/pengatur/settings/client-keys/" + k.id, { method: "DELETE" })
            .then(function () {
              GX.say(el.clientKeyMsg, "Key " + k.prefix + "\u2026 revoked.", "ok");
              return loadClientKeys();
            })
            .catch(function (err) { GX.say(el.clientKeyMsg, err.message, "err"); })
            .then(function () { GX.idle(btn); });
        });
      });
      actions.appendChild(btn);
      row.appendChild(actions);
      body.appendChild(row);
    });
  }

  function loadClientKeys() {
    return GX.api("/pengatur/settings/client-keys")
      .then(renderClientKeys)
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) return;
        GX.say(el.clientKeyMsg, err.message, "err");
      });
  }

  el.clientKeyCreate.addEventListener("click", function () {
    var label = (el.clientKeyLabel.value || "").trim();
    GX.busy(el.clientKeyCreate, "Creating\u2026");
    GX.api("/pengatur/settings/client-keys", { method: "POST", body: { label: label } })
      .then(function (r) {
        el.clientKeyLabel.value = "";
        el.clientKeySecretValue.textContent = r.raw;
        el.clientKeySecret.hidden = false;
        GX.say(el.clientKeyMsg, "Key created. Copy it now \u2014 it is not shown again.", "ok");
        return loadClientKeys();
      })
      .catch(function (err) { GX.say(el.clientKeyMsg, err.message, "err"); })
      .then(function () { GX.idle(el.clientKeyCreate); });
  });

  el.clientKeyCopy.addEventListener("click", function () {
    var text = el.clientKeySecretValue.textContent || "";
    if (!text) return;
    var done = function () { GX.toast("Key copied.", "ok"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { GX.toast("Copy failed.", "err"); });
    } else {
      GX.toast("Copy unsupported in this browser.", "err");
    }
  });

  el.clientKeyDismiss.addEventListener("click", function () {
    el.clientKeySecretValue.textContent = "";
    el.clientKeySecret.hidden = true;
  });

  function render(d) {
    var nDefaults = defs(el.defaults, d.defaults);
    var nLimits = defs(el.limits, d.limits);
    var nLedger = defs(el.ledger, d.ledger);
    renderEnv(d.env);
    loadClientKeys();

    if (d.rotation) {
      el.rotationCap.value = String(d.rotation.maxKeyAttempts);
      el.rotationCap.min = String(d.rotation.min);
      el.rotationCap.max = String(d.rotation.max);
      rotationMeta(d.rotation);
    }

    el.kpis.textContent = "";
    el.kpis.appendChild(GX.kpi("Defaults", String(nDefaults), "model, voice and search model"));
    el.kpis.appendChild(GX.kpi("Limits", String(nLimits), "cooldown, attempts and timeouts"));
    el.kpis.appendChild(GX.kpi("Ledger", String(nLedger), "batch size, flush and retention"));
    el.kpis.appendChild(GX.kpi("Environment", String((d.env || []).length), "variables read by the process"));

    el.note.textContent = d.note || "";
  }

  function refresh() {
    return GX.api("/pengatur/settings/data")
      .then(function (d) {
        render(d);
        GX.say(el.msg, "");
        el.console.hidden = false;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          GX.lock(err.message + " Re-enter the token.");
          throw err;
        }
        GX.say(el.msg, err.message, "err");
        el.console.hidden = false;
      });
  }

  function reload() {
    return refresh().catch(function () {});
  }

  el.refresh.addEventListener("click", function () { reload(); });
  el.rotationSave.addEventListener("click", function () {
    var n = Number(el.rotationCap.value);
    GX.busy(el.rotationSave, "Saving\u2026");
    GX.api("/pengatur/settings/rotation", { method: "POST", body: { maxKeyAttempts: n } })
      .then(function (r) {
        rotationMeta(r.rotation);
        GX.say(el.rotationMsg, "Rotation cap set to " + r.rotation.maxKeyAttempts + ".", "ok");
      })
      .catch(function (err) { GX.say(el.rotationMsg, err.message, "err"); })
      .then(function () { GX.idle(el.rotationSave); });
  });
  el.exportBtn.addEventListener("click", function () {
    GX.busy(el.exportBtn, "Exporting\u2026");
    GX.download("/pengatur/settings/export", "omniproxy-config.json")
      .catch(function (err) { GX.say(el.msg, err.message, "err"); })
      .then(function () { GX.idle(el.exportBtn); });
  });

  GX.shortcuts({ refresh: "refreshBtn" });
  GX.gate({ onSuccess: refresh });
})();
`;
var SETTINGS_HTML = consolePage({
  title: "Settings",
  active: "/pengatur/settings",
  actions: '<button id="exportBtn" class="btn btn-sm" type="button">' + icon("download") + 'Export JSON</button><button id="refreshBtn" class="btn btn-sm" type="button">' + icon("refresh") + "Refresh</button>",
  body: SETTINGS_BODY,
  script: SETTINGS_SCRIPT
});

// src/settings.ts
init_config();
var TOKEN_ENVS = ["ADMIN_TOKEN", "CLIENT_TOKEN", "ROLLUP_TOKEN", "GEMINI_API_KEYS", "WHATSTOKEN_API_KEYS"];
var FLAG_ENVS = [
  "DATABASE_URL",
  "DEFAULT_MODEL",
  "DEFAULT_TTS_MODEL",
  "DEFAULT_EMBED_MODEL",
  "DEFAULT_VOICE",
  "SEARCH_MODEL",
  "GEMINI_BASE_URL",
  "KEY_COOLDOWN_MS",
  "KEY_5XX_COOLDOWN_MS",
  "KEY_RATE_WINDOW_MS",
  "MAX_ATTEMPTS",
  "MAX_WAIT_MS",
  "UPSTREAM_TIMEOUT_MS",
  "DB_QUERY_TIMEOUT_MS",
  "LEDGER_FLUSH_MS",
  "LEDGER_MAX_ROWS",
  "LEDGER_TAIL_ROWS",
  "RETENTION_DAYS",
  "PORT",
  "LOG_LEVEL"
];
var NOTES = "The rotation cap is editable here and takes effect immediately; every other value on this page is deploy-time: change it in the host environment, then redeploy. Token values are never shown.";
function regionHostSuffix(dsn) {
  const at = dsn.indexOf("@");
  if (at < 0) return "unknown";
  const hostAndRest = dsn.slice(at + 1);
  const host = hostAndRest.split(/[/?#]/)[0].toLowerCase();
  if (!host) return "unknown";
  const labels = host.split(":").join(".").split(".").filter((l) => l !== "");
  const safe = labels.filter((l) => /^[a-z0-9-]+$/.test(l));
  if (safe.length < 2) return "unknown";
  return safe.slice(1).join(".");
}
async function settingsView() {
  const flags = [...TOKEN_ENVS, ...FLAG_ENVS].map((name) => {
    const raw2 = process.env[name];
    return { name, state: raw2 && raw2.trim() !== "" ? "set" : "unset" };
  });
  const hosted = cfg.databaseUrl !== "";
  return {
    ok: true,
    defaults: {
      model: cfg.defaultModel,
      ttsModel: cfg.defaultTtsModel,
      embedModel: cfg.defaultEmbedModel,
      voice: cfg.defaultVoice,
      searchModel: cfg.searchModel
    },
    limits: {
      keyCooldownMs: cfg.cooldownMs,
      serverErrCooldownMs: cfg.serverErrCooldownMs,
      rateWindowMs: cfg.rateWindowMs,
      maxAttempts: cfg.maxAttempts,
      maxWaitMs: cfg.maxWaitMs,
      upstreamTimeoutMs: cfg.upstreamTimeoutMs
    },
    rotation: await rotationSetting(),
    ledger: {
      flushMs: cfg.ledgerFlushMs,
      maxRows: cfg.ledgerMaxRows,
      tailRows: cfg.ledgerTailRows,
      retentionDays: cfg.retentionDays,
      queryTimeoutMs: cfg.dbQueryTimeoutMs
    },
    storage: {
      mode: hosted ? "hosted" : "memory",
      regionHostSuffix: hosted ? regionHostSuffix(cfg.databaseUrl) : "none"
    },
    env: flags,
    note: NOTES
  };
}

// src/audit-ui.ts
var AUDIT_BODY = `

<div id="console" hidden>
  <header class="page-head">
    <div class="page-head-main">
      <span class="eyebrow">Govern</span>
      <h1 class="page-title">Audit</h1>
      <p class="page-lede">Every admin action, newest first.</p>
    </div>
    <div class="page-head-side">
      <span class="meta" id="sWindow">-</span>
    </div>
  </header>

  ${noticeBand()}

  <div class="figures" id="kpis"></div>

  <section class="panel u-mt-4">
    <div class="panel-head">
      <h2>Filters</h2>
      <label class="check"><input id="auto" type="checkbox"> Auto refresh every 15s</label>
    </div>
    <div class="panel-body">
      <div class="toolbar">
        <div class="filter-grid">
          <div class="filter-cell">
            <label class="field" for="action">Action prefix</label>
            <input id="action" type="search" spellcheck="false" placeholder="keys." autocomplete="off">
          </div>
          <div class="filter-cell">
            <label class="field" for="since">Since</label>
            <input id="since" type="datetime-local">
          </div>
          <div class="filter-cell">
            <label class="field" for="limit">Limit</label>
            <select id="limit" class="select">
              <option value="50">50</option>
              <option value="100" selected>100</option>
              <option value="250">250</option>
              <option value="500">500</option>
            </select>
          </div>
        </div>
      </div>
      <div id="msg" class="notice u-mt-3" role="status" aria-live="polite"></div>
    </div>
  </section>

  <section class="panel u-mt-4">
    <div class="panel-head">
      <h2>Trail</h2>
      <span class="meta" id="trailMeta"></span>
    </div>
    <div class="feed" id="trail"></div>
  </section>
</div>
`;
var AUDIT_SCRIPT = `
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

  /* JSON.stringify(r.detail) dumped raw JSON straight into the trail: braces,
     quoted keys, nulls. Render the fields the way the rest of the feed reads. */
  function detailText(v) {
    if (v === null || v === undefined) return "";
    if (typeof v !== "object") return String(v);
    var parts = [];
    Object.keys(v).forEach(function (key) {
      var value = v[key];
      if (value === null || value === undefined || value === "") return;
      /* A nested object (an array of ids, a per-model map) still came out as
         raw JSON in the middle of the sentence. Flatten one level so the feed
         reads the same whatever the detail shape. */
      if (Array.isArray(value)) parts.push(key + " " + value.join(", "));
      else if (typeof value === "object") {
        Object.keys(value).forEach(function (sub) {
          var sv = value[sub];
          if (sv === null || sv === undefined || sv === "") return;
          parts.push(key + " " + sub + " " + String(sv));
        });
      } else parts.push(key + " " + String(value));
    });
    return parts.join(" \xB7 ");
  }

  function render(payload) {
    var rows = payload.rows || [];
    var kinds = {};
    rows.forEach(function (r) { kinds[r.action] = true; });

    el.kpis.textContent = "";
    el.kpis.appendChild(GX.kpi("Actions", GX.fmt.num(rows.length), "capped at " + el.limit.value + ", more may exist"));
    el.kpis.appendChild(GX.kpi("Kinds", GX.fmt.num(Object.keys(kinds).length), "distinct action names"));
    /* sWindow in the header and trailMeta in the panel both said "100
       recorded" / "100 entries" - the same number twice. The header keeps the
       window (what the filters say); the panel keeps the count. */
    el.sWindow.textContent = el.since.value
      ? "since " + el.since.value.replace("T", " ")
      : (el.action.value.trim() ? "action " + el.action.value.trim() : "all time");

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
        /* The actor landed in a second .what span with no label, so the feed
           read as two consecutive values. Say who it was. */
        GX.el("span", { class: "act", text: r.action }),
        GX.el("span", { class: "what", text: (what ? what + " \xB7 " : "") + detail }),
        GX.el("span", { class: "what meta", text: r.actor ? "by " + r.actor : "by unknown actor" }),
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
    /* Enter filtered correctly but never wrote the URL, so a filtered trail
       could not be shared or restored - the only control on the page that
       behaved differently from limit and since. */
    if (event.key === "Enter") { writeUrl(); reload(); }
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
var AUDIT_HTML = consolePage({
  title: "Audit",
  active: "/pengatur/audit",
  actions: '<button id="refreshBtn" class="btn btn-sm" type="button">' + icon("refresh") + "Refresh</button>",
  body: AUDIT_BODY,
  script: AUDIT_SCRIPT
});

// src/client-keys.ts
init_db();
import { createHash as createHash3, randomBytes } from "node:crypto";
init_log();
var CLIENT_KEY_PREFIX = "op_live_";
var SHOWN_LEN = CLIENT_KEY_PREFIX.length + 8;
var CACHE_TTL_MS2 = 1e4;
var TOUCH_TTL_MS = 6e4;
var CONFIGURED_KEY = "client_keys_configured";
var toEpoch2 = (v2) => {
  if (!v2) return 0;
  const t = v2 instanceof Date ? v2.getTime() : Date.parse(v2);
  return Number.isFinite(t) ? t : 0;
};
var clientKeyId = (raw2) => createHash3("sha256").update(raw2).digest("hex").slice(0, 12);
var hashOf = (raw2) => createHash3("sha256").update(raw2).digest("hex");
function mintClientKey() {
  return CLIENT_KEY_PREFIX + randomBytes(24).toString("hex");
}
async function createClientKey(label) {
  const raw2 = mintClientKey();
  const id = clientKeyId(raw2);
  const prefix = raw2.slice(0, SHOWN_LEN);
  const hash = hashOf(raw2);
  const res = await sql(
    `insert into client_keys (id, hash, prefix, label) values ($1, $2, $3, $4)`,
    [id, hash, prefix, label]
  );
  if (!res.ok) throw new Error(res.message ?? "could not store the client key");
  await setSetting(CONFIGURED_KEY, "1");
  cache4.at = 0;
  return { raw: raw2, row: { id, prefix, label, enabled: true, createdAt: Date.now(), lastUsedAt: 0 } };
}
var toRow = (r) => ({
  id: r.id,
  prefix: r.prefix,
  label: r.label ?? null,
  enabled: r.enabled === true,
  createdAt: toEpoch2(r.created_at),
  lastUsedAt: toEpoch2(r.last_used_at)
});
async function listClientKeys() {
  if (!dbEnabled()) return [];
  const res = await sql(
    `select id, prefix, label, enabled, created_at, last_used_at
       from client_keys
      order by created_at desc`
  );
  if (!res.ok) {
    log("warn", "client_keys.list_failed", { reason: res.reason });
    return [];
  }
  return res.rows.map(toRow);
}
async function revokeClientKey(id) {
  if (!dbEnabled()) return false;
  const res = await sql(`delete from client_keys where id = $1 returning id`, [id]);
  if (!res.ok) throw new Error(res.message ?? "could not revoke the client key");
  cache4.at = 0;
  return res.rows.length > 0;
}
var cache4 = { at: 0, hashes: /* @__PURE__ */ new Set(), enabled: false };
var touched = /* @__PURE__ */ new Map();
async function load2() {
  if (Date.now() - cache4.at < CACHE_TTL_MS2) return cache4;
  if (!dbEnabled()) {
    cache4 = { at: Date.now(), hashes: /* @__PURE__ */ new Set(), enabled: false };
    return cache4;
  }
  const res = await sql(`select hash, enabled from client_keys`);
  if (!res.ok) {
    log("warn", "client_keys.load_failed", { reason: res.reason });
    return cache4;
  }
  const hashes = /* @__PURE__ */ new Set();
  let enabled = false;
  for (const row of res.rows) {
    if (row.enabled !== true) continue;
    hashes.add(row.hash);
    enabled = true;
  }
  cache4 = { at: Date.now(), hashes, enabled };
  return cache4;
}
async function clientKeysArmed() {
  if ((await load2()).enabled) return true;
  return await getSetting(CONFIGURED_KEY) === "1";
}
async function verifyClientKey(raw2) {
  const value = raw2.trim();
  if (!value.startsWith(CLIENT_KEY_PREFIX)) return false;
  const { hashes } = await load2();
  const hash = hashOf(value);
  if (!hashes.has(hash)) return false;
  const last = touched.get(hash) ?? 0;
  if (Date.now() - last > TOUCH_TTL_MS) {
    touched.set(hash, Date.now());
    sqlLater(`update client_keys set last_used_at = now() where hash = $1`, [hash]);
  }
  return true;
}
async function clientKeyStats() {
  if (!dbEnabled()) return { total: 0, enabled: 0 };
  const res = await sql(
    `select count(*) as total, count(*) filter (where enabled) as enabled from client_keys`
  );
  if (!res.ok) return { total: 0, enabled: 0 };
  const row = res.rows[0];
  return { total: Number(row?.total ?? 0), enabled: Number(row?.enabled ?? 0) };
}

// src/app.ts
init_db();
var app = new Hono3();
app.use("*", cors());
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const route = routeOf(path);
  if (!route) return next();
  beginUsage(c.req.raw, path, route);
  await next();
  commitUsage(c.req.raw, c.res.status);
  const flushed = flush().catch(() => {
  });
  try {
    c.executionCtx.waitUntil(flushed);
  } catch {
  }
});
var bearer = (h2) => {
  if (!h2) return "";
  const m = /^Bearer\s+(.+)$/i.exec(h2.trim());
  return m ? m[1].trim() : h2.trim();
};
var clientGate = async (c, next) => {
  const configured = cfg.clientToken !== "" || await clientKeysArmed();
  if (!configured) return next();
  const presented = bearer(c.req.header("authorization")) || c.req.header("x-api-key") || "";
  if (cfg.clientToken && presented === cfg.clientToken) return next();
  if (presented && await verifyClientKey(presented)) return next();
  return c.json({ error: { type: "auth_error", message: "Invalid API key." } }, 401);
};
app.use("/v1/*", clientGate);
app.use("/v1beta/*", clientGate);
app.use("/v1/*", lazyRecheck);
app.use("/v1beta/*", lazyRecheck);
var SHELL_PATHS = [
  "/pengatur",
  "/pengatur/login",
  "/pengatur/models",
  "/pengatur/usage",
  // redirects to /pengatur/logs; kept public so the redirect works pre-auth
  "/pengatur/stats",
  "/pengatur/keys",
  "/pengatur/providers",
  "/pengatur/settings",
  "/pengatur/audit",
  "/pengatur/logs"
];
var KEY_PAGE = /^\/pengatur\/keys\/[0-9a-f]{12}$/;
var ADMIN_RATE_READS = Math.max(10, Number(process.env.ADMIN_RATE_READS_PER_MIN ?? 300));
var ADMIN_RATE_WRITES = Math.max(5, Number(process.env.ADMIN_RATE_WRITES_PER_MIN ?? 60));
var adminHits = /* @__PURE__ */ new Map();
function adminRetryAfter(ip, kind) {
  const limit = kind === "read" ? ADMIN_RATE_READS : ADMIN_RATE_WRITES;
  const key = `${ip}:${kind}`;
  const now2 = Date.now();
  const hits = (adminHits.get(key) ?? []).filter((t) => now2 - t < 6e4);
  if (hits.length >= limit) {
    adminHits.set(key, hits);
    return Math.max(1, Math.ceil((6e4 - (now2 - hits[0])) / 1e3));
  }
  hits.push(now2);
  adminHits.set(key, hits);
  if (adminHits.size > 4096) {
    for (const [k, v2] of adminHits) if (v2.every((t) => now2 - t >= 6e4)) adminHits.delete(k);
  }
  return 0;
}
app.use("/pengatur/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  const kind = method === "GET" || method === "HEAD" || method === "OPTIONS" ? "read" : "write";
  const forwarded = c.req.header("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";
  const retry = adminRetryAfter(ip, kind);
  if (retry > 0) {
    c.header("Retry-After", String(retry));
    return c.json({ error: { message: `Too many requests. Retry in ${retry}s.` } }, 429);
  }
  return next();
});
app.use("/pengatur/*", async (c, next) => {
  const adminPath = new URL(c.req.url).pathname;
  const method = c.req.method.toUpperCase();
  const readOnly = method === "GET" || method === "HEAD" || method === "OPTIONS";
  if (readOnly && (SHELL_PATHS.includes(adminPath) || KEY_PAGE.test(adminPath))) return next();
  if (!cfg.adminToken) {
    return c.json({ error: { message: "Admin disabled: ADMIN_TOKEN is not set." } }, 403);
  }
  const presented = bearer(c.req.header("authorization")) || c.req.header("x-admin-token") || "";
  if (presented && cfg.ingestToken && presented === cfg.ingestToken && method === "POST" && adminPath === "/pengatur/keys") {
    return next();
  }
  if (presented !== cfg.adminToken) {
    return c.json({ error: { message: "Unauthorized." } }, 401);
  }
  return next();
});
async function liveness() {
  const snap = await snapshot();
  return snap.ready > 0 ? { ok: true, status: 200 } : { ok: false, status: 503 };
}
app.get("/", async (c) => {
  const { ok, status } = await liveness();
  return c.json({ ok, service: "omniproxy" }, status);
});
app.get("/health", async (c) => {
  const { ok, status } = await liveness();
  return c.json({ ok }, status);
});
app.get("/pengatur/status", async (c) => {
  const snap = await snapshot();
  const rows = await loadKeys();
  const lastCheckedAt = rows.reduce((m, k) => Math.max(m, k.lastCheckedAt || 0), 0);
  return c.json({
    ok: true,
    service: "omniproxy",
    storage: snap.storage,
    db: { enabled: dbEnabled(), breakerOpen: breakerOpen() },
    material: { durable: keyMaterialDurable() },
    identities: { rows: rows.length, lastCheckedAt: lastCheckedAt || null },
    uptimeSeconds: Math.round(process.uptime()),
    pool: snap,
    defaults: {
      model: cfg.defaultModel,
      tts: cfg.defaultTtsModel,
      embed: cfg.defaultEmbedModel,
      voice: cfg.defaultVoice,
      search: cfg.searchModel,
      modelFallback: cfg.modelFallback,
      probeModels: cfg.probeModels,
      retiredModels: cfg.retiredModels
    }
  });
});
async function peekModel(req) {
  const parsed = await bodyJson(req);
  return typeof parsed?.model === "string" ? parsed.model : "";
}
async function resolveRoute(model, cap) {
  const route = await resolveModelRoute(model);
  const provider = await getProvider(route.provider);
  const withCap = (await providersWith(cap)).map((p2) => p2.id);
  if (!provider) {
    return {
      ok: false,
      status: 400,
      message: `Unknown provider \`${route.provider}\`.` + (withCap.length ? ` Providers that serve ${cap}: ${withCap.join(", ")}.` : "")
    };
  }
  if (!provider.enabled) {
    return { ok: false, status: 400, message: `Provider \`${provider.id}\` is disabled.` };
  }
  if (!provider.capabilities.includes(cap)) {
    return {
      ok: false,
      status: 400,
      message: `Provider \`${provider.id}\` does not support ${cap}.` + (withCap.length ? ` Providers that do: ${withCap.join(", ")}.` : "")
    };
  }
  return { ok: true, provider, model: route.model };
}
async function poolReady(provider) {
  return Boolean(await pick(/* @__PURE__ */ new Set(), void 0, provider.id));
}
app.post("/v1/chat/completions", async (c) => {
  const resolved = await resolveRoute(await peekModel(c.req.raw), "llm");
  if (!resolved.ok) return c.json({ error: { message: resolved.message } }, resolved.status);
  if (!await poolReady(resolved.provider)) {
    return c.json(
      { error: { message: `No available ${resolved.provider.label} API keys in pool.` } },
      503
    );
  }
  if (resolved.provider.wire === "openai") {
    return openaiWire(c.req.raw, resolved.provider, "chat", resolved.model, c.req.raw.signal);
  }
  return chatCompletions(c.req.raw, resolved.model);
});
app.post("/v1/audio/speech", async (c) => {
  const resolved = await resolveRoute(await peekModel(c.req.raw), "tts");
  if (!resolved.ok) return c.json({ error: { message: resolved.message } }, resolved.status);
  if (!await poolReady(resolved.provider)) {
    return c.json(
      { error: { message: `No available ${resolved.provider.label} API keys in pool.` } },
      503
    );
  }
  if (resolved.provider.wire === "openai") {
    return openaiWire(c.req.raw, resolved.provider, "audio", resolved.model, c.req.raw.signal);
  }
  if (resolved.provider.wire === "elevenlabs") {
    const st = await pick(/* @__PURE__ */ new Set(), void 0, "elevenlabs");
    return serveElevenLabs(c.req.raw, st?.key);
  }
  return speech(c.req.raw, resolved.model);
});
app.post("/v1/embeddings", async (c) => {
  const resolved = await resolveRoute(await peekModel(c.req.raw), "embeddings");
  if (!resolved.ok) return c.json({ error: { message: resolved.message } }, resolved.status);
  if (!await poolReady(resolved.provider)) {
    return c.json(
      { error: { message: `No available ${resolved.provider.label} API keys in pool.` } },
      503
    );
  }
  if (resolved.provider.wire === "openai") {
    return openaiWire(c.req.raw, resolved.provider, "embeddings", resolved.model, c.req.raw.signal);
  }
  return embeddings(c.req.raw, resolved.model);
});
app.post("/v1/images/generations", async (c) => {
  const resolved = await resolveRoute(await peekModel(c.req.raw), "image");
  if (!resolved.ok) return c.json({ error: { message: resolved.message } }, resolved.status);
  if (resolved.provider.wire !== "openai") {
    return c.json(
      {
        error: {
          message: `Provider \`${resolved.provider.id}\` serves image models through POST /v1/chat/completions, not /v1/images/generations.`
        }
      },
      400
    );
  }
  if (!await poolReady(resolved.provider)) {
    return c.json(
      { error: { message: `No available ${resolved.provider.label} API keys in pool.` } },
      503
    );
  }
  return openaiWire(c.req.raw, resolved.provider, "images", resolved.model, c.req.raw.signal);
});
app.get("/v1/models", async (c) => {
  const rows = [];
  const census = {};
  try {
    const gemini = await geminiModelRows();
    rows.push(...gemini.rows);
    census.gemini = gemini.rows.length;
  } catch {
    census.gemini = 0;
  }
  for (const provider of await allProviders()) {
    if (!provider.enabled || provider.wire !== "openai") continue;
    const st = await pick(/* @__PURE__ */ new Set(), void 0, provider.id);
    if (!st) {
      census[provider.id] = 0;
      continue;
    }
    const raw2 = await rawKeyById(st.key) || st.key;
    const live = await openaiModelList(provider, raw2);
    const declared = provider.models;
    const list3 = declared.length ? live.length ? live.filter((m) => declared.includes(m.id)) : declared.map((id) => ({ id, ownedBy: provider.id })) : live;
    census[provider.id] = list3.length;
    rows.push(
      ...list3.map((m) => ({
        // Prefixed so every row routes deterministically: two gateways can
        // both list `gpt-4o-mini`, and a bare id would resolve by registry
        // order instead of by the row the client actually picked.
        id: `${provider.id}/${m.id}`,
        object: "model",
        created: 17e8,
        owned_by: provider.id,
        upstream_owned_by: m.ownedBy
      }))
    );
  }
  try {
    const { inv } = await elevenLabsInventoryCached();
    const list3 = (inv?.models ?? []).filter((m) => m.can_do_text_to_speech !== false);
    census.elevenlabs = list3.length;
    rows.push(
      ...list3.map((m) => ({
        id: `elevenlabs/${m.model_id}`,
        object: "model",
        created: 17e8,
        owned_by: "elevenlabs",
        display_name: m.name ?? m.model_id
      }))
    );
  } catch {
    census.elevenlabs = 0;
  }
  if (rows.length === 0) {
    return c.json({ error: { message: "No provider can list models right now." } }, 503);
  }
  return c.json({ object: "list", data: rows, omniproxy: { providers: census } });
});
app.all("/v1beta/models/*", (c) => geminiPassthrough(c.req.raw, new URL(c.req.url).pathname));
var icoCache = null;
app.get("/favicon.svg", (c) => {
  c.header("content-type", "image/svg+xml; charset=utf-8");
  c.header("cache-control", "public, max-age=604800");
  return c.body(FAVICON_SVG);
});
app.get("/favicon.ico", (c) => {
  if (!icoCache) icoCache = buildFaviconIco((raw2) => deflateSync(raw2));
  c.header("content-type", "image/x-icon");
  c.header("cache-control", "public, max-age=604800");
  return c.body(icoCache);
});
app.get("/pengatur", (c) => c.html(ADMIN_HTML));
app.get("/pengatur/login", (c) => c.html(LOGIN_HTML));
app.get("/pengatur/models", (c) => c.html(MODELS_HTML));
app.get("/pengatur/stats", (c) => c.html(STATS_HTML));
app.get("/pengatur/stats/data", async (c) => {
  const range = new URL(c.req.url).searchParams.get("range") ?? "24h";
  if (!isStatsRange(range)) {
    return c.json({ error: { message: "`range` must be one of: 1h, 24h, 7d, 30d" } }, 400);
  }
  const stats = await statsSnapshot(range);
  if (!stats.ok) {
    return c.json({ ok: false, error: { message: stats.error ?? "Statistics unavailable." } }, 500);
  }
  return c.json(stats);
});
app.get("/pengatur/models/list", async (c) => {
  const force = new URL(c.req.url).searchParams.get("refresh") === "1";
  let gemini;
  try {
    const live = await listLiveModels(force);
    gemini = live;
  } catch (err2) {
    const message = err2 instanceof Error ? err2.message : String(err2);
    const status = err2.code === "empty_pool" ? 503 : 502;
    log("warn", "models.list_fallback_catalog", { reason: message });
    gemini = {
      models: catalogModels(),
      source: "catalog",
      cached: false,
      degraded: true,
      degradedReason: message
    };
  }
  const inv = await listElevenLabsInventory();
  const eleven = inv ? inv.models.map((m) => ({
    id: `elevenlabs:${m.model_id}`,
    provider: "elevenlabs",
    name: m.model_id,
    displayName: m.name || m.model_id,
    description: m.description || "",
    version: "",
    methods: m.can_do_text_to_speech ? ["generateSpeech"] : [],
    inputTokenLimit: null,
    outputTokenLimit: null,
    kind: "tts",
    free: true,
    freeLabel: "per-character quota",
    inUsd: null,
    outUsd: null,
    inRaw: "",
    outRaw: ""
  })) : [];
  const voices = inv ? inv.voices.map((v2) => ({
    id: `voice:${v2.voice_id}`,
    provider: "elevenlabs",
    name: v2.voice_id,
    displayName: v2.name,
    description: typeof v2.labels === "object" ? JSON.stringify(v2.labels) : "",
    version: "",
    methods: [],
    inputTokenLimit: null,
    outputTokenLimit: null,
    kind: "voice",
    free: v2.category === "premade",
    freeLabel: v2.category === "premade" ? "premade (free tier)" : `professional (${v2.category}), paid plan required`,
    inUsd: null,
    outUsd: null,
    inRaw: "",
    outRaw: "",
    voiceCategory: v2.category ?? ""
  })) : [];
  const wire = await openaiWireRows(new URL(c.req.url).searchParams.get("refresh") === "1");
  const models = [...gemini.models, ...eleven, ...voices, ...wire.rows];
  const census = {
    gemini: gemini.models.length,
    elevenlabs: eleven.length + voices.length,
    voice: voices.length,
    ...wire.census
  };
  return c.json({
    ok: true,
    count: models.length,
    models,
    source: gemini.source,
    cached: gemini.cached,
    degraded: gemini.degraded,
    degradedReason: gemini.degradedReason,
    providers: census,
    pricing: pricingMeta()
  });
});
var OPENAI_WIRE_CACHE_MS = 6e5;
var openaiWireCache = null;
function kindOfWireModel(id) {
  const m = id.toLowerCase();
  if (/embed/.test(m)) return "embedding";
  if (/tts|speech|audio/.test(m)) return "tts";
  if (/image|flux|dall|midjourney|draw|paint|banana/.test(m)) return "image";
  if (/veo|vidu|seedance|kling|sora|hailuo|runway|video/.test(m)) return "video";
  return "text";
}
async function openaiWireRows(force) {
  if (!force && openaiWireCache && Date.now() - openaiWireCache.at < OPENAI_WIRE_CACHE_MS) {
    return { rows: openaiWireCache.rows, census: openaiWireCache.census };
  }
  const rows = [];
  const census = {};
  for (const provider of await allProviders()) {
    if (!provider.enabled || provider.wire !== "openai") continue;
    const st = await pick(/* @__PURE__ */ new Set(), void 0, provider.id);
    if (!st) {
      census[provider.id] = 0;
      continue;
    }
    const raw2 = await rawKeyById(st.key) || st.key;
    const live = await openaiModelList(provider, raw2);
    const declared = provider.models;
    const list3 = declared.length ? live.length ? live.filter((m) => declared.includes(m.id)) : declared.map((id) => ({ id, ownedBy: provider.id })) : live;
    census[provider.id] = list3.length;
    rows.push(
      ...list3.map((m) => ({
        id: m.id,
        provider: provider.id,
        name: m.id,
        displayName: m.id,
        description: m.ownedBy && m.ownedBy !== provider.id ? `upstream: ${m.ownedBy}` : "",
        version: "",
        methods: [],
        inputTokenLimit: null,
        outputTokenLimit: null,
        kind: kindOfWireModel(m.id),
        free: null,
        freeLabel: "gateway pricing",
        inUsd: null,
        outUsd: null,
        inRaw: "",
        outRaw: ""
      }))
    );
  }
  openaiWireCache = { at: Date.now(), rows, census };
  return { rows, census };
}
var ELEVENLABS_CACHE_MS = 6e5;
var elevenLabsCache = null;
async function elevenLabsInventoryCached(force = false) {
  if (!force && elevenLabsCache && Date.now() - elevenLabsCache.at < ELEVENLABS_CACHE_MS) {
    return { cached: true, inv: { voices: elevenLabsCache.voices, models: elevenLabsCache.models } };
  }
  const fresh = await listElevenLabsInventory();
  if (!fresh) return { cached: false, inv: null };
  elevenLabsCache = { at: Date.now(), voices: fresh.voices, models: fresh.models };
  return { cached: false, inv: fresh };
}
app.get("/pengatur/elevenlabs/list", async (c) => {
  const force = new URL(c.req.url).searchParams.get("refresh") === "1";
  const { cached, inv } = await elevenLabsInventoryCached(force);
  if (!inv) {
    return c.json(
      { ok: false, error: "No available ElevenLabs API keys in pool.", voices: [], models: [] },
      503
    );
  }
  return c.json({
    ok: true,
    cached,
    voices: inv.voices,
    models: inv.models
  });
});
app.post("/pengatur/models/test", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) return c.json({ error: { message: "`model` is required." } }, 400);
  const tier = typeof body.tier === "string" ? body.tier : "";
  const result = await testModel(
    model,
    typeof body.key === "string" ? body.key : void 0,
    KEY_TIERS.includes(tier) ? tier : "unknown"
  );
  return c.json({ ok: true, model, result });
});
app.get("/pengatur/keys", (c) => c.html(KEYS_HTML));
app.get("/pengatur/providers", (c) => c.html(PROVIDERS_HTML));
app.get("/pengatur/keys/list", async (c) => {
  const providerFilter = c.req.query("provider");
  dropLocal(await purgedIds());
  const [keys, snap, identities] = await Promise.all([listKeys(providerFilter), snapshot(), loadKeys()]);
  const byId = new Map(identities.map((k) => [k.id, k]));
  const merged = keys.map((k) => {
    const identity = byId.get(k.id);
    return {
      ...k,
      provider: k.provider || identity?.provider || "gemini",
      enabled: identity ? identity.enabled : true,
      label: identity?.label ?? null
    };
  });
  return c.json({
    pool: snap,
    keys: merged,
    tiers: tierCounts(keys),
    knownTiers: KEY_TIERS,
    providers: await providerViews()
  });
});
app.get("/pengatur/keys/:id", async (c) => {
  const id = c.req.param("id");
  const keys = await listKeys();
  if (!keys.some((k) => k.id === id)) return c.text("not found", 404);
  return c.html(KEY_DETAIL_HTML);
});
app.get("/pengatur/keys/:id/data", async (c) => {
  const id = c.req.param("id");
  const key = (await listKeys()).find((k) => k.id === id);
  if (!key) return c.json({ error: { message: "No key with that id." } }, 404);
  const ledgerId = ledgerKeyId(key.key);
  const daily = [];
  let dailyNote = "";
  if (!dbEnabled()) {
    dailyNote = "Database disabled: no daily history.";
  } else {
    const res = await sql(
      `select day::text as day,
              sum(requests)::int as requests,
              sum(errors)::int as errors,
              sum(cost_usd)::numeric as cost_usd
         from usage_daily
        where key_id = $1 and day >= current_date - 30
        group by day
        order by day`,
      [ledgerId]
    );
    if (!res.ok) {
      return c.json({ ok: false, error: { message: res.message ?? "Daily history unavailable." } }, 500);
    }
    for (const row of res.rows) {
      daily.push({
        day: row.day,
        requests: Number(row.requests) || 0,
        errors: Number(row.errors) || 0,
        costUsd: row.cost_usd == null ? null : Number(row.cost_usd)
      });
    }
  }
  const recent = allRows().filter((r) => r.keyId === ledgerId).slice(0, 100);
  const events = recent.filter((r) => !r.ok || r.rotated).slice(0, 50).map((r) => ({ ts: r.ts, status: r.status, ok: r.ok, errorCode: r.errorCode, rotated: r.rotated }));
  const identity = (await loadKeys()).find((k) => k.id === id);
  return c.json({
    ok: true,
    key: {
      id: key.id,
      masked: key.key,
      provider: key.provider || identity?.provider || "gemini",
      plan: key.tier,
      status: key.status,
      enabled: identity ? identity.enabled : true,
      label: identity?.label ?? null,
      failures: key.failures,
      invalidations: key.invalidations,
      invalid: key.invalid,
      lastUsed: key.lastUsed,
      cooldownUntil: key.cooldownUntil,
      cooldownLeftMs: key.cooldownLeftMs
    },
    daily,
    dailyNote,
    recent,
    events,
    cooldown: { status: key.status, until: key.cooldownUntil, leftMs: key.cooldownLeftMs }
  });
});
app.post("/pengatur/keys/tier", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  const tier = String(body.tier ?? "");
  if (!KEY_TIERS.includes(tier)) {
    return c.json({ error: { message: `\`tier\` must be one of: ${KEY_TIERS.join(", ")}` } }, 400);
  }
  let ids = [];
  if (body.all) ids = (await listKeys()).map((k) => k.id);
  else if (Array.isArray(body.ids)) ids = body.ids.filter((x2) => typeof x2 === "string" && x2);
  else if (typeof body.id === "string" && body.id) ids = [body.id];
  if (!ids.length) return c.json({ error: { message: "`id`, `ids` or `all` is required." } }, 400);
  let updated = 0;
  for (const id of ids) if (await setTierById(id, tier)) updated++;
  await recordNow("keys.tier", {
    actor: actorFrom(c.req.header("user-agent")),
    target: ids.join(","),
    detail: { tier, updated }
  });
  const keys = await listKeys();
  return c.json({ ok: true, tier, updated, tiers: tierCounts(keys), pool: await snapshot() });
});
app.post("/pengatur/keys", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  const incoming = [];
  if (typeof body.key === "string") incoming.push(body.key);
  if (typeof body.keys === "string") incoming.push(...body.keys.split(/[\s,]+/));
  if (Array.isArray(body.keys)) incoming.push(...body.keys);
  const clean = [...new Set(incoming.map((k) => String(k).trim()).filter(Boolean))];
  if (clean.length === 0) return c.json({ error: { message: "No keys supplied." } }, 400);
  const cooldownInput = body.cooldowns && typeof body.cooldowns === "object" ? body.cooldowns : {};
  const cooldownFor = (key) => {
    const raw2 = cooldownInput[key];
    const at = typeof raw2 === "number" ? raw2 : typeof raw2 === "string" ? Date.parse(raw2) : 0;
    return Number.isFinite(at) ? at : 0;
  };
  const named = typeof body.provider === "string" ? body.provider.trim() : "";
  const namedProvider = named ? await getProvider(named) : null;
  if (named && !namedProvider) {
    return c.json({ error: { message: `Unknown provider \`${named}\`.` } }, 400);
  }
  const registry2 = await allProviders();
  const perKey = clean.map((k) => named || detectProvider(k, registry2) || "gemini");
  const byId = new Map(registry2.map((p2) => [p2.id, p2]));
  if (namedProvider) byId.set(namedProvider.id, namedProvider);
  const rejected = [];
  const accepted = [];
  for (let i = 0; i < clean.length; i++) {
    const provider = perKey[i];
    const p2 = byId.get(provider);
    const why = p2 ? keyShapeError(clean[i], p2) : null;
    if (why) rejected.push({ id: keyId(clean[i]), provider, reason: why });
    else accepted.push({ key: clean[i], provider });
  }
  const verdicts = await verifyIngestKeys(accepted);
  const byKey = new Map(verdicts.map((v2) => [v2.key, v2]));
  const probed = { ok: 0, rateLimited: 0, quotaExhausted: 0, inconclusive: 0, refused: 0 };
  const purged = new Set(await purgedIds());
  const ids = [];
  const addedByProvider = {};
  let added = 0;
  let parked = 0;
  for (const { key, provider } of accepted) {
    if (purged.has(keyId(key))) {
      rejected.push({ id: keyId(key), provider, reason: "purged: tombstoned by the operator" });
      continue;
    }
    const v2 = byKey.get(key);
    if (v2) {
      if (v2.status === "ok") probed.ok++;
      else if (v2.status === "rate_limited") probed.rateLimited++;
      else if (v2.status === "quota_exhausted") probed.quotaExhausted++;
      else if (v2.status === "invalid" || v2.status === "zero_quota") {
        probed.refused++;
        rejected.push({ id: keyId(key), provider, reason: `${v2.status}: ${v2.message}` });
        continue;
      } else probed.inconclusive++;
    }
    let until = cooldownFor(key);
    if (v2?.status === "rate_limited") until = Math.max(until, Date.now() + v2.retryAfterMs);
    if (v2?.status === "quota_exhausted") until = Math.max(until, Date.now() + v2.retryAfterMs);
    if (await addKey(key, provider, until)) {
      added++;
      if (until > Date.now()) parked++;
      ids.push(keyId(key));
      addedByProvider[provider] = (addedByProvider[provider] ?? 0) + 1;
    }
  }
  await recordNow("keys.add", {
    actor: actorFrom(c.req.header("user-agent")),
    target: ids.join(","),
    detail: {
      received: clean.length,
      added,
      parked,
      provider: named || "auto",
      providers: addedByProvider,
      rejected: rejected.length,
      rejectedIds: rejected.map((r) => r.id),
      probed
    }
  });
  const durable = keyMaterialDurable();
  await flushPoolWrites();
  const warning = durable ? {} : { warning: "KEY_MATERIAL is not durable: keys added now survive until the next cold start only." };
  return c.json({
    ok: true,
    received: clean.length,
    added,
    parked,
    rejected,
    probed,
    ids,
    durable,
    providers: addedByProvider,
    ...warning,
    pool: await snapshot()
  });
});
app.get("/pengatur/providers/list", async (c) => {
  return c.json({
    ok: true,
    providers: await providerViews(),
    capabilities: CAPABILITIES,
    capabilityLabels: CAPABILITY_LABEL
  });
});
app.post("/pengatur/providers", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  let provider;
  try {
    provider = await registerProvider({
      id: String(body.id ?? ""),
      label: String(body.label ?? ""),
      baseUrl: String(body.baseUrl ?? ""),
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
      keyPattern: typeof body.keyPattern === "string" ? body.keyPattern : void 0,
      models: Array.isArray(body.models) ? body.models.map((m) => String(m)) : [],
      note: typeof body.note === "string" ? body.note : ""
    });
  } catch (err2) {
    return c.json({ error: { message: err2 instanceof Error ? err2.message : String(err2) } }, 400);
  }
  const incoming = [];
  if (typeof body.keys === "string") incoming.push(...body.keys.split(/[\s,]+/));
  if (Array.isArray(body.keys)) incoming.push(...body.keys);
  const clean = [...new Set(incoming.map((k) => String(k).trim()).filter(Boolean))];
  let added = 0;
  for (const k of clean) if (await addKey(k, provider.id)) added++;
  await recordNow("providers.add", {
    actor: actorFrom(c.req.header("user-agent")),
    target: provider.id,
    detail: {
      label: provider.label,
      baseUrl: provider.baseUrl,
      capabilities: provider.capabilities,
      models: provider.models.length,
      keysAdded: added
    }
  });
  return c.json({ ok: true, provider, added, pool: await snapshot() });
});
app.patch("/pengatur/providers/:id", async (c) => {
  const id = c.req.param("id");
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  try {
    const provider = await updateProvider(id, {
      label: typeof body.label === "string" ? body.label : void 0,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : void 0,
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : void 0,
      keyPattern: body.keyPattern === void 0 ? void 0 : body.keyPattern,
      models: Array.isArray(body.models) ? body.models.map((m) => String(m)) : void 0,
      note: typeof body.note === "string" ? body.note : void 0,
      enabled: typeof body.enabled === "boolean" ? body.enabled : void 0
    });
    if (!provider) return c.json({ error: { message: "No provider with that id." } }, 404);
    await recordNow("providers.update", {
      actor: actorFrom(c.req.header("user-agent")),
      target: id,
      detail: { enabled: provider.enabled, models: provider.models.length, capabilities: provider.capabilities }
    });
    return c.json({ ok: true, provider, pool: await snapshot() });
  } catch (err2) {
    return c.json({ error: { message: err2 instanceof Error ? err2.message : String(err2) } }, 400);
  }
});
app.delete("/pengatur/providers/:id", async (c) => {
  const id = c.req.param("id");
  const result = await removeProvider(id);
  if (!result.ok) {
    const status = /No provider/.test(result.error ?? "") ? 404 : 409;
    return c.json({ error: { message: result.error } }, status);
  }
  await recordNow("providers.remove", {
    actor: actorFrom(c.req.header("user-agent")),
    target: id,
    detail: {}
  });
  return c.json({ ok: true, pool: await snapshot() });
});
app.get("/pengatur/providers/:id/models", async (c) => {
  const id = c.req.param("id");
  const provider = await getProvider(id);
  if (!provider) return c.json({ error: { message: "No provider with that id." } }, 404);
  if (provider.wire !== "openai") {
    return c.json(
      { error: { message: `Provider \`${id}\` does not expose an OpenAI-compatible /v1/models.` } },
      400
    );
  }
  const st = await pick(/* @__PURE__ */ new Set(), void 0, id);
  if (!st) {
    return c.json({ error: { message: `No available ${provider.label} API keys in pool.` } }, 503);
  }
  const raw2 = await rawKeyById(st.key) || st.key;
  const list3 = await openaiModelList(provider, raw2);
  await recordNow("providers.import_models", {
    actor: actorFrom(c.req.header("user-agent")),
    target: id,
    detail: { count: list3.length }
  });
  return c.json({ ok: true, provider: id, count: list3.length, models: list3 });
});
app.post("/pengatur/keys/backfill-material", async (c) => {
  const written = await backfillMaterial();
  await recordNow("keys.backfill_material", {
    actor: actorFrom(c.req.header("user-agent")),
    detail: { written }
  });
  return c.json({ ok: true, written });
});
app.delete("/pengatur/keys", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  if (Array.isArray(body.ids) && body.ids.length) {
    const ids = body.ids.filter((x2) => typeof x2 === "string" && x2.length > 0);
    const removed = [];
    const failed = [];
    for (const id of ids) {
      const ok = await removeKeyById(id);
      if (ok) removed.push(id);
      else failed.push(id);
    }
    await recordNow("keys.delete", {
      actor: actorFrom(c.req.header("user-agent")),
      target: removed.join(","),
      detail: { by: "id", bulk: true, removed: removed.length, failed: failed.length }
    });
    return c.json({ ok: failed.length === 0, removed, failed, pool: await snapshot() });
  }
  if (typeof body.id === "string" && body.id) {
    const removed = await removeKeyById(body.id);
    if (!removed) return c.json({ error: { message: "No key with that id." } }, 404);
    await recordNow("keys.delete", {
      actor: actorFrom(c.req.header("user-agent")),
      target: body.id,
      detail: { by: "id" }
    });
    return c.json({ ok: true, pool: await snapshot() });
  }
  if (typeof body.key !== "string" || !body.key) {
    return c.json({ error: { message: "`id` or `key` is required." } }, 400);
  }
  await removeKey(body.key);
  await recordNow("keys.delete", {
    actor: actorFrom(c.req.header("user-agent")),
    target: keyId(body.key),
    detail: { by: "raw-key" }
  });
  return c.json({ ok: true, pool: await snapshot() });
});
app.post("/pengatur/keys/test", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  let raw2 = "";
  let id = typeof body.id === "string" ? body.id : "";
  if (id) {
    const resolved = await rawKeyById(id);
    if (!resolved) return c.json({ error: { message: "No key with that id." } }, 404);
    raw2 = resolved;
  } else if (typeof body.key === "string" && body.key.trim()) {
    raw2 = body.key.trim();
    id = keyId(raw2);
  } else {
    return c.json({ error: { message: "`id` or `key` is required." } }, 400);
  }
  const allKeys = await listKeys();
  const matched = allKeys.find((k) => k.id === id);
  const provider = matched?.provider ?? (typeof body.provider === "string" && body.provider.trim() ? body.provider.trim() : void 0);
  const model = typeof body.model === "string" && body.model ? body.model : void 0;
  const result = await probeKey(raw2, model, provider);
  const held = Boolean(await rawKeyById(id));
  const applied = held ? await applyProbe(raw2, result) : "none";
  if (held && result.tierEvidence) await markValidatedPlan(raw2, result.tierEvidence);
  await flushPoolWrites();
  const view = held ? (await listKeys()).find((k) => k.id === id) : void 0;
  await recordNow("keys.test", {
    actor: actorFrom(c.req.header("user-agent")),
    target: id,
    detail: {
      provider: provider ?? view?.provider ?? "gemini",
      model: model ?? "default",
      verdict: result.status,
      tier: result.tierEvidence?.tier ?? "unknown",
      applied
    }
  });
  return c.json({
    ok: true,
    id,
    applied,
    probe: { status: result.status, httpStatus: result.httpStatus, retryAfterMs: result.retryAfterMs },
    verdict: result.status,
    httpStatus: result.httpStatus,
    message: result.message,
    quota: result.quota ?? null,
    tierEvidence: result.tierEvidence ?? null,
    planValidated: view?.planValidated ?? false,
    plan: view?.plan ?? "unspecified",
    nextAccessAt: view?.nextAccessAt ?? 0,
    pool: await snapshot()
  });
});
async function applyProbe(raw2, probe) {
  switch (probe.status) {
    case "ok":
      await markHealthy(raw2);
      return "revived";
    case "rate_limited":
      await mark429(raw2, Math.max(cfg.cooldownMs, probe.retryAfterMs), probe.quota ?? null);
      return "cooling";
    case "zero_quota":
      await markInvalid(raw2, Date.now(), "zero_quota");
      return "retired";
    case "quota_exhausted":
      await markQuotaExhausted(raw2, probe.quota ?? null);
      return "quota_exhausted";
    case "invalid":
      await markInvalid(raw2);
      return "retired";
    case "server_error":
    case "network_error":
      await markSoftError(raw2, cfg.serverErrCooldownMs);
      return "cooling";
    default:
      await markUnverified(raw2);
      return "unverified";
  }
}
app.post("/pengatur/keys/test-all", async (c) => {
  const keys = await listKeys();
  const target = keys.filter((k) => k.status !== "dead");
  const limit = 8;
  const results = [];
  let cursor = 0;
  const worker = async () => {
    for (; ; ) {
      const i = cursor++;
      if (i >= target.length) return;
      const k = target[i];
      const raw2 = await rawKeyById(k.id);
      if (!raw2) continue;
      const probe = await probeKey(raw2, void 0, k.provider);
      const applied = await applyProbe(raw2, probe);
      results.push({ id: k.id, key: k.key, probe, applied });
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, target.length) }, worker));
  await flushPoolWrites();
  const purged = await purgeDead();
  const dropped2 = forgetDead();
  await recordNow("keys.test-all", {
    actor: actorFrom(c.req.header("user-agent")),
    detail: { tested: results.length, purged: purged.removed, droppedFromPool: dropped2, purgedBy: purged.byReason }
  });
  return c.json({ ok: true, tested: results.length, results, purged, droppedFromPool: dropped2, pool: await snapshot() });
});
app.post("/pengatur/keys/purge-dead", async (c) => {
  const purged = await purgeDead();
  const dropped2 = forgetDead();
  await recordNow("keys.purge-dead", {
    actor: actorFrom(c.req.header("user-agent")),
    target: purged.ids.join(","),
    detail: { removed: purged.removed, droppedFromPool: dropped2, byReason: purged.byReason }
  });
  return c.json({ ok: true, ...purged, droppedFromPool: dropped2, pool: await snapshot() });
});
app.post("/pengatur/keys/restore", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x2) => typeof x2 === "string" && x2.length > 0) : typeof body.id === "string" && body.id ? [body.id] : [];
  if (ids.length === 0) return c.json({ error: { message: "`id` or `ids` is required." } }, 400);
  const restored = await restoreKeys(ids);
  await hydrate();
  await recordNow("keys.restore", {
    actor: actorFrom(c.req.header("user-agent")),
    target: ids.join(","),
    detail: { requested: ids.length, restored }
  });
  return c.json({ ok: true, restored, pool: await snapshot() });
});
app.post("/pengatur/keys/validate-plan", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  let ids = [];
  if (body.all) ids = (await listKeys()).map((k) => k.id);
  else if (Array.isArray(body.ids)) ids = body.ids.filter((x2) => typeof x2 === "string" && x2);
  if (!ids.length) return c.json({ error: { message: "`ids` or `all` is required." } }, 400);
  const results = new Array(ids.length);
  const owned = new Map((await listKeys()).map((k) => [k.id, k.provider || "gemini"]));
  let cursor = 0;
  const worker = async () => {
    for (; ; ) {
      const i = cursor++;
      if (i >= ids.length) return;
      const id = ids[i];
      const raw2 = await rawKeyById(id);
      if (!raw2) {
        results[i] = { id, tier: "unknown", planValidated: false, error: "No key with that id." };
        continue;
      }
      const provider = owned.get(id) || "gemini";
      if (provider !== "gemini") {
        results[i] = {
          id,
          tier: "unknown",
          planValidated: false,
          verdict: "not_applicable",
          httpStatus: 0,
          error: null,
          message: "only Google publishes a plan; " + provider + " keys have none"
        };
        continue;
      }
      const t = await probeTier(raw2);
      const evidence = t.tierEvidence && t.tierEvidence.tier !== "unknown" ? t.tierEvidence : null;
      if (evidence) await markValidatedPlan(raw2, evidence);
      results[i] = {
        id,
        tier: evidence?.tier ?? "unknown",
        planValidated: Boolean(evidence),
        verdict: t.verdict,
        httpStatus: t.httpStatus,
        error: evidence ? null : t.message
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
  const validated = results.filter((r) => r.planValidated).length;
  await recordNow("keys.validate-plan", {
    actor: actorFrom(c.req.header("user-agent")),
    target: ids.join(","),
    detail: { requested: ids.length, validated }
  });
  return c.json({ ok: true, validated, results, pool: await snapshot() });
});
app.all("/internal/rollup", async (c) => {
  const presented = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || c.req.header("x-rollup-token") || "";
  const accepted = [cfg.rollupToken, cfg.cronSecret].filter((t) => t.length > 0);
  if (accepted.length === 0) {
    return c.json(
      { error: { message: "Rollup disabled: neither ROLLUP_TOKEN nor CRON_SECRET is set." } },
      403
    );
  }
  if (!accepted.includes(presented)) {
    return c.json({ error: { message: "Unauthorized." } }, 401);
  }
  let bodyDay;
  try {
    const body = await c.req.json();
    bodyDay = body?.day;
  } catch {
  }
  const requested = bodyDay ?? new URL(c.req.url).searchParams.get("day") ?? void 0;
  const rolled = await rollupDay(requested ?? defaultDay());
  if (!rolled.ok) {
    return c.json({ error: { message: `Rollup failed: ${rolled.error}` } }, 500);
  }
  const pruned = await pruneOlderThan();
  if (!pruned.ok) {
    return c.json(
      { day: rolled.day, buckets: rolled.buckets, error: { message: `Prune failed: ${pruned.error}` } },
      500
    );
  }
  return c.json({ day: rolled.day, buckets: rolled.buckets, pruned: pruned.pruned });
});
async function recheckDueKeys() {
  const at = Date.now();
  const floor = cfg.invalidRecheckFloorMinutes * 6e4;
  const quotaFloor = cfg.quotaRecheckFloorMinutes * 6e4;
  const due = (k) => {
    if (k.status === "dead") return k.lastCheckedAt === 0 || at - k.lastCheckedAt >= floor;
    if (k.status === "quota_exhausted") {
      if (k.nextAccessAt > 0) return k.nextAccessAt <= at;
      return k.lastCheckedAt === 0 || at - k.lastCheckedAt >= quotaFloor;
    }
    if (k.status === "cooling") return k.nextAccessAt <= at;
    if (k.status === "unverified") return true;
    if (!k.planValidated) return k.lastCheckedAt === 0 || at - k.lastCheckedAt >= floor;
    return false;
  };
  const candidates = (await listKeys()).filter(due).slice(0, cfg.recheckBatchSize);
  let checked = 0;
  let revived = 0;
  let stillQuota = 0;
  let failed = 0;
  let retired = 0;
  let plansValidated = 0;
  for (const k of candidates) {
    const raw2 = await rawKeyById(k.id);
    if (!raw2) continue;
    checked++;
    const result = await probeKey(raw2);
    const applied = await applyProbe(raw2, result);
    if (applied === "revived") revived++;
    else if (applied === "quota_exhausted") stillQuota++;
    else if (applied === "retired") retired++;
    else if (applied !== "cooling") failed++;
    if (result.tierEvidence) await markValidatedPlan(raw2, result.tierEvidence);
    if (!k.planValidated) {
      const tier = await probeTier(raw2);
      if (tier.tierEvidence && tier.tierEvidence.tier !== "unknown") {
        await markValidatedPlan(raw2, tier.tierEvidence);
        plansValidated++;
      }
    }
  }
  return { due: candidates.length, checked, revived, stillQuota, retired, failed, plansValidated };
}
app.post("/internal/keys/recheck", async (c) => {
  const presented = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || c.req.header("x-rollup-token") || "";
  const accepted = [cfg.adminToken, cfg.rollupToken, cfg.cronSecret].filter((t) => t.length > 0);
  if (accepted.length === 0) {
    return c.json(
      { error: { message: "Recheck disabled: no internal token is configured." } },
      403
    );
  }
  if (!accepted.includes(presented)) {
    return c.json({ error: { message: "Unauthorized." } }, 401);
  }
  const result = await recheckDueKeys();
  await flushPoolWrites();
  await recordNow("keys.recheck", {
    actor: actorFrom(c.req.header("user-agent")),
    target: "pool",
    detail: result
  });
  return c.json({
    ok: true,
    ...result,
    pool: await snapshot()
  });
});
var RECHECK_INTERVAL_MS = cfg.recheckIntervalMinutes * 6e4;
var recheckTimer = null;
var recheckBusy = false;
async function runRecheckOnce(trigger) {
  if (recheckBusy) return;
  recheckBusy = true;
  try {
    const r = await recheckDueKeys();
    await flushPoolWrites();
    if (r.checked > 0) {
      await recordNow("keys.recheck", {
        actor: trigger === "timer" ? "scheduler" : "traffic",
        target: "pool",
        detail: { ...r, trigger }
      });
      log("info", trigger === "timer" ? "recheck.tick" : "recheck.lazy", r);
    }
  } catch (e) {
    log("warn", "recheck.failed", { trigger, reason: e.message });
  } finally {
    recheckBusy = false;
  }
}
function startRecheckLoop() {
  if (recheckTimer || RECHECK_INTERVAL_MS <= 0) return;
  recheckTimer = setInterval(() => {
    void runRecheckOnce("timer");
  }, RECHECK_INTERVAL_MS);
  log("info", "recheck.scheduler_started", { intervalMs: RECHECK_INTERVAL_MS });
}
startRecheckLoop();
var LAZY_RECHECK_MS = cfg.lazyRecheckMs;
var lastLazyRecheckAt = 0;
function maybeRecheckDueKeys() {
  if (LAZY_RECHECK_MS <= 0) return;
  const at = Date.now();
  if (recheckBusy || at - lastLazyRecheckAt < LAZY_RECHECK_MS) return;
  lastLazyRecheckAt = at;
  void runRecheckOnce("lazy");
}
async function lazyRecheck(_c, next) {
  maybeRecheckDueKeys();
  await next();
}
app.notFound(
  (c) => c.json({ error: { message: `No route for ${c.req.method} ${new URL(c.req.url).pathname}` } }, 404)
);
app.onError((e, c) => {
  console.error("[omniproxy] unhandled:", e);
  return c.json({ error: { message: e.message } }, 500);
});
app.get("/pengatur/usage", (c) => {
  const url = new URL(c.req.url);
  return c.redirect("/pengatur/logs" + (url.search || ""), 302);
});
var usageDataHandler = (c) => {
  const q = new URL(c.req.url).searchParams;
  const filter = {
    day: q.get("day") ?? void 0,
    model: q.get("model") ?? void 0,
    key: q.get("key") ?? void 0,
    status: q.get("status") ?? void 0,
    route: q.get("route") ?? void 0
  };
  const page = Number(q.get("page") ?? 1) || 1;
  const pageSize = Number(q.get("pageSize") ?? 25) || 25;
  return c.json(usageOverview(page, pageSize, filter));
};
app.get("/pengatur/logs/data", usageDataHandler);
app.get("/pengatur/usage/data", usageDataHandler);
var usageExportHandler = (c) => {
  const q = new URL(c.req.url).searchParams;
  const filter = {
    day: q.get("day") ?? void 0,
    model: q.get("model") ?? void 0,
    key: q.get("key") ?? void 0,
    status: q.get("status") ?? void 0,
    route: q.get("route") ?? void 0
  };
  const snapshot2 = usageOverview(1, 200, filter);
  const csv = toCsv(snapshot2.rows);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="omniproxy-usage-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`
    }
  });
};
app.get("/pengatur/logs/export.csv", usageExportHandler);
app.get("/pengatur/usage/export.csv", usageExportHandler);
app.get("/pengatur/logs", (c) => c.html(USAGE_HTML));
app.get("/pengatur/settings", (c) => c.html(SETTINGS_HTML));
app.get("/pengatur/settings/data", async (c) => c.json(await settingsView()));
app.post("/pengatur/settings/rotation", async (c) => {
  const body = await c.req.json().catch(() => null);
  const n = Number(body?.maxKeyAttempts);
  if (!Number.isFinite(n) || n < MAX_ATTEMPTS_RANGE.min || n > MAX_ATTEMPTS_RANGE.max) {
    return c.json(
      {
        error: {
          message: `maxKeyAttempts must be a number between ${MAX_ATTEMPTS_RANGE.min} and ${MAX_ATTEMPTS_RANGE.max}.`
        }
      },
      400
    );
  }
  const value = Math.round(n);
  await setSetting(MAX_ATTEMPTS_KEY, String(value));
  await recordNow("settings.rotation", {
    actor: actorFrom(c.req.header("user-agent")),
    detail: { maxKeyAttempts: value }
  });
  return c.json({ ok: true, rotation: await rotationSetting() });
});
app.get("/pengatur/settings/export", async (c) => {
  const view = await settingsView();
  await recordNow("settings.export", {
    actor: actorFrom(c.req.header("user-agent")),
    detail: { envFlags: view.env.length }
  });
  return new Response(JSON.stringify(view, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="omniproxy-config-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json"`
    }
  });
});
app.get("/pengatur/audit", (c) => c.html(AUDIT_HTML));
app.get("/pengatur/audit/data", async (c) => {
  const q = c.req.query();
  const res = await list2({
    action: q.action?.trim() || void 0,
    since: q.since?.trim() || void 0,
    limit: q.limit ? Number(q.limit) : void 0
  });
  if (!res.ok) return c.json({ ok: false, error: { message: res.error ?? "audit query failed" } }, 500);
  return c.json(res);
});
app.get("/pengatur/settings/client-keys", async (c) => {
  const [keys, stats] = await Promise.all([listClientKeys(), clientKeyStats()]);
  return c.json({
    ok: true,
    keys,
    stats,
    /** true when CLIENT_TOKEN alone already gates /v1; the console says so */
    envToken: cfg.clientToken !== "",
    /** true once a key has ever been minted: `/v1` stays gated even at zero keys */
    armed: await clientKeysArmed(),
    storage: dbEnabled()
  });
});
app.post("/pengatur/settings/client-keys", async (c) => {
  if (!dbEnabled()) {
    return c.json({ error: { message: "storage disabled: no DATABASE_URL" } }, 400);
  }
  const body = await c.req.json().catch(() => null);
  const rawLabel = typeof body?.label === "string" ? body.label.trim() : "";
  const label = rawLabel === "" ? null : rawLabel.slice(0, 80);
  try {
    const created = await createClientKey(label);
    await recordNow("settings.client_key.create", {
      actor: actorFrom(c.req.header("user-agent")),
      // The raw key is never recorded; the id and label are enough to trace it.
      detail: { id: created.row.id, label }
    });
    return c.json({ ok: true, key: created.row, raw: created.raw });
  } catch (err2) {
    const message = err2 instanceof Error ? err2.message : "could not create the key";
    return c.json({ error: { message } }, 500);
  }
});
app.delete("/pengatur/settings/client-keys/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f]{12}$/.test(id)) {
    return c.json({ error: { message: "unknown key id" } }, 400);
  }
  try {
    const removed = await revokeClientKey(id);
    if (!removed) return c.json({ error: { message: "unknown key id" } }, 404);
    await recordNow("settings.client_key.revoke", {
      actor: actorFrom(c.req.header("user-agent")),
      detail: { id }
    });
    return c.json({ ok: true, id });
  } catch (err2) {
    const message = err2 instanceof Error ? err2.message : "could not revoke the key";
    return c.json({ error: { message } }, 500);
  }
});
var app_default = app;

// serverless/index.ts
init_pool();
var hydrated = null;
function ensureHydrated() {
  if (!hydrated) {
    hydrated = hydrate().then((n) => {
      console.log(`[omniproxy] cold-start hydrated ${n} keys storage=${storageMode}`);
      return n;
    });
  }
  return hydrated;
}
var listener = getRequestListener(app_default.fetch);
async function handler(req, res) {
  await ensureHydrated();
  return listener(req, res);
}
export {
  handler as default
};
/*! Bundled license information:

@neondatabase/serverless/index.mjs:
  (*! Bundled license information:
  
  ieee754/index.js:
    (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)
  
  buffer/index.js:
    (*!
     * The buffer module from node.js, for the browser.
     *
     * @author   Feross Aboukhadijeh <https://feross.org>
     * @license  MIT
     *)
  *)
*/
