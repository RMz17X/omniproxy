/**
 * Durable key material without a live database: a fake runner backs a
 * one-table in-memory store and records every statement it is handed.
 */
import { afterEach, expect, test } from "bun:test";

import "./env.ts";

import { setSqlRunner, type SqlResult } from "../src/db.ts";
import {
  deleteMaterial,
  loadMaterial,
  materialEnabled,
  saveMaterial,
} from "../src/key-material.ts";

type Call = { query: string; params: unknown[] };

let calls: Call[] = [];
let table = new Map<string, string>();

/** Install a runner over `table`; `fail` short-circuits every statement. */
function install(fail: SqlResult<unknown> | null = null): void {
  table = new Map();
  calls = [];
  setSqlRunner(async <T,>(query: string, params: unknown[]): Promise<SqlResult<T>> => {
    calls.push({ query, params });
    if (fail) return fail as SqlResult<T>;
    if (/^insert into key_material/i.test(query)) {
      table.set(String(params[0]), String(params[1]));
      return { ok: true, rows: [] };
    }
    if (/^select id, raw_key from key_material/i.test(query)) {
      const rows = [...table].map(([id, raw_key]) => ({ id, raw_key })) as T[];
      return { ok: true, rows };
    }
    if (/^delete from key_material/i.test(query)) {
      table.delete(String(params[0]));
      return { ok: true, rows: [] };
    }
    throw new Error(`unexpected statement: ${query}`);
  });
}

afterEach(() => setSqlRunner(null));

test("material is enabled exactly when the database is", () => {
  install();
  expect(materialEnabled()).toBe(true);
  setSqlRunner(null);
  expect(materialEnabled()).toBe(false);
});

test("saved material loads back under its id", async () => {
  install();
  saveMaterial("abc123", "AIzaPLAIN1");

  // `sqlLater` reaches the runner synchronously; nothing to await.
  const loaded = await loadMaterial();
  expect(loaded.get("abc123")).toBe("AIzaPLAIN1");
  expect(loaded.size).toBe(1);
});

test("the write is an upsert keyed on id", async () => {
  install();
  saveMaterial("abc123", "AIzaPLAIN1");

  expect(calls).toHaveLength(1);
  expect(calls[0]?.params).toEqual(["abc123", "AIzaPLAIN1"]);
  expect(calls[0]?.query).toContain("on conflict (id) do update");
});

test("a failed read yields an empty map and does not throw", async () => {
  install({ ok: false, reason: "disabled", message: "DATABASE_URL not set" });
  const loaded = await loadMaterial();
  expect(loaded.size).toBe(0);
});

test("blank rows are skipped and good rows beside them survive", async () => {
  install();
  table.set("aaaa", "   ");
  table.set("bbbb", "AIzaGOOD2");

  const loaded = await loadMaterial();
  expect(loaded.has("aaaa")).toBe(false);
  expect(loaded.get("bbbb")).toBe("AIzaGOOD2");
  expect(loaded.size).toBe(1);
});

test("delete removes the row by id", async () => {
  install();
  table.set("abc123", "AIzaPLAIN1");

  deleteMaterial("abc123");

  expect(calls).toHaveLength(1);
  expect(calls[0]?.query).toContain("delete from key_material");
  expect(calls[0]?.params).toEqual(["abc123"]);
  expect(table.has("abc123")).toBe(false);
});