// @vitest-environment node
//
// Exercises the REAL challenge functions from schema.sql in an embedded
// Postgres (PGlite). Monthly goals (owner, 2026-10-17): pick 3 from the menu,
// final for the month, progress counted from the 1st out of the event logs;
// 25 coins a goal + 50 for all three, claimed by hand. Seasonal events: each
// player chases the target alone; completing grants the event's badge and its
// coins on claim. Claims pay once and wait while the economy is off; only
// challenges.manage can save events, and every save is audited. Each player
// gets one "challenges are ready" bell notice a month, sent the first time
// evaluate_challenges runs that month. Daily and weekly goals (2026-10-17)
// are dealt from the pools (one daily, three weeklies, skipping goals that
// don't apply and doubling up no exclusive group), count progress only from
// when they're dealt, swap once per period, and add a sweep bonus for all
// three weeklies. Tables are
// trimmed to the columns these read; auth.uid, has_permission,
// economy_enabled and log_coin_event are stubbed.
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
const BADGE = "00000000-0000-4000-8000-0000000000b1";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function public.has_permission(p text) returns boolean language sql
      as $$ select coalesce(current_setting('test.manager', true), '') = 'yes' $$;
    create table public.app_config (id integer primary key, rotation_reset_tz text, bounty_gate_pct integer,
      challenge_goal_reward integer, challenge_set_bonus integer, rotation_reset_dow integer,
      rotation_reset_hour integer, challenge_daily_reward integer, challenge_weekly_reward integer,
      challenge_weekly_sweep integer);
    insert into public.app_config values (1, 'UTC', 25, 25, 50, 1, 0, 10, 25, 25);
    create table public.profiles (id uuid primary key, coins integer not null default 0,
      economy boolean not null default true);
    create table public.games (id uuid primary key, user_id uuid, status text, finish_tag text,
      added_at timestamptz, played_hours real, personal_hours real, hours real,
      preordered_at timestamptz, in_rotation boolean not null default false, review text);
    create table public.game_status_events (user_id uuid, game_id uuid, to_status text,
      created_at timestamptz not null default now());
    create table public.playtime_events (user_id uuid, game_id uuid, hours real, source text not null default 'live',
      created_at timestamptz not null default now());
    create table public.action_undos (user_id uuid, game_id uuid, action text, undone_at timestamptz,
      created_at timestamptz not null default now());
    create table public.play_sessions (user_id uuid, status text, ended_at timestamptz);
    create table public.review_events (user_id uuid, game_id uuid, review text, created_at timestamptz not null default now());
    create table public.rotation_checkins (user_id uuid, game_id uuid, created_at timestamptz not null default now());
    create table public.badges (id uuid primary key, name text, icon text);
    insert into public.badges values ('${BADGE}', 'Autumn Champion', 'leaf');
    create table public.user_badges (user_id uuid, badge_id uuid, source text, revoked_at timestamptz,
      primary key (user_id, badge_id));
    create table public.coin_events (user_id uuid, kind text, coin_delta integer, coin_after integer, label text);
    create table public.notifications (user_id uuid, type text, title text, body text, link text,
      created_at timestamptz not null default now());
    create table public.audit_events (actor_id uuid, target_user uuid, entity text, entity_id text,
      action text, field text, old_value jsonb, new_value jsonb, detail jsonb);
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select economy from public.profiles where id = p_user $$;
    create function public.log_coin_event(p_user uuid, p_kind text, p_coin_delta integer,
      p_charter_delta integer, p_coin_after integer, p_charter_after integer, p_game uuid,
      p_game_title text, p_label text, p_detail jsonb default '{}'::jsonb)
      returns void language sql as $$
        insert into public.coin_events values (p_user, p_kind, p_coin_delta, p_coin_after, p_label) $$;
  `);
  await db.exec(fn("is_live_play"));
  await db.exec(fn("challenge_metric_keys"));
  await db.exec(fn("challenge_metric"));
  await db.exec(fn("challenge_month"));
  await db.exec(fn("challenge_day"));
  await db.exec(fn("recap_week"));
  await db.exec(fn("rotation_period_start"));
  await db.exec(`
    create table public.challenge_goals (key text primary key, name text, description text, icon text,
      metric text, target numeric, sort integer default 0, active boolean not null default true);
    insert into public.challenge_goals values
      ('finish-two', 'Two Clears', 'Finish 2 games', 'trophy', 'games_finished', 2, 1, true),
      ('log-twenty', 'Twenty Hours', 'Log 20 hours', 'clock', 'hours_logged', 20, 2, true),
      ('review-one', 'Say a Few Words', 'Review a game', 'star', 'reviews_written', 1, 3, true),
      ('stopwatch-eight', 'On the Clock', 'Log 8 sessions', 'timer', 'stopwatch_sessions', 8, 4, true),
      ('retired-goal', 'Old', 'Gone', 'star', 'play_days', 1, 5, false);
    create table public.user_monthly_goals (id uuid primary key default gen_random_uuid(), user_id uuid,
      month date, goal_key text, goal_name text, metric text, target numeric, reward integer not null default 0,
      picked_at timestamptz not null default now(), completed_at timestamptz, value numeric,
      reward_paid_at timestamptz, unique (user_id, month, goal_key));
    create table public.monthly_goal_bonuses (id uuid primary key default gen_random_uuid(), user_id uuid,
      month date, reward integer not null default 0, completed_at timestamptz not null default now(),
      reward_paid_at timestamptz, unique (user_id, month));
    create table public.seasonal_challenges (id uuid primary key default gen_random_uuid(), name text,
      description text not null default '', metric text, target numeric, starts_at timestamptz,
      ends_at timestamptz, reward integer not null default 0, badge_id uuid, created_by uuid,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      archived_at timestamptz);
    create table public.user_seasonal_challenges (id uuid primary key default gen_random_uuid(), user_id uuid,
      challenge_id uuid, challenge_name text, value numeric, reward integer not null default 0,
      completed_at timestamptz not null default now(), reward_paid_at timestamptz,
      unique (user_id, challenge_id));
    create table public.quick_goals (key text primary key, cadence text, name text, description text,
      icon text, metric text, target numeric, eligibility text, exclusive_group text,
      sort integer default 0, active boolean not null default true);
    -- A small pool so dealing is predictable: one daily always applies (the
    -- Rotation one needs a Rotation game); the weeklies hold one exclusive
    -- pair and a review goal that needs an unreviewed clear.
    insert into public.quick_goals values
      ('d-half-hour', 'daily', 'Half an Hour', 'Log 30 minutes of play', 'clock', 'hours_logged', 0.5, null, null, 1, true),
      ('d-rotation', 'daily', 'Check In', 'Check in a Rotation game', 'refresh-cw', 'rotation_checkins', 1, 'rotation_unchecked', null, 2, true),
      ('w-five-hours', 'weekly', 'Five Hours', 'Log 5 hours of play', 'clock', 'hours_logged', 5, null, null, 1, true),
      ('w-three-games', 'weekly', 'Variety Pack', 'Play 3 different games', 'layers', 'games_played', 3, null, null, 2, true),
      ('w-finish', 'weekly', 'Finisher', 'Finish a game', 'trophy', 'games_finished', 1, null, 'clear', 3, true),
      ('w-verified', 'weekly', 'Done Properly', 'Earn a Verified clear', 'badge-check', 'verified_clears', 1, null, 'clear', 4, true),
      ('w-review', 'weekly', 'Critic''s Week', 'Review a game you''ve finished', 'star', 'reviews_written', 1, 'unreviewed_clear', null, 5, true);
    create table public.user_quick_goals (id uuid primary key default gen_random_uuid(), user_id uuid,
      cadence text, period date, goal_key text, goal_name text, description text, icon text, metric text,
      target numeric, reward integer not null default 0, dealt_at timestamptz not null default now(),
      swapped_at timestamptz, completed_at timestamptz, value numeric, reward_paid_at timestamptz,
      unique (user_id, cadence, period, goal_key));
    create table public.weekly_sweep_bonuses (id uuid primary key default gen_random_uuid(), user_id uuid,
      period date, reward integer not null default 0, completed_at timestamptz not null default now(),
      reward_paid_at timestamptz, unique (user_id, period));
  `);
  for (const name of ["quick_goal_applies", "deal_quick_goal", "deal_quick_goals", "quick_goal_json", "swap_quick_goal"]) {
    await db.exec(fn(name));
  }
  for (const name of [
    "challenge_month_notice",
    "pick_monthly_goal",
    "evaluate_challenges",
    "list_challenges",
    "claim_challenge_rewards",
    "admin_save_seasonal_challenge",
    "admin_archive_seasonal_challenge",
  ]) {
    await db.exec(fn(name));
  }
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.user_monthly_goals; delete from public.monthly_goal_bonuses;
    delete from public.user_seasonal_challenges; delete from public.seasonal_challenges;
    delete from public.user_badges; delete from public.coin_events; delete from public.audit_events;
    delete from public.notifications;
    delete from public.games; delete from public.game_status_events; delete from public.playtime_events;
    delete from public.play_sessions; delete from public.review_events; delete from public.profiles;
    delete from public.action_undos; delete from public.user_quick_goals; delete from public.weekly_sweep_bonuses;
    delete from public.rotation_checkins;
    insert into public.profiles (id, coins) values ('${ME}', 100), ('${OTHER}', 0);
    select set_config('test.uid', '${ME}', false);
    select set_config('test.manager', '', false);
  `);
});

async function pick(goal: string) {
  await db.query("select public.pick_monthly_goal($1)", [goal]);
}

async function evaluate() {
  return (await db.query<{ kind: string; name: string; reward: number }>("select * from public.evaluate_challenges()")).rows;
}

/** Just the monthly and seasonal completions (daily/weekly goals are dealt
 *  and completed alongside them; they have their own tests below). */
async function evaluateLongGoals() {
  return (await evaluate()).filter((r) => !["daily", "weekly", "sweep"].includes(r.kind));
}

async function claim(id: string | null = null) {
  return (
    await db.query<{ paid: number; claimed: number; coins: number }>(
      "select * from public.claim_challenge_rewards($1)",
      [id],
    )
  ).rows[0];
}

/** A beaten game finished through the finish flow `daysAgo` days ago (the
 *  status move plus apply_finish's action_undos row). */
async function finishGame(daysAgo: number) {
  await db.exec(`
    with g as (
      insert into public.games (id, user_id, status, finish_tag, added_at, played_hours, hours)
      values (gen_random_uuid(), '${ME}', 'finished', 'beaten', now() - interval '400 days', 10, 10)
      returning id
    ), s as (
      insert into public.game_status_events (user_id, game_id, to_status, created_at)
      select '${ME}', g.id, 'finished', now() - interval '${daysAgo} days' from g
    )
    insert into public.action_undos (user_id, game_id, action, created_at)
    select '${ME}', g.id, 'finish', now() - interval '${daysAgo} days' from g;
  `);
}

/** A beaten game moved back to Finished WITHOUT a clear (an abandoned replay,
 *  or a past beat logged straight to Finished): only the status move. */
async function returnToFinished() {
  await db.exec(`
    with g as (
      insert into public.games (id, user_id, status, finish_tag, added_at, played_hours, hours)
      values (gen_random_uuid(), '${ME}', 'finished', 'beaten', now() - interval '400 days', 10, 10)
      returning id
    )
    insert into public.game_status_events (user_id, game_id, to_status)
    select '${ME}', g.id, 'finished' from g;
  `);
}

describe("pick_monthly_goal", () => {
  it("takes three goals from the active menu, once each, and no more", async () => {
    await pick("finish-two");
    await expect(pick("finish-two")).rejects.toThrow(/already picked that goal/);
    await expect(pick("retired-goal")).rejects.toThrow(/isn't on this month's menu/);
    await pick("log-twenty");
    await pick("review-one");
    await expect(pick("stopwatch-eight")).rejects.toThrow(/already picked 3 goals/);
    const rows = await db.query<{ reward: number }>("select reward from public.user_monthly_goals");
    expect(rows.rows.map((r) => r.reward)).toEqual([25, 25, 25]);
  });
});

describe("evaluate_challenges + claim_challenge_rewards", () => {
  it("completes goals from this month's logs, adds the all-three bonus, and pays each once", async () => {
    await finishGame(0);
    await finishGame(0);
    await db.exec(`insert into public.playtime_events (user_id, hours) values ('${ME}', 12), ('${ME}', 9)`);
    await db.exec(`insert into public.review_events (user_id, game_id, review) values ('${ME}', gen_random_uuid(), 'Great')`);
    await pick("finish-two");
    await pick("log-twenty");
    await pick("review-one");

    expect((await evaluate()).map((r) => r.kind).sort()).toEqual(["bonus", "goal", "goal", "goal"]);
    expect(await evaluate()).toEqual([]);
    expect(await claim()).toEqual({ paid: 125, claimed: 4, coins: 225 });
    expect(await claim()).toEqual({ paid: 0, claimed: 0, coins: 225 });
  });

  it("only counts real clears this month: not undone ones, abandoned replays or past beats", async () => {
    await finishGame(45); // last month or earlier: doesn't count
    await finishGame(0);
    await db.exec("update public.action_undos set undone_at = now() where created_at > now() - interval '1 day'");
    await returnToFinished();
    await pick("finish-two");
    await finishGame(0);
    expect(await evaluateLongGoals()).toEqual([]);
    await finishGame(0);
    expect((await evaluateLongGoals()).map((r) => r.name)).toEqual(["Two Clears"]);
  });

  it("completes a live seasonal event, grants its badge, and pays on claim", async () => {
    await db.exec(`insert into public.seasonal_challenges (id, name, metric, target, starts_at, ends_at, reward, badge_id)
      values ('00000000-0000-4000-8000-0000000000c1', 'Autumn Push', 'hours_logged', 5,
              now() - interval '3 days', now() + interval '3 days', 40, '${BADGE}')`);
    await db.exec(`insert into public.playtime_events (user_id, hours, created_at)
      values ('${ME}', 4, now() - interval '5 days'), ('${ME}', 3, now())`);
    expect(await evaluateLongGoals()).toEqual([]); // the 4h before it started don't count
    await db.exec(`insert into public.playtime_events (user_id, hours) values ('${ME}', 2)`);
    expect(await evaluateLongGoals()).toEqual([{ kind: "seasonal", name: "Autumn Push", reward: 40 }]);
    const badge = await db.query("select source from public.user_badges where user_id = $1", [ME]);
    expect(badge.rows).toEqual([{ source: "auto" }]);
    await claim();
    const paid = await db.query("select coin_delta, label from public.coin_events where kind = 'seasonal_challenge'");
    expect(paid.rows).toEqual([{ coin_delta: 40, label: "Autumn Push" }]);
  });

  it("holds rewards while the economy is off", async () => {
    await db.exec(`insert into public.review_events (user_id, game_id, review) values ('${ME}', gen_random_uuid(), 'Great')`);
    await pick("review-one");
    await evaluate();
    await db.exec(`update public.profiles set economy = false where id = '${ME}'`);
    await expect(claim()).rejects.toThrow(/paused/);
    await db.exec(`update public.profiles set economy = true where id = '${ME}'`);
    expect((await claim()).paid).toBe(25);
  });

  it("lists this month's menu with progress, the picks and the bonus target", async () => {
    await db.exec(`insert into public.playtime_events (user_id, hours) values ('${ME}', 6)`);
    await pick("log-twenty");
    const doc = (await db.query<{ d: Record<string, unknown> }>("select public.list_challenges() as d")).rows[0].d;
    expect(doc).toMatchObject({ goal_reward: 25, set_bonus: 50, bonus: null });
    expect((doc.menu as { key: string }[]).map((g) => g.key)).not.toContain("retired-goal");
    expect(doc.picks).toEqual([expect.objectContaining({ goal_key: "log-twenty", progress: 6, completed_at: null })]);
  });
});

describe("logged play", () => {
  it("counts live play only: not catch-up, and never an entry over 24 hours", async () => {
    await db.exec(`insert into public.playtime_events (user_id, hours, source) values
      ('${ME}', 6, 'live'), ('${ME}', 300, 'backfill'), ('${ME}', 356, 'live'), ('${ME}', -40, 'live')`);
    await pick("log-twenty");
    const doc = (await db.query<{ d: { picks: { progress: number }[] } }>("select public.list_challenges() as d")).rows[0].d;
    expect(doc.picks[0].progress).toBe(6);
  });
});

describe("monthly notice", () => {
  async function notices() {
    return (
      await db.query<{ title: string; body: string; link: string }>(
        "select title, body, link from public.notifications where user_id = $1 order by created_at",
        [ME],
      )
    ).rows;
  }

  it("goes out once a month, naming the rewards and anything still waiting", async () => {
    await db.exec(`insert into public.monthly_goal_bonuses (user_id, month, reward)
      values ('${ME}', date_trunc('month', now() - interval '40 days')::date, 50)`);
    await evaluate();
    await evaluate();
    const month = new Date().toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    expect(await notices()).toEqual([
      {
        title: `Your ${month} challenges are ready`,
        body: "Pick 3 goals for the month: 25 coins each, and 50 more for all three. You also have 50 coins in rewards waiting to be claimed.",
        link: "challenges",
      },
    ]);
    // Last month's notice doesn't stop this month's.
    await db.exec("update public.notifications set created_at = now() - interval '40 days'");
    await evaluate();
    expect(await notices()).toHaveLength(2);
  });

  it("leaves coins out while the economy is off", async () => {
    await db.exec(`update public.profiles set economy = false where id = '${ME}'`);
    await evaluate();
    expect((await notices())[0].body).toBe("Pick 3 goals for the month.");
  });
});

describe("daily & weekly goals", () => {
  async function held(cadence: "daily" | "weekly") {
    return (
      await db.query<{ id: string; goal_key: string; completed_at: Date | null }>(
        "select id, goal_key, completed_at from public.user_quick_goals where user_id = $1 and cadence = $2 and swapped_at is null order by goal_key",
        [ME, cadence],
      )
    ).rows;
  }

  it("deals one daily and three weeklies, skipping goals that don't apply and never two from one group", async () => {
    await evaluate();
    await evaluate(); // dealt once, not again
    expect((await held("daily")).map((g) => g.goal_key)).toEqual(["d-half-hour"]);
    const weekly = (await held("weekly")).map((g) => g.goal_key);
    expect(weekly).toHaveLength(3);
    expect(weekly).toContain("w-five-hours");
    expect(weekly).toContain("w-three-games");
    expect(weekly.filter((k) => k === "w-finish" || k === "w-verified")).toHaveLength(1);
    expect(weekly).not.toContain("w-review"); // no unreviewed clear
  });

  it("deals the Rotation goal only while a Rotation game is waiting for its check-in", async () => {
    const R = "00000000-0000-4000-8000-0000000000e1";
    await db.exec(`insert into public.games (id, user_id, status, in_rotation) values ('${R}', '${ME}', 'playing', true)`);
    expect((await db.query<{ ok: boolean }>("select public.quick_goal_applies($1, 'rotation_unchecked') as ok", [ME])).rows[0].ok).toBe(true);
    await db.exec(`insert into public.rotation_checkins (user_id, game_id) values ('${ME}', '${R}')`);
    expect((await db.query<{ ok: boolean }>("select public.quick_goal_applies($1, 'rotation_unchecked') as ok", [ME])).rows[0].ok).toBe(false);
  });

  it("counts progress only from when a goal was dealt", async () => {
    await db.exec(`insert into public.playtime_events (user_id, hours, created_at) values ('${ME}', 2, now() - interval '1 minute')`);
    await evaluate();
    expect((await held("daily"))[0].completed_at).toBeNull();
    await db.exec(`insert into public.playtime_events (user_id, hours, created_at) values ('${ME}', 0.5, now() + interval '1 second')`);
    expect((await evaluate()).map((r) => [r.kind, r.name])).toContainEqual(["daily", "Half an Hour"]);
  });

  it("swaps once per day, never a goal that's done", async () => {
    await evaluate();
    await db.exec(`insert into public.games (id, user_id, status, in_rotation) values ('00000000-0000-4000-8000-0000000000e2', '${ME}', 'playing', true)`);
    const [daily] = await held("daily");
    await db.query("select public.swap_quick_goal($1)", [daily.id]);
    const [swapped] = await held("daily");
    expect(swapped.goal_key).toBe("d-rotation");
    await expect(db.query("select public.swap_quick_goal($1)", [swapped.id])).rejects.toThrow(/already used this day's swap/);
  });

  it("refuses a swap with nothing left to swap to, and keeps the goal", async () => {
    await evaluate();
    const [daily] = await held("daily");
    await expect(db.query("select public.swap_quick_goal($1)", [daily.id])).rejects.toThrow(/no other goal/);
    expect((await held("daily"))[0].id).toBe(daily.id);
  });

  it("pays the weekly sweep for all three, and every reward once", async () => {
    await evaluate();
    await db.exec(`update public.user_quick_goals set completed_at = now() where user_id = '${ME}'`);
    const sweep = await evaluate();
    expect(sweep).toContainEqual({ kind: "sweep", name: "All three weekly goals", reward: 25 });
    expect(await claim()).toEqual({ paid: 10 + 3 * 25 + 25, claimed: 5, coins: 100 + 110 });
    expect((await claim()).paid).toBe(0);
    const kinds = await db.query<{ kind: string }>("select distinct kind from public.coin_events order by kind");
    expect(kinds.rows.map((r) => r.kind)).toEqual(["daily_goal", "weekly_goal", "weekly_sweep"]);
  });
});

describe("admin seasonal challenges", () => {
  const args = ["Winter", "", "games_finished", 3, "2026-12-01T00:00:00Z", "2027-01-01T00:00:00Z", 100, null];
  const save = (id: string | null) =>
    db.query<{ id: string }>(
      "select public.admin_save_seasonal_challenge($1, $2, $3, $4, $5, $6, $7, $8, $9) as id",
      [id, ...args],
    );

  it("needs challenges.manage", async () => {
    await expect(save(null)).rejects.toThrow(/Not authorized/);
  });

  it("audits creating, editing and archiving", async () => {
    await db.exec("select set_config('test.manager', 'yes', false)");
    const id = (await save(null)).rows[0].id;
    await save(id);
    await db.query("select public.admin_archive_seasonal_challenge($1, true)", [id]);
    const audit = await db.query<{ action: string }>("select action from public.audit_events order by action");
    expect(audit.rows.map((r) => r.action)).toEqual(["archive", "create", "update"]);
  });
});
