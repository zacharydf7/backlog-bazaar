// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
const schema = readFileSync(
  new URL("../../supabase/schema.sql", import.meta.url),
  "utf8",
);
const migration = schema.slice(
  schema.indexOf("-- Persistent collection drafts."),
);
const buyStart = schema.indexOf(
  "create or replace function public.buy_shop_item(",
);
const buySql = schema.slice(buyStart, schema.indexOf("\n$$;", buyStart) + 4);
const seedStart = schema.indexOf("do $collection_seed$");
const seed = schema.slice(
  seedStart,
  schema.indexOf("$collection_seed$;", seedStart) + 18,
);
const user = "00000000-0000-4000-8000-000000000001";
const itemA = "00000000-0000-4000-8000-000000000002";
const itemB = "00000000-0000-4000-8000-000000000003";
const badge = "00000000-0000-4000-8000-000000000004";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
  create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
  insert into auth.users values('${user}');
  create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;
  create function has_permission(p_key text) returns boolean language sql as $$select coalesce(p_key=any(string_to_array(current_setting('test.permissions',true),',')),false)$$;
  create table badges(id uuid primary key default gen_random_uuid(),slug text unique,name text,description text,kind text,icon text,prestige integer,effect text);
  create table shop_sets(key text primary key,name text not null,description text,badge_id uuid references badges(id),created_at timestamptz default now());
  create table shop_items(id uuid primary key default gen_random_uuid(),slug text unique,name text,description text,kind text,price integer,style text,badge_id uuid references badges(id),tier text,secret boolean,active boolean default true,set_key text references shop_sets(key),available_from timestamptz,available_until timestamptz,sort integer);
  create table audit_events(actor_id uuid,entity text,entity_id text,action text,old_value jsonb,new_value jsonb,detail jsonb,created_at timestamptz default now());
  create table shop_purchases(user_id uuid,item_id uuid,item_slug text,item_name text,item_kind text,price_paid integer,unique(user_id,item_id));
  create table user_badges(user_id uuid,badge_id uuid,source text,revoked_at timestamptz,unique(user_id,badge_id));
  create table app_config(id integer,shop_open boolean);insert into app_config values(1,true);
  create table profiles(id uuid primary key,coins integer);insert into profiles values('${user}',500);
  create function economy_enabled(uuid) returns boolean language sql as $$select true$$;
  create function log_coin_event(uuid,text,integer,integer,integer,integer,uuid,text,text,jsonb) returns void language plpgsql as $$begin return;end;$$;
  insert into badges(id,slug,name,kind,icon,prestige) values('${badge}','reward','Reward','shop','award',3);
  insert into shop_sets(key,name,badge_id) values('a','Alpha','${badge}'),('b','Beta',null);
  insert into shop_items(id,slug,name,kind,price,style,tier,secret,active,set_key,sort) values
    ('${itemA}','alpha-frame','Alpha Frame','frame',100,'bronze-ring','standard',false,true,'a',0),
    ('${itemB}','beta-frame','Beta Frame','frame',100,'bronze-ring','standard',false,false,'b',0);
  insert into shop_purchases values('${user}','${itemA}');insert into user_badges values('${user}','${badge}');
  `);
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(buySql);
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "begin;set test.permissions='shop.manage,shop.collections.drafts,shop.collections.publish'",
  );
});
afterEach(async () => {
  await db.exec("rollback");
});
async function query(sql: string, args: unknown[] = []) {
  await db.exec("savepoint operation");
  try {
    const result = await db.query(sql, args);
    await db.exec("release savepoint operation");
    return result.rows as Record<string, any>[];
  } catch (error) {
    await db.exec(
      "rollback to savepoint operation;release savepoint operation",
    );
    throw error;
  }
}
const start = async (key: string | null = "b") =>
  (await query("select start_collection_draft($1) as result", [key]))[0].result;
const save = async (draft: any, members = [itemA], name = "Reviewed Beta") =>
  (
    await query("select save_collection_draft($1,$2,$3) as result", [
      draft.draft_id,
      draft.revision,
      { set: { ...draft.payload.set, name }, member_ids: members },
    ])
  )[0].result;
const publish = async (draft: any, ack = true) =>
  (
    await query("select publish_collection_draft($1,$2,$3) as result", [
      draft.draft_id,
      draft.revision,
      ack,
    ])
  )[0].result;
describe("customer purchase rules", () => {
  it.each(["", "shop.manage,shop.wardrobe,shop.presets"])("charges the same price regardless of admin permissions (%s)", async (permissions) => {
    await query("select set_config('test.permissions',$1,true)", [permissions]);
    await query("update shop_items set active=true where id=$1", [itemB]);
    expect((await query("select buy_shop_item($1) as coins", [itemB]))[0].coins).toBe(400);
    expect((await query("select price_paid from shop_purchases where item_id=$1", [itemB]))[0].price_paid).toBe(100);
  });
  it.each(["", "shop.manage,shop.wardrobe,shop.presets"])("cannot bypass closure or insufficient funds (%s)", async (permissions) => {
    await query("select set_config('test.permissions',$1,true)", [permissions]);
    await query("update shop_items set active=true where id=$1", [itemB]);
    await query("update app_config set shop_open=false");
    await expect(query("select buy_shop_item($1)", [itemB])).rejects.toThrow(/closed/i);
    await query("update app_config set shop_open=true");
    await query("update profiles set coins=99");
    await expect(query("select buy_shop_item($1)", [itemB])).rejects.toThrow(/coins/i);
    expect(await query("select * from shop_purchases where item_id=$1", [itemB])).toHaveLength(0);
    expect((await query("select coins from profiles"))[0].coins).toBe(99);
  });
});

describe("persistent collection draft SQL", () => {
  it("keeps the purchase reward rules intact and holds catalog locks through the purchase", async () => {
    await query("update shop_items set active=true where id=$1", [itemB]);
    const result = await query("select buy_shop_item($1) as coins", [itemB]);
    expect(result[0].coins).toBe(400);
    expect(await query("select * from shop_purchases")).toHaveLength(2);
    const locks = await query(
      "select relation::regclass::text as name from pg_locks where mode='ShareLock' and relation in ('shop_items'::regclass,'shop_sets'::regclass)",
    );
    expect(locks.map((row) => row.name).sort()).toEqual([
      "shop_items",
      "shop_sets",
    ]);
  });
  it("saves revisions without changing catalog, purchases or grants", async () => {
    const first = await start();
    const second = await save(first);
    expect(second.revision).toBe(2);
    expect(
      (await query("select name from shop_sets where key=$1", ["b"]))[0].name,
    ).toBe("Beta");
    expect(
      (await query("select set_key from shop_items where id=$1", [itemA]))[0]
        .set_key,
    ).toBe("a");
    expect(
      await query("select * from shop_collection_draft_revisions"),
    ).toHaveLength(2);
    expect(await query("select * from shop_purchases")).toHaveLength(1);
    expect(await query("select * from user_badges")).toHaveLength(1);
  });
  it("publishes membership and metadata atomically while keeping prior ownership and rewards", async () => {
    const draft = await save(await start());
    await expect(publish(draft, false)).rejects.toThrow(/ACK_REQUIRED/);
    const result = await publish(draft);
    expect(result.state).toBe("published");
    expect(
      (await query("select set_key from shop_items where id=$1", [itemA]))[0]
        .set_key,
    ).toBe("b");
    expect(
      (await query("select set_key from shop_items where id=$1", [itemB]))[0]
        .set_key,
    ).toBeNull();
    expect(
      (await query("select name from shop_sets where key=$1", ["b"]))[0].name,
    ).toBe("Reviewed Beta");
    expect(await query("select * from shop_purchases")).toHaveLength(1);
    expect(await query("select * from user_badges")).toHaveLength(1);
    expect(await query("select * from audit_events")).toHaveLength(1);
    await expect(publish(draft)).rejects.toThrow(/DRAFT_CONFLICT/);
  });
  it("rejects stale revisions and changed source membership", async () => {
    const first = await start();
    const next = await save(first);
    await expect(save(first)).rejects.toThrow(/DRAFT_CONFLICT/);
    await expect(publish(first)).rejects.toThrow(/DRAFT_CONFLICT/);
    await query("update shop_items set active=false where id=$1", [itemA]);
    await expect(publish(next)).rejects.toThrow(/CATALOG_CONFLICT/);
    expect(
      (await query("select set_key from shop_items where id=$1", [itemA]))[0]
        .set_key,
    ).toBe("a");
  });
  it("rejects newly added members in an affected collection and changed reward definitions", async () => {
    const draft = await save(await start());
    await query(
      "insert into shop_items(slug,name,kind,set_key) values('new','New','frame','a')",
    );
    await expect(publish(draft)).rejects.toThrow(/CATALOG_CONFLICT/);
    const next = await start("a");
    await query("update badges set name=$1 where id=$2", [
      "Changed Reward",
      badge,
    ]);
    await expect(publish(next)).rejects.toThrow(/CATALOG_CONFLICT/);
  });
  it("creates a new collection but refuses to steal a concurrent key", async () => {
    let draft = await start(null);
    draft.payload.set.key = "new-set";
    draft = await save(draft, [itemB], "New Set");
    await publish(draft);
    expect(
      (await query("select name from shop_sets where key='new-set'"))[0].name,
    ).toBe("New Set");
    let conflict = await start(null);
    conflict.payload.set.key = "new-set";
    conflict = await save(conflict, [], "Collision");
    await expect(publish(conflict)).rejects.toThrow(/CATALOG_CONFLICT/);
  });
  it("separates draft and publish permissions and protects immutable history", async () => {
    await db.exec("set test.permissions='shop.manage,shop.collections.drafts'");
    const draft = await start();
    await expect(publish(draft)).rejects.toThrow(/Not authorized/);
    await db.exec(
      "set test.permissions='shop.manage,shop.collections.publish'",
    );
    await expect(save(draft)).rejects.toThrow(/Not authorized/);
    await db.exec("set test.permissions='';set role authenticated");
    expect(
      await query("select * from shop_collection_draft_revisions"),
    ).toHaveLength(0);
    await expect(
      query("delete from shop_collection_draft_revisions"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      query("update shop_collection_draft_revisions set state='published'"),
    ).rejects.toThrow(/permission denied/);
  });
  it("rolls back collection and membership changes when audit recording fails", async () => {
    const draft = await save(await start());
    await db.exec(`create function fail_collection_audit() returns trigger language plpgsql as $$begin raise exception 'Audit unavailable';end;$$;
    create trigger fail_collection_audit before insert on audit_events for each row execute function fail_collection_audit();`);
    await expect(publish(draft)).rejects.toThrow(/Audit unavailable/);
    expect(
      (await query("select name from shop_sets where key='b'"))[0].name,
    ).toBe("Beta");
    expect(
      (await query("select set_key from shop_items where id=$1", [itemA]))[0]
        .set_key,
    ).toBe("a");
  });
  it("seed reapplication preserves intentional removals and cross-collection assignments", async () => {
    await db.exec(seed);
    expect(
      (
        await query(
          "select set_key from shop_items where slug='frame-holly-wreath'",
        )
      )[0].set_key,
    ).toBe("yuletide-2026");
    await query(
      "update shop_items set set_key=null where slug='frame-holly-wreath'",
    );
    await query(
      "update shop_items set set_key='a' where slug='stall-haunted-bazaar'",
    );
    await db.exec(seed);
    expect(
      (
        await query(
          "select set_key from shop_items where slug='frame-holly-wreath'",
        )
      )[0].set_key,
    ).toBeNull();
    expect(
      (
        await query(
          "select set_key from shop_items where slug='stall-haunted-bazaar'",
        )
      )[0].set_key,
    ).toBe("a");
  });
});
