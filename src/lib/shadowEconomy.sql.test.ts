// @vitest-environment node
//
// Exercises the REAL shadow_economy_status / shadow_economy_pct functions from
// schema.sql in an embedded Postgres (PGlite): an engaged player (enough of
// their recent paid clears Verified) gets the automatic buff, an admin override
// wins (buff / nerf / exempt, own % or the default), and nothing applies while
// the switch is off. Tables are trimmed to the columns the functions read;
// apply_finish's use of it was probed against the live schema in a rolled-back
// transaction (it depends on too much to extract).
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

const U = "00000000-0000-4000-8000-0000000000a1";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.app_config (id integer primary key, bounty_gate_pct integer);
    insert into public.app_config values (1, 50);
    create table public.games (
      id uuid primary key default gen_random_uuid(), user_id uuid not null,
      status text not null default 'finished', finish_tag text default 'beaten',
      reward integer default 100, played_hours real default 0, hours real, personal_hours real,
      finished_at timestamptz default now()
    );
    create table public.shadow_economy_config (
      id integer primary key default 1, enabled boolean not null default false,
      buff_pct integer not null default 10, nerf_pct integer not null default 10,
      window_clears integer not null default 10, min_clears integer not null default 3,
      verified_share integer not null default 80
    );
    insert into public.shadow_economy_config (id) values (1);
    create table public.shadow_economy_overrides (
      user_id uuid primary key, mode text not null, pct integer, note text
    );
  `);
  // auth.uid() reads the caller from a setting, as Supabase's does.
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  `);
  await db.exec(fn("shadow_economy_status"));
  await db.exec(fn("shadow_economy_pct"));
  await db.exec(fn("my_bounty_rate"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.games; delete from public.shadow_economy_overrides;
    update public.shadow_economy_config set enabled = true, buff_pct = 10, nerf_pct = 10,
      window_clears = 10, min_clears = 3, verified_share = 80;
  `);
});

/** Paid clears on 40h games: `verified` with 25h logged (50% bar), the rest 1h. */
async function clears(verified: number, unverified: number) {
  for (let i = 0; i < verified + unverified; i++) {
    await db.query(
      "insert into public.games (user_id, hours, played_hours, finished_at) values ($1, 40, $2, now() - ($3 || ' hours')::interval)",
      [U, i < verified ? 25 : 1, String(i)],
    );
  }
}

async function pct() {
  const r = await db.query<{ pct: number; source: string | null }>(
    "select pct, source from public.shadow_economy_pct($1, null)",
    [U],
  );
  return r.rows[0];
}

describe("shadow economy standing", () => {
  it("buffs an engaged player automatically", async () => {
    await clears(9, 1);
    expect(await pct()).toEqual({ pct: 10, source: "auto" });
  });

  it("gives nothing below the verified share, or with too few clears", async () => {
    await clears(6, 4);
    expect(await pct()).toEqual({ pct: 0, source: null });
    await db.exec("delete from public.games");
    await clears(2, 0);
    expect(await pct()).toEqual({ pct: 0, source: null });
  });

  it("judges only the most recent clears in the window", async () => {
    // Ten old unverified clears, then ten fresh verified ones.
    for (let i = 0; i < 10; i++) {
      await db.query(
        "insert into public.games (user_id, hours, played_hours, finished_at) values ($1, 40, 1, now() - interval '30 days')",
        [U],
      );
    }
    await clears(10, 0);
    expect(await pct()).toEqual({ pct: 10, source: "auto" });
  });

  it("lets an admin override win: nerf, custom buff, exemption", async () => {
    await clears(10, 0);
    await db.query("insert into public.shadow_economy_overrides values ($1, 'nerf', null, null)", [U]);
    expect(await pct()).toEqual({ pct: -10, source: "override" });
    await db.query("update public.shadow_economy_overrides set mode = 'buff', pct = 25 where user_id = $1", [U]);
    expect(await pct()).toEqual({ pct: 25, source: "override" });
    await db.query("update public.shadow_economy_overrides set mode = 'exempt' where user_id = $1", [U]);
    expect(await pct()).toEqual({ pct: 0, source: "override" });
  });

  it("tells a player only their own rate, as a percent of normal", async () => {
    await clears(10, 0);
    await db.exec(`select set_config('test.uid', '${U}', false)`);
    const rate = async () =>
      (await db.query<{ r: number }>("select public.my_bounty_rate() as r")).rows[0].r;
    expect(await rate()).toBe(110);
    await db.query("insert into public.shadow_economy_overrides values ($1, 'nerf', 15, null)", [U]);
    expect(await rate()).toBe(85);
    await db.exec("update public.shadow_economy_config set enabled = false");
    expect(await rate()).toBe(100);
  });

  it("applies nothing while switched off, though the standing still shows", async () => {
    await clears(10, 0);
    await db.exec("update public.shadow_economy_config set enabled = false");
    expect(await pct()).toEqual({ pct: 0, source: null });
    const s = await db.query<{ pct: number }>("select pct from public.shadow_economy_status($1, null)", [U]);
    expect(s.rows[0].pct).toBe(10);
  });
});
