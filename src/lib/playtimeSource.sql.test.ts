// @vitest-environment node
//
// Exercises the REAL log_playtime_event trigger and set_platform_playtime
// from schema.sql in an embedded Postgres (PGlite): play logged as it happens
// is 'live', while catch-up is 'backfill' (owner reports, 2026-10-17) — the
// starting time entered when a game is added or a copy attached (the
// bonus-free set_platform_playtime call), and any single change over 24 hours
// either way. It also checks which version an unattributed session is
// credited to. Tables are trimmed; pay_session_bonus and auth.uid are stubbed.
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

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.games (id uuid primary key, user_id uuid, title text, played_hours real not null default 0,
      copies jsonb not null default '[]'::jsonb, genres jsonb, developers jsonb, hours real,
      in_rotation boolean not null default false, status text not null default 'playing',
      demo boolean not null default false);
    create table public.playtime_events (user_id uuid, game_id uuid, game_title text, hours real, played_after real,
      platform text, format text, genres jsonb, developers jsonb, game_hours real, pact_id uuid, session_id uuid,
      source text not null default 'live', in_rotation boolean not null default false,
      drop_in boolean not null default false, note text, demo boolean not null default false,
      via_editor boolean not null default false,
      created_at timestamptz not null default now());
    create table public.bonus_calls (hours real);
    create function public.rotation_play_rewards(p_game uuid) returns table (milestone integer, regular integer, checkin integer)
      language sql as $$ select 0, 0, null::integer $$;
    create function public.pay_session_bonus(p_user uuid, p_game uuid, p_hours real) returns integer
      language sql as $$ insert into public.bonus_calls values (p_hours); select 5 $$;
  `);
  await db.exec(fn("log_playtime_event"));
  await db.exec(`create trigger games_log_playtime after update of played_hours on public.games
    for each row execute function public.log_playtime_event()`);
  await db.exec(fn("set_platform_playtime"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.playtime_events; delete from public.games; delete from public.bonus_calls;
    insert into public.games (id, user_id, title) values ('${G}', '${ME}', 'Hades');
    select set_config('test.uid', '${ME}', false);
  `);
});

async function sources() {
  return (await db.query<{ hours: number; source: string }>("select hours, source from public.playtime_events order by hours")).rows;
}

describe("playtime source", () => {
  it("logs play as live, and any change over 24 hours as catch-up", async () => {
    await db.exec(`update public.games set played_hours = 2 where id = '${G}'`);
    await db.exec(`update public.games set played_hours = 358 where id = '${G}'`);
    await db.exec(`update public.games set played_hours = 300 where id = '${G}'`);
    expect(await sources()).toEqual([
      { hours: -58, source: "backfill" },
      { hours: 2, source: "live" },
      { hours: 356, source: "backfill" },
    ]);
  });

  it("logs starting time (the bonus-free call) as catch-up, with no bonus", async () => {
    await db.query("select public.set_platform_playtime($1, 'PC', null, 12, false)", [G]);
    await db.query("select public.set_platform_playtime($1, 'PC', null, 14, true)", [G]);
    expect(await sources()).toEqual([
      { hours: 2, source: "live" },
      { hours: 12, source: "backfill" },
    ]);
    expect((await db.query("select hours from public.bonus_calls")).rows).toEqual([{ hours: 2 }]);
  });
});

describe("version auto-detect", () => {
  async function logWithCopies(copies: object[]) {
    await db.query("update public.games set copies = $1::jsonb where id = $2", [JSON.stringify(copies), G]);
    await db.exec(`update public.games set played_hours = played_hours + 1 where id = '${G}'`);
    return (await db.query<{ platform: string | null; format: string | null }>(
      "select platform, format from public.playtime_events order by created_at desc limit 1",
    )).rows[0];
  }

  it("credits the one platform you own in two formats (issue 78dab2e2)", async () => {
    expect(
      await logWithCopies([
        { id: "a", platform: "PlayStation 4", format: "digital" },
        { id: "b", platform: "PlayStation 4", format: "physical" },
      ]),
    ).toEqual({ platform: "PlayStation 4", format: null });
  });

  it("keeps the format when every copy agrees, ignoring DLC and platform-less copies", async () => {
    expect(
      await logWithCopies([
        { id: "a", platform: "PC", format: "digital" },
        { id: "b", platform: "PC", format: "dlc" },
        { id: "c", format: "physical" },
      ]),
    ).toEqual({ platform: "PC", format: "digital" });
  });

  it("leaves time on two platforms unattributed when no choice is given", async () => {
    expect(
      await logWithCopies([
        { id: "a", platform: "PC", format: "digital" },
        { id: "b", platform: "Nintendo Switch", format: "digital" },
      ]),
    ).toEqual({ platform: null, format: null });
  });
});
