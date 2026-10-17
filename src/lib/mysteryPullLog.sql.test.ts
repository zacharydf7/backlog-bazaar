// @vitest-environment node
//
// Exercises the REAL log_mystery_pull from schema.sql in an embedded Postgres
// (PGlite): a confirmed pull is recorded against the caller's own game, and a
// "Help me choose" pick (kind 'picker', 2026-10-17) keeps the answers and the
// suggestions shown as a small JSON object. Tables are trimmed; auth.uid and
// assert_not_compilation_game are stubbed.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

const ME = "00000000-0000-4000-8000-0000000000a1";
const G = "00000000-0000-4000-8000-0000000000b1";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function public.assert_not_compilation_game(p uuid) returns void language sql as $$ select $$;
    create table public.games (id uuid primary key, user_id uuid, title text);
    create table public.mystery_pull_events (user_id uuid, game_id uuid, game_title text,
      rerolls integer, kind text, detail jsonb);
  `);
  await db.exec(fn("log_mystery_pull"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.mystery_pull_events; delete from public.games;
    insert into public.games values ('${G}', '${ME}', 'Hollow Knight');
    select set_config('test.uid', '${ME}', false);
  `);
});

const log = (kind: string, detail: unknown = {}) =>
  db.query("select public.log_mystery_pull($1, 0, $2, $3::jsonb)", [G, kind, JSON.stringify(detail)]);

describe("log_mystery_pull", () => {
  it("records a picker choice with its answers and suggestions", async () => {
    await log("picker", { aim: "series", suggested: [G], rank: 1 });
    const row = await db.query("select game_title, kind, detail from public.mystery_pull_events");
    expect(row.rows).toEqual([
      { game_title: "Hollow Knight", kind: "picker", detail: { aim: "series", suggested: [G], rank: 1 } },
    ]);
  });

  it("refuses an unknown kind or detail that isn't a small object", async () => {
    await expect(log("lucky")).rejects.toThrow(/Unknown pull kind/);
    await expect(log("picker", [1, 2])).rejects.toThrow(/small object/);
    await expect(log("picker", { pad: "x".repeat(5000) })).rejects.toThrow(/small object/);
  });

  it("only logs your own games", async () => {
    await db.exec("select set_config('test.uid', '00000000-0000-4000-8000-0000000000a2', false)");
    await expect(log("play")).rejects.toThrow(/not found in your library/);
  });
});
