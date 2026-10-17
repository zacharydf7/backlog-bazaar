// @vitest-environment node
//
// Exercises the REAL claim_achievement_rewards and list_achievements from
// schema.sql in an embedded Postgres (PGlite). Medal rewards are claimed by
// hand (owner, 2026-10-17, including every medal earned before rewards
// existed): one medal or all at once, each paying exactly once with its own
// ledger row, paused while the economy is off. The trophy room masks a hidden
// medal until it's earned and shares claimed state only with its owner.
// Tables are trimmed to the columns these read; achievement_metrics,
// economy_enabled and log_coin_event are stubbed.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const m = new RegExp(`create (or replace )?function public\\.${name}\\(`).exec(schema);
  if (!m) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(m.index, schema.indexOf("\n$$;", m.index) + 4);
}

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const BRONZE = "00000000-0000-4000-8000-0000000000c1";
const SILVER = "00000000-0000-4000-8000-0000000000c2";
const SECRET = "00000000-0000-4000-8000-0000000000c3";
const SECRET2 = "00000000-0000-4000-8000-0000000000c4";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, coins integer not null default 0,
      economy boolean not null default true, blocked boolean not null default false,
      privacy jsonb not null default '{}'::jsonb);
    create table public.achievements (id uuid primary key, slug text, family text, tier smallint,
      name text, description text, icon text, metric text, threshold numeric, sort integer,
      hidden boolean not null default false, reward integer not null default 0);
    create table public.user_achievements (user_id uuid, achievement_id uuid,
      earned_at timestamptz not null default now(), value numeric, reward_paid_at timestamptz,
      primary key (user_id, achievement_id));
    create table public.coin_events (user_id uuid, kind text, coin_delta integer, coin_after integer,
      label text, detail jsonb);
    -- Coin events are covered in bonusEvents.sql.test.ts; none run here.
    create function public.bonus_event_pay(p_user uuid, p_game uuid, p_kind text, p_base integer)
      returns integer language sql as $$ select 0 $$;
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select economy from public.profiles where id = p_user $$;
    create function public.log_coin_event(p_user uuid, p_kind text, p_coin_delta integer,
      p_charter_delta integer, p_coin_after integer, p_charter_after integer, p_game uuid,
      p_game_title text, p_label text, p_detail jsonb default '{}'::jsonb)
      returns void language sql as $$
        insert into public.coin_events values (p_user, p_kind, p_coin_delta, p_coin_after, p_label, p_detail) $$;
    create function public.achievement_metrics(p_user uuid)
      returns table (metric text, value numeric) language sql
      as $$ select 'games_finished', 4::numeric union all select 'night_owl_logs', 0::numeric $$;
  `);
  await db.exec(fn("claim_achievement_rewards"));
  await db.exec(fn("list_achievements"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.coin_events; delete from public.user_achievements;
    delete from public.achievements; delete from public.profiles;
    insert into public.profiles (id, coins) values ('${ME}', 100), ('${OTHER}', 0);
    insert into public.achievements values
      ('${BRONZE}', 'first-clear', 'finisher', 1, 'First Clear', 'Finish a game', 'trophy', 'games_finished', 1, 1, false, 10),
      ('${SILVER}', 'seasoned', 'finisher', 2, 'Seasoned Finisher', 'Finish 10', 'trophy', 'games_finished', 10, 1, false, 25),
      ('${SECRET}', 'night-owl', 'night-owl', 1, 'Night Owl', 'Play past midnight', 'moon', 'night_owl_logs', 1, 30, true, 25),
      ('${SECRET2}', 'speed-clear', 'speed-clear', 1, 'Speed Clear', 'Clear fast', 'zap', 'night_owl_logs', 1, 31, true, 25);
    insert into public.user_achievements (user_id, achievement_id) values
      ('${ME}', '${BRONZE}'), ('${ME}', '${SECRET2}'), ('${OTHER}', '${BRONZE}');
    select set_config('test.uid', '${ME}', false);
  `);
});

async function claim(id: string | null = null) {
  const r = await db.query<{ paid: number; medals: number; coins: number }>(
    "select * from public.claim_achievement_rewards($1)",
    [id],
  );
  return r.rows[0];
}

describe("claim_achievement_rewards", () => {
  it("pays one medal, then the rest, and never the same medal twice", async () => {
    expect(await claim(BRONZE)).toEqual({ paid: 10, medals: 1, coins: 110 });
    expect(await claim()).toEqual({ paid: 25, medals: 1, coins: 135 });
    expect(await claim()).toEqual({ paid: 0, medals: 0, coins: 135 });
    const ledger = await db.query("select kind, coin_delta, coin_after, label from public.coin_events order by coin_after");
    expect(ledger.rows).toEqual([
      { kind: "achievement_reward", coin_delta: 10, coin_after: 110, label: "First Clear" },
      { kind: "achievement_reward", coin_delta: 25, coin_after: 135, label: "Speed Clear" },
    ]);
  });

  it("can't claim a medal you haven't earned or another player's", async () => {
    expect(await claim(SILVER)).toEqual({ paid: 0, medals: 0, coins: 100 });
    await claim();
    const other = await db.query("select reward_paid_at from public.user_achievements where user_id = $1", [OTHER]);
    expect(other.rows).toEqual([{ reward_paid_at: null }]);
  });

  it("holds rewards while the economy is off, then pays them once it's back", async () => {
    await db.exec(`update public.profiles set economy = false where id = '${ME}'`);
    await expect(claim()).rejects.toThrow(/paused/);
    await db.exec(`update public.profiles set economy = true where id = '${ME}'`);
    expect((await claim()).paid).toBe(35);
  });
});

describe("list_achievements", () => {
  async function list(user: string | null = null) {
    const r = await db.query<{ slug: string; family: string; name: string; metric_value: string | null;
      reward: number; reward_paid_at: Date | null; hidden: boolean }>(
      "select * from public.list_achievements($1)",
      [user],
    );
    return r.rows;
  }

  it("masks a hidden medal until it's earned", async () => {
    const rows = await list();
    const owl = rows.find((r) => r.family === `hidden:${SECRET}`);
    expect(owl).toMatchObject({ slug: "hidden", name: "Hidden achievement", metric_value: null, hidden: true, reward: 25 });
    expect(rows.find((r) => r.slug === "speed-clear")).toMatchObject({ name: "Speed Clear", hidden: true });
  });

  it("shows claimed state to its owner only", async () => {
    await claim(BRONZE);
    expect((await list()).find((r) => r.slug === "first-clear")?.reward_paid_at).not.toBeNull();
    await db.exec(`select set_config('test.uid', '${OTHER}', false)`);
    expect((await list(ME)).find((r) => r.slug === "first-clear")?.reward_paid_at).toBeNull();
  });
});
