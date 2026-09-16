// @vitest-environment node
//
// Exercises the REAL capture_game_milestone() trigger from schema.sql inside
// an embedded Postgres (PGlite), alongside the real games_log_status trigger it
// now reads from — the two fire on the same games update, so their ordering is
// part of what's under test. The tables are trimmed to the columns the two
// triggers touch; everything else (RLS, other triggers) is out of scope here.
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
      copies      jsonb not null default '[]'
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
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec("delete from public.game_milestones; delete from public.game_status_events; delete from public.games;");
});

async function addGame(status = "backlog"): Promise<string> {
  const res = await db.query<{ id: string }>(
    "insert into public.games (user_id, status) values ($1, $2) returning id",
    [USER, status],
  );
  return res.rows[0].id;
}

async function start(id: string, on: string) {
  await db.query("update public.games set status = 'playing', started_at = $2 where id = $1", [id, on]);
}

async function finish(id: string, on: string, tag: string | null = null) {
  await db.query(
    "update public.games set status = 'finished', finished_at = $2, finish_tag = $3 where id = $1",
    [id, on, tag],
  );
}

async function shelve(id: string) {
  await db.query("update public.games set status = 'backlog', started_at = null where id = $1", [id]);
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
    await db.query("delete from public.game_milestones where game_id = $1 and kind = 'beat'", [id]);
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
