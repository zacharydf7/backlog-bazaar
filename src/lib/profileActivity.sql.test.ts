// @vitest-environment node
//
// Exercises the REAL list_profile_activity (the profile's Recent Activity)
// from schema.sql in an embedded Postgres (PGlite): a pre-order isn't "added"
// until it releases (issue f7040bfd). Release day re-dates the Added step
// (games_preorder_fulfilled_redate), so it then shows at the release date.
// Tables are trimmed to the columns it reads; are_friends is stubbed.
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
const ZELDA = "00000000-0000-4000-8000-0000000000c1";
const HADES = "00000000-0000-4000-8000-0000000000c2";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select '${ME}'::uuid $$;
    create table public.profiles (id uuid primary key, privacy jsonb not null default '{}');
    create table public.games (id uuid primary key, user_id uuid, title text, status text,
      image text, stock_image text, finish_tag text, copies jsonb not null default '[]',
      private boolean not null default false, preordered_at timestamptz);
    create table public.game_milestones (id uuid primary key default gen_random_uuid(), user_id uuid,
      game_id uuid, kind text, occurred_on date, created_at timestamptz not null default now());
    create function public.are_friends(a uuid, b uuid) returns boolean language sql as $$ select false $$;
  `);
  for (const name of ["primary_acquisition", "primary_provider", "list_profile_activity"]) {
    await db.exec(fn(name));
  }
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.game_milestones; delete from public.games; delete from public.profiles;
    insert into public.profiles (id) values ('${ME}');
    insert into public.games (id, user_id, title, status, preordered_at) values
      ('${ZELDA}', '${ME}', 'The Legend of Zelda: Ocarina of Time', 'backlog', '2026-10-18'),
      ('${HADES}', '${ME}', 'Hades', 'backlog', null);
    insert into public.game_milestones (user_id, game_id, kind, occurred_on) values
      ('${ME}', '${ZELDA}', 'added', '2026-10-18'),
      ('${ME}', '${HADES}', 'added', '2026-10-19');
  `);
});

async function timeline() {
  return (
    await db.query<{ kind: string; game_title: string }>(
      `select kind, game_title from public.list_profile_activity('${ME}', 30)`,
    )
  ).rows.map((r) => `${r.kind}:${r.game_title}`);
}

describe("list_profile_activity — pre-orders (issue f7040bfd)", () => {
  it("leaves a pre-order's Added step out until it releases", async () => {
    expect(await timeline()).toEqual(["added:Hades"]);
    await db.exec(`update public.games set preordered_at = null where id = '${ZELDA}'`);
    expect(await timeline()).toContain("added:The Legend of Zelda: Ocarina of Time");
  });

  it("leaves a wishlist entry's Added step out until it's imported", async () => {
    await db.exec(`update public.games set status = 'wishlist', preordered_at = null where id = '${ZELDA}'`);
    expect(await timeline()).toEqual(["added:Hades"]);
    await db.exec(`update public.games set status = 'backlog' where id = '${ZELDA}'`);
    expect(await timeline()).toContain("added:The Legend of Zelda: Ocarina of Time");
  });
});
