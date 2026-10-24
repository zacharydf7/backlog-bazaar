// @vitest-environment node
//
// Exercises the REAL log_playtime_event trigger and set_platform_playtime
// from schema.sql in an embedded Postgres (PGlite): play logged as it happens
// is 'live', while catch-up is 'backfill' (owner reports, 2026-10-17): any
// single change over 24 hours either way, and hours typed into the Played
// fields (owner, 2026-10-24) apart from a same-day take-back. It also checks
// which version an unattributed session is credited to. Tables are trimmed;
// auth.uid is stubbed.
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
    create table public.user_time_zones (user_id uuid primary key, time_zone text not null);
    create table public.app_config (id integer primary key, rotation_reset_tz text);
  `);
  await db.exec(fn("player_tz"));
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
    delete from public.playtime_events; delete from public.games;
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

  it("logs hours typed into the Played fields as catch-up (issue 0b535cb2)", async () => {
    await db.query("select public.set_platform_playtime($1, 'PC', null, 12)", [G]);
    await db.query("select public.set_platform_playtime($1, 'PC', null, 14)", [G]);
    expect(await sources()).toEqual([
      { hours: 2, source: "backfill" },
      { hours: 12, source: "backfill" },
    ]);
  });
});

describe("typed edits against play logged today (issue 0b535cb2)", () => {
  // Each step is its own request in the app, so give it its own moment: the
  // rules read which came first, and PGlite's clock only has milliseconds.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 2));
  const log = async (h: number) => {
    await tick();
    await db.exec(`update public.games set played_hours = played_hours + ${h} where id = '${G}'`);
  };
  /** Type a version's hours to `total` in the Played fields. */
  const type = async (platform: string | null, total: number, format: string | null = null) => {
    await tick();
    await db.query("select public.set_platform_playtime($1, $2, $3, $4)", [G, platform, format, total]);
  };
  const ownPcDigital = () =>
    db.exec(`update public.games set copies = '[{"id":"c","platform":"PC","format":"digital"}]' where id = '${G}'`);
  async function live() {
    const r = await db.query<{ h: number }>(
      "select coalesce(sum(hours), 0)::real as h from public.playtime_events where source = 'live'",
    );
    return Math.round(r.rows[0].h * 100) / 100;
  }

  it("takes a mistaken log back when it's typed down", async () => {
    await log(15);
    await type(null, 1.5);
    expect(await live()).toBe(1.5);
  });

  it("leaves logged play alone when a fill-in is typed and then fixed", async () => {
    await log(2);
    await type("PC", 10);
    await type("PC", 8);
    expect(await live()).toBe(2);
  });

  it("uses up a typo'd fill-in before logged play on the same platform", async () => {
    await log(2);
    await type(null, 12); // a 10h fill-in on the same bucket as the log
    await type(null, 10); // the typo fixed
    expect(await live()).toBe(2);
  });

  it("leaves logged play alone when a format's hours fold into its platform row", async () => {
    await ownPcDigital();
    await log(2); // credited to PC (Digital)
    await type("PC", 0, "digital"); // the editor clears the folded bucket…
    await type("PC", 3); // …then sets the platform row, one hour higher
    expect(await live()).toBe(2);
    expect(await sources()).toEqual([
      { hours: -2, source: "live" },
      { hours: 1, source: "backfill" },
      { hours: 2, source: "live" },
      { hours: 2, source: "live" },
    ]);
  });

  it("takes a mistaken log back even after starting hours were typed that day", async () => {
    await ownPcDigital();
    await type("PC", 356, "digital"); // starting hours, typed at add
    await log(15);
    await type("PC", 357.5, "digital");
    expect(await live()).toBe(1.5);
  });

  it("never gives a taken-back log back as a fill-in on another platform", async () => {
    await log(15);
    await type(null, 1.5);
    await type("PS5", 10);
    expect(await live()).toBe(1.5);
  });

  it("counts today's logged hours moved to another platform as catch-up (known limit)", async () => {
    await log(2);
    await type(null, 0);
    await type("PC", 2);
    expect(await live()).toBe(0);
  });

  it("leaves logged play alone across a move bigger than a day", async () => {
    await type("PS5", 20); // yesterday's history, typed in
    await log(1);
    await type("PS5", 0);
    await type("PC", 25);
    expect(await live()).toBe(1);
  });

  it("never turns a typed drop and rise into play", async () => {
    await type("PC", 50);
    await type("PC", 20);
    await type("PC", 30);
    expect(await live()).toBe(0);
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
