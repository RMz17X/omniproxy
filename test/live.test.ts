/**
 * Gemini Live relay gate tests: the path matcher and the handshake
 * credential check. The socket pipe itself is proven end-to-end against
 * the real upstream; what a unit test can pin down is that ONLY the
 * BidiGenerateContent path is treated as a Live handshake and that the
 * gate accepts exactly the credentials the REST gate accepts.
 *
 * env.ts deliberately pins CLIENT_TOKEN to "" (the suite runs the REST
 * gate open), so this file configures a token on cfg for its own run
 * and restores "" afterwards — the shared process must find the gate
 * exactly as open as it was.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import "./env.ts";

import { cfg } from "../src/config.ts";
import { isLivePath, liveAuthorized, LIVE_PATH } from "../src/live.ts";

const TOKEN = "live-gate-test-token";
const req = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { headers });

beforeAll(() => {
  cfg.clientToken = TOKEN;
});
afterAll(() => {
  cfg.clientToken = "";
});

describe("Gemini Live relay gate", () => {
  test("only the BidiGenerateContent path is a live handshake", () => {
    expect(isLivePath(LIVE_PATH)).toBe(true);
    expect(isLivePath("/v1/audio/speech")).toBe(false);
    expect(isLivePath("/v1beta/models/gemini-2.5-flash:generateContent")).toBe(false);
  });

  test("the client token authorizes via query, goog header, or bearer", async () => {
    expect(await liveAuthorized(req(`${LIVE_PATH}?key=${TOKEN}`))).toBe(true);
    expect(await liveAuthorized(req(LIVE_PATH, { "x-goog-api-key": TOKEN }))).toBe(true);
    expect(await liveAuthorized(req(LIVE_PATH, { authorization: `Bearer ${TOKEN}` }))).toBe(true);
  });

  test("a wrong or missing credential is refused", async () => {
    expect(await liveAuthorized(req(`${LIVE_PATH}?key=not-the-token`))).toBe(false);
    expect(await liveAuthorized(req(LIVE_PATH))).toBe(false);
  });
});
