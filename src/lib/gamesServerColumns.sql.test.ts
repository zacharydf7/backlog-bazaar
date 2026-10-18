// @vitest-environment node
//
// Exercises the REAL games_guard_server_columns trigger from schema.sql in
// PGlite: a player's own direct write (role authenticated, as PostgREST runs
// it) can't touch a game's coin-sensitive columns, while the same changes
// from the server (a security-definer RPC runs as its owner) go through, and
// the direct writes the app does make still work.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

const G = "00000000-0000-4000-8000-0000000000b1";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create table public.games (id uuid primary key, title text, status text not null default 'backlog',
      price_paid integer, reward integer, started_at timestamptz, finished_at timestamptz,
      resumed boolean not null default false, completionist boolean not null default false,
      in_rotation boolean not null default false, slot_id uuid, co_op boolean not null default false,
      ongoing boolean not null default false, hours real, personal_hours real, played_hours real,
      length_premium_owed integer not null default 0, length_fee_credit integer not null default 0,
      length_fee_credit_run timestamptz, started_economy_off boolean not null default false,
      started_story_locked boolean not null default false, progress_note text);
    grant all on public.games to authenticated;
  `);
  await db.exec(fn("games_guard_server_columns"));
  await db.exec(`create trigger games_aa_guard_server_columns before insert or update on public.games
    for each row execute function public.games_guard_server_columns()`);
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`reset role; delete from public.games;
    insert into public.games (id, title, status, price_paid, started_at, hours)
      values ('${G}', 'Long Game', 'playing', 150, now(), 60);`);
});

/** Run a statement as the player (a direct table write through PostgREST). */
async function asPlayer(sql: string) {
  await db.exec("set role authenticated");
  try {
    await db.exec(sql);
  } finally {
    await db.exec("reset role");
  }
}

describe("games_guard_server_columns", () => {
  it.each([
    ["set what the run paid", "update public.games set price_paid = 100000"],
    ["end a run directly", "update public.games set status = 'backlog'"],
    ["set a reward", "update public.games set reward = 500"],
    ["move it between lanes", "update public.games set in_rotation = true"],
    ["make it Endless", "update public.games set ongoing = true"],
    ["change its length outside set_personal_length", "update public.games set personal_hours = 500"],
    ["change the catalog length", "update public.games set hours = 500"],
    ["set when the run started", "update public.games set started_at = now() - interval '1 year'"],
    ["give it a slot", "update public.games set slot_id = gen_random_uuid()"],
    ["mark it a replay", "update public.games set resumed = true"],
    ["move it to the Completionist lane", "update public.games set completionist = true"],
    ["make it co-op", "update public.games set co_op = true"],
    ["bank a length fee credit", "update public.games set length_fee_credit = 500"],
    ["move the credit to another run", "update public.games set length_fee_credit_run = now()"],
    ["clear its length debt", "update public.games set length_premium_owed = 5"],
    ["start a run directly", "insert into public.games (id, title, status) values (gen_random_uuid(), 'Free', 'playing')"],
    ["add a game with a price paid", "insert into public.games (id, title, price_paid) values (gen_random_uuid(), 'Paid', 999)"],
  ])("refuses a player's direct write to %s", async (_label, sql) => {
    await expect(asPlayer(sql)).rejects.toThrow(/SERVER_COLUMNS/);
  });

  it("refuses filling in a missing length on a game in play", async () => {
    await db.exec("update public.games set hours = null");
    await expect(asPlayer("update public.games set hours = 1000")).rejects.toThrow(/SERVER_COLUMNS/);
  });

  it("lets the server make the same changes", async () => {
    await db.exec("update public.games set price_paid = 0, status = 'finished', reward = 300, in_rotation = true");
    expect((await db.query("select status, reward from public.games")).rows).toEqual([{ status: "finished", reward: 300 }]);
  });

  it("keeps the direct writes the app makes working", async () => {
    await asPlayer("update public.games set progress_note = 'Act 2', played_hours = 12");
    await db.exec("update public.games set status = 'backlog', price_paid = null, started_at = null");
    // Bazaar → Finished with its reward cleared, and an import filling in a missing length.
    await asPlayer("update public.games set status = 'finished', finished_at = now(), reward = null");
    await db.exec("update public.games set hours = null");
    await asPlayer("update public.games set hours = 40");
    await asPlayer("insert into public.games (id, title, status) values (gen_random_uuid(), 'New', 'wishlist')");
    expect((await db.query("select count(*)::int as n from public.games")).rows).toEqual([{ n: 2 }]);
  });
});
