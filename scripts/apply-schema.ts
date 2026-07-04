/**
 * Apply the database schema to Supabase from the command line:
 *
 *   npm run db:apply                 # runs the whole supabase/schema.sql
 *   npm run db:apply -- path/to.sql  # runs a specific SQL file instead
 *
 * schema.sql is the idempotent single source of truth (safe to re-run by
 * design), so the default full-file run both applies the newest migration
 * AND verifies the whole file still re-runs cleanly — the same thing as
 * pasting it into the Supabase SQL editor, minus the pasting.
 *
 * The whole file is sent as ONE multi-statement batch, which Postgres wraps
 * in a single implicit transaction: any error rolls the entire run back, so
 * a typo can't leave the schema half-applied.
 *
 * Credentials: set SUPABASE_DB_URL in .env.local (gitignored) to the
 * project's Session-pooler connection string (Dashboard → Connect →
 * Session pooler URI, with the database password filled in). This is a
 * direct Postgres connection — it bypasses RLS entirely — so it lives next
 * to the admin password and must never be committed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // absent — fine
  }
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error(
    "Missing SUPABASE_DB_URL.\n" +
      "Add the Session-pooler connection string to .env.local (gitignored):\n" +
      "  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres",
  );
  process.exit(1);
}

const target = resolve(process.argv[2] ?? "supabase/schema.sql");
let sql: string;
try {
  sql = readFileSync(target, "utf8");
} catch {
  console.error(`Cannot read ${target}`);
  process.exit(1);
}
if (!sql.trim()) {
  console.error(`${target} is empty — nothing to apply.`);
  process.exit(1);
}

/** 1-based line number for a Postgres error `position` (a character offset). */
function lineAt(text: string, position: number): number {
  return text.slice(0, Math.max(0, position - 1)).split("\n").length;
}

async function main() {
  const lines = sql.split("\n").length;
  console.log(`Applying ${target} (${lines} lines) …`);

  const client = new pg.Client({
    connectionString: dbUrl,
    // Supabase requires TLS; its pooler chain isn't in Node's default store.
    ssl: { rejectUnauthorized: false },
    // The full schema file takes a while — don't let a default timeout kill it.
    statement_timeout: 0,
  });

  const started = Date.now();
  await client.connect();
  try {
    // One multi-statement batch = one implicit transaction (all-or-nothing).
    await client.query(sql);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`✓ Applied cleanly in ${secs}s — nothing was left half-run.`);
  } catch (err) {
    const e = err as { message?: string; position?: string; hint?: string; code?: string };
    console.error("✗ Apply FAILED — the implicit transaction rolled everything back.");
    console.error(`  ${e.code ?? ""} ${e.message ?? String(err)}`.trim());
    if (e.position) {
      const line = lineAt(sql, Number(e.position));
      console.error(`  at ${target}:${line}`);
    }
    if (e.hint) console.error(`  hint: ${e.hint}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
