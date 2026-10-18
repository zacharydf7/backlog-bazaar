// @vitest-environment node
//
// Exercises the REAL pay_session_bonus from schema.sql in an embedded Postgres
// (PGlite): each logging of play time pays the Daily Session bonus, up to the
// daily cap (owner, 2026-10-17: 3 x 5 coins), with no minimum by default; a
// minimum, the economy switch and an empty log all hold it back. Tables are
// trimmed to the columns it reads; economy_enabled and log_coin_event stubbed.
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
const G = "00000000-0000-4000-8000-0000000000b1";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.profiles (id uuid primary key, coins integer not null default 0,
      economy boolean not null default true);
    create table public.games (id uuid primary key, title text, status text not null default 'playing',
      demo boolean not null default false);
    create table public.app_config (id integer primary key, session_bonus integer,
      session_bonus_min_minutes integer, session_bonus_daily_cap integer, rotation_reset_tz text);
    insert into public.app_config values (1, 5, 0, 3, 'UTC');
    create table public.coin_events (user_id uuid, kind text, coin_delta integer,
      created_at timestamptz not null default now());
    -- Coin events are covered in bonusEvents.sql.test.ts; none run here.
    create function public.bonus_event_pay(p_user uuid, p_game uuid, p_kind text, p_base integer)
      returns integer language sql as $$ select 0 $$;
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select economy from public.profiles where id = p_user $$;
    create function public.log_coin_event(p_user uuid, p_kind text, p_coin_delta integer,
      p_charter_delta integer, p_coin_after integer, p_charter_after integer, p_game uuid,
      p_game_title text, p_label text, p_detail jsonb default '{}'::jsonb)
      returns void language sql as $$
        insert into public.coin_events (user_id, kind, coin_delta) values (p_user, p_kind, p_coin_delta) $$;
  `);
  await db.exec(fn("pay_session_bonus"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.coin_events; delete from public.games; delete from public.profiles;
    insert into public.profiles (id, coins) values ('${U}', 100);
    insert into public.games (id, title) values ('${G}', 'Doom');
    update public.app_config set session_bonus = 5, session_bonus_min_minutes = 0, session_bonus_daily_cap = 3;
  `);
});

async function log(hours: number) {
  const r = await db.query<{ paid: number }>("select public.pay_session_bonus($1, $2, $3) as paid", [U, G, hours]);
  return r.rows[0].paid;
}

async function coins() {
  return (await db.query<{ coins: number }>("select coins from public.profiles where id = $1", [U])).rows[0].coins;
}

describe("pay_session_bonus", () => {
  it("pays 5 coins for each log, any length, up to 3 a day", async () => {
    expect([await log(0.05), await log(2), await log(0.5), await log(1)]).toEqual([5, 5, 5, 0]);
    expect(await coins()).toBe(115);
  });

  it("pays nothing on a demo's time", async () => {
    await db.exec(`update public.games set status = 'wishlist', demo = true`);
    expect(await log(1)).toBe(0);
    expect(await coins()).toBe(100);
  });

  it("starts the count again the next day", async () => {
    await db.exec(`insert into public.coin_events (user_id, kind, coin_delta, created_at)
      select '${U}', 'session_bonus', 5, now() - interval '1 day' from generate_series(1, 3)`);
    expect(await log(1)).toBe(5);
  });

  it("holds back a log under the minimum, an empty log, or one with the economy off", async () => {
    await db.exec("update public.app_config set session_bonus_min_minutes = 20");
    expect(await log(0.25)).toBe(0); // 15 minutes
    expect(await log(0.5)).toBe(5);
    expect(await log(0)).toBe(0);
    await db.exec(`update public.profiles set economy = false where id = '${U}'`);
    expect(await log(1)).toBe(0);
  });
});
