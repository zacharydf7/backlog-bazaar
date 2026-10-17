// @vitest-environment node
//
// Exercises the REAL Regular streak (pay_regular_week, my_regular_streak) from
// schema.sql in an embedded Postgres (PGlite): a week with at least an hour of
// live Rotation play pays once, weeks in a row grow the bonus up to its cap, a
// missed week starts over, and with the economy off the week still counts at
// 0 coins. Tables are trimmed; economy_enabled, log_coin_event and auth.uid
// are stubbed.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

/** The real regular_weeks table, minus its auth.users reference. */
function weeksTable(): string {
  const start = schema.indexOf("create table if not exists public.regular_weeks (");
  return schema.slice(start, schema.indexOf("\n);", start) + 3).replace(/ references auth\.users \(id\) on delete cascade/, "");
}

const U = "00000000-0000-4000-8000-0000000000a1";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.app_config (id integer primary key, rotation_reset_tz text, regular_min_hours numeric,
      regular_bonus_base integer, regular_bonus_step integer, regular_bonus_cap integer);
    insert into public.app_config values (1, 'America/New_York', 1, 10, 5, 20);
    create table public.profiles (id uuid primary key, coins integer not null default 0, economy boolean not null default true);
    create table public.playtime_events (user_id uuid, game_id uuid, hours real, source text not null default 'live',
      in_rotation boolean not null default false, created_at timestamptz not null default now());
    create table public.coin_events (user_id uuid, kind text, delta integer, label text);
    ${weeksTable()}
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${U}'::uuid $$;
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select economy from public.profiles where id = p_user $$;
    create function public.log_coin_event(p_user uuid, p_kind text, p_coin_delta integer,
      p_charter_delta integer, p_coin_after integer, p_charter_after integer, p_game uuid,
      p_game_title text, p_label text, p_detail jsonb default '{}'::jsonb)
      returns void language sql as $$ insert into public.coin_events values (p_user, p_kind, p_coin_delta, p_label) $$;
  `);
  for (const name of ["is_live_play", "recap_week", "rotation_live_hours", "pay_regular_week", "my_regular_streak"]) {
    await db.exec(fn(name));
  }
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`delete from public.regular_weeks; delete from public.coin_events; delete from public.playtime_events;
                 delete from public.profiles; insert into public.profiles (id, coins) values ('${U}', 0);`);
});

async function play(hours: number, inRotation = true) {
  await db.query("insert into public.playtime_events (user_id, hours, in_rotation) values ($1, $2, $3)", [U, hours, inRotation]);
  return (await db.query<{ paid: number }>("select public.pay_regular_week($1) as paid", [U])).rows[0].paid;
}

async function streak() {
  return (await db.query<{ s: Record<string, unknown> }>("select public.my_regular_streak() as s")).rows[0].s;
}

/** A Regular week `n` weeks back with the given streak. */
async function pastWeek(n: number, s: number) {
  await db.exec(`insert into public.regular_weeks (user_id, week, hours, streak)
                 select '${U}', w.week_start - ${7 * n}, 1, ${s} from public.recap_week(now()) w`);
}

describe("pay_regular_week", () => {
  it("pays once the week reaches an hour of Rotation play, and only once", async () => {
    expect(await play(0.5)).toBe(0);
    expect(await play(2, false)).toBe(0); // not Rotation play
    expect(await streak()).toMatchObject({ streak: 0, done: false, week_hours: 0.5, next_bonus: 10 });
    expect(await play(0.5)).toBe(10);
    expect(await play(3)).toBe(0);
    expect(await streak()).toMatchObject({ streak: 1, best: 1, done: true, next_bonus: 15 });
    expect((await db.query("select kind, delta, label from public.coin_events")).rows).toEqual([
      { kind: "regular_week", delta: 10, label: "Week 1" },
    ]);
  });

  it("grows the bonus for weeks in a row, up to the cap", async () => {
    await pastWeek(1, 3);
    expect(await streak()).toMatchObject({ streak: 3, done: false, next_bonus: 20 });
    expect(await play(1)).toBe(20); // 10 + 5×3 = 25, capped at 20
    expect(await streak()).toMatchObject({ streak: 4, best: 4 });
  });

  it("starts over after a missed week", async () => {
    await pastWeek(2, 5);
    expect(await streak()).toMatchObject({ streak: 0, best: 5 });
    expect(await play(1)).toBe(10);
    expect(await streak()).toMatchObject({ streak: 1, best: 5 });
  });

  it("counts the week at 0 coins with the economy off", async () => {
    await db.exec("update public.profiles set economy = false");
    expect(await play(1)).toBe(0);
    expect(await streak()).toMatchObject({ streak: 1, done: true });
    expect((await db.query("select coins from public.profiles")).rows).toEqual([{ coins: 0 }]);
  });
});
