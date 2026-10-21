/**
 * Test environment pinning and mock-upstream lifecycle.
 *
 * `cfg` and the pool's storage mode are both read at *module import* time, so
 * this module must be imported FIRST in every test file — before any
 * `../src/*` module. It deliberately imports nothing from `src/`.
 *
 * ORDER MATTERS. A module graph evaluates sibling imports concurrently, so a
 * `../src/config.ts` imported by a test file can be evaluated BEFORE this
 * module's body finishes. Every `process.env` write therefore happens in the
 * synchronous part of this module, before the `await` below; only the mock's
 * port is unknown up front, and the code reads it through a getter.
 *
 * The mock upstream binds an OS-assigned port and reports it on stdout. A
 * fixed port is a trap: a mock left behind by an earlier run keeps answering
 * with the OLD code while the new one fails to bind, and the suite then
 * "passes" against stale behaviour.
 */
process.env.KEY_COOLDOWN_MS = "5000";
process.env.KEY_5XX_COOLDOWN_MS = "100";
/** Small so the "whole pool is cooling" path terminates quickly. */
process.env.MAX_WAIT_MS = "600";
process.env.MAX_ATTEMPTS = "6";
process.env.LOG_LEVEL = "error";
/** Small ledger batch so the flush thresholds are reachable in a unit test. */
process.env.LEDGER_MAX_ROWS = "4";
process.env.LEDGER_FLUSH_MS = "40";
process.env.LEDGER_TAIL_ROWS = "50";
process.env.ADMIN_TOKEN = "test-admin-token";
process.env.CLIENT_TOKEN = "";
/** Short enough that the upstream-timeout path is reachable in a test. */
process.env.UPSTREAM_TIMEOUT_MS = "1500";
process.env.FALLBACK_TIMEOUT_MS = "800";
process.env.MODEL_CHAIN_BUDGET_MS = "4000";
/** Force the in-memory store and an empty seed: tests manage their own keys. */
delete process.env.GEMINI_API_KEYS;
delete process.env.DATABASE_URL;

export const MOCK_BASE = await bootMock();

/**
 * The upstream base is read through a getter (`cfg.upstream`), so setting it
 * after the mock reports its port is enough — no module has to be re-imported.
 */
process.env.GEMINI_BASE_URL = MOCK_BASE;

declare global {
  // eslint-disable-next-line no-var
  var __geminesxMockStarted: Promise<void> | undefined;
}

/**
 * Start the mock upstream and wait for it to report its port.
 *
 * The child dies with the runner: a mock that outlives the run would hold its
 * port and answer the NEXT run with stale behaviour.
 */
async function bootMock(): Promise<string> {
  const proc = Bun.spawn(
    ["bun", "run", new URL("./mock-upstream.ts", import.meta.url).pathname],
    { stdout: "pipe", stderr: "ignore" },
  );
  process.on("exit", () => proc.kill());

  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const match = /mock upstream on (\d+)/.exec(buffer);
    if (match) return `http://127.0.0.1:${match[1]}`;
  }

  proc.kill();
  throw new Error("mock upstream did not report a port within 10s");
}

/**
 * Idempotent across test files. The mock is already up when this module was
 * imported, so the promise resolves immediately.
 */
export async function ensureMock(): Promise<void> {
  if (!globalThis.__geminesxMockStarted) {
    globalThis.__geminesxMockStarted = Promise.resolve();
  }
  return globalThis.__geminesxMockStarted;
}
