// @vitest-environment node
//
// Exercises the REAL pay_rotation_milestones from schema.sql in an embedded
// Postgres (PGlite): every N live hours logged on a Rotation game pays coins
// once, only play logged while in Rotation counts, catch-up time never does,
// and with the economy off a milestone is recorded at 0 coins (no back-pay).
// Tables are trimmed to the columns it reads; economy_enabled and
// log_coin_event are stubbed. log_playtime's call was probed against the live
// schema in a rolled-back transaction.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

/** The real rotation_milestones table, minus its auth.users / games references. */
function milestonesTable(): string {
  const start = schema.indexOf("create table if not exists public.rotation_milestones (");
  const end = schema.indexOf("alter table public.rotation_milestones enable row level security;");
  return schema
    .slice(start, end)
    .replace(/ references auth\.users \(id\) on delete cascade/, "")
    .replace(/ references public\.games \(id\) on delete set null/, "");
}

const U = "00000000-0000-4000-8000-0000000000a1";
const R = "00000000-0000-4000-8000-0000000000b1";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.app_config (id integer primary key, rotation_milestone_hours numeric, rotation_milestone_reward integer);
    insert into public.app_config values (1, 10, 25);
    create table public.profiles (id uuid primary key, coins integer not null default 0, economy boolean not null default true);
    create table public.games (id uuid primary key, user_id uuid, title text, status text, in_rotation boolean not null default false);
    create table public.playtime_events (user_id uuid, game_id uuid, hours real, source text not null default 'live',
      in_rotation boolean not null default false, created_at timestamptz not null default now());
    create table public.coin_events (user_id uuid, kind text, delta integer, label text);
    ${milestonesTable()}
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select economy from public.profiles where id = p_user $$;
    create function public.log_coin_event(p_user uuid, p_kind text, p_coin_delta integer,
      p_charter_delta integer, p_coin_after integer, p_charter_after integer, p_game uuid,
      p_game_title text, p_label text, p_detail jsonb default '{}'::jsonb)
      returns void language sql as $$ insert into public.coin_events values (p_user, p_kind, p_coin_delta, p_label) $$;
  `);
  await db.exec(`create function public.player_tz(p_user uuid) returns text language sql as $$ select 'America/New_York' $$`);
  await db.exec(fn("is_live_play"));
  await db.exec(fn("rotation_game_hours"));
  await db.exec(fn("pay_rotation_milestones"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.rotation_milestones; delete from public.coin_events; delete from public.playtime_events;
    delete from public.games; delete from public.profiles;
    insert into public.profiles (id, coins) values ('${U}', 100);
    insert into public.games values ('${R}', '${U}', 'Hearthstone', 'playing', true);
  `);
});

async function log(hours: number, inRotation = true, source = "live", ago = "0 seconds") {
  await db.query(
    "insert into public.playtime_events (user_id, game_id, hours, source, in_rotation, created_at) values ($1, $2, $3, $4, $5, now() - $6::interval)",
    [U, R, hours, source, inRotation, ago],
  );
  const r = await db.query<{ paid: number }>("select public.pay_rotation_milestones($1, $2) as paid", [U, R]);
  return r.rows[0].paid;
}

async function coins() {
  return (await db.query<{ coins: number }>("select coins from public.profiles")).rows[0].coins;
}

describe("pay_rotation_milestones", () => {
  it("pays each 10 hours once, with a ledger line", async () => {
    expect(await log(6)).toBe(0);
    expect(await log(5)).toBe(25);
    expect(await log(1)).toBe(0);
    expect(await coins()).toBe(125);
    expect((await db.query("select kind, delta, label from public.coin_events")).rows).toEqual([
      { kind: "rotation_milestone", delta: 25, label: "10 hours" },
    ]);
  });

  it("pays every milestone a long session crosses, day after day", async () => {
    expect(await log(21, true, "live", "2 days")).toBe(50);
    expect(await log(14, true, "live", "1 day")).toBe(25);
    expect(await log(9)).toBe(25);
    expect((await db.query("select count(*)::int as n from public.rotation_milestones")).rows).toEqual([{ n: 4 }]);
  });

  it("counts at most 24 hours on any one day, so repeated logs can't mint coins", async () => {
    for (let i = 0; i < 9; i++) await log(20);
    // 180 hours logged today count as 24: two milestones, not eighteen.
    expect((await db.query("select count(*)::int as n from public.rotation_milestones")).rows).toEqual([{ n: 2 }]);
  });

  it("counts only live play logged while the game was in Rotation", async () => {
    await log(9, false); // played before it joined Rotation
    await log(30); // over 24 hours at once: catch-up time
    expect(await log(9)).toBe(0);
    expect(await log(1)).toBe(25);
  });

  it("records milestones at 0 coins with the economy off, so nothing is back-paid", async () => {
    await db.exec("update public.profiles set economy = false");
    expect(await log(12)).toBe(0);
    await db.exec("update public.profiles set economy = true");
    expect(await log(1)).toBe(0);
    expect(await coins()).toBe(100);
    expect((await db.query("select milestone, coins from public.rotation_milestones")).rows).toEqual([
      { milestone: 1, coins: 0 },
    ]);
  });

  it("pays nothing once the game leaves Rotation", async () => {
    await db.exec(`update public.games set in_rotation = false`);
    expect(await log(12)).toBe(0);
  });
});
