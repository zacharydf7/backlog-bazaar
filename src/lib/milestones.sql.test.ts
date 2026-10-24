// @vitest-environment node
//
// Exercises the REAL capture_game_milestone() trigger from schema.sql inside
// an embedded Postgres (PGlite), alongside the real games_log_status trigger it
// now reads from — the two fire on the same games update, so their ordering is
// part of what's under test — and the activity-feed trigger, so the Cancel
// replay / Abandon Completion RPCs can be checked against all three. The tables
// are trimmed to the columns these touch; everything else (RLS, other triggers)
// is out of scope here.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

/** The `create or replace function public.<name>(` ... `$$;` block. */
function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

/** The `drop trigger if exists <name> ... execute function ...;` pair. */
function trigger(name: string): string {
  const start = schema.indexOf(`drop trigger if exists ${name} on public.games;`);
  if (start < 0) throw new Error(`trigger ${name} not found in schema.sql`);
  const execAt = schema.indexOf("execute function", start);
  return schema.slice(start, schema.indexOf(";", execAt) + 1);
}

const USER = "00000000-0000-4000-8000-000000000001";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${USER}');
    create function auth.uid() returns uuid language sql as $$ select '${USER}'::uuid $$;
    create table public.games (
      id          uuid primary key default gen_random_uuid(),
      user_id     uuid not null references auth.users (id),
      title       text not null default 'Game',
      status      text not null,
      finish_tag  text,
      added_at    timestamptz not null default now(),
      started_at  timestamptz,
      finished_at timestamptz,
      genres      text[] not null default '{}',
      developers  text[] not null default '{}',
      platforms   text[] not null default '{}',
      hours       numeric,
      copies      jsonb not null default '[]',
      slot_id     uuid,
      resumed     boolean not null default false,
      completionist boolean not null default false,
      in_rotation boolean not null default false,
      private     boolean not null default false,
      stealth     boolean not null default false,
      reward      integer,
      preordered_at timestamptz
    );
    create table public.slot_definitions (id uuid primary key, kind text);
    create table public.user_slots (id uuid primary key, definition_id uuid);
    create table public.activity_events (
      id         uuid primary key default gen_random_uuid(),
      actor      uuid not null,
      kind       text not null,
      game_id    uuid,
      game_title text,
      detail     jsonb,
      created_at timestamptz not null default now()
    );
    create table public.game_status_events (
      id          uuid primary key default gen_random_uuid(),
      user_id     uuid not null references auth.users (id),
      game_id     uuid references public.games (id) on delete set null,
      game_title  text,
      from_status text,
      to_status   text not null,
      created_at  timestamptz not null default now(),
      genres      text[],
      developers  text[],
      platforms   text[],
      game_hours  numeric,
      source      text not null default 'live',
      acquisition text,
      provider    text
    );
  `);
  const milestonesTable = schema.indexOf("create table if not exists public.game_milestones (");
  await db.exec(schema.slice(milestonesTable, schema.indexOf(");", milestonesTable) + 2));
  await db.exec(fn("primary_acquisition"));
  await db.exec(fn("primary_provider"));
  await db.exec(fn("log_game_status_event"));
  await db.exec(trigger("games_log_status"));
  await db.exec(fn("capture_game_milestone"));
  await db.exec(trigger("games_capture_milestone"));
  await db.exec(fn("emit_game_activity"));
  await db.exec(trigger("games_emit_activity"));
  await db.exec(fn("abort_replay"));
  await db.exec(fn("abandon_completion"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(
    "delete from public.game_milestones; delete from public.game_status_events; delete from public.activity_events; delete from public.games;",
  );
});

/** One simulated user action. PGlite's clock ticks in whole milliseconds, so
 *  back-to-back statements can share a now() — which the triggers compare and
 *  order events by. Space actions apart, as real ones (seconds apart) always are. */
async function step<T>(sql: string, params: unknown[]) {
  await new Promise((resolve) => setTimeout(resolve, 3));
  return db.query<T>(sql, params);
}

async function addGame(status = "backlog"): Promise<string> {
  const res = await step<{ id: string }>(
    "insert into public.games (user_id, status) values ($1, $2) returning id",
    [USER, status],
  );
  return res.rows[0].id;
}

async function start(id: string, on: string) {
  await step("update public.games set status = 'playing', started_at = $2 where id = $1", [id, on]);
}

async function finish(id: string, on: string, tag: string | null = null) {
  await step(
    "update public.games set status = 'finished', finished_at = $2, finish_tag = $3 where id = $1",
    [id, on, tag],
  );
}

async function shelve(id: string) {
  await step("update public.games set status = 'backlog', started_at = null where id = $1", [id]);
}

/** Milestones in insertion order as "kind@YYYY-MM-DD". */
async function journey(id: string): Promise<string[]> {
  const res = await db.query<{ kind: string; occurred_on: string }>(
    "select kind, to_char(occurred_on, 'YYYY-MM-DD') as occurred_on from public.game_milestones where game_id = $1 order by created_at, id",
    [id],
  );
  return res.rows.map((r) => `${r.kind}@${r.occurred_on}`);
}

describe("capture_game_milestone — Started per run (issue 192c571a)", () => {
  it("logs the first start, and nothing more for a shelve → restart of the same run", async () => {
    const id = await addGame();
    await start(id, "2026-07-05");
    await shelve(id);
    await start(id, "2026-07-20");
    const rows = await journey(id);
    expect(rows.filter((r) => r.startsWith("started"))).toEqual(["started@2026-07-05"]);
  });

  it("logs a fresh Started when a finished game is picked up again on a later day", async () => {
    // The reporter's timeline: a launch-night test run (start → finish within
    // a minute, then back to the Bazaar), and the real playthrough a month on.
    const id = await addGame();
    await start(id, "2026-07-05");
    await finish(id, "2026-07-05");
    await shelve(id);
    await start(id, "2026-08-10");
    expect(await journey(id)).toEqual([
      expect.stringMatching(/^added@/),
      "started@2026-07-05",
      "beat@2026-07-05",
      "started@2026-08-10",
    ]);
  });

  it("does not stack a second Started when the re-start lands on the same day as the last one", async () => {
    const id = await addGame();
    await start(id, "2026-07-05");
    await finish(id, "2026-07-05");
    await shelve(id);
    await start(id, "2026-07-05");
    expect((await journey(id)).filter((r) => r.startsWith("started"))).toEqual(["started@2026-07-05"]);
  });

  it("treats a replay straight from Finished as a new run", async () => {
    const id = await addGame();
    await start(id, "2026-03-01");
    await finish(id, "2026-03-20");
    await start(id, "2026-09-01");
    expect((await journey(id)).filter((r) => r.startsWith("started"))).toEqual([
      "started@2026-03-01",
      "started@2026-09-01",
    ]);
  });

  it("marks a retired game coming back with Unretired, not a second Started", async () => {
    const id = await addGame();
    await start(id, "2026-03-01");
    await finish(id, "2026-03-20", "retired");
    await start(id, "2026-09-01");
    const rows = await journey(id);
    expect(rows.filter((r) => r.startsWith("started"))).toHaveLength(1);
    expect(rows.filter((r) => r.startsWith("retired"))).toHaveLength(1);
    expect(rows.filter((r) => r.startsWith("unretired"))).toHaveLength(1);
  });

  it("reads the conclusion from the status log, so a deleted Beat row can't hide it", async () => {
    const id = await addGame();
    await start(id, "2026-07-05");
    await finish(id, "2026-07-05");
    await step("delete from public.game_milestones where game_id = $1 and kind = 'beat'", [id]);
    await shelve(id);
    await start(id, "2026-08-10");
    expect((await journey(id)).filter((r) => r.startsWith("started"))).toEqual([
      "started@2026-07-05",
      "started@2026-08-10",
    ]);
  });

  it("stays silent while an undo restore is in progress", async () => {
    const id = await addGame();
    await start(id, "2026-07-05");
    await finish(id, "2026-07-05");
    await shelve(id);
    await db.exec("select set_config('app.undo_in_progress', '1', false)");
    try {
      await start(id, "2026-08-10");
    } finally {
      await db.exec("select set_config('app.undo_in_progress', '', false)");
    }
    expect((await journey(id)).filter((r) => r.startsWith("started"))).toEqual(["started@2026-07-05"]);
  });
});

/** Pull a finished game back to play for free, as enter_replay / enter_completionist do. */
async function resume(id: string, on: string, completionist = false) {
  await step(
    "update public.games set status = 'playing', started_at = $2, finished_at = null, resumed = true, completionist = $3 where id = $1",
    [id, on, completionist],
  );
}

async function lastFinishedEventAt(id: string): Promise<Date> {
  const res = await db.query<{ at: Date }>(
    "select max(created_at) as at from public.game_status_events where game_id = $1 and to_status = 'finished'",
    [id],
  );
  return res.rows[0].at;
}

async function feedCards(id: string): Promise<number> {
  const res = await db.query<{ n: number }>(
    "select count(*)::int as n from public.activity_events where game_id = $1 and kind = 'bounty_claimed'",
    [id],
  );
  return res.rows[0].n;
}

async function finishedAt(id: string): Promise<Date> {
  const res = await db.query<{ finished_at: Date }>("select finished_at from public.games where id = $1", [id]);
  return res.rows[0].finished_at;
}

describe("capture_game_milestone — wishlist imports (issue f7040bfd)", () => {
  const today = () => new Date().toISOString().slice(0, 10);
  async function wishWithSeededAdded(): Promise<string> {
    const id = await addGame("wishlist");
    // What the milestone seed in schema.sql wrote for wishlist entries before
    // it learned to skip them: dated the day it was stamped.
    await db.query(
      "insert into public.game_milestones (user_id, game_id, kind, occurred_on, source, created_at) values ($1, $2, 'added', '2026-07-05', 'backfill', '2026-07-05T12:00:00Z')",
      [USER, id],
    );
    return id;
  }

  it("moves a seeded Added step to the import day", async () => {
    const id = await wishWithSeededAdded();
    await step("update public.games set status = 'backlog' where id = $1", [id]);
    expect(await journey(id)).toEqual([`added@${today()}`]);
  });

  it("keeps an Added date the owner set by hand", async () => {
    const id = await wishWithSeededAdded();
    // As the Milestones editor saves it: only the date changes.
    await db.query("update public.game_milestones set occurred_on = '2026-06-01' where game_id = $1", [id]);
    await step("update public.games set status = 'backlog' where id = $1", [id]);
    expect(await journey(id)).toEqual(["added@2026-06-01"]);
  });

  it("keeps the real Added date of a game owned before it went to the wishlist", async () => {
    const id = await addGame("backlog");
    await db.query(
      "update public.game_milestones set occurred_on = '2026-05-01', source = 'backfill', created_at = '2026-05-01T12:00:00Z' where game_id = $1",
      [id],
    );
    await step("update public.games set status = 'wishlist' where id = $1", [id]);
    await step("update public.games set status = 'backlog' where id = $1", [id]);
    expect(await journey(id)).toEqual(["added@2026-05-01"]);
  });

  it("the re-run milestone seed leaves wishlist entries without an Added step", async () => {
    // schema.sql re-runs on every apply, so its one-time seed runs again too.
    const head = "select g.user_id, g.id, 'added', g.added_at::date, 'backfill', g.added_at";
    const at = schema.indexOf(head);
    const seed =
      "insert into public.game_milestones (user_id, game_id, kind, occurred_on, source, created_at) " +
      schema.slice(at, schema.indexOf(";", at) + 1);
    const wish = await addGame("wishlist");
    const owned = await addGame("backlog");
    await db.query("delete from public.game_milestones where game_id = $1", [owned]);
    await db.exec(seed);
    expect(await journey(wish)).toEqual([]);
    expect(await journey(owned)).toHaveLength(1);
  });
});

describe("abort_replay — cancelling a replay is not a clear", () => {
  it("logs no Beat or feed card, retracts the replay's Started, and restores the finish date", async () => {
    const id = await addGame();
    await start(id, "2026-03-01");
    await finish(id, "2026-03-20", "beaten");
    const clearedAt = await lastFinishedEventAt(id);
    await resume(id, "2026-09-01");

    const res = await step<{ restored: Date }>("select public.abort_replay($1) as restored", [id]);

    expect(await journey(id)).toEqual([
      expect.stringMatching(/^added@/),
      "started@2026-03-01",
      "beat@2026-03-20",
    ]);
    expect(await feedCards(id)).toBe(1); // only the real clear's card
    expect(res.rows[0].restored).toEqual(clearedAt);
    expect(await finishedAt(id)).toEqual(clearedAt);
    // The audit trail still records the move back to Finished.
    const moves = await db.query<{ from_status: string; to_status: string }>(
      "select from_status, to_status from public.game_status_events where game_id = $1 order by created_at desc limit 1",
      [id],
    );
    expect(moves.rows[0]).toEqual({ from_status: "playing", to_status: "finished" });
  });

  it("keeps a replay Started row the owner has re-dated", async () => {
    const id = await addGame();
    await start(id, "2026-03-01");
    await finish(id, "2026-03-20", "beaten");
    await resume(id, "2026-09-01");
    await step(
      "update public.game_milestones set occurred_on = '2026-08-30' where game_id = $1 and occurred_on = '2026-09-01'",
      [id],
    );

    await step("select public.abort_replay($1)", [id]);

    expect((await journey(id)).filter((r) => r.startsWith("started"))).toEqual([
      "started@2026-03-01",
      "started@2026-08-30",
    ]);
  });
});

describe("abandon_completion — giving up a 100% run is not a clear", () => {
  it("logs no Beat or feed card and restores the finish date, keeping the run's Started", async () => {
    const id = await addGame();
    await start(id, "2026-03-01");
    await finish(id, "2026-03-20", "beaten");
    const clearedAt = await lastFinishedEventAt(id);
    await resume(id, "2026-09-01", true);

    const res = await step<{ restored: Date }>("select public.abandon_completion($1) as restored", [id]);

    expect(await journey(id)).toEqual([
      expect.stringMatching(/^added@/),
      "started@2026-03-01",
      "beat@2026-03-20",
      "started@2026-09-01",
    ]);
    expect(await feedCards(id)).toBe(1);
    expect(res.rows[0].restored).toEqual(clearedAt);
    expect(await finishedAt(id)).toEqual(clearedAt);
  });
});
