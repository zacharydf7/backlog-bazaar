// @vitest-environment node
//
// Exercises the REAL DLC functions from schema.sql in PGlite: save_game_dlc,
// the expansion run (start_expansion / finish_expansion / cancel_expansion
// in the DLC lane, beside enter_replay, and advance_clear_streak), expansion_quote's server-side
// pricing frozen at the start, undo_action's expansion branch, and the guard
// that keeps a running expansion's game from leaving through a plain finish.
// has_permission, economy_enabled, log_coin_event and bonus_event_pay are
// stubbed; tables are trimmed to what these read.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

function table(name: string): string {
  const start = schema.indexOf(`create table if not exists public.${name} (`);
  return schema
    .slice(start, schema.indexOf("\n);", start) + 3)
    .replace(/ references auth\.users \(id\) on delete cascade/g, "");
}

const U = "00000000-0000-4000-8000-0000000000a1";
const G = "00000000-0000-4000-8000-0000000000b1";
const FINISHED = "2026-07-18T13:00:00Z";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${U}'::uuid $$;
    create table public.app_config (id integer primary key, price_formula jsonb, bounty_formula jsonb,
      bounty_gate_pct integer, clear_streak_threshold integer, clear_streak_bonus_base integer,
      clear_streak_bonus_step integer, clear_streak_bonus_cap integer);
    create table public.profiles (id uuid primary key, coins integer not null default 0,
      economy boolean not null default true, clear_streak integer not null default 0,
      clear_streak_best integer not null default 0, replay_slots integer not null default 2);
    create table public.games (id uuid primary key, user_id uuid, title text, status text,
      played_hours real, started_at timestamptz, finished_at timestamptz, reward integer, price_paid integer,
      completionist boolean not null default false, in_rotation boolean not null default false,
      resumed boolean not null default false, slot_id uuid, family_id uuid, ongoing boolean not null default false,
      finish_tag text, length_premium_owed integer, stealth boolean not null default false,
      bounty_held integer not null default 0, bounty_held_total integer, bounty_gate_hours numeric,
      copies jsonb not null default '[]'::jsonb, expansion_run boolean not null default false);
    create table public.activity_events (actor uuid, game_id uuid, kind text, created_at timestamptz not null default now());
    create table public.game_length_events (game_id uuid, created_at timestamptz not null default now());
    create table public.shadow_economy_adjustments (user_id uuid, game_id uuid, game_title text,
      kind text not null default 'applied', source text, pct integer, base integer, adjusted integer,
      delta integer, undo_id uuid);
    create table public.bonus_event_payouts (event_id uuid, event_name text, user_id uuid, game_id uuid,
      kind text, amount integer, created_at timestamptz not null default now());
    create table public.game_milestones (game_id uuid, user_id uuid, kind text, source text, occurred_on date,
      created_at timestamptz not null default now());
    create table public.coin_events (user_id uuid, kind text, delta integer, label text);
    create table public.action_undos (id uuid primary key default gen_random_uuid(), user_id uuid, game_id uuid,
      game_title text, action text, coins_delta integer, prev jsonb, created_at timestamptz not null default now(),
      undone_at timestamptz);
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select economy from public.profiles where id = p_user $$;
    create function public.log_coin_event(p_user uuid, p_kind text, p_coin_delta integer,
      p_charter_delta integer, p_coin_after integer, p_charter_after integer, p_game uuid,
      p_game_title text, p_label text, p_detail jsonb default '{}'::jsonb)
      returns void language sql as $$ insert into public.coin_events values (p_user, p_kind, p_coin_delta, p_label) $$;
    -- A running double-coins event: reports the boost it would pay.
    create function public.bonus_event_pay(p_user uuid, p_game uuid, p_kind text, p_amount integer)
      returns integer language sql as $$ select p_amount $$;
    -- A start discount, half off while test.discount is set.
    create function public.bonus_event_discount(p_user uuid, p_game uuid, p_price integer, p_record boolean)
      returns table (price integer, event_name text) language sql as $$
        select case when current_setting('test.discount', true) = '1' then p_price / 2 else p_price end, null::text $$;
  `);
  // The expansion settings come from the real schema's alter statements.
  const settings = schema.match(/alter table public\.app_config add column if not exists expansion_[^;]+;/g);
  expect(settings).toHaveLength(4);
  for (const sql of settings!) await db.exec(sql);
  await db.exec(table("game_dlc"));
  await db.exec(table("game_dlc_events"));
  // The event actions widened later in the schema ('converted').
  for (const sql of schema.match(/alter table public\.game_dlc_events (?:drop|add) constraint[^;]+;/g) ?? []) {
    await db.exec(sql);
  }
  for (const name of [
    "econ_default_formula",
    "econ_normalize",
    "econ_formula",
    "expansion_formulas",
    "expansion_quote",
    "advance_clear_streak",
    "enter_replay",
    "expansion_restore_game",
    "save_game_dlc",
    "convert_dlc_copy",
    "remove_game_dlc",
    "start_expansion",
    "finish_expansion",
    "cancel_expansion",
    "games_guard_expansion_run",
    "undo_action",
  ]) {
    await db.exec(fn(name));
  }
  await db.exec(`create trigger games_guard_expansion_run before update of status, completionist, in_rotation
    on public.games for each row execute function public.games_guard_expansion_run()`);
});

afterAll(async () => {
  await db.close();
});

// Live-like formulas: price 40 + 3/h + $1 + 120 fresh; bounty 40 + 5/h + $1 + 150 fresh.
const PRICE = { base: 40, recencyDecayYears: 1, factors: { length: { enabled: true, weight: 3 }, recency: { enabled: true, weight: 120 }, paid: { enabled: true, weight: 1 } } };
const BOUNTY = { base: 40, recencyDecayYears: 1, factors: { length: { enabled: true, weight: 5 }, recency: { enabled: true, weight: 150 }, paid: { enabled: true, weight: 1 } } };

beforeEach(async () => {
  await db.exec(`
    delete from public.game_dlc_events; delete from public.game_dlc; delete from public.coin_events;
    delete from public.action_undos; delete from public.game_milestones; delete from public.game_length_events;
    delete from public.games;
    delete from public.profiles; delete from public.app_config;
    insert into public.app_config (id, price_formula, bounty_formula, bounty_gate_pct, clear_streak_threshold,
      clear_streak_bonus_base, clear_streak_bonus_step, clear_streak_bonus_cap)
      values (1, '${JSON.stringify(PRICE)}', '${JSON.stringify(BOUNTY)}', 50, 3, 100, 25, 250);
    insert into public.profiles (id, coins) values ('${U}', 1000);
    insert into public.games (id, user_id, title, status, played_hours, started_at, finished_at, reward, price_paid)
      values ('${G}', '${U}', 'Ghost of Yotei', 'finished', 40, '2026-06-01', '${FINISHED}', 300, 150);
  `);
});

async function addExpansion(hours: number | null = 8, cost: number | null = 20) {
  const r = await db.query<{ id: string }>(
    "select public.save_game_dlc(null, $1, 'expansion', 'Legends', current_date, $2, $3, null) as id",
    [G, cost, hours],
  );
  return r.rows[0].id;
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

const coins = () => one<{ coins: number }>("select coins from public.profiles").then((r) => r.coins);
const game = () =>
  one<Record<string, unknown>>("select status, resumed, expansion_run, finished_at, reward, price_paid from public.games");
const logHours = (h: number) => db.query("update public.games set played_hours = played_hours + $1", [h]);

describe("expansion runs", () => {
  it("prices the start from the server's formulas and moves the game into the DLC lane", async () => {
    const id = await addExpansion();
    // A full Replay lane doesn't matter: the DLC lane has no limit.
    await db.exec("update public.profiles set replay_slots = 0");
    // A just-acquired 8h, $20 expansion: 40 + 24 + 20 + 120.
    expect(await one("select * from public.start_expansion($1)", [id])).toEqual({ coins: 796, price_paid: 204 });
    expect(await game()).toMatchObject({ status: "playing", resumed: true, expansion_run: true });
    expect(await one("select run_status, run_hours_start, run_price from public.game_dlc")).toEqual({
      run_status: "playing",
      run_hours_start: 40,
      run_price: 204,
    });
  });

  it("takes a running event's start discount off, and refunds just what was paid on a stop", async () => {
    const id = await addExpansion();
    await db.exec("select set_config('test.discount', '1', false)");
    try {
      expect(await one("select * from public.start_expansion($1)", [id])).toEqual({ coins: 898, price_paid: 102 });
      expect(await one("select run_price from public.game_dlc")).toEqual({ run_price: 102 });
      expect(await one("select refunded from public.cancel_expansion($1)", [id])).toEqual({ refunded: 102 });
      expect(await coins()).toBe(1000);
    } finally {
      await db.exec("select set_config('test.discount', '', false)");
    }
  });

  it("leaves the Replay slot free for a replay, which a plain replay still fills", async () => {
    const G2 = "00000000-0000-4000-8000-0000000000b2";
    const G3 = "00000000-0000-4000-8000-0000000000b3";
    await db.query(
      `insert into public.games (id, user_id, title, status, played_hours, finished_at)
         values ($1, $3, 'Replay A', 'finished', 10, $4), ($2, $3, 'Replay B', 'finished', 10, $4)`,
      [G2, G3, U, FINISHED],
    );
    await db.exec("update public.profiles set replay_slots = 1");
    await db.query("select public.start_expansion($1)", [await addExpansion()]);
    await db.query("select public.enter_replay($1)", [G2]);
    expect(await one("select status, resumed from public.games where id = $1", [G2])).toEqual({
      status: "playing",
      resumed: true,
    });
    await expect(db.query("select public.enter_replay($1)", [G3])).rejects.toThrow();
  });

  it("moves a run already in progress into the DLC lane once, on re-apply too", async () => {
    const backfill = schema.match(/update public\.games g\s+set expansion_run = true[^;]+;/g);
    expect(backfill).toHaveLength(1);
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await db.exec("update public.games set expansion_run = false");
    await db.exec(backfill![0]);
    expect(await game()).toMatchObject({ status: "playing", expansion_run: true });
    // A finished game with an owned (not running) expansion stays put.
    await db.query("select public.cancel_expansion($1)", [id]);
    await db.exec(backfill![0]);
    expect(await game()).toMatchObject({ status: "finished", expansion_run: false });
  });

  it("pays the full bounty once the gate is logged, and restores the game as it was", async () => {
    await db.exec("update public.app_config set expansion_counts_streak = true");
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await logHours(4); // half of 8 hours
    const r = await one<Record<string, unknown>>(
      "select reward, logged_hours, streak, event_bonus from public.finish_expansion($1)",
      [id],
    );
    // 40 + 40 + 20 + 150, boosted by the running event.
    expect(r).toMatchObject({ reward: 250, streak: 1, event_bonus: 250 });
    expect(Number(r.logged_hours)).toBe(4);
    expect(await coins()).toBe(1000 - 204 + 250);
    expect(await game()).toMatchObject({ status: "finished", resumed: false, expansion_run: false, reward: 300, price_paid: 150 });
    expect(new Date((await game()).finished_at as string).toISOString()).toBe(new Date(FINISHED).toISOString());
    expect(await one("select action, coins_delta from public.action_undos")).toEqual({
      action: "expansion_finish",
      coins_delta: 500, // the bounty and its boost, both reversed by an undo
    });
  });

  it("under the gate pays the start price back or the logged share, unboosted, and doesn't extend the streak", async () => {
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await logHours(1); // a quarter of the gate: 250 / 4 rounds to 63, under the 204 start price
    // No event boost: boosting the returned start price would pay for starting and clearing at once.
    expect(await one("select reward, streak, event_bonus from public.finish_expansion($1)", [id])).toEqual({
      reward: 204,
      streak: 0,
      event_bonus: 0,
    });
  });

  it("runs free and pays nothing below the minimum length", async () => {
    const id = await addExpansion(1.5);
    expect(await one("select price_paid from public.start_expansion($1)", [id])).toEqual({ price_paid: 0 });
    await logHours(2);
    expect(await one("select reward, streak from public.finish_expansion($1)", [id])).toEqual({ reward: 0, streak: 0 });
    expect(await coins()).toBe(1000);
  });

  it("starts free and pays nothing with the economy off", async () => {
    await db.exec("update public.profiles set economy = false");
    const id = await addExpansion();
    expect(await one("select price_paid from public.start_expansion($1)", [id])).toEqual({ price_paid: 0 });
    await db.exec("update public.profiles set economy = true");
    await logHours(8);
    expect(await one("select reward from public.finish_expansion($1)", [id])).toEqual({ reward: 0 });
  });

  it("refunds the start price on a cancel and puts the game back", async () => {
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    expect(await one("select refunded from public.cancel_expansion($1)", [id])).toEqual({ refunded: 204 });
    expect(await coins()).toBe(1000);
    expect(await game()).toMatchObject({ status: "finished", reward: 300, expansion_run: false });
    expect(await one("select run_status from public.game_dlc")).toEqual({ run_status: "owned" });
  });

  it("pays each expansion once", async () => {
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await db.query("select public.finish_expansion($1)", [id]);
    await expect(db.query("select public.start_expansion($1)", [id])).rejects.toThrow(/already played/);
  });

  it("keeps a running expansion's game from leaving through a plain finish or lane move", async () => {
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await expect(db.exec("update public.games set status = 'finished'")).rejects.toThrow(/EXPANSION_ACTIVE/);
    await expect(db.exec("update public.games set in_rotation = true")).rejects.toThrow(/EXPANSION_ACTIVE/);
    await expect(db.query("select public.remove_game_dlc($1)", [id])).rejects.toThrow(/Finish or cancel/);
  });

  it("locks a started expansion's kind and length", async () => {
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await expect(
      db.query("select public.save_game_dlc($1, $2, 'expansion', 'Legends', current_date, 20, 40, null)", [id, G]),
    ).rejects.toThrow(/keeps its kind and length/);
    // The name and note can still change.
    await db.query("select public.save_game_dlc($1, $2, 'expansion', 'Legends of Ezo', current_date, 20, 8, 'great')", [id, G]);
    expect(await one("select name from public.game_dlc")).toEqual({ name: "Legends of Ezo" });
  });

  it("uses the expansion formulas where the admin set them, the game formulas elsewhere", async () => {
    await db.exec(`update public.app_config set expansion_price_formula = '{"base": 0, "factors": {"recency": {"enabled": false}}}'`);
    const id = await addExpansion();
    // 0 + 24 + 20, with fresh pickup off.
    expect(await one("select price_paid from public.start_expansion($1)", [id])).toEqual({ price_paid: 44 });
  });

  it("doesn't count a clear toward the streak unless the admin turns it on", async () => {
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await logHours(4);
    expect(await one("select streak from public.finish_expansion($1)", [id])).toEqual({ streak: 0 });
  });

  it("pays the streak bonus at the threshold, and none with the economy off", async () => {
    await db.exec("update public.app_config set expansion_counts_streak = true");
    await db.exec("update public.profiles set clear_streak = 2, clear_streak_best = 2");
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await logHours(4);
    expect(await one("select streak, streak_bonus from public.finish_expansion($1)", [id])).toEqual({
      streak: 3,
      streak_bonus: 100,
    });
    // Economy off: the counter still advances, the bonus doesn't pay.
    const other = (await db.query<{ id: string }>(
      "select public.save_game_dlc(null, $1, 'expansion', 'Second', current_date, 0, 8, null) as id",
      [G],
    )).rows[0].id;
    await db.query("select public.start_expansion($1)", [other]);
    await db.exec("update public.profiles set economy = false");
    await logHours(4);
    expect(await one("select streak, streak_bonus from public.finish_expansion($1)", [other])).toEqual({
      streak: 4,
      streak_bonus: 0,
    });
  });

  it("pays what was quoted at the start, whatever is edited or retuned mid-run", async () => {
    const id = await addExpansion(8, 0);
    await db.query("select public.start_expansion($1)", [id]);
    // A costly, fresh-dated record and a higher minimum after the start change nothing.
    await db.query("select public.save_game_dlc($1, $2, 'expansion', 'Legends', current_date, 100000, 8, null)", [id, G]);
    await db.exec("update public.app_config set expansion_min_hours = 20");
    await logHours(4);
    // 40 + 40 + 0 + 150, from the start.
    expect(await one("select reward from public.finish_expansion($1)", [id])).toEqual({ reward: 230 });
  });

  it("logs the start price coming back under the gate as a refund, not earnings", async () => {
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await logHours(3); // 3 of 4: 250 x 3/4 rounds to 188, under the 204 start price
    await db.query("select public.finish_expansion($1)", [id]);
    expect((await db.query("select kind, delta from public.coin_events order by kind")).rows).toEqual([
      { kind: "expansion_refund", delta: 204 },
      { kind: "expansion_start", delta: -204 },
    ]);
  });

  it("lets any player record DLC (no preview permission any more)", async () => {
    const id = await one<{ id: string }>("select public.save_game_dlc(null, $1, 'item', 'Coins', null, 5, null, null) as id", [G]);
    expect(id.id).toBeTruthy();
  });

  it("won't start on a retired game", async () => {
    await db.exec("update public.games set finish_tag = 'retired'");
    const id = await addExpansion();
    await expect(db.query("select public.start_expansion($1)", [id])).rejects.toThrow(/retired/);
  });

  it("takes each expansion once per game: no second copy, nor a cleared one back after removing it", async () => {
    const id = await addExpansion();
    await expect(addExpansion()).rejects.toThrow(/already on this game/);
    await db.query("select public.start_expansion($1)", [id]);
    await db.query("select public.finish_expansion($1)", [id]);
    await db.query("select public.remove_game_dlc($1)", [id]);
    await expect(addExpansion()).rejects.toThrow(/already on this game/);
  });

  it("undoes a clear: coins, boost and streak back, the run in progress again", async () => {
    await db.exec("update public.app_config set expansion_counts_streak = true");
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await logHours(4);
    const { undo_id } = await one<{ undo_id: string }>("select undo_id from public.finish_expansion($1)", [id]);
    // The stubbed boost reports but doesn't pay, so the balance holds the bounty only.
    await db.exec("update public.profiles set coins = coins + 250");
    expect(await one("select coins from public.undo_action($1)", [undo_id])).toEqual({ coins: 796 });
    expect(await one("select clear_streak from public.profiles")).toEqual({ clear_streak: 0 });
    expect(await game()).toMatchObject({ status: "playing", resumed: true, expansion_run: true });
    expect(await one("select run_status from public.game_dlc")).toEqual({ run_status: "playing" });
  });

  it("won't undo a clear once the game's length has changed since", async () => {
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await logHours(4);
    const { undo_id } = await one<{ undo_id: string }>("select undo_id from public.finish_expansion($1)", [id]);
    await db.query("insert into public.game_length_events (game_id) values ($1)", [G]);
    await expect(db.query("select public.undo_action($1)", [undo_id])).rejects.toThrow(/changed since/);
  });

  it("won't undo a clear whose expansion was removed since", async () => {
    const id = await addExpansion();
    await db.query("select public.start_expansion($1)", [id]);
    await logHours(4);
    const { undo_id } = await one<{ undo_id: string }>("select undo_id from public.finish_expansion($1)", [id]);
    await db.query("select public.remove_game_dlc($1)", [id]);
    await expect(db.query("select public.undo_action($1)", [undo_id])).rejects.toThrow(/expansion was removed/);
    expect(await game()).toMatchObject({ status: "finished" });
  });

  it("records new content and purchases without moving coins", async () => {
    await db.query("select public.save_game_dlc(null, $1, 'update', 'Into the Emerald Dream', '2026-03-25', 50, 99, null)", [G]);
    expect(await one("select kind, hours from public.game_dlc")).toEqual({ kind: "update", hours: null });
    await expect(
      db.query("select public.start_expansion((select id from public.game_dlc))"),
    ).rejects.toThrow(/Expansion not found/);
    expect(await coins()).toBe(1000);
    expect((await db.query("select action from public.game_dlc_events")).rows).toEqual([{ action: "added" }]);
  });
});

describe("an old DLC copy becoming a DLC record", () => {
  beforeEach(async () => {
    await db.query("update public.games set copies = $1::jsonb where id = $2", [
      JSON.stringify([
        { id: "base", platform: "PS5", format: "digital", cost: 70 },
        { id: "old", platform: "PS5", format: "dlc", cost: 19.99, note: "Legends" },
        { id: "extra", platform: "PC", format: "digital" },
      ]),
      G,
    ]);
  });

  it("adds the record and takes the copy off the game in one step, keeping the rest in order", async () => {
    await db.query("select public.convert_dlc_copy($1, 'old', 'expansion', 'Legends', current_date, 19.99, 8, null)", [G]);
    expect((await db.query("select kind, name, cost from public.game_dlc")).rows).toEqual([
      { kind: "expansion", name: "Legends", cost: "19.99" },
    ]);
    const copies = (await one<{ copies: { id: string }[] }>("select copies from public.games")).copies;
    expect(copies.map((c) => c.id)).toEqual(["base", "extra"]);
    const converted = await one<{ detail: { copy: { id: string; cost: number } } }>(
      "select detail from public.game_dlc_events where action = 'converted'",
    );
    expect(converted.detail.copy).toMatchObject({ id: "old", cost: 19.99 });
  });

  it("keeps a copy a DLC record can't hold yet: a subscription one, or one with a member discount", async () => {
    for (const extra of [{ acquisition: "subscription", provider: "PS Plus" }, { memberSavings: 4 }]) {
      await db.query("update public.games set copies = $1::jsonb where id = $2", [
        JSON.stringify([{ id: "old", platform: "PS5", format: "dlc", cost: 19.99, ...extra }]),
        G,
      ]);
      await expect(
        db.query("select public.convert_dlc_copy($1, 'old', 'item', 'Pass', null, 19.99, null, null)", [G]),
      ).rejects.toThrow(/stays a copy/);
    }
    expect((await db.query("select count(*)::int as n from public.game_dlc")).rows).toEqual([{ n: 0 }]);
  });

  it("won't touch another player's game", async () => {
    await db.query("update public.games set user_id = gen_random_uuid() where id = $1", [G]);
    await expect(
      db.query("select public.convert_dlc_copy($1, 'old', 'item', 'Legends', null, 19.99, null, null)", [G]),
    ).rejects.toThrow(/no longer on this game/);
  });

  it("refuses a copy that isn't an old DLC copy on the game, changing nothing", async () => {
    await expect(
      db.query("select public.convert_dlc_copy($1, 'base', 'item', 'Base', null, 70, null, null)", [G]),
    ).rejects.toThrow(/no longer on this game/);
    expect((await db.query("select count(*)::int as n from public.game_dlc")).rows).toEqual([{ n: 0 }]);
    expect((await one<{ copies: unknown[] }>("select copies from public.games")).copies).toHaveLength(3);
  });
});
