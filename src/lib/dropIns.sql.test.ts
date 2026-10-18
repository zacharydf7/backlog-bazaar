// @vitest-environment node
//
// Exercises the REAL log_playtime and log_playtime_event trigger from
// schema.sql in an embedded Postgres (PGlite) for drop-in sessions (issue
// f40bf121): a Finished game takes logged time without moving, the row is
// marked drop_in with its note, friends get one feed post a day per game
// (never for a private or stealth game), and a drop-in never copies time onto
// a co-op partner's card. The stopwatch (start_play_session /
// end_play_session) works the same way. Tables are trimmed; pay_session_bonus,
// rotation_play_rewards and auth.uid are stubbed.
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
const G = "00000000-0000-4000-8000-0000000000b1";
const PARTNER = "00000000-0000-4000-8000-0000000000b2";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${ME}'::uuid $$;
    create table public.games (id uuid primary key, user_id uuid, title text, status text not null,
      played_hours real not null default 0, copies jsonb not null default '[]'::jsonb, genres jsonb,
      developers jsonb, hours real, in_rotation boolean not null default false,
      private boolean not null default false, stealth boolean not null default false);
    create table public.profiles (id uuid primary key, coins integer not null default 0);
    create table public.playtime_events (user_id uuid, game_id uuid, game_title text, hours real, played_after real,
      platform text, format text, genres jsonb, developers jsonb, game_hours real, pact_id uuid, session_id uuid,
      source text not null default 'live', in_rotation boolean not null default false,
      drop_in boolean not null default false, note text, created_at timestamptz not null default now());
    create table public.co_op_pacts (id uuid primary key, status text, inviter_game uuid, invitee_game uuid,
      inviter_finished_at timestamptz);
    create table public.play_sessions (id uuid primary key default gen_random_uuid(), user_id uuid, game_id uuid,
      game_title text, platform text, format text, status text not null default 'active',
      started_at timestamptz not null default now(), ended_at timestamptz, logged_hours real);
    create table public.activity_events (actor uuid, kind text, game_id uuid, game_title text,
      detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
    create function public.pay_session_bonus(p_user uuid, p_game uuid, p_hours real) returns integer
      language sql as $$ select 0 $$;
    create function public.rotation_play_rewards(p_game uuid) returns table (milestone integer, regular integer, checkin integer)
      language sql as $$ select 0, 0, null::integer $$;
  `);
  await db.exec(fn("log_playtime_event"));
  await db.exec(`create trigger games_log_playtime after update of played_hours on public.games
    for each row execute function public.log_playtime_event()`);
  for (const name of ["log_playtime", "start_play_session", "end_play_session"]) await db.exec(fn(name));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.playtime_events; delete from public.games; delete from public.activity_events;
    delete from public.co_op_pacts; delete from public.profiles; delete from public.play_sessions;
    insert into public.profiles (id) values ('${ME}');
    insert into public.games (id, user_id, title, status, played_hours)
      values ('${G}', '${ME}', 'Monster Hunter Wilds', 'finished', 40);
  `);
});

/** Log time in its own transaction, as each RPC call is (the GUCs are
 *  transaction-local). */
async function log(hours: number, note: string | null = null, game = G) {
  return db.transaction((tx) => tx.query("select * from public.log_playtime($1, $2, null, null, $3)", [game, hours, note]));
}

async function events() {
  return (
    await db.query<{ hours: number; drop_in: boolean; note: string | null }>(
      "select hours, drop_in, note from public.playtime_events order by created_at, hours",
    )
  ).rows;
}

async function feed() {
  return (await db.query<{ kind: string; game_title: string }>("select kind, game_title from public.activity_events")).rows;
}

describe("drop-in sessions", () => {
  it("logs time on a Finished game without moving it, marked as a drop-in with its note", async () => {
    await log(1.5, "  Harvest Festival event  ");
    expect((await db.query("select status, played_hours from public.games")).rows).toEqual([
      { status: "finished", played_hours: 41.5 },
    ]);
    expect(await events()).toEqual([{ hours: 1.5, drop_in: true, note: "Harvest Festival event" }]);
  });

  it("keeps a Playing game's log a normal one", async () => {
    await db.exec(`update public.games set status = 'playing'`);
    await log(1);
    expect(await events()).toEqual([{ hours: 1, drop_in: false, note: null }]);
    expect(await feed()).toEqual([]);
  });

  it("refuses other statuses and an over-long note", async () => {
    await db.exec(`update public.games set status = 'backlog'`);
    await expect(log(1)).rejects.toThrow(/not available to log time/);
    await db.exec(`update public.games set status = 'finished'`);
    await expect(log(1, "x".repeat(141))).rejects.toThrow(/140 characters/);
    expect(await events()).toEqual([]);
  });

  it("posts to the feed once a day per game", async () => {
    await log(1);
    await log(0.5);
    expect(await feed()).toEqual([{ kind: "drop_in", game_title: "Monster Hunter Wilds" }]);
    await db.exec(`update public.activity_events set created_at = now() - interval '25 hours'`);
    await log(0.5);
    expect(await feed()).toHaveLength(2);
  });

  it("never posts a private or stealth game", async () => {
    await db.exec(`update public.games set private = true`);
    await log(1);
    await db.exec(`update public.games set private = false, stealth = true`);
    await log(1);
    expect(await feed()).toEqual([]);
    expect(await events()).toHaveLength(2);
  });

  it("copies nothing onto a co-op partner's card", async () => {
    await db.exec(`
      insert into public.games (id, user_id, title, status) values ('${PARTNER}', null, 'Monster Hunter Wilds', 'playing');
      insert into public.co_op_pacts values (gen_random_uuid(), 'active', '${G}', '${PARTNER}', now());
    `);
    await log(2);
    expect((await db.query(`select played_hours from public.games where id = '${PARTNER}'`)).rows).toEqual([
      { played_hours: 0 },
    ]);
  });

  it("runs the stopwatch on a Finished game and logs it as a drop-in with its note", async () => {
    const started = await db.query<{ id: string }>("select id from public.start_play_session($1)", [G]);
    await db.exec(`update public.play_sessions set started_at = now() - interval '30 minutes'`);
    await db.transaction((tx) =>
      tx.query("select * from public.end_play_session($1, null, 'one quick hunt')", [started.rows[0].id]),
    );
    expect(await events()).toEqual([{ hours: 0.5, drop_in: true, note: "one quick hunt" }]);
    expect((await db.query("select status from public.play_sessions")).rows).toEqual([{ status: "logged" }]);
  });

  it("lets a finished Player 2 start the stopwatch while Player 1 still plays", async () => {
    await db.exec(`insert into public.co_op_pacts values (gen_random_uuid(), 'active', '${PARTNER}', '${G}', null)`);
    await expect(db.query("select id from public.start_play_session($1)", [G])).resolves.toBeTruthy();
  });
});
