// @vitest-environment node
//
// Exercises the REAL square_trending() (Hot This Week) from schema.sql inside an
// embedded Postgres (PGlite), fed by the real status-log and activity-feed
// triggers and the real Cancel replay / Abandon Completion RPCs, so its finish
// count is checked against what actually lands in the tables. The tables are
// trimmed to the columns these touch; RLS and other triggers are out of scope.
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
      rawg_id     integer,
      igdb_id     integer,
      catalog_id  uuid,
      private     boolean not null default false,
      stealth     boolean not null default false,
      stock_image text,
      cleared_on  date,
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
      reward      integer,
      compilation_id uuid,
      preordered_at timestamptz
    );
    create table public.slot_definitions (id uuid primary key, kind text);
    create table public.user_slots (id uuid primary key, definition_id uuid);
    create table public.game_milestones (
      id uuid primary key default gen_random_uuid(),
      user_id uuid, game_id uuid, kind text, occurred_on date, source text,
      created_at timestamptz not null default now()
    );
    create table public.game_identity_links (rawg_id integer, igdb_id integer, status text);
    create table public.catalog_games (id uuid primary key, rawg_id integer, igdb_id integer, image text);
    create table public.like_events (
      user_id uuid, game_id uuid, action text, created_at timestamptz not null default now()
    );
    create table public.review_events (
      user_id uuid, game_id uuid, review text, created_at timestamptz not null default now()
    );
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
  await db.exec(fn("primary_acquisition"));
  await db.exec(fn("primary_provider"));
  await db.exec(fn("log_game_status_event"));
  await db.exec(trigger("games_log_status"));
  await db.exec(fn("emit_game_activity"));
  await db.exec(trigger("games_emit_activity"));
  await db.exec(fn("abort_replay"));
  await db.exec(fn("abandon_completion"));
  await db.exec(fn("game_title_key"));
  await db.exec(fn("game_identity_key"));
  await db.exec(fn("clear_is_fresh"));
  await db.exec(fn("square_trending"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(
    "delete from public.game_milestones; delete from public.game_status_events; delete from public.activity_events; delete from public.games;",
  );
});

async function addGame(status = "backlog"): Promise<string> {
  const res = await db.query<{ id: string }>(
    "insert into public.games (user_id, title, rawg_id, status) values ($1, 'Pumpkin Jack', 42, $2) returning id",
    [USER, status],
  );
  return res.rows[0].id;
}

async function setStatus(id: string, status: string, tag: string | null = null) {
  await db.query("update public.games set status = $2, finish_tag = $3 where id = $1", [id, status, tag]);
}

/** A clear from a month ago: everything logged so far moves out of the 7-day window. */
async function ageEverything() {
  await db.exec(`
    update public.game_status_events set created_at = created_at - interval '30 days';
    update public.activity_events set created_at = created_at - interval '30 days';
  `);
}

/** Pull a finished game back to play for free, as enter_replay / enter_completionist do. */
async function resume(id: string, completionist = false) {
  await db.query(
    "update public.games set status = 'playing', started_at = now(), finished_at = null, resumed = true, completionist = $2 where id = $1",
    [id, completionist],
  );
}

async function finishes(): Promise<number> {
  const res = await db.query<{ finishes: number }>(
    "select finishes::int from public.square_trending(12)",
  );
  return res.rows[0]?.finishes ?? 0;
}

describe("square_trending — Hot This Week counts only real clears", () => {
  it("counts a real finish", async () => {
    const id = await addGame();
    await setStatus(id, "playing");
    await setStatus(id, "finished", "beaten");
    expect(await finishes()).toBe(1);
  });

  it("does not count a Retire It, which also lands on Finished", async () => {
    const id = await addGame();
    await setStatus(id, "playing");
    await setStatus(id, "backlog");
    await setStatus(id, "finished", "retired");
    expect(await finishes()).toBe(0);
  });

  it("does not count a cancelled replay of an older clear", async () => {
    const id = await addGame();
    await setStatus(id, "playing");
    await setStatus(id, "finished", "beaten");
    await ageEverything();
    await resume(id);
    await db.query("select public.abort_replay($1)", [id]);
    expect(await finishes()).toBe(0);
  });

  it("does not count an abandoned completion run of an older clear", async () => {
    const id = await addGame();
    await setStatus(id, "playing");
    await setStatus(id, "finished", "beaten");
    await ageEverything();
    await resume(id, true);
    await db.query("select public.abandon_completion($1)", [id]);
    expect(await finishes()).toBe(0);
  });

  it("does not count a clear the owner's milestones date before this week", async () => {
    const id = await addGame();
    await setStatus(id, "playing");
    await setStatus(id, "finished", "beaten");
    await db.query("update public.games set cleared_on = current_date - 60 where id = $1", [id]);
    expect(await finishes()).toBe(0);
  });
});

describe("square_trending — a bundle is one add (2026-10-23)", () => {
  it("counts adding a bundle once, as the bundle, but still counts finishing a game inside it", async () => {
    const BUNDLE = "00000000-0000-4000-8000-0000000000c1";
    await db.query("insert into public.games (user_id, title, status) values ($1, 'Toy Story Double Pack', 'backlog')", [USER]);
    const members = await db.query<{ id: string }>(
      `insert into public.games (user_id, title, status, compilation_id)
       values ($1, 'Toy Story', 'backlog', $2), ($1, 'Toy Story Racer', 'backlog', $2) returning id`,
      [USER, BUNDLE],
    );
    const shelf = async () =>
      (await db.query<{ title: string; adds: number; finishes: number }>(
        "select title, adds::int, finishes::int from public.square_trending(12) order by title",
      )).rows;
    expect(await shelf()).toEqual([{ title: "Toy Story Double Pack", adds: 1, finishes: 0 }]);

    await setStatus(members.rows[0].id, "playing");
    await setStatus(members.rows[0].id, "finished", "beaten");
    expect(await shelf()).toEqual([
      { title: "Toy Story", adds: 0, finishes: 1 },
      { title: "Toy Story Double Pack", adds: 1, finishes: 0 },
    ]);
  });
});
