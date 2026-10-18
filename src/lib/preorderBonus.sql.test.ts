// @vitest-environment node
//
// Exercises the REAL pre-order arrival bonus (pay_preorder_bonus and its
// trigger) from schema.sql in an embedded Postgres (PGlite): an arrival pays
// once per game when the pre-order was placed at least 7 days before (the
// server's 'placed' event, not the client-written marker), at most 5 a month,
// never on a cancel, and at 0 coins with the economy off. Tables are trimmed;
// economy_enabled, log_coin_event and game_identity_key are stubbed.
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

/** The real preorder_bonuses table, minus its foreign keys. */
function bonusesTable(): string {
  const start = schema.indexOf("create table if not exists public.preorder_bonuses (");
  return schema
    .slice(start, schema.indexOf("\n);", start) + 3)
    .replace(/ references auth\.users \(id\) on delete cascade/, "")
    .replace(/ references public\.games \(id\) on delete set null/, "");
}

const U = "00000000-0000-4000-8000-0000000000a1";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.app_config (id integer primary key, preorder_bonus integer, preorder_bonus_lead_days integer,
      preorder_bonus_monthly_cap integer, rotation_reset_tz text);
    insert into public.app_config values (1, 50, 7, 5, 'America/New_York');
    create table public.profiles (id uuid primary key, coins integer not null default 0, economy boolean not null default true);
    create table public.games (id uuid primary key default gen_random_uuid(), user_id uuid, title text,
      status text not null default 'backlog', preordered_at timestamptz, rawg_id integer, igdb_id integer, catalog_id uuid);
    create table public.preorder_events (user_id uuid, game_id uuid, action text, created_at timestamptz not null default now());
    create table public.coin_events (user_id uuid, kind text, delta integer, label text);
    ${bonusesTable()}
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select economy from public.profiles where id = p_user $$;
    create function public.game_identity_key(p_rawg integer, p_igdb integer, p_catalog uuid) returns text
      language sql as $$ select case when p_rawg is not null then 'r:' || p_rawg end $$;
    create function public.log_coin_event(p_user uuid, p_kind text, p_coin_delta integer,
      p_charter_delta integer, p_coin_after integer, p_charter_after integer, p_game uuid,
      p_game_title text, p_label text, p_detail jsonb default '{}'::jsonb)
      returns void language sql as $$ insert into public.coin_events values (p_user, p_kind, p_coin_delta, p_label) $$;
  `);
  await db.exec(fn("pay_preorder_bonus"));
  await db.exec(trigger("games_preorder_zz_bonus"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`delete from public.preorder_bonuses; delete from public.coin_events; delete from public.preorder_events;
                 delete from public.games; delete from public.profiles;
                 insert into public.profiles (id, coins) values ('${U}', 0);`);
});

/** A pre-order placed `days` ago (per the server's event), optionally of a
 *  catalog game; returns its id. */
async function preorder(days: number, rawg: number | null = null): Promise<string> {
  const r = await db.query<{ id: string }>(
    "insert into public.games (user_id, title, preordered_at, rawg_id) values ($1, 'Metroid', now(), $2) returning id",
    [U, rawg],
  );
  const id = r.rows[0].id;
  await db.query(
    "insert into public.preorder_events (user_id, game_id, action, created_at) values ($1, $2, 'placed', now() - make_interval(days => $3))",
    [U, id, days],
  );
  return id;
}

async function arrive(id: string) {
  await db.query("update public.games set preordered_at = null where id = $1", [id]);
}

async function coins() {
  return (await db.query<{ coins: number }>("select coins from public.profiles")).rows[0].coins;
}

describe("pay_preorder_bonus", () => {
  it("pays 50 when a pre-order placed a week or more ahead arrives", async () => {
    await arrive(await preorder(10));
    expect(await coins()).toBe(50);
    expect((await db.query("select kind, delta, label from public.coin_events")).rows).toEqual([
      { kind: "preorder_bonus", delta: 50, label: "Pre-order arrived" },
    ]);
  });

  it("pays nothing for a pre-order marked less than 7 days before it arrived", async () => {
    await arrive(await preorder(3));
    expect(await coins()).toBe(0);
  });

  it("ignores a client-backdated marker: only the server's placed time counts", async () => {
    const id = await preorder(1);
    await db.query("update public.games set preordered_at = now() - interval '90 days' where id = $1", [id]);
    await arrive(id);
    expect(await coins()).toBe(0);
  });

  it("pays once per game, even across two copies", async () => {
    await arrive(await preorder(10, 77));
    await arrive(await preorder(10, 77));
    expect(await coins()).toBe(50);
  });

  it("pays at most 5 a month", async () => {
    for (let i = 0; i < 7; i++) await arrive(await preorder(10, 100 + i));
    expect(await coins()).toBe(250);
    expect((await db.query("select count(*)::int as n from public.preorder_bonuses")).rows).toEqual([{ n: 7 }]);
  });

  it("pays nothing on a cancel (the game leaves the Bazaar)", async () => {
    const id = await preorder(10);
    await db.query("update public.games set preordered_at = null, status = 'wishlist' where id = $1", [id]);
    expect(await coins()).toBe(0);
  });

  it("records the arrival at 0 coins with the economy off, so it never back-pays", async () => {
    await db.exec("update public.profiles set economy = false");
    const id = await preorder(10, 5);
    await arrive(id);
    await db.exec("update public.profiles set economy = true");
    await db.query("update public.games set preordered_at = now() where id = $1", [id]);
    await arrive(id);
    expect(await coins()).toBe(0);
  });
});
