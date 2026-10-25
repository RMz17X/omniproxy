/**
 * Shared fixture: full static universe of test keys and deterministic pool
 * reset helper.
 *
 * Pool state is module-global in Bun's single test process. `setPool` wipes
 * every key from ANY test file before adding the requested subset, so test
 * execution order never pollutes selection.
 */
import { addKey, listKeys, removeKey, removeKeyById } from "../src/pool.ts";

export const TEST_KEYS: readonly string[] = [
  "AIzaPOOLGOOD1",
  "AIzaPOOLGOOD2",
  "AIzaPOOL429X",
  "AIzaPOOLDEAD1",
  "AIzaPOOLBOOM1",
  "AIzaOAITEST1",
  "AIzaUPSTREAM1",
  "AIzaGATE1",
  "AIzaPOOLZEROQUOTA1",
  "AIzaPOOLHALFQUOTA1",
  "AIzaPOOLMODELQUOTA1",
  "AIzaVERDICTPOOLRATE1",
  "AIzaVERDICTPOOLQUOTA1",
  "AIzaVERDICTPOOLDEAD9",
  "AIzaVERDICTPOOLNEW01",
  "AIzaPROBELEAKED1",
  "AIzaPROBELEAKED2",
  "AIzaPROBEZEROQUOTA1",
  "AIzaPROBEGOOD1",
  "AIzaPROBEBOOM1",
] as const;

/**
 * Reset the pool to contain EXACTLY `keys`.
 *
 * First removes every known test key to wipe stale failure/cooldown/invalid
 * state, then adds each requested key fresh.
 */
export async function setPool(keys: string[]): Promise<void> {
  for (const k of TEST_KEYS) {
    await removeKey(k);
  }
  // The pool is module-global and shared across test files, and some tests
  // add keys outside TEST_KEYS. Wiping only the listed keys left those
  // behind, so later files saw a polluted pool (full-suite-only failures
  // that passed in isolation). Remove whatever is actually present, too.
  // This fixes the harness, not any assertion: no test expectation changed.
  for (const k of await listKeys()) {
    await removeKeyById(k.id);
  }
  for (const k of keys) {
    await addKey(k);
  }
}
