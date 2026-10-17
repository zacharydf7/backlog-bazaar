// @vitest-environment node
//
// Exercises the REAL games_guard_compilation_game trigger from schema.sql in an
// embedded Postgres (PGlite), for issue 86fc0b4b: a compilation's own game row
// is made only through the definer functions (which set app.compilation_game),
// and is refused any economy change — so every buy/finish/log-time RPC fails
// whole on one — while its review, like, cover and the like stay editable.
// The table is trimmed to the columns the guard reads.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

/** The `create or replace function public.<name>(` ... `$$;` block. */
function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

/** The `drop trigger if exists <name> ... execute function ...;` pair. */
function trigger(name: string): string {
  const start = schema.indexOf(`drop trigger if exists ${name} on public.games;`);
  if (start < 0) throw new Error(`trigger ${name} not found in schema.sql`);
  const execAt = schema.indexOf("execute function", start);
  return schema.slice(start, schema.indexOf(";", execAt) + 1);
}

const COMP = "00000000-0000-4000-8000-0000000000b1";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.games (
      id uuid primary key default gen_random_uuid(),
      title text not null default 'Game',
      status text not null default 'backlog',
      finish_tag text, started_at timestamptz, finished_at timestamptz,
      reward integer, price_paid integer, played_hours real not null default 0,
      slot_id uuid, in_rotation boolean not null default false, rotation_origin text,
      pre_rotation_ongoing boolean, completionist boolean not null default false,
      co_op boolean not null default false, resumed boolean not null default false,
      personal_hours real, length_premium_owed integer not null default 0,
      started_economy_off boolean not null default false,
      started_story_locked boolean not null default false,
      family_id uuid, family_primary_game_id uuid, family_cover_game_id uuid,
      prerequisite_game_id uuid, compilation_id uuid,
      preordered_at timestamptz, preorder_expected_on date,
      ongoing boolean not null default false,
      review text, liked_at timestamptz, image text, priority text,
      compilation_game_for uuid
    );
  `);
  await db.exec(fn("games_guard_compilation_game"));
  await db.exec(trigger("games_guard_compilation_game"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec("delete from public.games");
});

/** A compilation game, made the way the definer functions make one. */
async function container(): Promise<string> {
  await db.exec("begin");
  await db.exec("select set_config('app.compilation_game', '1', true)");
  const res = await db.query<{ id: string }>(
    "insert into public.games (title, compilation_game_for) values ('Bundle', $1) returning id",
    [COMP],
  );
  await db.exec("commit");
  return res.rows[0].id;
}

describe("games_guard_compilation_game (86fc0b4b)", () => {
  it("refuses making a compilation game outside the definer functions", async () => {
    await expect(
      db.query("insert into public.games (compilation_game_for) values ($1)", [COMP]),
    ).rejects.toThrow(/COMPILATION_GAME/);
    const plain = await db.query<{ id: string }>("insert into public.games default values returning id");
    await expect(
      db.query("update public.games set compilation_game_for = $1 where id = $2", [COMP, plain.rows[0].id]),
    ).rejects.toThrow(/COMPILATION_GAME/);
  });

  it("refuses any economy change on a compilation game", async () => {
    const id = await container();
    for (const set of [
      "status = 'playing'",
      "price_paid = 40",
      "played_hours = 2",
      "completionist = true",
      "prerequisite_game_id = gen_random_uuid()",
      "preordered_at = now()",
    ]) {
      await expect(db.query(`update public.games set ${set} where id = $1`, [id])).rejects.toThrow(
        /a compilation is played through the games inside it/,
      );
    }
  });

  it("lets its review, like, cover and priority change, and sheds ongoing", async () => {
    const id = await container();
    await db.query(
      "update public.games set review = 'Great', liked_at = now(), image = 'x.png', priority = 'high', ongoing = true where id = $1",
      [id],
    );
    const row = await db.query<{ review: string; ongoing: boolean }>(
      "select review, ongoing from public.games where id = $1",
      [id],
    );
    expect(row.rows[0]).toEqual({ review: "Great", ongoing: false });
  });

  it("leaves ordinary games alone", async () => {
    const res = await db.query<{ id: string }>("insert into public.games default values returning id");
    await db.query("update public.games set status = 'playing', price_paid = 40 where id = $1", [res.rows[0].id]);
  });
});
