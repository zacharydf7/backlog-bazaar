// @vitest-environment node
//
// Exercises the REAL weekly recap functions from schema.sql in an embedded
// Postgres (PGlite). The recap for the week just ended (Monday to Sunday) is
// built the first time it's asked for, stored once with one bell
// notification, and skipped entirely for a quiet week (owner, 2026-10-17).
// Coins are left out while the economy is off, and only the owner can mark
// their recap seen. Tables are trimmed to the columns these read;
// achievement_metrics, economy_enabled and auth.uid are stubbed.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const G1 = "00000000-0000-4000-8000-0000000000b1";
const G2 = "00000000-0000-4000-8000-0000000000b2";
const G3 = "00000000-0000-4000-8000-0000000000b3";
/** A moment in the middle of last week. */
const LAST_WEEK = "(select starts + interval '2 days' from public.recap_week(now() - interval '7 days'))";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.app_config (id integer primary key, rotation_reset_tz text, bounty_gate_pct integer);
    insert into public.app_config values (1, 'UTC', 25);
    create table public.profiles (id uuid primary key, economy boolean not null default true,
      clear_streak integer not null default 0, clear_streak_best integer not null default 0);
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select economy from public.profiles where id = p_user $$;
    create table public.games (id uuid primary key, user_id uuid, title text, status text, finish_tag text,
      personal_hours real, hours real, played_hours real);
    create table public.playtime_events (user_id uuid, game_id uuid, game_title text, hours real,
      source text not null default 'live', created_at timestamptz not null default now());
    create table public.action_undos (user_id uuid, game_id uuid, action text, undone_at timestamptz,
      created_at timestamptz not null default now());
    create table public.game_status_events (user_id uuid, game_id uuid, to_status text,
      created_at timestamptz not null default now());
    create table public.play_sessions (user_id uuid, status text, ended_at timestamptz);
    create table public.coin_events (user_id uuid, kind text, coin_delta integer, created_at timestamptz not null default now());
    create table public.achievements (id uuid primary key default gen_random_uuid(), family text, tier smallint,
      name text, description text, metric text, threshold numeric, hidden boolean not null default false,
      reward integer not null default 0);
    create table public.user_achievements (user_id uuid, achievement_id uuid, earned_at timestamptz not null default now(),
      reward_paid_at timestamptz);
    create function public.achievement_metrics(p_user uuid) returns table (metric text, value numeric)
      language sql as $$ select 'games_finished', 8::numeric $$;
    create table public.user_monthly_goals (user_id uuid, goal_name text, reward integer, completed_at timestamptz,
      reward_paid_at timestamptz);
    create table public.monthly_goal_bonuses (user_id uuid, reward integer, reward_paid_at timestamptz);
    create table public.user_seasonal_challenges (user_id uuid, challenge_name text, reward integer,
      completed_at timestamptz, reward_paid_at timestamptz);
    create table public.notifications (user_id uuid, type text, title text, body text, link text);
    create table public.user_time_zones (user_id uuid primary key, time_zone text not null);
    create table public.user_quick_goals (user_id uuid, reward integer, completed_at timestamptz, reward_paid_at timestamptz);
    create table public.weekly_sweep_bonuses (user_id uuid, reward integer, reward_paid_at timestamptz);
    create table public.weekly_recaps (id uuid primary key default gen_random_uuid(), user_id uuid,
      week_start date, data jsonb, created_at timestamptz not null default now(), seen_at timestamptz,
      unique (user_id, week_start));
  `);
  for (const name of ["is_live_play", "player_tz", "recap_week", "build_weekly_recap", "weekly_recap", "mark_weekly_recap_seen"]) {
    await db.exec(fn(name));
  }
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.weekly_recaps; delete from public.notifications; delete from public.playtime_events;
    delete from public.game_status_events; delete from public.games; delete from public.coin_events;
    delete from public.achievements; delete from public.user_achievements; delete from public.profiles;
    delete from public.action_undos; delete from public.user_quick_goals;
    insert into public.profiles (id, clear_streak, clear_streak_best) values ('${ME}', 2, 5), ('${OTHER}', 0, 0);
    insert into public.achievements (family, tier, name, description, metric, threshold)
      values ('finisher', 2, 'Seasoned Finisher', 'Finish 10 games', 'games_finished', 10);
    select set_config('test.uid', '${ME}', false);
  `);
});

async function recap() {
  return (await db.query<{ r: Record<string, unknown> | null }>("select public.weekly_recap() as r")).rows[0].r;
}

async function activeWeek() {
  await db.exec(`
    insert into public.games values
      ('${G1}', '${ME}', 'Celeste', 'finished', 'beaten', null, 8, 7),
      ('${G2}', '${ME}', 'Hades', 'playing', null, null, 20, 3);
    insert into public.game_status_events (user_id, game_id, to_status, created_at)
      values ('${ME}', '${G1}', 'finished', ${LAST_WEEK});
    insert into public.action_undos (user_id, game_id, action, created_at)
      values ('${ME}', '${G1}', 'finish', ${LAST_WEEK});
    insert into public.playtime_events (user_id, game_id, game_title, hours, created_at) values
      ('${ME}', '${G1}', 'Celeste', 2.5, ${LAST_WEEK}),
      ('${ME}', '${G2}', 'Hades', 3, ${LAST_WEEK} + interval '1 day'),
      ('${ME}', '${G2}', 'Hades', 4, now());  -- this week: not in last week's recap
    insert into public.coin_events (user_id, kind, coin_delta, created_at) values
      ('${ME}', 'bounty', 300, ${LAST_WEEK}), ('${ME}', 'purchase', -120, ${LAST_WEEK});
    insert into public.user_quick_goals (user_id, reward, completed_at, reward_paid_at)
      values ('${ME}', 10, ${LAST_WEEK}, ${LAST_WEEK}), ('${ME}', 25, now() - interval '30 days', null);
  `);
}

describe("weekly_recap", () => {
  it("skips a quiet week: no recap, no notification", async () => {
    expect(await recap()).toBeNull();
    const n = await db.query("select count(*)::int as n from public.notifications");
    expect(n.rows).toEqual([{ n: 0 }]);
  });

  it("builds last week's recap once, with one notification", async () => {
    await activeWeek();
    const first = await recap();
    const again = await recap();
    expect(again!.id).toBe(first!.id);
    expect(first!.seen_at).toBeNull();
    expect(first!.data).toMatchObject({
      play: { hours: 5.5, days: 2, top_game: { title: "Hades", hours: 3 } },
      clears: { finished: 1, verified: 1, titles: ["Celeste"], streak: 2, best_streak: 5 },
      coins: { earned: 300, spent: 120, top_sources: [{ kind: "bounty", coins: 300 }] },
      progress: { close: [{ name: "Seasoned Finisher", value: 8, threshold: 10 }], quick_done: 1, unclaimed: 25 },
    });
    const notes = await db.query("select title, body, link from public.notifications");
    expect(notes.rows).toEqual([
      { title: "Your week in the Bazaar", body: "5.5h played · 1 finished · +300 coins", link: `recap:${first!.id}` },
    ]);
  });

  it("leaves out catch-up time and a replay put back on Finished (owner reports, 2026-10-17)", async () => {
    await activeWeek();
    await db.exec(`
      insert into public.games values ('${G3}', '${ME}', 'Final Fantasy VII Remake', 'finished', 'beaten', null, 30, 40);
      -- The abandoned replay: back to Finished with no clear recorded.
      insert into public.game_status_events (user_id, game_id, to_status, created_at)
        values ('${ME}', '${G3}', 'finished', ${LAST_WEEK});
      insert into public.playtime_events (user_id, game_id, game_title, hours, source, created_at) values
        ('${ME}', '${G3}', 'Disney Dreamlight Valley', 356, 'live', ${LAST_WEEK}),
        ('${ME}', '${G3}', 'Diablo IV', 40, 'backfill', ${LAST_WEEK});
    `);
    const data = (await recap())!.data as { play: unknown; clears: unknown };
    expect(data.play).toMatchObject({ hours: 5.5, top_game: { title: "Hades" } });
    expect(data.clears).toMatchObject({ finished: 1, titles: ["Celeste"] });
  });

  it("leaves coins out while the economy is off", async () => {
    await activeWeek();
    await db.exec(`update public.profiles set economy = false where id = '${ME}'`);
    const r = await recap();
    expect((r!.data as Record<string, unknown>).coins).toBeNull();
    const notes = await db.query<{ body: string }>("select body from public.notifications");
    expect(notes.rows[0].body).toBe("5.5h played · 1 finished");
  });

  it("lets only the owner mark it seen", async () => {
    await activeWeek();
    const id = (await recap())!.id;
    await db.exec(`select set_config('test.uid', '${OTHER}', false)`);
    await db.query("select public.mark_weekly_recap_seen($1)", [id]);
    await db.exec(`select set_config('test.uid', '${ME}', false)`);
    expect((await recap())!.seen_at).toBeNull();
    await db.query("select public.mark_weekly_recap_seen($1)", [id]);
    expect((await recap())!.seen_at).not.toBeNull();
  });
});
