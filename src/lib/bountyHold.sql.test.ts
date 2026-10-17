// @vitest-environment node
//
// Exercises the REAL games_release_bounty and games_guard_bounty_hold triggers
// from schema.sql in an embedded Postgres (PGlite), for the logged-time gate
// (coin outliers, 2026-10-17): a held bounty is released in proportion as a
// finished game's logged hours rise, all of it at the gate, never clawed back,
// frozen while the economy is off — and no client write can set the hold.
// Tables are trimmed to the columns the triggers read; economy_enabled and
// log_coin_event are stubbed. apply_finish's side was probed against the live
// schema in a rolled-back transaction (it depends on too much to extract).
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bountyRelease } from "./bountyHold";

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
const G = "00000000-0000-4000-8000-0000000000b1";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.profiles (id uuid primary key, coins integer not null default 0,
      economy boolean not null default true);
    create table public.games (
      id uuid primary key, user_id uuid not null, title text not null default 'Probe',
      status text not null default 'finished', played_hours real not null default 0,
      bounty_held integer not null default 0, bounty_held_total integer, bounty_gate_hours real
    );
    create table public.coin_events (user_id uuid, kind text, delta integer, after integer);
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select economy from public.profiles where id = p_user $$;
    create function public.log_coin_event(p_user uuid, p_kind text, p_coin_delta integer,
      p_charter_delta integer, p_coin_after integer, p_charter_after integer, p_game uuid,
      p_game_title text, p_label text, p_detail jsonb default '{}'::jsonb)
      returns void language sql as $$
        insert into public.coin_events values (p_user, p_kind, p_coin_delta, p_coin_after) $$;
  `);
  await db.exec(fn("games_release_bounty"));
  await db.exec(trigger("games_release_bounty"));
  await db.exec(fn("games_guard_bounty_hold"));
  await db.exec(trigger("games_bounty_guard"));
});

afterAll(async () => {
  await db.close();
});

/** A finished game holding 200 of a 300 bounty (100 paid), gate 10h. */
beforeEach(async () => {
  await db.exec(`
    delete from public.coin_events; delete from public.games; delete from public.profiles;
    insert into public.profiles (id, coins) values ('${U}', 1000);
    begin;
    select set_config('app.bounty_write', '1', true);
    insert into public.games (id, user_id, bounty_held, bounty_held_total, bounty_gate_hours)
      values ('${G}', '${U}', 200, 300, 10);
    commit;
  `);
});

async function logTo(hours: number) {
  await db.query("update public.games set played_hours = $1 where id = $2", [hours, G]);
}

async function state() {
  const g = await db.query<{ bounty_held: number; bounty_held_total: number | null }>(
    "select bounty_held, bounty_held_total from public.games where id = $1",
    [G],
  );
  const p = await db.query<{ coins: number }>("select coins from public.profiles where id = $1", [U]);
  return { ...g.rows[0], coins: p.rows[0].coins };
}

describe("games_release_bounty", () => {
  it("releases in proportion to logged hours, matching the client mirror", async () => {
    await logTo(5);
    expect(await state()).toMatchObject({ bounty_held: 150, coins: 1050 });
    expect(bountyRelease({ total: 300, held: 200, gateHours: 10, played: 5 })).toBe(50);
    await logTo(12);
    expect(await state()).toEqual({ bounty_held: 0, bounty_held_total: null, coins: 1200 });
    const ev = await db.query("select kind, delta from public.coin_events order by after");
    expect(ev.rows).toEqual([
      { kind: "bounty_release", delta: 50 },
      { kind: "bounty_release", delta: 150 },
    ]);
  });

  it("never claws back when logged hours go down", async () => {
    await logTo(5);
    await logTo(1);
    expect(await state()).toMatchObject({ bounty_held: 150, coins: 1050 });
  });

  it("holds while the economy is off, then releases on the next logged time", async () => {
    await db.exec(`update public.profiles set economy = false where id = '${U}'`);
    await logTo(12);
    expect(await state()).toMatchObject({ bounty_held: 200, coins: 1000 });
    await db.exec(`update public.profiles set economy = true where id = '${U}'`);
    await logTo(13);
    expect(await state()).toMatchObject({ bounty_held: 0, coins: 1200 });
  });
});

describe("games_guard_bounty_hold", () => {
  it("refuses a client raising its own hold, or inserting one", async () => {
    await expect(
      db.query("update public.games set bounty_held = 99999 where id = $1", [G]),
    ).rejects.toThrow(/BOUNTY_HOLD/);
    await expect(
      db.query(
        "insert into public.games (id, user_id, bounty_held, bounty_held_total, bounty_gate_hours) values (gen_random_uuid(), $1, 500, 500, 1)",
        [U],
      ),
    ).rejects.toThrow(/BOUNTY_HOLD/);
  });

  it("lets ordinary edits through untouched", async () => {
    await db.query("update public.games set title = 'Renamed' where id = $1", [G]);
    expect(await state()).toMatchObject({ bounty_held: 200 });
  });
});
