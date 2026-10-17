// @vitest-environment node
//
// Exercises the REAL break_clear_streak trigger from schema.sql in an embedded
// Postgres (PGlite): adding a new game to play resets the Clear Streak, and
// each carve-out (stealth, modifier-only copies, and live-service games since
// 2026-10-17) leaves it alone. Tables are trimmed to the columns it reads.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

function trigger(name: string): string {
  const start = schema.indexOf(`drop trigger if exists ${name} on public.games;`);
  if (start < 0) throw new Error(`trigger ${name} not found in schema.sql`);
  const execAt = schema.indexOf("execute function", start);
  return schema.slice(start, schema.indexOf(";", execAt) + 1);
}

const U = "00000000-0000-4000-8000-0000000000a1";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.profiles (id uuid primary key, clear_streak integer not null default 0);
    create table public.games (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null,
      stealth boolean not null default false, ongoing boolean not null default false,
      compilation_game_for uuid, copies jsonb not null default '[]'
    );
  `);
  await db.exec(fn("break_clear_streak"));
  await db.exec(trigger("games_break_clear_streak"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`delete from public.games; delete from public.profiles;
                 insert into public.profiles values ('${U}', 4);`);
});

async function add(cols: string, values: string) {
  await db.exec(`insert into public.games (user_id, status${cols}) values ('${U}', 'backlog'${values})`);
  const r = await db.query<{ clear_streak: number }>("select clear_streak from public.profiles");
  return r.rows[0].clear_streak;
}

describe("break_clear_streak", () => {
  it("resets the streak when a new game to play is added", async () => {
    expect(await add("", "")).toBe(0);
  });

  it("leaves it alone for a live-service game", async () => {
    expect(await add(", ongoing", ", true")).toBe(4);
  });

  it("leaves it alone for a stealth add or a subscription-only copy", async () => {
    expect(await add(", stealth", ", true")).toBe(4);
    expect(await add(", copies", `, '[{"platform":"PC","acquisition":"subscription"}]'`)).toBe(4);
  });
});
