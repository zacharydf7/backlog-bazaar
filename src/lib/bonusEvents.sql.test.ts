// @vitest-environment node
//
// Exercises the REAL coin event functions from schema.sql in an embedded
// Postgres (PGlite): repeat runs (across a clock change), targeting
// (genre, length, named platform, off your main platform), payouts with a
// per-run cap, the start discount, and the one-notice-per-run bell. Tables
// are trimmed to the columns the functions read; economy_enabled,
// log_coin_event and player_tz are stubbed. apply_purchase / apply_finish /
// the claims were probed against the live schema in a rolled-back
// transaction (they depend on too much to extract).
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

/** The real bonus_events table with everything added after it (columns and
 *  the named checks), and the skips table, minus auth.users references. */
function bonusEventsTables(): string {
  const start = schema.indexOf("create table if not exists public.bonus_events (");
  const end = schema.indexOf("create table if not exists public.bonus_event_payouts (");
  const skipsStart = schema.indexOf("create table if not exists public.bonus_event_skips (");
  const skipsEnd = schema.indexOf("alter table public.bonus_event_skips enable row level security;");
  return (schema.slice(start, end) + schema.slice(skipsStart, skipsEnd)).replace(
    / references auth\.users \(id\) on delete set null/g,
    "",
  );
}

const U = "00000000-0000-4000-8000-0000000000a1";
const PS = "00000000-0000-4000-8000-0000000000b1"; // RPG on PS5, 40h
const SW = "00000000-0000-4000-8000-0000000000b2"; // Platformer on Switch, 8h

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.app_config (id integer primary key, rotation_reset_tz text);
    insert into public.app_config values (1, 'America/New_York');
    create table public.profiles (id uuid primary key, coins integer not null default 0,
      economy boolean not null default true);
    create table public.games (
      id uuid primary key, user_id uuid not null, title text not null, status text not null default 'backlog',
      genres jsonb, copies jsonb, platforms jsonb, hours real, personal_hours real,
      started_at timestamptz
    );
    create table public.playtime_events (user_id uuid, platform text, hours real, source text,
      created_at timestamptz not null default now());
    create table public.coin_events (user_id uuid, kind text, delta integer, label text);
    create table public.notifications (user_id uuid, type text, title text, body text, link text);
    create table public.seasonal_challenges (id uuid primary key default gen_random_uuid(), name text,
      description text not null default '', starts_at timestamptz, ends_at timestamptz,
      reward integer not null default 0, archived_at timestamptz);
    ${bonusEventsTables()}
    create table public.bonus_event_payouts (event_id uuid, event_name text, user_id uuid, game_id uuid,
      kind text, amount integer, created_at timestamptz not null default now());
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select economy from public.profiles where id = p_user $$;
    create function public.player_tz(p_user uuid) returns text language sql as $$ select 'America/New_York' $$;
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function public.log_coin_event(p_user uuid, p_kind text, p_coin_delta integer,
      p_charter_delta integer, p_coin_after integer, p_charter_after integer, p_game uuid,
      p_game_title text, p_label text, p_detail jsonb default '{}'::jsonb)
      returns void language sql as $$
        insert into public.coin_events values (p_user, p_kind, p_coin_delta, p_label) $$;
  `);
  for (const name of [
    "is_live_play",
    "player_main_platform",
    "bonus_event_applies",
    "bonus_event_run_skipped",
    "bonus_event_runs",
    "bonus_event_occurrence",
    "live_bonus_events",
    "bonus_event_factor",
    "bonus_event_usable",
    "best_bonus_event",
    "bonus_event_pay",
    "bonus_event_discount",
    "bonus_event_relevant",
    "bonus_event_notices",
    "my_bonus_event_perks",
    "calendar_feed",
  ]) {
    await db.exec(fn(name));
  }
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.bonus_event_payouts; delete from public.bonus_event_skips; delete from public.bonus_events;
    delete from public.notifications; delete from public.seasonal_challenges;
    delete from public.coin_events; delete from public.playtime_events; delete from public.games;
    delete from public.profiles;
    insert into public.profiles (id, coins) values ('${U}', 1000);
    insert into public.games (id, user_id, title, genres, copies, hours) values
      ('${PS}', '${U}', 'Big RPG', '["RPG"]', '[{"platform":"PS5"}]', 40),
      ('${SW}', '${U}', 'Small Jumper', '["Platformer"]', '[{"platform":"Switch"}]', 8);
    insert into public.playtime_events (user_id, platform, hours, source) values ('${U}', 'PS5', 3, 'live');
  `);
});

/** Add an event running from an hour ago for a day, with any column overrides. */
async function event(cols: Record<string, string> = {}): Promise<string> {
  const all = {
    name: "'Double Bounty'",
    starts_at: "now() - interval '1 hour'",
    ends_at: "now() + interval '1 day'",
    bounty_mult: "2",
    ...cols,
  };
  const r = await db.query<{ id: string }>(
    `insert into public.bonus_events (${Object.keys(all).join(", ")}) values (${Object.values(all).join(", ")}) returning id`,
  );
  return r.rows[0].id;
}

async function coins(): Promise<number> {
  const r = await db.query<{ coins: number }>("select coins from public.profiles where id = $1", [U]);
  return r.rows[0].coins;
}

async function pay(kind: string, base: number, game: string | null = PS): Promise<number> {
  const r = await db.query<{ v: number }>("select public.bonus_event_pay($1, $2, $3, $4) as v", [U, game, kind, base]);
  return r.rows[0].v;
}

describe("bonus_event_occurrence", () => {
  async function occ(at: string) {
    const r = await db.query<{ occ_start: Date; occ_end: Date; live: boolean }>(
      "select o.* from public.bonus_events e cross join lateral public.bonus_event_occurrence(e, $1::timestamptz) o",
      [at],
    );
    return r.rows.map((x) => ({ start: x.occ_start.toISOString(), end: x.occ_end.toISOString(), live: x.live }));
  }

  it("repeats a weekend weekly at local midnight, across the clock change", async () => {
    await event({
      starts_at: "'2026-10-03 00:00 America/New_York'",
      ends_at: "'2026-10-05 00:00 America/New_York'",
      repeat: "'weekly'",
    });
    // Saturday Oct 17 (EDT): live.
    expect(await occ("2026-10-17 12:00 America/New_York")).toEqual([
      { start: "2026-10-17T04:00:00.000Z", end: "2026-10-19T04:00:00.000Z", live: true },
    ]);
    // Wednesday: the next weekend, not live.
    expect(await occ("2026-10-21 12:00 America/New_York")).toEqual([
      { start: "2026-10-24T04:00:00.000Z", end: "2026-10-26T04:00:00.000Z", live: false },
    ]);
    // After clocks go back (EST): still midnight local.
    expect(await occ("2026-11-07 12:00 America/New_York")).toEqual([
      { start: "2026-11-07T05:00:00.000Z", end: "2026-11-09T05:00:00.000Z", live: true },
    ]);
  });

  it("steps monthly by calendar month and stops at repeat_until", async () => {
    await event({
      starts_at: "'2026-09-01 00:00 America/New_York'",
      ends_at: "'2026-09-02 00:00 America/New_York'",
      repeat: "'monthly'",
      repeat_until: "'2026-11-15 00:00 America/New_York'",
    });
    expect(await occ("2026-10-01 08:00 America/New_York")).toMatchObject([
      { start: "2026-10-01T04:00:00.000Z", live: true },
    ]);
    expect(await occ("2026-10-20 08:00 America/New_York")).toMatchObject([
      { start: "2026-11-01T04:00:00.000Z", live: false },
    ]);
    expect(await occ("2026-11-20 08:00 America/New_York")).toEqual([]);
  });

  it("returns a one-off's window until it ends, then nothing", async () => {
    await event({ starts_at: "'2026-10-10 00:00Z'", ends_at: "'2026-10-12 00:00Z'" });
    expect(await occ("2026-10-09 00:00Z")).toMatchObject([{ live: false }]);
    expect(await occ("2026-10-11 00:00Z")).toMatchObject([{ live: true }]);
    expect(await occ("2026-10-12 00:00Z")).toEqual([]);
  });

  it("rejects a weekly event longer than a week", async () => {
    await expect(event({ ends_at: "now() + interval '8 days'", repeat: "'weekly'" })).rejects.toThrow();
  });
});

describe("bonus_event_pay", () => {
  it("pays the extra, logs it, and records the payout", async () => {
    await event();
    expect(await pay("bounty", 150)).toBe(150);
    expect(await coins()).toBe(1150);
    const ledger = await db.query("select kind, delta, label from public.coin_events");
    expect(ledger.rows).toEqual([{ kind: "event_bonus", delta: 150, label: "Double Bounty" }]);
    const payouts = await db.query("select kind, amount from public.bonus_event_payouts");
    expect(payouts.rows).toEqual([{ kind: "bounty", amount: 150 }]);
  });

  it("pays nothing with the economy off, before the start, or for another kind", async () => {
    await event({ starts_at: "now() + interval '1 hour'", ends_at: "now() + interval '1 day'" });
    expect(await pay("bounty", 150)).toBe(0);
    await event({ session_mult: "1", bounty_mult: "3" });
    expect(await pay("session", 5)).toBe(0);
    await db.exec(`update public.profiles set economy = false`);
    expect(await pay("bounty", 150)).toBe(0);
    expect(await coins()).toBe(1000);
  });

  it("stops at the per-player cap", async () => {
    await event({ player_cap: "100" });
    expect(await pay("bounty", 80)).toBe(80);
    expect(await pay("bounty", 80)).toBe(20);
    expect(await pay("bounty", 80)).toBe(0);
  });

  it("resets the cap on each run of a repeating event", async () => {
    const id = await event({ player_cap: "100", repeat: "'weekly'" });
    // A payout from last week's run doesn't count against this one.
    await db.query(
      "insert into public.bonus_event_payouts (event_id, event_name, user_id, kind, amount, created_at) values ($1, 'x', $2, 'bounty', 100, now() - interval '6 days')",
      [id, U],
    );
    expect(await pay("bounty", 80)).toBe(80);
  });

  it("passes over an event whose cap is used up for the next best one", async () => {
    const capped = await event({ name: "'Double'", player_cap: "50" });
    await event({ name: "'Bounty Weekend'", bounty_mult: "1.5" });
    await db.query(
      "insert into public.bonus_event_payouts (event_id, event_name, user_id, kind, amount) values ($1, 'Double', $2, 'bounty', 50)",
      [capped, U],
    );
    expect(await pay("bounty", 100)).toBe(50);
    const label = await db.query<{ label: string }>("select label from public.coin_events");
    expect(label.rows).toEqual([{ label: "Bounty Weekend" }]);
  });

  it("takes the strongest matching event", async () => {
    await event({ bounty_mult: "1.5" });
    await event({ name: "'Triple'", bounty_mult: "3" });
    expect(await pay("bounty", 100)).toBe(200);
  });

  it("boosts reward claims (no game) whatever the targets", async () => {
    await event({ bounty_mult: "1", rewards_mult: "2", genres: "'{Puzzle}'" });
    expect(await pay("rewards", 25, null)).toBe(25);
  });
});

describe("targeting", () => {
  it("matches genre (any case) and length", async () => {
    await event({ genres: "'{rpg}'" });
    expect(await pay("bounty", 10, SW)).toBe(0);
    expect(await pay("bounty", 10, PS)).toBe(10);
    await db.exec("delete from public.bonus_events");
    await event({ max_hours: "10" });
    expect(await pay("bounty", 10, PS)).toBe(0);
    expect(await pay("bounty", 10, SW)).toBe(10);
  });

  it("off your main platform skips games on the platform you play most", async () => {
    await event({ off_main_platform: "true" });
    expect(await pay("bounty", 10, PS)).toBe(0);
    expect(await pay("bounty", 10, SW)).toBe(10);
  });

  it("named platforms match a game's copies", async () => {
    await event({ platforms: "'{Switch}'" });
    expect(await pay("bounty", 10, PS)).toBe(0);
    expect(await pay("bounty", 10, SW)).toBe(10);
  });
});

describe("bonus_event_discount", () => {
  async function discount(price: number, record: boolean) {
    const r = await db.query<{ price: number; event_name: string | null }>(
      "select * from public.bonus_event_discount($1, $2, $3, $4)",
      [U, PS, price, record],
    );
    return r.rows[0];
  }

  it("takes the percentage off and records the saving only for the real purchase", async () => {
    await event({ bounty_mult: "1", start_discount_pct: "25", name: "'Cheap Starts'" });
    expect(await discount(100, false)).toEqual({ price: 75, event_name: "Cheap Starts" });
    expect((await db.query("select * from public.bonus_event_payouts")).rows).toHaveLength(0);
    await discount(100, true);
    const p = await db.query("select kind, amount from public.bonus_event_payouts");
    expect(p.rows).toEqual([{ kind: "discount", amount: 25 }]);
  });

  it("stops discounting once the player's discounted starts are used, then falls back", async () => {
    await event({ bounty_mult: "1", start_discount_pct: "50", discount_limit: "2" });
    expect(await discount(100, true)).toMatchObject({ price: 50 });
    // Previews don't use one up.
    expect(await discount(100, false)).toMatchObject({ price: 50 });
    expect(await discount(100, true)).toMatchObject({ price: 50 });
    expect(await discount(100, true)).toEqual({ price: 100, event_name: null });
    // A smaller unlimited discount still applies once the bigger one is used.
    await event({ name: "'Small'", bounty_mult: "1", start_discount_pct: "10" });
    expect(await discount(100, false)).toEqual({ price: 90, event_name: "Small" });
  });

  it("counts savings against the cap", async () => {
    await event({ bounty_mult: "1", start_discount_pct: "50", player_cap: "30" });
    expect(await discount(100, true)).toMatchObject({ price: 70 });
    expect(await discount(100, true)).toEqual({ price: 100, event_name: null });
  });
});

describe("bonus_event_notices", () => {
  async function notices() {
    await db.query("select public.bonus_event_notices($1)", [U]);
    const r = await db.query<{ title: string }>("select title from public.notifications order by title");
    return r.rows.map((x) => x.title);
  }

  it("sends a heads-up in the two days before, a now-on while running, and never twice", async () => {
    await event({ name: "'Live'" });
    await event({ name: "'Soon'", starts_at: "now() + interval '1 day'", ends_at: "now() + interval '2 days'" });
    await event({ name: "'Later'", starts_at: "now() + interval '5 days'", ends_at: "now() + interval '6 days'" });
    expect(await notices()).toEqual(["Coin event: Live", "Coming up: Soon"]);
    expect(await notices()).toEqual(["Coin event: Live", "Coming up: Soon"]);
  });

  it("skips events that fit none of the player's games, and players with the economy off", async () => {
    await event({ genres: "'{Puzzle}'" });
    expect(await notices()).toEqual([]);
    await db.exec("delete from public.bonus_events; update public.profiles set economy = false");
    await event();
    expect(await notices()).toEqual([]);
  });

  it("announces each run of a repeating event once", async () => {
    const id = await event({ repeat: "'weekly'" });
    // Last week's notice has its own run key.
    await db.query(
      "insert into public.notifications (user_id, type, title, link) values ($1, 'bonus_event', 'Coin event: old', 'bonus:' || $2 || ':1')",
      [U, id],
    );
    expect(await notices()).toEqual(["Coin event: Double Bounty", "Coin event: old"]);
  });
});

describe("my_bonus_event_perks", () => {
  async function perks() {
    await db.query("select set_config('test.uid', $1, false)", [U]);
    const r = await db.query<{ p: Record<string, unknown> }>("select public.my_bonus_event_perks() as p");
    return r.rows[0].p;
  }

  it("is empty with nothing running", async () => {
    await event({ starts_at: "now() + interval '1 day'", ends_at: "now() + interval '2 days'" });
    expect(await perks()).toEqual({});
  });

  it("gives Bazaar games the discount (and the bounty to come), Now Playing games the boosts and saving", async () => {
    await db.exec(`update public.games set status = 'playing', started_at = now() - interval '1 hour' where id = '${SW}'`);
    const id = await event({
      start_discount_pct: "50",
      discount_limit: "2",
      session_mult: "3",
      genres: "'{RPG,Platformer}'",
    });
    // A discount saved on this run counts; one from before it started doesn't.
    await db.query(
      `insert into public.bonus_event_payouts (event_id, event_name, user_id, game_id, kind, amount, created_at)
       values ($1, 'x', $2, $3, 'discount', 20, now() - interval '30 minutes'),
              ($1, 'x', $2, $3, 'discount', 99, now() - interval '2 hours')`,
      [id, U, SW],
    );
    expect(await perks()).toEqual({
      [PS]: {
        // One of the two discounted starts went on the Switch game's run.
        discount: { event: "Double Bounty", pct: 50, starts_left: 1 },
        bounty: { event: "Double Bounty", factor: 2 },
      },
      [SW]: {
        bounty: { event: "Double Bounty", factor: 2 },
        session: { event: "Double Bounty", factor: 3 },
        saved: 20,
      },
    });
  });

  it("keeps a run's discount saving after the event is over", async () => {
    await db.exec(`update public.games set status = 'playing', started_at = now() - interval '2 hours' where id = '${SW}'`);
    await db.query(
      "insert into public.bonus_event_payouts (event_name, user_id, game_id, kind, amount, created_at) values ('Old', $1, $2, 'discount', 30, now() - interval '1 hour')",
      [U, SW],
    );
    expect(await perks()).toEqual({ [SW]: { saved: 30 } });
  });

  it("drops the discount once the player's discounted starts are used", async () => {
    const id = await event({ bounty_mult: "1", start_discount_pct: "50", discount_limit: "1" });
    await db.query(
      "insert into public.bonus_event_payouts (event_id, event_name, user_id, kind, amount) values ($1, 'x', $2, 'discount', 10)",
      [id, U],
    );
    expect(await perks()).toEqual({});
  });

  it("is empty with the economy off", async () => {
    await event();
    await db.exec("update public.profiles set economy = false");
    expect(await perks()).toEqual({});
  });
});

describe("monthly patterns", () => {
  async function runs(id: string, from: string, to: string, withSkipped = false) {
    const r = await db.query<{ run_start: Date; run_end: Date; skipped: boolean }>(
      "select r.* from public.bonus_events e cross join lateral public.bonus_event_runs(e, $2::timestamptz, $3::timestamptz, $4) r where e.id = $1",
      [id, from, to, withSkipped],
    );
    return r.rows.map((x) => [x.run_start.toISOString(), x.run_end.toISOString(), ...(withSkipped ? [x.skipped] : [])]);
  }
  const pattern = (cols: Record<string, string>) =>
    event({
      starts_at: "'2026-11-01 00:00 America/New_York'",
      ends_at: "'2026-11-02 00:00 America/New_York'",
      ...cols,
    });

  it("runs the 1st to 7th of each month at local midnight, across the clock change", async () => {
    const id = await pattern({ repeat: "'month_days'", repeat_from: "1", repeat_to: "7" });
    expect(await runs(id, "2026-10-15Z", "2027-01-01Z")).toEqual([
      ["2026-11-01T04:00:00.000Z", "2026-11-08T05:00:00.000Z"],
      ["2026-12-01T05:00:00.000Z", "2026-12-08T05:00:00.000Z"],
    ]);
  });

  it("runs the last 7 days of each month, February included", async () => {
    const id = await pattern({ repeat: "'month_days'", repeat_from: "-7", repeat_to: "-1" });
    expect(await runs(id, "2027-02-02Z", "2027-03-01Z")).toEqual([
      ["2027-02-22T05:00:00.000Z", "2027-03-01T05:00:00.000Z"],
    ]);
  });

  it("runs the 3rd weekend and the last weekend, Saturday through Sunday", async () => {
    const third = await pattern({ repeat: "'month_weekend'", repeat_week: "3" });
    const last = await pattern({ repeat: "'month_weekend'", repeat_week: "-1" });
    expect(await runs(third, "2026-11-01Z", "2026-12-01Z")).toEqual([
      ["2026-11-21T05:00:00.000Z", "2026-11-23T05:00:00.000Z"],
    ]);
    // October 2026 ends on a Saturday: its last weekend runs into November.
    await db.exec(`update public.bonus_events set starts_at = '2026-10-01 00:00 America/New_York' where id = '${last}'`);
    expect(await runs(last, "2026-10-01Z", "2026-11-01Z")).toEqual([
      ["2026-10-31T04:00:00.000Z", "2026-11-02T05:00:00.000Z"],
    ]);
  });

  it("ends a weekly run at local midnight even across the clock change", async () => {
    const id = await event({
      starts_at: "'2026-10-17 00:00 America/New_York'",
      ends_at: "'2026-10-19 00:00 America/New_York'",
      repeat: "'weekly'",
    });
    // Oct 31 (EDT) to Nov 2 (EST): 49 real hours, still midnight to midnight.
    expect(await runs(id, "2026-10-30Z", "2026-11-03Z")).toEqual([
      ["2026-10-31T04:00:00.000Z", "2026-11-02T05:00:00.000Z"],
    ]);
  });

  it("never runs before its start date", async () => {
    const id = await pattern({ repeat: "'month_days'", repeat_from: "1", repeat_to: "7" });
    expect(await runs(id, "2026-09-01Z", "2026-11-01Z")).toEqual([]);
  });

  it("rejects days past the 28th or out of order", async () => {
    await expect(pattern({ repeat: "'month_days'", repeat_from: "1", repeat_to: "31" })).rejects.toThrow();
    await expect(pattern({ repeat: "'month_days'", repeat_from: "8", repeat_to: "3" })).rejects.toThrow();
    await expect(pattern({ repeat: "'month_weekend'", repeat_week: "5" })).rejects.toThrow();
  });

  it("allows an event with no boost, a calendar note", async () => {
    await expect(event({ bounty_mult: "1" })).resolves.toBeTruthy();
  });

  it("leaves out a skipped run, and the next run takes its place", async () => {
    const id = await pattern({ repeat: "'month_days'", repeat_from: "1", repeat_to: "7" });
    await db.query(
      "insert into public.bonus_event_skips (event_id, run_start) values ($1, '2026-12-01 00:00 America/New_York')",
      [id],
    );
    expect(await runs(id, "2026-11-15Z", "2027-02-01Z")).toEqual([
      ["2027-01-01T05:00:00.000Z", "2027-01-08T05:00:00.000Z"],
    ]);
    expect((await runs(id, "2026-11-15Z", "2027-02-01Z", true)).map((r) => r[2])).toEqual([true, false]);
    const occ = await db.query<{ occ_start: Date }>(
      "select o.occ_start from public.bonus_events e cross join lateral public.bonus_event_occurrence(e, '2026-11-15Z') o where e.id = $1",
      [id],
    );
    expect(occ.rows[0].occ_start.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });
});

describe("calendar_feed", () => {
  it("lists every run and seasonal challenge in the window, marking events that don't fit your games", async () => {
    await event({
      name: "'Fresh Start Week'",
      starts_at: "'2026-11-01 00:00 America/New_York'",
      ends_at: "'2026-11-02 00:00 America/New_York'",
      repeat: "'month_days'",
      repeat_from: "1",
      repeat_to: "7",
    });
    await event({ name: "'Puzzle Party'", genres: "'{Puzzle}'", starts_at: "'2026-11-10Z'", ends_at: "'2026-11-12Z'" });
    await db.exec(`insert into public.seasonal_challenges (name, starts_at, ends_at, reward)
                   values ('Winter Push', '2026-11-15Z', '2026-12-15Z', 100)`);
    await db.query("select set_config('test.uid', $1, false)", [U]);
    const r = await db.query<{ f: { kind: string; name: string; for_you?: boolean }[] }>(
      "select public.calendar_feed('2026-10-25Z', '2027-01-01Z') as f",
    );
    expect(r.rows[0].f.map((x) => [x.kind, x.name, x.for_you ?? null])).toEqual([
      ["event", "Fresh Start Week", true],
      ["event", "Puzzle Party", false],
      ["challenge", "Winter Push", null],
      ["event", "Fresh Start Week", true],
    ]);
  });
});
