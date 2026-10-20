/**
 * Test environment pinning and mock-upstream lifecycle.
 *
 * `cfg`, `USE_KV` and the pool's storage mode are all read at *module import*
 * time, so this module must be imported FIRST in every test file — before any
 * `../src/*` module. It deliberately imports nothing from `src/`.
 *
 * The shared key universe and `setPool()` live in `./fixture.ts`, which test
 * files import second.
 */
export const MOCK_BASE = "http://127.0.0.1:8089";

process.env.GEMINI_BASE_URL = MOCK_BASE;
/** Long enough that a test can observe a parked key without racing it. */
process.env.KEY_COOLDOWN_MS = "5000";
process.env.KEY_5XX_COOLDOWN_MS = "100";
/** Small so the "whole pool is cooling" path terminates quickly. */
process.env.MAX_WAIT_MS = "600";
process.env.MAX_ATTEMPTS = "6";
process.env.LOG_LEVEL = "error";
process.env.ADMIN_TOKEN = "test-admin-token";
process.env.CLIENT_TOKEN = "";
/** Force the in-memory store and an empty seed: tests manage their own keys. */
delete process.env.GEMINI_API_KEYS;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

declare global {
  // eslint-disable-next-line no-var
  var __geminesxMockStarted: Promise<void> | undefined;
}

async function probe(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Boot the mock Gemini upstream once per test process and return when it
 * answers. Idempotent across test files; the child dies with the runner.
 */
export async function ensureMock(): Promise<void> {
  if (globalThis.__geminesxMockStarted) return globalThis.__geminesxMockStarted;
  globalThis.__geminesxMockStarted = (async () => {
    const proc = Bun.spawn(
      ["bun", "run", new URL("./mock-upstream.ts", import.meta.url).pathname],
      { stdout: "ignore", stderr: "ignore" },
    );
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (await probe(`${MOCK_BASE}/`)) {
        process.on("exit", () => proc.kill());
        return;
      }
      await Bun.sleep(50);
    }
    proc.kill();
    globalThis.__geminesxMockStarted = undefined;
    throw new Error(`mock upstream did not come up on ${MOCK_BASE}`);
  })();
  return globalThis.__geminesxMockStarted;
}
