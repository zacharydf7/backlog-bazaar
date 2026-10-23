// @vitest-environment node
//
// Exercises the REAL list_friends and list_conversations from schema.sql, with
// the real user_title_json / user_cosmetics_json, in an embedded Postgres
// (PGlite): each friend or chat partner carries the title and cosmetics they
// wear (owner, 2026-10-23), only owned equipment shows, and a hard-private
// profile shares neither. Tables are trimmed to the columns these read;
// live_play_presence is stubbed.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.lastIndexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

const ME = "00000000-0000-4000-8000-0000000000a1";
const ANA = "00000000-0000-4000-8000-0000000000a2";
const BADGE = "00000000-0000-4000-8000-0000000000b1";
const FRAME = "00000000-0000-4000-8000-0000000000c1";
const COIN = "00000000-0000-4000-8000-0000000000c2";
const STALL = "00000000-0000-4000-8000-0000000000c3";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, display_name text, avatar_url text,
      coins integer not null default 0, economy_enabled boolean not null default true,
      last_seen_at timestamptz, activity text, privacy jsonb not null default '{}',
      selected_badge_id uuid, equipped_frame_id uuid, equipped_stall_id uuid, equipped_coin_id uuid);
    create table public.friendships (requester uuid, addressee uuid, status text);
    create table public.games (id uuid primary key default gen_random_uuid(), user_id uuid, title text,
      status text, private boolean not null default false, started_at timestamptz,
      added_at timestamptz not null default now());
    create table public.badges (id uuid primary key, slug text, name text, description text, icon text,
      prestige integer, kind text, effect text);
    create table public.user_badges (user_id uuid, badge_id uuid, revoked_at timestamptz);
    create table public.shop_items (id uuid primary key, kind text, style text);
    create table public.shop_purchases (user_id uuid, item_id uuid);
    create table public.cosmetic_grants (user_id uuid, item_id uuid, revoked_at timestamptz);
    create table public.messages (id uuid primary key default gen_random_uuid(), sender uuid, recipient uuid,
      body text, game_title text, images jsonb, deleted_at timestamptz, read_at timestamptz,
      sender_hidden_at timestamptz, recipient_hidden_at timestamptz,
      sender_archived_at timestamptz, recipient_archived_at timestamptz,
      created_at timestamptz not null default now());
    create function public.live_play_presence(p_user uuid)
      returns table (playing_title text, playing_since timestamptz) language sql
      as $$ select null::text, null::timestamptz where false $$;

    insert into public.badges values ('${BADGE}', 'haunt', 'Keeper of the Haunt', 'Spooky', 'moon', 3, 'shop', 'haunt-glow');
    insert into public.shop_items values ('${FRAME}', 'frame', 'jack-o-lantern'), ('${COIN}', 'coin', 'opal'),
      ('${STALL}', 'stall', 'haunted-bazaar');
  `);
  for (const name of ["user_title_json", "user_cosmetics_json", "list_friends", "list_conversations"]) {
    await db.exec(fn(name));
  }
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.profiles; delete from public.friendships; delete from public.user_badges;
    delete from public.shop_purchases; delete from public.cosmetic_grants; delete from public.messages;
    insert into public.profiles (id, display_name) values ('${ME}', 'Me');
    -- Ana wears a title, a frame and a coin she owns, and a stall she doesn't.
    insert into public.profiles (id, display_name, selected_badge_id, equipped_frame_id, equipped_coin_id,
      equipped_stall_id)
    values ('${ANA}', 'Ana', '${BADGE}', '${FRAME}', '${COIN}', '${STALL}');
    insert into public.user_badges values ('${ANA}', '${BADGE}', null);
    insert into public.shop_purchases values ('${ANA}', '${FRAME}');
    insert into public.cosmetic_grants values ('${ANA}', '${COIN}', null);
    insert into public.friendships values ('${ME}', '${ANA}', 'accepted');
    insert into public.messages (sender, recipient, body) values ('${ANA}', '${ME}', 'hi');
    select set_config('test.uid', '${ME}', false);
  `);
});

type Look = { title: { name: string; effect: string } | null; cosmetics: Record<string, string | null> | null };

async function friendLook(): Promise<Look> {
  return (await db.query<Look>("select title, cosmetics from public.list_friends()")).rows[0];
}

async function chatLook(): Promise<Look> {
  return (
    await db.query<Look>("select other_title as title, other_cosmetics as cosmetics from public.list_conversations()")
  ).rows[0];
}

describe("a friend's worn look (owner, 2026-10-23)", () => {
  it("carries their title and owned cosmetics, on the friends list and in chats", async () => {
    for (const look of [await friendLook(), await chatLook()]) {
      expect(look.title).toMatchObject({ name: "Keeper of the Haunt", effect: "haunt-glow" });
      // The stall was never bought or granted, so it isn't worn.
      expect(look.cosmetics).toEqual({ frame: "jack-o-lantern", coin: "opal", stall: null });
    }
  });

  it("shares neither from a hard-private profile", async () => {
    await db.exec(`update public.profiles set privacy = '{"private_profile": true}' where id = '${ANA}'`);
    expect(await friendLook()).toEqual({ title: null, cosmetics: null });
    expect(await chatLook()).toEqual({ title: null, cosmetics: null });
  });
});
