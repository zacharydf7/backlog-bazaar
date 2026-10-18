// @vitest-environment node
//
// Exercises the REAL set_personal_length from schema.sql in PGlite: shortening
// a game you're playing refunds the length fee's drop, but never more than the
// run paid to activate — a replay (or expansion run) paid nothing, so
// replaying, shortening and cancelling can't mint the fee over and over.
// economy_enabled, log_coin_event and auth.uid are stubbed; tables are trimmed.
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
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${U}'::uuid $$;
    create table public.app_config (id integer primary key, price_formula jsonb);
    insert into public.app_config values (1, '{"factors": {"length": {"enabled": true, "weight": 3}}}');
    create table public.profiles (id uuid primary key, coins integer not null default 0);
    create table public.games (id uuid primary key, user_id uuid, title text, status text, hours real,
      personal_hours real, price_paid integer, length_premium_owed integer not null default 0,
      started_at timestamptz, length_fee_credit integer not null default 0, length_fee_credit_run timestamptz,
      started_economy_off boolean not null default false, ongoing boolean not null default false);
    create table public.coin_events (user_id uuid, kind text, delta integer);
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select coalesce(current_setting('test.econ', true), 'on') = 'on' $$;
    create function public.log_coin_event(p_user uuid, p_kind text, p_coin_delta integer,
      p_charter_delta integer, p_coin_after integer, p_charter_after integer, p_game uuid,
      p_game_title text, p_label text, p_detail jsonb default '{}'::jsonb)
      returns void language sql as $$ insert into public.coin_events values (p_user, p_kind, p_coin_delta) $$;
  `);
  await db.exec(fn("set_personal_length"));
  // The real length history and its trigger (undo_action reads it).
  const start = schema.indexOf("create table if not exists public.game_length_events (");
  await db.exec(
    schema
      .slice(start, schema.indexOf("\n);", start) + 3)
      .replace(/ references auth\.users \(id\) on delete cascade/, "")
      .replace(/ references public\.games \(id\) on delete set null/, ""),
  );
  for (const sql of schema.match(/alter table public\.game_length_events add column if not exists [^;]+;/g)!) {
    await db.exec(sql);
  }
  await db.exec(fn("log_game_length_event"));
  const trig = schema.indexOf("create trigger games_log_length");
  await db.exec(schema.slice(trig, schema.indexOf(";", trig) + 1));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`delete from public.coin_events; delete from public.game_length_events; delete from public.games;
                 delete from public.profiles;
                 insert into public.profiles values ('${U}', 100);
                 select set_config('test.econ', 'on', false);`);
});

async function shorten(pricePaid: number | null) {
  // A 60-hour game: its length fee is 180, and 0 hours drops it to 0.
  await db.query(
    "insert into public.games (id, user_id, title, status, hours, price_paid, started_at) values ($1, $2, 'Long Game', 'playing', 60, $3, now())",
    [G, U, pricePaid],
  );
  return (await db.query<{ settled: number }>("select settled from public.set_personal_length($1, 0)", [G])).rows[0].settled;
}

describe("set_personal_length", () => {
  it("refunds a paid run's length fee drop", async () => {
    expect(await shorten(300)).toBe(180);
    expect((await db.query("select coins from public.profiles")).rows).toEqual([{ coins: 280 }]);
  });

  it("refunds a replay nothing: it paid nothing to activate", async () => {
    expect(await shorten(0)).toBe(0);
    expect((await db.query("select count(*)::int as n from public.coin_events")).rows).toEqual([{ n: 0 }]);
  });

  it("refunds no more than the run paid", async () => {
    expect(await shorten(120)).toBe(120);
  });

  it("costs nothing to shorten a replay and lengthen it back", async () => {
    expect(await shorten(0)).toBe(0);
    const back = await db.query<{ settled: number; premium_owed: number }>(
      "select settled, premium_owed from public.set_personal_length($1, null)",
      [G],
    );
    expect(back.rows[0]).toEqual({ settled: 0, premium_owed: 0 });
    expect((await db.query("select coins from public.profiles")).rows).toEqual([{ coins: 100 }]);
  });

  it("drops a credit left from an earlier run", async () => {
    expect(await shorten(0)).toBe(0); // 180 credit on this run
    await db.exec("update public.games set started_at = now() + interval '1 day'"); // a new run
    const back = await db.query<{ settled: number }>("select settled from public.set_personal_length($1, null)", [G]);
    expect(back.rows[0].settled).toBe(-100); // charged afresh: 100 now, the rest deferred
  });

  it("won't move a paid run's length while the economy is off", async () => {
    await db.query(
      "insert into public.games (id, user_id, title, status, hours, price_paid, started_at) values ($1, $2, 'Long Game', 'playing', 60, 200, now())",
      [G, U],
    );
    await db.exec("select set_config('test.econ', 'off', false)");
    await expect(db.query("select public.set_personal_length($1, 500)", [G])).rejects.toThrow(/economy back on/);
    // Shortening refunds nothing while it's off, so a finish can still settle down.
    const down = await db.query<{ settled: number }>("select settled from public.set_personal_length($1, 10)", [G]);
    expect(down.rows[0].settled).toBe(0);
  });

  it("logs every length change, the catalog length's too, with the run's credit", async () => {
    expect(await shorten(0)).toBe(0);
    await db.exec("update public.games set hours = 70");
    expect(
      (
        await db.query(
          "select to_hours, from_catalog_hours, catalog_hours, fee_credit from public.game_length_events order by created_at",
        )
      ).rows,
    ).toEqual([
      { to_hours: 0, from_catalog_hours: 60, catalog_hours: 60, fee_credit: 180 },
      { to_hours: 0, from_catalog_hours: 60, catalog_hours: 70, fee_credit: 180 },
    ]);
  });

  it("refunds nothing when the run's price was never recorded", async () => {
    expect(await shorten(null)).toBe(0);
  });
});
