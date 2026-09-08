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
  schema.indexOf("-- Atomic wardrobe application."),
);
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const frame = "00000000-0000-4000-8000-000000000003";
const stall = "00000000-0000-4000-8000-000000000004";
const coin = "00000000-0000-4000-8000-000000000005";
const title = "00000000-0000-4000-8000-000000000006";
const empty = { title: null, frame: null, stall: null, coin: null };
const full = { title, frame, stall, coin };
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${user}'),('${other}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function public.has_permission(p_key text) returns boolean language sql as $$
      select coalesce(p_key = any(string_to_array(current_setting('test.permissions', true), ',')),false) $$;
    create table public.badges(id uuid primary key, name text, icon text, effect text);
    create table public.shop_items(id uuid primary key, kind text, name text, style text, active boolean);
    create table public.shop_purchases(user_id uuid, item_id uuid);
    create table public.user_badges(user_id uuid, badge_id uuid, revoked_at timestamptz);
    create table public.profiles(id uuid primary key references auth.users(id), selected_badge_id uuid, equipped_frame_id uuid,
      equipped_stall_id uuid, equipped_coin_id uuid, banner_url text, coins integer);
    insert into public.profiles(id,banner_url,coins) values ('${user}','keep-banner',700),('${other}','other-banner',500);
    insert into public.badges values ('${title}','Earned title','award',null);
    insert into public.shop_items values ('${frame}','frame','Retired frame','bronze-ring',false),
      ('${stall}','stall','Stall','haunted',true),('${coin}','coin','Coin','mint',true);
    insert into public.shop_purchases values ('${user}','${frame}'),('${user}','${stall}'),('${user}','${coin}');
    insert into public.user_badges values ('${user}','${title}',null);
  `);
  await db.exec(migration);
  await db.exec(migration);
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    `begin; set test.uid='${user}'; set test.permissions='shop.manage,shop.wardrobe';`,
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
      "rollback to savepoint operation; release savepoint operation",
    );
    throw error;
  }
}
const apply = (look: unknown, expected: unknown = empty) =>
  query("select apply_wardrobe($1,$2) as result", [look, expected]);
const profile = async () =>
  (await query("select * from profiles where id=$1", [user]))[0];
describe("atomic wardrobe SQL", () => {
  it("rolls back the outfit if its history cannot be recorded", async () => {
    await db.exec(`create function reject_outfit_event() returns trigger language plpgsql as $$
      begin raise exception 'History unavailable'; end; $$;
      create trigger reject_event before insert on outfit_events for each row execute function reject_outfit_event();`);
    await expect(apply(full)).rejects.toThrow(/History unavailable/);
    expect(await profile()).toMatchObject({
      selected_badge_id: null,
      equipped_frame_id: null,
      equipped_stall_id: null,
      equipped_coin_id: null,
    });
    expect(await query("select * from outfit_events")).toHaveLength(0);
  });
  it("applies all slots including retired pieces and records one complete event", async () => {
    expect((await apply(full))[0].result.look).toEqual(full);
    expect(await profile()).toMatchObject({
      selected_badge_id: title,
      equipped_frame_id: frame,
      equipped_stall_id: stall,
      equipped_coin_id: coin,
      banner_url: "keep-banner",
      coins: 700,
    });
    const events = await query("select * from outfit_events");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      user_id: user,
      actor_id: user,
      old_look: empty,
      new_look: full,
    });
    expect(events[0].catalog_snapshot.items).toContainEqual({
      id: frame,
      name: "Retired frame",
      kind: "frame",
      style: "bronze-ring",
    });
    expect(events[0].created_at).toBeTruthy();
  });
  it("rejects an unowned slot without changing any slot or recording success", async () => {
    await query("delete from shop_purchases where item_id=$1", [coin]);
    await expect(apply(full)).rejects.toThrow(/do not own/);
    expect(await profile()).toMatchObject({
      selected_badge_id: null,
      equipped_frame_id: null,
      equipped_stall_id: null,
      equipped_coin_id: null,
    });
    expect(await query("select * from outfit_events")).toHaveLength(0);
  });
  it("rejects wrong categories, revoked titles and another account holdings", async () => {
    await expect(apply({ ...empty, frame: stall })).rejects.toThrow(
      /do not own/,
    );
    await query("update user_badges set revoked_at=now()");
    await expect(apply(full)).rejects.toThrow(/no longer hold/);
    await db.exec(`set test.uid='${other}'`);
    await expect(apply({ ...empty, frame })).rejects.toThrow(/do not own/);
  });
  it("rejects stale and missing expectations, preserving the newer outfit", async () => {
    await apply(full);
    await expect(apply(empty)).rejects.toThrow(/OUTFIT_CONFLICT/);
    await expect(apply(empty, null)).rejects.toThrow(/OUTFIT_CONFLICT/);
    expect((await profile()).equipped_frame_id).toBe(frame);
    expect(await query("select * from outfit_events")).toHaveLength(1);
  });
  it("supports defaults, records old names, and avoids duplicate no-op history", async () => {
    await apply(full);
    await apply(full, full);
    await apply(empty, full);
    expect(await query("select * from outfit_events")).toHaveLength(2);
    expect((await profile()).equipped_frame_id).toBeNull();
  });
  it("requires the new gate, rejects malformed outfits, and never edits another profile", async () => {
    await db.exec("set test.permissions='shop.manage'");
    await expect(apply(full)).rejects.toThrow(/Not authorized/);
    await db.exec("set test.permissions='shop.manage,shop.wardrobe'");
    await expect(apply({ frame })).rejects.toThrow(/Invalid outfit/);
    await expect(apply({ ...empty, user_id: other })).rejects.toThrow(
      /Invalid outfit/,
    );
    await apply(full);
    expect(
      (await query("select * from profiles where id=$1", [other]))[0]
        .equipped_frame_id,
    ).toBeNull();
  });
  it("audits legacy slot changes too and protects append-only history with RLS", async () => {
    await query("update profiles set equipped_frame_id=$1 where id=$2", [
      frame,
      user,
    ]);
    expect(await query("select * from outfit_events")).toHaveLength(1);
    await db.exec("set test.permissions=''; set role authenticated");
    expect(await query("select * from outfit_events")).toHaveLength(1);
    await expect(query("delete from outfit_events")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      query("update outfit_events set new_look='{}'"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      query(
        "insert into outfit_events(old_look,new_look,catalog_snapshot) values('{}','{}','{}')",
      ),
    ).rejects.toThrow(/permission denied/);
    await db.exec(`set test.uid='${other}'`);
    expect(await query("select * from outfit_events")).toHaveLength(0);
  });
});

describe("saved outfit preset SQL", () => {
  const presetId = "00000000-0000-4000-8000-000000000010";
  beforeEach(async () => {
    await db.exec(
      "set test.permissions='shop.manage,shop.wardrobe,shop.presets'",
    );
  });
  const savePreset = (version = 0, name = "Weekend", look: unknown = full) =>
    query("select save_outfit_preset($1,$2,$3,$4) as result", [
      presetId,
      version,
      name,
      look,
    ]);
  const archive = (version: number, archived: boolean) =>
    query("select archive_outfit_preset($1,$2,$3) as result", [
      presetId,
      version,
      archived,
    ]);
  it("saves a private named look without equipping it and appends history", async () => {
    await db.exec("set role authenticated");
    const saved = (await savePreset(0, "  Weekend  "))[0].result;
    expect(saved).toMatchObject({
      name: "Weekend",
      look: full,
      version: 1,
      user_id: user,
    });
    const events = await query("select * from outfit_preset_events");
    expect(events).toHaveLength(1);
    expect(events[0].old_value).toBeNull();
    expect(events[0].new_value.name).toBe("Weekend");
    await db.exec("reset role");
    expect((await profile()).equipped_frame_id).toBeNull();
    expect(await query("select * from outfit_events")).toHaveLength(0);
  });
  it("rejects another account reads and edits, even for another manager", async () => {
    await savePreset();
    await db.exec(`set test.uid='${other}'; set role authenticated`);
    expect(await query("select * from outfit_presets")).toHaveLength(0);
    await expect(savePreset(1, "Intrusion")).rejects.toThrow(
      /Preset unavailable/,
    );
    await expect(archive(1, true)).rejects.toThrow(/Preset unavailable/);
  });
  it("requires preset permission and validates names and ownership for new or replaced looks", async () => {
    await db.exec("set test.permissions='shop.manage,shop.wardrobe'");
    await expect(savePreset()).rejects.toThrow(/Not authorized/);
    await db.exec(
      "set test.permissions='shop.manage,shop.wardrobe,shop.presets'",
    );
    await expect(savePreset(0, "   ")).rejects.toThrow(/name between/);
    await expect(savePreset(0, "x".repeat(61))).rejects.toThrow(/name between/);
    await expect(
      savePreset(0, "Invalid", { ...full, frame: stall }),
    ).rejects.toThrow(/do not own/);
    await savePreset(0, "Defaults", empty);
    await query("update user_badges set revoked_at=now()");
    await expect(savePreset(1, "Revoked", full)).rejects.toThrow(
      /no longer hold/,
    );
  });
  it("rejects stale versions, missing expectations and duplicate creates without losing saved data", async () => {
    await savePreset();
    await savePreset(1, "Renamed");
    await expect(savePreset(1, "Stale")).rejects.toThrow(/PRESET_CONFLICT/);
    await expect(savePreset(0, "Duplicate")).rejects.toThrow(/PRESET_CONFLICT/);
    await expect(
      query("select save_outfit_preset($1,null,$2,$3)", [
        presetId,
        "Missing",
        full,
      ]),
    ).rejects.toThrow(/PRESET_CONFLICT/);
    await expect(archive(1, true)).rejects.toThrow(/PRESET_CONFLICT/);
    expect((await query("select * from outfit_presets"))[0].name).toBe(
      "Renamed",
    );
    expect(await query("select * from outfit_preset_events")).toHaveLength(2);
  });
  it("keeps stale pieces through rename/archive/restore and still validates them on Apply", async () => {
    await savePreset();
    await query("update user_badges set revoked_at=now()");
    const renamed = (await savePreset(1, "Old favorite"))[0].result;
    expect(renamed.look).toEqual(full);
    await archive(2, true);
    await expect(savePreset(3, "Archived edit")).rejects.toThrow(
      /PRESET_CONFLICT/,
    );
    const restored = (await archive(3, false))[0].result;
    expect(restored.look).toEqual(full);
    expect(restored.archived_at).toBeNull();
    await expect(apply(restored.look)).rejects.toThrow(/no longer hold/);
    expect(await query("select * from outfit_preset_events")).toHaveLength(4);
  });
  it("protects history against direct writes and rolls back changes if auditing fails", async () => {
    await savePreset();
    await db.exec("set role authenticated");
    await expect(
      query("update outfit_presets set name='Bypass'"),
    ).rejects.toThrow(/permission denied/);
    await expect(query("delete from outfit_presets")).rejects.toThrow(
      /permission denied/,
    );
    await expect(query("delete from outfit_preset_events")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      query("update outfit_preset_events set new_value='{}'"),
    ).rejects.toThrow(/permission denied/);
    await db.exec(`reset role; create function fail_preset_event() returns trigger language plpgsql as $$ begin raise exception 'Audit unavailable'; end; $$;
      create trigger fail_preset_event before insert on outfit_preset_events for each row execute function fail_preset_event();`);
    await expect(savePreset(1, "Must roll back")).rejects.toThrow(
      /Audit unavailable/,
    );
    expect((await query("select * from outfit_presets"))[0].name).toBe(
      "Weekend",
    );
  });
});
