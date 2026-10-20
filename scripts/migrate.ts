#!/usr/bin/env bun
/**
 * migrate.ts — apply src/schema.sql to the database named by DATABASE_URL.
 *
 * Idempotent: every statement uses `if not exists`, so running it on every
 * deploy is safe. With DATABASE_URL unset it prints a skip message and exits 0;
 * a missing database is a supported configuration, not a failure.
 *
 * Usage:
 *   DATABASE_URL=postgres://... bun run db:migrate
 */

import { neon } from "@neondatabase/serverless";

const url = (process.env.DATABASE_URL ?? "").trim();

if (!url) {
  console.log("[migrate] DATABASE_URL not set — skipping schema apply (storage disabled)");
  process.exit(0);
}

const schemaPath = new URL("../src/schema.sql", import.meta.url).pathname;
const schema = await Bun.file(schemaPath).text();

// Split on `;` at end of line; the schema has no procedural bodies, so this is
// exact. Comments are preserved and are legal statement prefixes.
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const sql = neon(url);

console.log(`[migrate] applying ${statements.length} statement(s) from src/schema.sql`);

for (const statement of statements) {
  try {
    await sql.query(statement, []);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Never echo the connection string.
    const message = raw.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
    console.error(`[migrate] failed: ${message}`);
    process.exit(1);
  }
}

console.log("[migrate] schema up to date");