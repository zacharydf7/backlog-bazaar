// @vitest-environment node
//
// Exercises the REAL log_profile_event trigger from schema.sql in an embedded
// Postgres (PGlite): every profile field a player or admin changes is recorded
// in audit_events — including about me, banner, target cost per hour, edition
// tracking, Rotation lane size and onboarding completion, which used to change
// silently (2026-10-17). Tables are trimmed to the columns the trigger reads.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function block(startText: string, endText: string): string {
  const start = schema.indexOf(startText);
  if (start < 0) throw new Error(`not found: ${startText}`);
  return schema.slice(start, schema.indexOf(endText, start) + endText.length);
}

const U = "00000000-0000-4000-8000-0000000000a1";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.profiles (
      id uuid primary key, display_name text, avatar_url text, theme text, platforms text[],
      custom_platforms text[], hidden_market boolean, privacy text, is_admin boolean,
      blocked boolean, blocked_reason text, hidden boolean, general_slots integer,
      replay_slots integer, completionist_slots integer, selected_badge_id uuid, accent text,
      bg text, economy_enabled boolean, about_me text, banner_url text,
      target_cost_per_hour real, track_editions boolean, rotation_slots integer,
      onboarding_completed_at timestamptz, last_seen_at timestamptz
    );
    create table public.audit_events (
      actor_id uuid, target_user uuid, entity text, entity_id text, action text,
      field text, old_value jsonb, new_value jsonb
    );
    insert into public.profiles (id, display_name) values ('${U}', 'Pat');
  `);
  // Only one logger may exist — the retired duplicate must not come back.
  expect(schema.split("create or replace function public.log_profile_event()").length - 1).toBe(1);
  await db.exec(block("create or replace function public.log_profile_event()", "\n$$;"));
  await db.exec(block("drop trigger if exists profiles_log_event on public.profiles;", "execute function public.log_profile_event();"));
});

afterAll(async () => {
  await db.close();
});

describe("profile change history", () => {
  it("records fields that used to change silently", async () => {
    await db.query(
      "update public.profiles set about_me = 'Hi', banner_url = 'b.png', target_cost_per_hour = 2, track_editions = true, rotation_slots = 3, onboarding_completed_at = now() where id = $1",
      [U],
    );
    const r = await db.query<{ field: string }>("select field from public.audit_events order by field");
    expect(r.rows.map((x) => x.field)).toEqual([
      "about_me",
      "banner_url",
      "onboarding_completed_at",
      "rotation_slots",
      "target_cost_per_hour",
      "track_editions",
    ]);
  });

  it("still ignores presence pings", async () => {
    await db.exec("delete from public.audit_events");
    await db.query("update public.profiles set last_seen_at = now() where id = $1", [U]);
    const r = await db.query("select * from public.audit_events");
    expect(r.rows).toEqual([]);
  });
});
