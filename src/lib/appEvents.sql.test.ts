// @vitest-environment node
//
// Exercises the REAL log_app_events from schema.sql in an embedded Postgres
// (PGlite): the browser's batches land as the caller's own rows; unknown kinds
// are dropped, a batch is capped at 50, oversized detail is emptied, and a
// signed-out call writes nothing.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

const U = "00000000-0000-4000-8000-0000000000a1";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.app_events (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, session_id text,
      kind text not null, name text not null, detail jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.exec(fn("log_app_events"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`delete from public.app_events; select set_config('test.uid', '${U}', false);`);
});

async function log(events: unknown) {
  const r = await db.query<{ n: number }>("select public.log_app_events($1::jsonb) as n", [JSON.stringify(events)]);
  return r.rows[0].n;
}

describe("log_app_events", () => {
  it("stores the caller's events and drops unknown kinds", async () => {
    expect(
      await log([
        { kind: "screen", name: "backlog", session: "s1" },
        { kind: "hack", name: "x" },
        { kind: "search", name: "no_results", detail: { query: "zelda" } },
      ]),
    ).toBe(2);
    const r = await db.query<{ user_id: string; kind: string; detail: unknown }>(
      "select user_id, kind, detail from public.app_events order by kind",
    );
    expect(r.rows).toEqual([
      { user_id: U, kind: "screen", detail: {} },
      { user_id: U, kind: "search", detail: { query: "zelda" } },
    ]);
  });

  it("caps a batch at 50 and empties oversized detail", async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ kind: "feature", name: `f${i}` }));
    expect(await log(many)).toBe(50);
    await db.exec("delete from public.app_events");
    await log([{ kind: "error", name: "big", detail: { blob: "x".repeat(5000) } }]);
    const r = await db.query<{ detail: unknown }>("select detail from public.app_events");
    expect(r.rows[0].detail).toEqual({});
  });

  it("writes nothing for a signed-out caller or a malformed batch", async () => {
    await db.exec("select set_config('test.uid', '', false)");
    expect(await log([{ kind: "screen", name: "x" }])).toBe(0);
    await db.exec(`select set_config('test.uid', '${U}', false)`);
    expect(await log({ kind: "screen" })).toBe(0);
  });
});
