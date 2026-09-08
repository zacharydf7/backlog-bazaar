// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const schema = readFileSync(
  new URL("../../supabase/schema.sql", import.meta.url),
  "utf8",
);
const migration = schema.slice(
  schema.indexOf("-- Persistent cosmetic authoring."),
);
const saveStart = schema.indexOf(
  "create or replace function public.admin_save_shop_item(",
);
const legacySave = schema.slice(
  saveStart,
  schema.indexOf("\n$$;", saveStart) + 4,
);
const USER = "00000000-0000-4000-8000-000000000001";
const ITEM = "00000000-0000-4000-8000-000000000002";
let db: PGlite;

// Real PostgreSQL functions executed entirely in memory. These fixtures contain
// no credentials, Supabase connection, or user data from the application.
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${USER}');
    create function auth.uid() returns uuid language sql as $$ select '${USER}'::uuid $$;
    create function public.has_permission(p_key text) returns boolean language sql as $$
      select p_key = any(string_to_array(current_setting('test.permissions', true), ','))
    $$;
    create table public.badges(id uuid primary key default gen_random_uuid(), slug text unique,
      name text, description text, icon text, kind text, prestige integer, effect text);
    create table public.shop_sets(key text primary key, badge_id uuid references badges(id));
    create table public.shop_items(id uuid primary key default gen_random_uuid(), slug text unique,
      kind text, name text, description text, price integer check(price >= 0), style text,
      badge_id uuid references badges(id), tier text, secret boolean, set_key text references shop_sets(key),
      available_from timestamptz, available_until timestamptz, active boolean, sort integer);
    create table public.shop_purchases(user_id uuid references auth.users(id), item_id uuid references shop_items(id));
    create table public.audit_events(actor_id uuid, entity text, entity_id text, action text,
      old_value jsonb, new_value jsonb, detail jsonb, created_at timestamptz default now());
    insert into public.shop_items(id,slug,kind,name,price,style,tier,secret,active,sort)
      values('${ITEM}','frame-bronze','frame','Bronze',100,'bronze-ring','standard',false,true,0);
  `);
  await db.exec(legacySave);
  await db.exec(migration);
  // The actual additive migration must be safe to run twice.
  await db.exec(migration);
}, 30_000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "begin; set test.permissions = 'shop.manage,shop.drafts,shop.publish';",
  );
});
afterEach(async () => {
  await db.exec("rollback");
});

async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
) {
  await db.exec("savepoint operation");
  try {
    const result = await db.query<T>(sql, params);
    await db.exec("release savepoint operation");
    return result.rows;
  } catch (error) {
    await db.exec(
      "rollback to savepoint operation; release savepoint operation",
    );
    throw error;
  }
}
async function start(item: string | null = ITEM) {
  return (await query<any>("select * from start_shop_draft($1)", [item]))[0];
}
async function save(draft: any, changes: Record<string, unknown>) {
  return (
    await query<any>("select * from save_shop_draft($1,$2,$3)", [
      draft.draft_id,
      draft.revision,
      { ...draft.payload, item: { ...draft.payload.item, ...changes } },
    ])
  )[0];
}
async function publish(draft: any, ack = true) {
  return (
    await query<any>("select * from publish_shop_draft($1,$2,$3)", [
      draft.draft_id,
      draft.revision,
      ack,
    ])
  )[0];
}

describe("persistent cosmetic draft SQL", () => {
  it("saves immutable revisions without modifying live catalog or purchases", async () => {
    const first = await start();
    const second = await save(first, { price: 250 });
    expect(second.revision).toBe(2);
    expect(
      (await query<any>("select price from shop_items where id=$1", [ITEM]))[0]
        .price,
    ).toBe(100);
    const history = await query<any>(
      "select payload from shop_draft_revisions order by revision",
    );
    expect(history.map((r) => r.payload.item.price)).toEqual([100, 250]);
    expect(await query("select * from shop_purchases")).toHaveLength(0);
  });
  it("denies stale saves and stale publications", async () => {
    const first = await start();
    await save(first, { price: 200 });
    await expect(save(first, { price: 300 })).rejects.toThrow(/DRAFT_CONFLICT/);
    await expect(publish(first)).rejects.toThrow(/DRAFT_CONFLICT/);
    await expect(query("select * from publish_shop_draft($1,null,true)", [first.draft_id])).rejects.toThrow(/DRAFT_CONFLICT/);
  });
  it("refuses to overwrite a catalog edit made since the draft started", async () => {
    const draft = await save(await start(), { price: 200 });
    await query("update shop_items set price=150 where id=$1", [ITEM]);
    await expect(publish(draft)).rejects.toThrow(/CATALOG_CONFLICT/);
    expect(
      (await query<any>("select price from shop_items where id=$1", [ITEM]))[0]
        .price,
    ).toBe(150);
  });
  it("requires owner acknowledgement and publishes exactly once with an audit", async () => {
    await query("insert into shop_purchases values($1,$2)", [USER, ITEM]);
    const draft = await save(await start(), { price: 200 });
    await expect(publish(draft, false)).rejects.toThrow(/OWNERS_ACK_REQUIRED/);
    const result = await publish(draft);
    expect(result.state).toBe("published");
    expect(
      (await query<any>("select price from shop_items where id=$1", [ITEM]))[0]
        .price,
    ).toBe(200);
    expect(await query("select * from shop_purchases")).toHaveLength(1);
    expect(
      await query("select * from audit_events where action='publish'"),
    ).toHaveLength(1);
    await expect(publish(draft)).rejects.toThrow(/DRAFT_CONFLICT/);
  });
  it("separates draft and publish capabilities and denies unprivileged reads/writes", async () => {
    const draft = await start();
    await db.exec("set test.permissions = 'shop.manage,shop.drafts'");
    await expect(publish(draft)).rejects.toThrow(/Not authorized/);
    await db.exec("set test.permissions = 'shop.manage,shop.publish'");
    await expect(start()).rejects.toThrow(/Not authorized/);
    await db.exec("set test.permissions = ''; set role authenticated");
    expect(await query("select * from shop_draft_revisions")).toHaveLength(0);
    await expect(query("delete from shop_draft_revisions")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      query("update shop_draft_revisions set revision=9"),
    ).rejects.toThrow(/permission denied/);
    await expect(query("select * from list_shop_drafts()")).rejects.toThrow(
      /Not authorized/,
    );
  });
  it("rolls back a failed publish and keeps its draft reusable", async () => {
    const draft = await save(await start(), {
      available_from: "2026-10-02T00:00:00Z",
      available_until: "2026-10-01T00:00:00Z",
    });
    await expect(publish(draft)).rejects.toThrow(/end must be later/);
    expect(
      (
        await query<any>(
          "select max(revision) as latest from shop_draft_revisions",
        )
      )[0].latest,
    ).toBe(2);
    expect(await query("select * from audit_events")).toHaveLength(0);
  });
  it("creates a new title and allows explicit effect removal in a later draft", async () => {
    const draft = await save(await start(null), {
      kind: "title",
      slug: "new-title",
      name: "New Title",
      price: 100,
      active: false,
    });
    draft.payload.badge.effect = "iridescent";
    const withEffect = (
      await query<any>("select * from save_shop_draft($1,$2,$3)", [
        draft.draft_id,
        draft.revision,
        draft.payload,
      ])
    )[0];
    const published = await publish(withEffect, false);
    const next = await start(published.published_item_id);
    next.payload.badge.effect = null;
    const clear = (
      await query<any>("select * from save_shop_draft($1,$2,$3)", [
        next.draft_id,
        next.revision,
        next.payload,
      ])
    )[0];
    await publish(clear);
    expect(
      (
        await query<any>(
          "select effect from badges where slug='shop-new-title'",
        )
      )[0].effect,
    ).toBeNull();
  });
});
