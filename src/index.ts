import type { Server } from "bun";
import app from "./app.ts";
import { liveHandshake, liveWebsocket, type LiveData } from "./live.ts";
import { hydrate, storageMode } from "./pool.ts";
import { cfg } from "./config.ts";

/* ---------- bootstrap ---------- */

// One cold-start read. The pool is memory-first; Postgres only supplies the
// durable identity overlay when DATABASE_URL is configured.
const seeded = await hydrate();

const port = Number(process.env.PORT ?? 3000);

console.log(
  `[omniproxy] up on :${port} storage=${storageMode} seed=${seeded} admin=${cfg.adminToken ? "on" : "off"}`,
);

export default {
  port,
  idleTimeout: 255,
  async fetch(req: Request, server: Server<LiveData>): Promise<Response | undefined> {
    // Gemini Live handshakes are intercepted before the Hono app: a
    // WebSocket upgrade is not an HTTP route, and the serverless build
    // (which never imports live.ts) keeps serving HTTP only.
    const live = await liveHandshake(req, server);
    if (live !== null) return live;
    return app.fetch(req);
  },
  websocket: liveWebsocket,
};