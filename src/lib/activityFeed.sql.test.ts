// @vitest-environment node
//
// Exercises the REAL friends-feed capture and reader from schema.sql in an
// embedded Postgres (PGlite) for everyday activity (issue d170a677): starts,
// time logged on a Playing game, progress notes and medals are append-only
// activity_events rows, and list_activity_feed rolls a friend's play, notes
// and medals up per day in THEIR timezone, honoring hide_play_activity,
// private profiles and private or stealth games. Tables are trimmed to the
// columns these touch; auth.uid reads a test setting.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

/** The `drop trigger if exists <name> ... execute function ...;` pair. */
function trigger(name: string): string {
  const start = schema.indexOf(`drop trigger if exists ${name} on `);
  if (start < 0) throw new Error(`trigger ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf(";", schema.indexOf("execute function", start)) + 1);
}

/** The feed-kinds check, as schema.sql leaves it. */
function kindCheck(): string {
  const start = schema.indexOf("alter table public.activity_events add constraint activity_events_kind_check");
  return schema.slice(start, schema.indexOf(";", start) + 1);
}

const ME = "00000000-0000-4000-8000-0000000000a1";
const SORA = "00000000-0000-4000-8000-0000000000a2";
const STRANGER = "00000000-0000-4000-8000-0000000000a3";
const MH = "00000000-0000-4000-8000-0000000000b1";
const HADES = "00000000-0000-4000-8000-0000000000b2";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, display_name text, avatar_url text,
      privacy jsonb not null default '{}'::jsonb, hidden boolean not null default false);
    create table public.notifications (user_id uuid, type text, title text, body text, link text);
    create table public.friendships (requester uuid, addressee uuid, status text);
    create table public.games (id uuid primary key, user_id uuid, title text, status text not null,
      played_hours real not null default 0, copies jsonb not null default '[]'::jsonb, genres jsonb,
      developers jsonb, hours real, in_rotation boolean not null default false,
      private boolean not null default false, stealth boolean not null default false,
      demo boolean not null default false, progress_note text, finish_tag text, reward integer,
      cleared_on date, preordered_at timestamptz);
    create table public.playtime_events (user_id uuid, game_id uuid, game_title text, hours real, played_after real,
      platform text, format text, genres jsonb, developers jsonb, game_hours real, pact_id uuid, session_id uuid,
      source text not null default 'live', in_rotation boolean not null default false,
      drop_in boolean not null default false, note text, demo boolean not null default false,
      via_editor boolean not null default false,
      created_at timestamptz not null default now());
    create table public.activity_events (id uuid primary key default gen_random_uuid(), actor uuid not null,
      kind text not null, game_id uuid references public.games (id) on delete set null, game_title text, detail jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now());
    create table public.activity_cheers (event_id uuid, user_id uuid, primary key (event_id, user_id));
    -- What the real log_game_status_event trigger records; tests write the rows they need.
    create table public.game_status_events (game_id uuid, from_status text, to_status text);
    create table public.user_time_zones (user_id uuid primary key, time_zone text not null);
    create table public.app_config (id integer primary key, rotation_reset_tz text);
    insert into public.app_config values (1, 'UTC');
    create table public.achievements (id uuid primary key default gen_random_uuid(), name text,
      hidden boolean not null default false);
    create table public.user_achievements (user_id uuid, achievement_id uuid,
      earned_at timestamptz not null default now(), primary key (user_id, achievement_id));
    -- The worn look's own rules are in socialCosmetics.sql.test.ts; these stand-ins
    -- echo the user they're asked about, so each line's look is checked to be its actor's.
    create function public.user_title_json(p_user uuid) returns jsonb language sql
      as $$ select jsonb_build_object('id', p_user) $$;
    create function public.user_cosmetics_json(p_user uuid) returns jsonb language sql
      as $$ select jsonb_build_object('frame', p_user) $$;
  `);
  await db.exec(kindCheck());
  for (const name of [
    "primary_acquisition",
    "primary_provider",
    "is_live_play",
    "player_tz",
    "clear_is_fresh",
    "log_playtime_event",
    "emit_game_activity",
    "emit_play_activity",
    "emit_note_activity",
    "emit_medal_activity",
    "activity_feed_lines",
    "list_activity_feed",
    "cheer_activity",
  ]) {
    await db.exec(fn(name));
  }
  for (const name of [
    "games_log_playtime",
    "games_emit_activity",
    "games_emit_note_activity",
    "playtime_events_emit_activity",
    "user_achievements_emit_activity",
  ]) {
    await db.exec(trigger(name));
  }
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    reset test.uid;
    delete from public.activity_cheers; delete from public.activity_events; delete from public.playtime_events;
    delete from public.game_status_events;
    delete from public.games; delete from public.profiles; delete from public.friendships;
    delete from public.user_time_zones; delete from public.user_achievements; delete from public.achievements;
    insert into public.profiles (id, display_name) values ('${ME}', 'Me'), ('${SORA}', 'Sora'), ('${STRANGER}', 'Ana');
    insert into public.friendships values ('${ME}', '${SORA}', 'accepted');
    insert into public.games (id, user_id, title, status) values
      ('${MH}', '${SORA}', 'Monster Hunter Wilds', 'playing'),
      ('${HADES}', '${SORA}', 'Hades', 'playing');
  `);
});

async function posts() {
  return (
    await db.query<{ kind: string; game_title: string | null; detail: Record<string, unknown> }>(
      "select kind, game_title, detail from public.activity_events order by created_at",
    )
  ).rows;
}

/** A row as list_activity_feed would see it, at a fixed time. */
async function post(actor: string, kind: string, at: string, detail: object = {}, game: string | null = MH) {
  const r = await db.query<{ id: string }>(
    `insert into public.activity_events (actor, kind, game_id, game_title, detail, created_at)
     values ($1, $2, $3, (select title from public.games where id = $3), $4, $5) returning id`,
    [actor, kind, game, JSON.stringify(detail), at],
  );
  return r.rows[0].id;
}

type FeedRow = {
  id: string;
  actor: string;
  actor_name: string;
  kind: string;
  game_title: string | null;
  detail: Record<string, unknown>;
  created_at: Date;
  cheer_count: number;
  cheered_by_me: boolean;
  title: { id: string };
  cosmetics: { frame: string };
};

async function feed(before: string | null = null, limit = 30, includeMe = false, everyone = false) {
  await db.exec(`set test.uid = '${ME}'`);
  return (
    await db.query<FeedRow>("select * from public.list_activity_feed($1, $2, $3, $4)", [
      before,
      limit,
      includeMe,
      everyone,
    ])
  ).rows.map((r) => ({ ...r, cheer_count: Number(r.cheer_count) }));
}

describe("capture", () => {
  it("posts time logged on a Playing game and corrections down, but not catch-up time", async () => {
    await db.exec(`update public.games set played_hours = played_hours + 1.5 where id = '${MH}'`);
    await db.exec(`update public.games set played_hours = played_hours + 30 where id = '${MH}'`);
    await db.exec(`update public.games set played_hours = played_hours - 1 where id = '${MH}'`);
    expect(await posts()).toEqual([
      { kind: "played", game_title: "Monster Hunter Wilds", detail: { hours: 1.5 } },
      { kind: "played", game_title: "Monster Hunter Wilds", detail: { hours: -1 } },
    ]);
  });

  describe("hours typed into the Played fields (issue 0b535cb2)", () => {
    // Each step is its own request in the app, so give it its own moment: the
    // rules read which came first, and PGlite's clock only has milliseconds.
    const tick = () => new Promise((resolve) => setTimeout(resolve, 2));
    const log = async (h: number) => {
      await tick();
      await db.exec(`update public.games set played_hours = played_hours + ${h} where id = '${MH}'`);
    };
    // set_platform_playtime marks its writes explicit; this stands in for it.
    async function typed(...steps: number[]) {
      await db.exec(`set app.play_platform_explicit = 'true'`);
      try {
        for (const h of steps) await log(h);
      } finally {
        await db.exec(`reset app.play_platform_explicit`);
      }
    }
    const day = async () => (await feed()).map((r) => r.detail.hours);

    it("posts nothing for a past playthrough filled in, and marks it typed", async () => {
      await typed(8);
      expect(await posts()).toEqual([]);
      expect((await db.query("select via_editor from public.playtime_events")).rows).toEqual([
        { via_editor: true },
      ]);
    });

    it("leaves logged play alone when a typed fill-in is fixed down", async () => {
      await log(2);
      await typed(8, -9.5);
      expect(await day()).toEqual([0.5]);
    });

    it("leaves logged play alone when a bucket is cleared and re-set", async () => {
      await log(2);
      await typed(-2, 3); // clear the logged bucket, then set the platform row
      expect(await day()).toEqual([2]);
    });

    it("posts nothing when a typed drop is later typed back up", async () => {
      await typed(-30, 10);
      expect(await posts()).toEqual([]);
    });

    it("leaves logged play alone across a typed drop and rise bigger than a day", async () => {
      await log(1);
      await typed(-20, 25);
      expect(await day()).toEqual([1]);
    });

    it("still takes a mistaken log back off when it's typed down", async () => {
      await log(15);
      await typed(-13.5);
      expect(await day()).toEqual([1.5]);
    });
  });

  it("nets a mistaken log against its correction on the feed", async () => {
    await db.exec(`update public.games set played_hours = played_hours + 15 where id = '${MH}'`);
    await db.exec(`update public.games set played_hours = 1.5 where id = '${MH}'`);
    expect((await feed()).map((r) => [r.kind, r.detail])).toEqual([["played", { hours: 1.5 }]]);
    await db.exec(`update public.games set played_hours = 0 where id = '${MH}'`);
    expect(await feed()).toEqual([]);
  });

  it("never posts a demo's time or a drop-in's (which has its own post)", async () => {
    await db.exec(`update public.games set status = 'wishlist', demo = true where id = '${MH}'`);
    await db.exec(`update public.games set status = 'finished' where id = '${HADES}'`);
    await db.exec(`delete from public.activity_events`); // the finish's own post
    await db.exec(`update public.games set played_hours = played_hours + 1`);
    expect(await posts()).toEqual([]);
    expect((await db.query("select demo from public.playtime_events where demo")).rows).toHaveLength(1);
  });

  it("posts a pre-order when it releases, not when it's placed (issue f7040bfd)", async () => {
    await db.exec(`update public.games set status = 'wishlist' where id = '${MH}'`);
    await db.exec(`delete from public.activity_events`);
    await db.exec(`update public.games set status = 'backlog', preordered_at = now() where id = '${MH}'`);
    await db.exec(`insert into public.game_status_events values ('${MH}', 'wishlist', 'backlog')`);
    expect(await posts()).toEqual([]);
    await db.exec(`update public.games set preordered_at = null where id = '${MH}'`);
    expect((await posts()).map((p) => [p.kind, p.game_title])).toEqual([["game_imported", "Monster Hunter Wilds"]]);
  });

  it("never announces a pre-order that was added straight to the Bazaar", async () => {
    await db.exec(`update public.games set status = 'backlog', preordered_at = now() where id = '${MH}'`);
    await db.exec(`delete from public.activity_events`);
    await db.exec(`update public.games set preordered_at = null where id = '${MH}'`);
    expect(await posts()).toEqual([]);
  });

  it("doesn't announce a game twice when it's marked a pre-order after it was added", async () => {
    await db.exec(`update public.games set status = 'wishlist' where id = '${MH}'`);
    await db.exec(`delete from public.activity_events`);
    await db.exec(`update public.games set status = 'backlog' where id = '${MH}'`);
    await db.exec(`insert into public.game_status_events values ('${MH}', 'wishlist', 'backlog')`);
    await db.exec(`update public.games set preordered_at = now() where id = '${MH}'`);
    await db.exec(`update public.games set preordered_at = null where id = '${MH}'`);
    expect((await posts()).map((p) => p.kind)).toEqual(["game_imported"]);
  });

  it("posts a start once a day per game, never for a private game", async () => {
    await db.exec(`update public.games set status = 'backlog'`);
    await db.exec(`update public.games set status = 'playing'`);
    await db.exec(`update public.games set status = 'backlog'`);
    await db.exec(`update public.games set status = 'playing'`);
    expect((await posts()).map((p) => [p.kind, p.game_title]).sort()).toEqual([
      ["game_started", "Hades"],
      ["game_started", "Monster Hunter Wilds"],
    ]);
    await db.exec(`delete from public.activity_events; update public.games set status = 'backlog', private = true`);
    await db.exec(`update public.games set status = 'playing'`);
    expect(await posts()).toEqual([]);
  });

  it("snapshots a new progress note on a Playing game, trimmed and capped", async () => {
    await db.exec(`update public.games set progress_note = '  Beat the first boss  ' where id = '${MH}'`);
    await db.exec(`update public.games set progress_note = 'Beat the first boss' where id = '${MH}'`);
    await db.exec(`update public.games set progress_note = null where id = '${MH}'`);
    await db.exec(`update public.games set progress_note = repeat('x', 300) where id = '${HADES}'`);
    const rows = await posts();
    expect(rows[0]).toEqual({ kind: "note", game_title: "Monster Hunter Wilds", detail: { note: "Beat the first boss" } });
    expect(rows).toHaveLength(2);
    expect((rows[1].detail.note as string).length).toBe(280);
  });

  it("posts no note for a Finished, private or stealth game", async () => {
    await db.exec(`update public.games set status = 'finished' where id = '${MH}'`);
    await db.exec(`delete from public.activity_events`); // the finish's own post
    await db.exec(`update public.games set progress_note = 'Did not click' where id = '${MH}'`);
    await db.exec(`update public.games set private = true where id = '${HADES}'`);
    await db.exec(`update public.games set progress_note = 'Secret run', played_hours = 1 where id = '${HADES}'`);
    await db.exec(`update public.games set private = false, stealth = true where id = '${HADES}'`);
    await db.exec(`update public.games set progress_note = 'Still secret', played_hours = 2 where id = '${HADES}'`);
    expect(await posts()).toEqual([]);
  });

  it("posts each medal earned, named", async () => {
    await db.exec(`
      insert into public.achievements (id, name) values ('00000000-0000-4000-8000-0000000000c1', 'Night Owl');
      insert into public.user_achievements (user_id, achievement_id) values ('${SORA}', '00000000-0000-4000-8000-0000000000c1');
    `);
    expect(await posts()).toEqual([{ kind: "medal_earned", game_title: null, detail: { name: "Night Owl" } }]);
  });
});

describe("list_activity_feed", () => {
  it("rolls a day of play on a game into one line: hours summed, newest time, first row's id", async () => {
    const first = await post(SORA, "played", "2026-10-20T10:00:00Z", { hours: 1 });
    await post(SORA, "bounty_claimed", "2026-10-20T12:00:00Z", { finish_tag: "beaten" }, HADES);
    await post(SORA, "played", "2026-10-20T14:00:00Z", { hours: 0.5 });
    await post(SORA, "played", "2026-10-21T09:00:00Z", { hours: 1 });
    const rows = await feed();
    expect(rows.map((r) => [r.kind, r.game_title, r.detail.hours ?? null, r.created_at.toISOString()])).toEqual([
      ["played", "Monster Hunter Wilds", 1, "2026-10-21T09:00:00.000Z"],
      ["played", "Monster Hunter Wilds", 1.5, "2026-10-20T14:00:00.000Z"],
      ["bounty_claimed", "Hades", null, "2026-10-20T12:00:00.000Z"],
    ]);
    expect(rows[1].id).toBe(first);
    // Each line wears its actor's title and cosmetics (owner, 2026-10-23).
    expect(rows.map((r) => [r.title.id, r.cosmetics.frame])).toEqual(rows.map((r) => [r.actor, r.actor]));
  });

  it("splits days in the player's own timezone", async () => {
    await db.exec(`insert into public.user_time_zones values ('${SORA}', 'America/New_York')`);
    await post(SORA, "played", "2026-10-20T03:00:00Z", { hours: 1 });
    await post(SORA, "played", "2026-10-20T05:00:00Z", { hours: 1 });
    expect(await feed()).toHaveLength(2);
    await db.exec(`delete from public.user_time_zones`);
    expect(await feed()).toHaveLength(1);
  });

  it("counts a cheer on a rolled line as the day goes on", async () => {
    const first = await post(SORA, "played", "2026-10-20T10:00:00Z", { hours: 1 });
    await db.exec(`insert into public.activity_cheers values ('${first}', '${ME}')`);
    await post(SORA, "played", "2026-10-20T20:00:00Z", { hours: 1 });
    const [row] = await feed();
    expect([row.id, row.cheer_count, row.cheered_by_me]).toEqual([first, 1, true]);
  });

  it("keeps a cheer on a note when the same day later gains play", async () => {
    const note = await post(SORA, "note", "2026-10-20T10:00:00Z", { note: "Reached the forest" });
    await db.exec(`insert into public.activity_cheers values ('${note}', '${ME}')`);
    await post(SORA, "played", "2026-10-20T12:00:00Z", { hours: 1 });
    const [row] = await feed();
    expect([row.kind, row.id, row.cheer_count, row.cheered_by_me]).toEqual(["played", note, 1, true]);
  });

  it("never splits a rolled day that straddles the scan window's edge", async () => {
    // Pages of 5 from a fixed start. Page 1 is the five starts from Oct 22
    // back to Oct 18 at noon, so page 2 asks for everything before Oct 18
    // noon: its 7-day window opens at Oct 11 noon, inside the two-row day of
    // play on Oct 11 (01:00 + 23:00), and four more starts fill that page.
    for (let d = 14; d <= 22; d++) {
      await post(SORA, "game_started", `2026-10-${d}T12:00:00Z`, {}, HADES);
    }
    await post(SORA, "game_started", "2026-10-01T12:00:00Z", {}, HADES);
    const straddler = await post(SORA, "played", "2026-10-11T01:00:00Z", { hours: 1 });
    await post(SORA, "played", "2026-10-11T23:00:00Z", { hours: 0.5 });
    const top = "2026-10-23T00:00:00Z";
    const pages: FeedRow[][] = [];
    let before = top;
    for (;;) {
      const page = await feed(before, 5);
      pages.push(page);
      if (page.length < 5) break;
      before = page[page.length - 1].created_at.toISOString();
    }
    expect(pages[1].map((r) => r.id)).toContain(straddler);
    const played = pages.flat().filter((r) => r.kind === "played");
    expect(played.map((r) => [r.id, r.detail.hours])).toEqual([[straddler, 1.5]]);
    const all = await feed(top, 100);
    expect(pages.flat().map((r) => [r.id, r.detail])).toEqual(all.map((r) => [r.id, r.detail]));
  });

  it("doesn't bump a day's play to the top for a correction down", async () => {
    await post(SORA, "played", "2026-10-20T10:00:00Z", { hours: 2 });
    await post(SORA, "game_started", "2026-10-20T12:00:00Z", {}, HADES);
    await post(SORA, "played", "2026-10-20T14:00:00Z", { hours: -1 });
    const rows = await feed();
    expect(rows.map((r) => [r.kind, r.detail.hours ?? null, r.created_at.toISOString()])).toEqual([
      ["game_started", null, "2026-10-20T12:00:00.000Z"],
      ["played", 1, "2026-10-20T10:00:00.000Z"],
    ]);
  });

  it("pages by the rolled time, never splitting a day", async () => {
    await post(SORA, "played", "2026-10-20T10:00:00Z", { hours: 1 });
    await post(SORA, "game_started", "2026-10-20T12:00:00Z", {}, HADES);
    await post(SORA, "played", "2026-10-20T14:00:00Z", { hours: 0.5 });
    expect((await feed("2026-10-20T14:00:00Z")).map((r) => r.kind)).toEqual(["game_started"]);
  });

  it("puts the day's latest note under that day's play, else on its own line", async () => {
    await post(SORA, "played", "2026-10-20T10:00:00Z", { hours: 1 });
    await post(SORA, "note", "2026-10-20T11:00:00Z", { note: "Reached the forest" });
    await post(SORA, "note", "2026-10-20T15:00:00Z", { note: "Beat Rathalos" });
    await post(SORA, "note", "2026-10-20T16:00:00Z", { note: "Going for Zagreus" }, HADES);
    await post(SORA, "note", "2026-10-20T17:00:00Z", { note: "Back on Elysium" }, HADES);
    const rows = await feed();
    expect(rows.map((r) => [r.kind, r.game_title, r.detail, r.created_at.toISOString()])).toEqual([
      ["note", "Hades", { note: "Back on Elysium" }, "2026-10-20T17:00:00.000Z"],
      ["played", "Monster Hunter Wilds", { hours: 1, note: "Beat Rathalos" }, "2026-10-20T15:00:00.000Z"],
    ]);
  });

  it("groups a day's medals into one line, oldest first", async () => {
    await post(SORA, "medal_earned", "2026-10-20T10:00:00Z", { name: "First Clear" }, null);
    await post(SORA, "medal_earned", "2026-10-20T10:00:01Z", { name: "Night Owl" }, null);
    await post(SORA, "medal_earned", "2026-10-20T18:00:00Z", { name: "Collector" }, null);
    await post(SORA, "medal_earned", "2026-10-21T09:00:00Z", { name: "Speed Clear" }, null);
    const rows = await feed();
    expect(rows.map((r) => [r.kind, r.detail])).toEqual([
      ["medal_earned", { medals: ["Speed Clear"] }],
      ["medal_earned", { medals: ["First Clear", "Night Owl", "Collector"] }],
    ]);
  });

  it("leaves out play, drop-ins and notes when the friend hides play activity", async () => {
    await post(SORA, "played", "2026-10-20T10:00:00Z", { hours: 1 });
    await post(SORA, "drop_in", "2026-10-20T10:30:00Z", {}, HADES);
    await post(SORA, "note", "2026-10-20T11:00:00Z", { note: "Beat Rathalos" }, HADES);
    await post(SORA, "game_started", "2026-10-20T12:00:00Z", {}, HADES);
    await post(SORA, "medal_earned", "2026-10-20T13:00:00Z", { name: "Night Owl" }, null);
    await db.exec(`update public.profiles set privacy = '{"hide_play_activity": true}' where id = '${SORA}'`);
    expect((await feed()).map((r) => r.kind)).toEqual(["medal_earned", "game_started"]);
  });

  it("hides a game made private or stealth, a private profile, strangers and my own posts", async () => {
    await post(SORA, "played", "2026-10-20T10:00:00Z", { hours: 1 });
    await post(SORA, "note", "2026-10-20T11:00:00Z", { note: "Beat Rathalos" });
    await post(SORA, "game_started", "2026-10-20T12:00:00Z", {}, MH);
    await post(SORA, "game_started", "2026-10-20T13:00:00Z", {}, HADES);
    await post(STRANGER, "medal_earned", "2026-10-20T13:00:00Z", { name: "Night Owl" }, null);
    await post(ME, "medal_earned", "2026-10-20T13:00:00Z", { name: "Night Owl" }, null);
    await db.exec(`update public.games set private = true where id = '${MH}'`);
    expect((await feed()).map((r) => [r.kind, r.game_title])).toEqual([["game_started", "Hades"]]);
    await db.exec(`update public.games set private = false, stealth = true where id = '${MH}'`);
    expect(await feed()).toHaveLength(1);
    await db.exec(`update public.profiles set privacy = '{"private_profile": true}' where id = '${SORA}'`);
    expect(await feed()).toEqual([]);
  });

  it("adds my own lines when asked, as my friends see them (issue 337e39ca)", async () => {
    const MINE = "00000000-0000-4000-8000-0000000000b3";
    await db.exec(`insert into public.games (id, user_id, title, status) values ('${MINE}', '${ME}', 'Celeste', 'playing')`);
    await post(SORA, "medal_earned", "2026-10-20T09:00:00Z", { name: "First Clear" }, null);
    await post(ME, "played", "2026-10-20T10:00:00Z", { hours: 1 }, MINE);
    await post(ME, "medal_earned", "2026-10-20T11:00:00Z", { name: "Night Owl" }, null);
    const lines = async (includeMe: boolean) =>
      (await feed(null, 30, includeMe)).map((r) => [r.actor === ME ? "me" : "sora", r.kind]);
    expect(await lines(false)).toEqual([["sora", "medal_earned"]]);
    expect(await lines(true)).toEqual([
      ["me", "medal_earned"],
      ["me", "played"],
      ["sora", "medal_earned"],
    ]);
    // Hidden from friends means hidden here too.
    await db.exec(`update public.profiles set privacy = '{"hide_play_activity": true}' where id = '${ME}'`);
    expect(await lines(true)).toEqual([
      ["me", "medal_earned"],
      ["sora", "medal_earned"],
    ]);
  });

  it("reaches back for my own older lines when no friend has any", async () => {
    const longAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    await post(ME, "medal_earned", longAgo, { name: "Night Owl" }, null);
    expect(await feed(null, 30, true)).toHaveLength(1);
  });

  // The Everyone view's launch: strangers' lines start here (issue 499f7c32).
  const AFTER_LAUNCH = "2026-10-25T00:00:00Z";
  const AT = (h: number) => `2026-10-24T${String(h).padStart(2, "0")}:30:00Z`;

  it("shows every player who shares with strangers on Everyone (issue 499f7c32)", async () => {
    const ZOE = "00000000-0000-4000-8000-0000000000a4";
    await db.exec(`insert into public.profiles (id, display_name) values ('${ZOE}', 'Zoe')`);
    await post(STRANGER, "medal_earned", AT(15), { name: "Night Owl" }, null);
    await post(SORA, "medal_earned", AT(16), { name: "First Clear" }, null);
    await post(ZOE, "medal_earned", AT(17), { name: "Collector" }, null);
    const names = async (everyone: boolean) =>
      (await feed(AFTER_LAUNCH, 30, false, everyone)).map((r) => r.actor_name);
    expect(await names(false)).toEqual(["Sora"]);
    expect(await names(true)).toEqual(["Zoe", "Sora", "Ana"]);
    // Friends only: out of Everyone for strangers, still in a friend's feed.
    await db.exec(`update public.profiles set privacy = '{"hide_from_square": true}' where id in ('${ZOE}', '${SORA}')`);
    // Admin-hidden and private accounts never show.
    await db.exec(`update public.profiles set hidden = true where id = '${STRANGER}'`);
    expect(await names(true)).toEqual(["Sora"]);
    await db.exec(`update public.profiles set hidden = false, privacy = '{"private_profile": true}' where id = '${STRANGER}'`);
    expect(await names(true)).toEqual(["Sora"]);
  });

  it("keeps what strangers wrote before Everyone, and hidden medal names, to their friends", async () => {
    await db.exec(`insert into public.achievements (name, hidden) values ('Ghost Run', true)`);
    await post(STRANGER, "note", "2026-10-20T10:00:00Z", { note: "Written for friends" }, HADES);
    const ghost = await post(STRANGER, "medal_earned", AT(15), { name: "Ghost Run" }, null);
    await post(STRANGER, "medal_earned", AT(16), { name: "Night Owl" }, null);
    const everyone = await feed(AFTER_LAUNCH, 30, false, true);
    expect(everyone.map((r) => [r.kind, r.detail])).toEqual([["medal_earned", { medals: ["Night Owl"] }]]);
    // The line keeps its id, so a stranger's cheer counts on the line friends see.
    expect(everyone[0].id).toBe(ghost);
    await db.query("select public.cheer_activity($1)", [ghost]);
    // A friend still sees all of it.
    await db.exec(`insert into public.friendships values ('${ME}', '${STRANGER}', 'accepted')`);
    const friends = await feed(AFTER_LAUNCH, 30, false, true);
    expect(friends.map((r) => r.kind).sort()).toEqual(["medal_earned", "note"]);
    const medals = friends.find((r) => r.kind === "medal_earned");
    expect(medals?.detail).toEqual({ medals: ["Ghost Run", "Night Owl"] });
    expect(medals?.cheer_count).toBe(1);
  });

  it("still lets a stranger cheer an older clear the Market Square shows", async () => {
    const clear = await post(STRANGER, "bounty_claimed", "2026-08-20T12:00:00Z", { finish_tag: "beaten" }, HADES);
    await db.exec(`set test.uid = '${ME}'`);
    await db.query("select public.cheer_activity($1)", [clear]);
    expect((await db.query("select user_id from public.activity_cheers")).rows).toEqual([{ user_id: ME }]);
  });

  it("lets a stranger cheer what the Everyone feed shows, and nothing else", async () => {
    const shared = await post(STRANGER, "medal_earned", AT(15), { name: "Night Owl" }, null);
    await db.exec(`set test.uid = '${ME}'`);
    await db.query("select public.cheer_activity($1)", [shared]);
    expect((await db.query("select user_id from public.activity_cheers")).rows).toEqual([{ user_id: ME }]);
    await db.exec(`update public.profiles set privacy = '{"hide_from_square": true}' where id = '${STRANGER}'`);
    const kept = await post(STRANGER, "medal_earned", AT(16), { name: "Collector" }, null);
    const old = await post(STRANGER, "medal_earned", "2026-10-20T10:00:00Z", { name: "First Clear" }, null);
    await db.exec(`set test.uid = '${ME}'`);
    await expect(db.query("select public.cheer_activity($1)", [kept])).rejects.toThrow(/Event not available/);
    await db.exec(`update public.profiles set privacy = '{}' where id = '${STRANGER}'`);
    await expect(db.query("select public.cheer_activity($1)", [old])).rejects.toThrow(/Event not available/);
  });

  it("keeps a private game's posts hidden after the game is deleted", async () => {
    await post(SORA, "played", "2026-10-20T10:00:00Z", { hours: 1 });
    await post(SORA, "note", "2026-10-20T11:00:00Z", { note: "Secret run" });
    await post(SORA, "game_started", "2026-10-20T09:00:00Z", {}, MH);
    await post(SORA, "game_started", "2026-10-20T08:00:00Z", {}, HADES);
    await db.exec(`update public.games set private = true where id = '${MH}'`);
    await db.exec(`delete from public.games where id = '${MH}'`);
    expect((await feed()).map((r) => [r.kind, r.game_title])).toEqual([["game_started", "Hades"]]);
  });
});
