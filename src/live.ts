/**
 * Gemini Live relay: a WebSocket proxy for Google's BidiGenerateContent
 * (the Gemini Live API), so a client can hold a real-time voice session
 * through the key pool instead of bringing its own Gemini key.
 *
 * Why this module is server-mode only: a Live session is one long-lived
 * bidirectional socket, and the Vercel deployment is a serverless
 * function (vercel.json: @vercel/node, maxDuration 60) that can neither
 * accept a WebSocket upgrade nor hold a connection. This file is
 * imported only by src/index.ts (the Bun server entry); the serverless
 * bundle (serverless/index.ts -> api/index.js) never sees it, so on
 * Vercel the Live path simply does not exist and every other route is
 * untouched.
 *
 * Key semantics, mirroring the REST gateway where the protocol allows:
 * - one session pins ONE pool key, chosen at connect with the same
 *   pick() the REST routes use (ready keys only, least-recently-used);
 *   rotation therefore happens between sessions, never inside one —
 *   Google ties the session to the credential that opened it.
 * - setup failover: while the session is still in its setup phase (the
 *   client's setup frame has not been answered with setupComplete), a
 *   key that refuses is exchanged for the next candidate and the setup
 *   frame replayed, so a dead or Live-quota-less key is invisible to
 *   the client beyond a slower connect. A key that provably rejects the
 *   credential itself is retired through markInvalid, exactly like a
 *   REST invalid-key verdict; quota refusals only exclude the key from
 *   this session (Live quota is a separate bucket — the REST machinery
 *   keeps judging the key on REST traffic).
 * - after setupComplete the relay is a pure pipe: frames pass verbatim
 *   in both directions, and a mid-session upstream death closes the
 *   client side (a session cannot change keys mid-flight).
 */
import type { Server, ServerWebSocket } from "bun";
import { clientKeysArmed, verifyClientKey } from "./client-keys.ts";
import { cfg } from "./config.ts";
import { log } from "./log.ts";
import { markInvalid, markUsed, maskKey, pick } from "./pool.ts";

/** The path Google's own Live clients connect to; SDKs pointed at this
 *  gateway with a custom base URL land here unchanged. */
export const LIVE_PATH =
  "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

const MAX_KEY_ATTEMPTS = 5;
const SETUP_TIMEOUT_MS = 10_000;

type Frame = string | ArrayBuffer | Uint8Array;

export type LiveData = {
  phase: "setup" | "live" | "closed";
  setupFrame: Frame | null;
  pending: Frame[];
  excluded: Set<string>;
  attempts: number;
  key: string | null;
  model: string | null;
  upstream: WebSocket | null;
  timer: ReturnType<typeof setTimeout> | null;
  lastErrorFrame: string | null;
};

export function isLivePath(pathname: string): boolean {
  return pathname === LIVE_PATH;
}

/**
 * The client-gate check with the same semantics as app.ts's clientGate
 * (env token OR a minted client_keys row; unconfigured means open),
 * adapted to a WebSocket handshake: browsers cannot set headers on a WS
 * connect, so the credential may also arrive as the `key` query
 * parameter — the shape Google's own Live endpoint uses.
 */
export async function liveAuthorized(req: Request): Promise<boolean> {
  const configured = cfg.clientToken !== "" || (await clientKeysArmed());
  if (!configured) return true;
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") ?? "";
  const presented =
    url.searchParams.get("key") ??
    req.headers.get("x-goog-api-key") ??
    req.headers.get("x-api-key") ??
    (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "");
  if (!presented) return false;
  if (cfg.clientToken && presented === cfg.clientToken) return true;
  return verifyClientKey(presented);
}

/**
 * fetch interceptor for the Bun server entry. Returns null when the
 * request is not a Live handshake (the Hono app handles it), a Response
 * when the handshake is refused, and undefined when the socket was
 * upgraded (Bun's contract: an upgraded fetch returns nothing).
 */
export async function liveHandshake(
  req: Request,
  server: Server<LiveData>,
): Promise<Response | null | undefined> {
  const url = new URL(req.url);
  if (!isLivePath(url.pathname)) return null;
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade.", { status: 426 });
  }
  if (!(await liveAuthorized(req))) {
    return new Response("Invalid API key.", { status: 401 });
  }
  const data: LiveData = {
    phase: "setup",
    setupFrame: null,
    pending: [],
    excluded: new Set(),
    attempts: 0,
    key: null,
    model: null,
    upstream: null,
    timer: null,
    lastErrorFrame: null,
  };
  return server.upgrade(req, { data })
    ? undefined
    : new Response("WebSocket upgrade failed.", { status: 400 });
}

/**
 * The text of a frame, whatever its WS framing: Google sends Live
 * messages as BINARY frames carrying plain JSON, so a string-only read
 * never sees setupComplete and every session would die as a "setup
 * timeout". Bytes are decoded for inspection only — forwarding always
 * uses the original frame verbatim.
 */
function frameText(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  return null;
}

function clearTimer(d: LiveData): void {
  if (d.timer) {
    clearTimeout(d.timer);
    d.timer = null;
  }
}

function closeClient(
  ws: ServerWebSocket<LiveData>,
  d: LiveData,
  code: number,
  reason: string,
): void {
  if (d.phase === "closed") return;
  d.phase = "closed";
  clearTimer(d);
  try {
    ws.close(code, reason.slice(0, 120));
  } catch {
    /* the client is already gone */
  }
}

/** End the current key attempt: judge the key, then try the next
 *  candidate or hand the client the honest end of the chain. */
function failAttempt(ws: ServerWebSocket<LiveData>, d: LiveData, why: string): void {
  const up = d.upstream;
  d.upstream = null;
  clearTimer(d);
  if (up) {
    try {
      up.close();
    } catch {
      /* already closed */
    }
  }
  if (d.phase === "closed") return;
  if (d.key) {
    log("warn", "live.key_failed", { key: maskKey(d.key), why, attempt: d.attempts });
    if (/api_key_invalid|api key not valid|permission_denied|reported as leaked/i.test(why)) {
      void markInvalid(d.key);
    }
    d.key = null;
  }
  if (d.attempts >= MAX_KEY_ATTEMPTS) {
    if (d.lastErrorFrame) {
      try {
        ws.send(d.lastErrorFrame);
      } catch {
        /* client gone */
      }
    }
    log("warn", "live.setup_exhausted", { attempts: d.attempts, model: d.model });
    closeClient(ws, d, 1011, "No pool key could open a Live session.");
    return;
  }
  void connectAttempt(ws, d);
}

async function connectAttempt(
  ws: ServerWebSocket<LiveData>,
  d: LiveData,
): Promise<void> {
  if (d.phase === "closed") return;
  d.attempts += 1;
  const st = await pick(d.excluded, undefined, "gemini");
  if (!st) {
    if (d.lastErrorFrame) {
      try {
        ws.send(d.lastErrorFrame);
      } catch {
        /* client gone */
      }
    }
    closeClient(ws, d, 1011, "No available Gemini API keys in pool.");
    return;
  }
  d.key = st.key;
  d.excluded.add(st.key);
  // Stamp usage like execute() does, or the LRU order never moves and
  // every new session retries the same first keys in the same order.
  void markUsed(st.key);
  const up = new WebSocket(
    `${cfg.liveUpstream}${LIVE_PATH}?key=${encodeURIComponent(st.key)}`,
  );
  d.upstream = up;
  d.timer = setTimeout(() => {
    if (d.upstream === up && d.phase === "setup") {
      failAttempt(ws, d, "setup timeout");
    }
  }, SETUP_TIMEOUT_MS);
  up.addEventListener("open", () => {
    if (d.upstream !== up) return;
    if (d.setupFrame != null) {
      try {
        up.send(d.setupFrame as string);
      } catch {
        /* the close handler owns the retry */
      }
    }
  });
  up.addEventListener("message", (ev: MessageEvent) => {
    if (d.upstream !== up || d.phase === "closed") return;
    onUpstreamFrame(ws, d, up, ev.data);
  });
  up.addEventListener("close", (ev: CloseEvent) => {
    if (d.upstream !== up) return;
    if (d.phase === "live") {
      log("info", "live.upstream_closed", {
        key: d.key ? maskKey(d.key) : null,
        code: ev.code,
      });
      closeClient(
        ws,
        d,
        ev.code >= 1000 && ev.code < 1016 ? ev.code : 1011,
        ev.reason || "upstream closed",
      );
    } else if (d.phase === "setup") {
      if (ev.code === 1007 || /not found|not supported|invalid argument/i.test(ev.reason || "")) {
        d.upstream = null;
        clearTimer(d);
        log("warn", "live.setup_rejected", { model: d.model, reason: (ev.reason || "").slice(0, 160) });
        closeClient(ws, d, 1007, ev.reason || "setup rejected");
        return;
      }
      failAttempt(ws, d, `upstream closed ${ev.code} ${(ev.reason || "").slice(0, 120)}`.trim());
    }
  });
  up.addEventListener("error", () => {
    /* Bun fires error before close; the close handler owns failover. */
  });
}

function onUpstreamFrame(
  ws: ServerWebSocket<LiveData>,
  d: LiveData,
  up: WebSocket,
  data: unknown,
): void {
  if (d.phase === "live") {
    try {
      ws.send(data as string);
    } catch {
      /* client gone; its close handler tears down */
    }
    return;
  }
  // Setup phase: only JSON frames carry the verdict — but Google
  // frames them as binary, so decode before judging.
  const text = frameText(data);
  if (text == null) return;
  let parsed: { setupComplete?: unknown; error?: { message?: unknown } } | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return; // not JSON: nothing to judge during setup
  }
  if (parsed && typeof parsed === "object" && "setupComplete" in parsed) {
    d.phase = "live";
    clearTimer(d);
    log("info", "live.session_open", {
      key: d.key ? maskKey(d.key) : null,
      model: d.model,
      attempts: d.attempts,
    });
    try {
      ws.send(data as string);
    } catch {
      /* client gone */
    }
    for (const f of d.pending) {
      try {
        up.send(f as string);
      } catch {
        /* upstream dying; its close handler closes the client */
      }
    }
    d.pending = [];
    return;
  }
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    d.lastErrorFrame = text;
    const msg =
      typeof parsed.error?.message === "string"
        ? parsed.error.message
        : JSON.stringify(parsed.error).slice(0, 200);
    failAttempt(ws, d, `upstream error: ${msg}`);
  }
  // Any other setup-phase frame is ignored rather than forwarded: the
  // client must see setupComplete before anything else.
}

export const liveWebsocket = {
  open(ws: ServerWebSocket<LiveData>): void {
    void connectAttempt(ws, ws.data);
  },
  message(ws: ServerWebSocket<LiveData>, message: string | Buffer): void {
    const d = ws.data;
    if (d.phase === "closed") return;
    const frame: Frame = message;
    if (d.phase === "live") {
      try {
        d.upstream?.send(frame as string);
      } catch {
        /* the upstream close handler owns teardown */
      }
      return;
    }
    if (d.setupFrame == null) {
      d.setupFrame = frame;
      const text = frameText(frame);
      if (text != null) {
        try {
          const parsed = JSON.parse(text) as { setup?: { model?: string } };
          d.model = typeof parsed?.setup?.model === "string" ? parsed.setup.model : null;
        } catch {
          /* the model is only for the log line */
        }
      }
      const up = d.upstream;
      if (up && up.readyState === WebSocket.OPEN) {
        try {
          up.send(frame as string);
        } catch {
          /* the upstream close handler owns the retry */
        }
      }
      return;
    }
    d.pending.push(frame);
  },
  close(ws: ServerWebSocket<LiveData>, code: number): void {
    const d = ws.data;
    const wasLive = d.phase === "live";
    d.phase = "closed";
    clearTimer(d);
    const up = d.upstream;
    d.upstream = null;
    if (up) {
      try {
        up.close(1000, "client closed");
      } catch {
        /* already closed */
      }
    }
    log("info", "live.session_closed", {
      key: d.key ? maskKey(d.key) : null,
      model: d.model,
      wasLive,
      code,
    });
  },
};
