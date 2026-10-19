// @vitest-environment node
//
// Exercises the REAL "Same game as…" functions from schema.sql in PGlite
// (issue 52f98b68): the preview's conflict checks, link_catalog_game_provider
// stamping the igdb id + merged fields and null-filling copies on both sides,
// unlink_catalog_game_provider reverting only what still holds, the guarded
// repair statement, the refusal when the RAWG crosswalk matcher (loaded for
// real, with its triggers) ties the game to a RAWG entry mid-link, and the
// revert/delete/list hooks. auth.uid and has_permission are stubbed; tables
// are trimmed to what these read.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

function table(name: string): string {
  const start = schema.indexOf(`create table if not exists public.${name} (`);
  if (start < 0) throw new Error(`table ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n);", start) + 3);
}

/** A single top-level statement, matched by its opening text. */
function statement(pattern: RegExp): string {
  const found = schema.match(pattern);
  expect(found).toHaveLength(1);
  return found![0];
}

const U = "00000000-0000-4000-8000-0000000000a1";
const C = "00000000-0000-4000-8000-0000000000c1"; // the community row
const D = "00000000-0000-4000-8000-0000000000c2"; // another community row
const X = 119388; // its IGDB game
const COMMUNITY_COPY = "00000000-0000-4000-8000-0000000000b1";
const IGDB_COPY = "00000000-0000-4000-8000-0000000000b2";
const CUSTOM_COPY = "00000000-0000-4000-8000-0000000000b3";
const BUNDLED_COPY = "00000000-0000-4000-8000-0000000000b4";
const OTHER_ID_COPY = "00000000-0000-4000-8000-0000000000b5";

const MERGED = {
  title: "Kingdom Hearts Collection [I-III]",
  image: "https://x/igdb.jpg",
  platforms: ["PlayStation 4", "PC"],
  genres: ["RPG"],
  developers: ["Square Enix"],
  released: "2019-03-29",
  hours: 120,
};

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function public.has_permission(p_key text) returns boolean language sql
      as $$ select coalesce(p_key = any(string_to_array(current_setting('test.permissions', true), ',')), false) $$;
    create table public.profiles (id uuid primary key);
    insert into public.profiles values ('${U}');
    create table public.catalog_games (
      id uuid primary key, rawg_id integer unique, igdb_id integer unique, title text, image text,
      platforms jsonb not null default '[]', genres jsonb not null default '[]',
      developers jsonb not null default '[]', released date, hours real,
      screenshots jsonb not null default '[]', is_live_service boolean not null default false,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table public.games (
      id uuid primary key, user_id uuid, title text, status text not null default 'backlog',
      played_hours real not null default 0, rawg_id integer, igdb_id integer, catalog_id uuid,
      compilation_id uuid, image text, stock_image text, platforms jsonb not null default '[]',
      genres jsonb not null default '[]', developers jsonb not null default '[]', released date,
      hours real, ongoing boolean not null default false);
    create table public.game_submissions (
      id uuid primary key default gen_random_uuid(), submitter uuid, kind text, catalog_id uuid,
      rawg_id integer, title text, image text, platforms jsonb, genres jsonb, developers jsonb,
      released date, hours real, screenshots jsonb, is_live_service boolean, before jsonb, status text,
      reviewer uuid, reviewed_at timestamptz, review_note text, reward integer, approved_fields text[],
      reverted_at timestamptz, reverted_by uuid, reverted_fields text[]);
    create table public.template_refreshes (catalog_id uuid);
    create function public.refresh_compilation_templates_for_catalog(p_catalog uuid) returns void
      language sql as $$ insert into public.template_refreshes values (p_catalog) $$;
  `);
  await db.exec(
    statement(/create unique index if not exists catalog_games_community_title_idx[^;]+;/g),
  );
  await db.exec(table("game_identity_links"));
  await db.exec(table("game_identity_link_events"));
  await db.exec(table("catalog_provider_links"));
  for (const sql of schema.match(/create unique index if not exists catalog_provider_links_\w+_live[^;]+;/g)!) {
    await db.exec(sql);
  }
  await db.exec(table("catalog_provider_link_events"));
  for (const name of [
    "converge_stock_cover",
    "catalog_provider_link_conflict",
    "preview_catalog_provider_link",
    "link_catalog_game_provider",
    "unlink_catalog_game_provider",
    "admin_delete_catalog_game",
    "list_community_catalog",
    "revert_game_submission",
    "game_title_key",
    "apply_game_identity_link",
    "sync_game_identity_links",
    "sync_identity_links_trigger",
  ]) {
    await db.exec(fn(name));
  }
  await db.exec(`create trigger games_converge_stock_cover before insert or update of catalog_id
    on public.games for each row execute function public.converge_stock_cover()`);
  // The RAWG crosswalk matcher, armed as in production: an igdb stamp re-runs it.
  for (const t of ["games", "catalog_games"]) {
    await db.exec(`create trigger ${t}_identity_links_sync after insert or update of rawg_id, igdb_id, title
      on public.${t} for each row execute function public.sync_identity_links_trigger()`);
  }
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    select set_config('test.uid', '${U}', false);
    select set_config('test.permissions', 'catalog.identity,catalog.manage,submissions.games.moderate', false);
    delete from public.catalog_provider_link_events; delete from public.catalog_provider_links;
    delete from public.game_identity_link_events; delete from public.game_identity_links; delete from public.game_submissions;
    delete from public.template_refreshes; delete from public.games; delete from public.catalog_games;
    insert into public.catalog_games (id, title, image, platforms, hours, screenshots)
      values ('${C}', 'Kingdom Hearts Collection [I~III]', 'https://x/community.jpg', '["PlayStation 4"]',
              120, '["https://x/shot.jpg"]'),
             ('${D}', 'Some Indie Game', null, '[]', null, '[]');
    insert into public.games (id, user_id, title, status, played_hours, igdb_id, catalog_id, compilation_id, image, stock_image) values
      ('${COMMUNITY_COPY}', '${U}', 'KH [I~III]', 'playing', 30, null, '${C}', null, 'https://x/community.jpg', 'https://x/community.jpg'),
      ('${IGDB_COPY}', '${U}', 'KH [I-III]', 'finished', 80, ${X}, null, null, 'https://x/igdb-old.jpg', 'https://x/igdb-old.jpg'),
      ('${CUSTOM_COPY}', '${U}', 'KH [I-III]', 'backlog', 0, ${X}, null, null, 'https://x/mine.jpg', 'https://x/igdb-old.jpg'),
      ('${BUNDLED_COPY}', '${U}', 'KH [I-III]', 'backlog', 0, ${X}, null, '${D}', 'https://x/bundle.jpg', 'https://x/bundle.jpg'),
      ('${OTHER_ID_COPY}', '${U}', 'KH [I~III]', 'backlog', 0, 555, '${C}', null, 'https://x/community.jpg', 'https://x/community.jpg');
  `);
});

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

const preview = () =>
  one<{ p: Record<string, unknown> }>("select public.preview_catalog_provider_link($1, $2) as p", [C, X]).then(
    (r) => r.p,
  );
const link = (primary = "provider", fields: unknown = MERGED, igdb = X) =>
  one<{ r: Record<string, number> }>("select public.link_catalog_game_provider($1, $2, $3, $4) as r", [
    C,
    igdb,
    primary,
    JSON.stringify(fields),
  ]).then((r) => r.r);
const unlink = () =>
  one<{ r: Record<string, number> }>("select public.unlink_catalog_game_provider($1) as r", [C]).then((r) => r.r);
const copy = (id: string) =>
  one<Record<string, unknown>>(
    "select igdb_id, catalog_id, image, stock_image, status, played_hours from public.games where id = $1",
    [id],
  );
const catalogRow = () =>
  one<Record<string, unknown>>(
    "select igdb_id, title, image, platforms, genres, developers, released::text, hours, screenshots from public.catalog_games where id = $1",
    [C],
  );

describe("preview_catalog_provider_link", () => {
  it("counts only the copies the link will touch", async () => {
    // Not the compilation child, nor the copy already carrying another igdb id.
    expect(await preview()).toEqual({ community_copies: 1, igdb_copies_to_adopt: 2, conflict: null });
  });

  it("needs both catalog.identity and catalog.manage, and a signed-in caller", async () => {
    for (const perms of ["catalog.manage", "catalog.identity"]) {
      await db.exec(`select set_config('test.permissions', '${perms}', false)`);
      await expect(preview()).rejects.toThrow(/Not authorized/);
      await expect(link()).rejects.toThrow(/Not authorized/);
      await expect(unlink()).rejects.toThrow(/Not authorized/);
    }
    await db.exec("select set_config('test.permissions', 'catalog.identity,catalog.manage', false)");
    await db.exec("select set_config('test.uid', '', false)");
    await expect(preview()).rejects.toThrow(/Not authorized/);
  });

  it("reports a row that already carries a provider id", async () => {
    await db.exec(`update public.catalog_games set rawg_id = 7 where id = '${C}'`);
    expect((await preview()).conflict).toMatch(/already tied/);
    await expect(link()).rejects.toThrow(/already tied/);
  });

  it("reports an IGDB id another catalog row already holds", async () => {
    await db.exec(`update public.catalog_games set igdb_id = ${X} where id = '${D}'`);
    expect((await preview()).conflict).toMatch(/already has its own catalog entry/);
    await expect(link()).rejects.toThrow(/already has its own catalog entry/);
  });

  it("reports an IGDB id with a live RAWG crosswalk link", async () => {
    await db.exec(`insert into public.game_identity_links (rawg_id, igdb_id, title_key) values (42, ${X}, 'kh')`);
    expect((await preview()).conflict).toMatch(/linked to a RAWG game/);
    await expect(link()).rejects.toThrow(/linked to a RAWG game/);
    // A suggestion or dismissal is no conflict.
    await db.exec("update public.game_identity_links set status = 'dismissed'");
    expect((await preview()).conflict).toBeNull();
  });
});

describe("link_catalog_game_provider", () => {
  it("stamps the igdb id and writes the merged fields, keeping screenshots", async () => {
    expect(await link()).toEqual({ adopted: 2, stamped: 1 });
    expect(await catalogRow()).toEqual({
      igdb_id: X,
      title: "Kingdom Hearts Collection [I-III]",
      image: "https://x/igdb.jpg",
      platforms: ["PlayStation 4", "PC"],
      genres: ["RPG"],
      developers: ["Square Enix"],
      released: "2019-03-29",
      hours: 120,
      screenshots: ["https://x/shot.jpg"],
    });
  });

  it("only fills empty ids, skips compilation children and keeps custom covers", async () => {
    await link();
    // The community copy gains the igdb id; nothing personal moves.
    expect(await copy(COMMUNITY_COPY)).toMatchObject({ igdb_id: X, catalog_id: C, status: "playing", played_hours: 30 });
    // An IGDB copy joins the row and converges on the merged cover.
    expect(await copy(IGDB_COPY)).toMatchObject({
      igdb_id: X,
      catalog_id: C,
      image: "https://x/igdb.jpg",
      stock_image: "https://x/igdb.jpg",
      status: "finished",
      played_hours: 80,
    });
    // A custom cover stays; only the stock art follows the catalog.
    expect(await copy(CUSTOM_COPY)).toMatchObject({ catalog_id: C, image: "https://x/mine.jpg", stock_image: "https://x/igdb.jpg" });
    // A compilation's game follows its bundle, not the catalog.
    expect(await copy(BUNDLED_COPY)).toMatchObject({ catalog_id: null, image: "https://x/bundle.jpg" });
    // A copy already carrying a different igdb id keeps it.
    expect(await copy(OTHER_ID_COPY)).toMatchObject({ igdb_id: 555 });
  });

  it("records the link, an event with every touched copy, and a revertable edit", async () => {
    await link("catalog", { ...MERGED, title: "Kingdom Hearts Collection [I~III]" });
    expect(await one("select provider, provider_id, primary_side, status, decided_by from public.catalog_provider_links")).toEqual({
      provider: "igdb",
      provider_id: X,
      primary_side: "catalog",
      status: "linked",
      decided_by: U,
    });
    const event = await one<{ action: string; actor: string; catalog_title: string; detail: Record<string, unknown> }>(
      "select action, actor, catalog_title, detail from public.catalog_provider_link_events",
    );
    expect(event).toMatchObject({ action: "linked", actor: U, catalog_title: "Kingdom Hearts Collection [I~III]" });
    expect(event.detail).toMatchObject({
      before: { title: "Kingdom Hearts Collection [I~III]", image: "https://x/community.jpg" },
      after: { image: "https://x/igdb.jpg" },
    });
    const copies = event.detail.copies as Record<string, unknown>[];
    expect(copies.map((c) => c.id).sort()).toEqual([COMMUNITY_COPY, IGDB_COPY, CUSTOM_COPY].sort());
    expect(copies.find((c) => c.id === IGDB_COPY)).toEqual({
      id: IGDB_COPY,
      set_catalog_id: true,
      set_igdb_id: false,
      prev_image: "https://x/igdb-old.jpg",
      prev_stock_image: "https://x/igdb-old.jpg",
      image: "https://x/igdb.jpg",
      stock_image: "https://x/igdb.jpg",
    });
    expect(
      await one(
        "select kind, status, submitter, reviewer, reward, review_note, approved_fields, before->>'image' as before_image from public.game_submissions",
      ),
    ).toEqual({
      kind: "edit",
      status: "approved",
      submitter: U,
      reviewer: U,
      reward: 0,
      review_note: `Linked to IGDB #${X} (primary: catalog)`,
      approved_fields: ["title", "image", "platforms", "genres", "developers", "released", "hours"],
      before_image: "https://x/community.jpg",
    });
    expect(await one("select catalog_id from public.template_refreshes")).toEqual({ catalog_id: C });
  });

  it("refuses, changing nothing, when the igdb stamp ties the game to a same-titled RAWG entry", async () => {
    // Another player's RAWG copy wears the merged title, so stamping the igdb
    // id lets the crosswalk matcher auto-link RAWG #42 and adopt copies.
    await db.exec(`insert into public.games (id, user_id, title, rawg_id)
      values (gen_random_uuid(), '${U}', 'Kingdom Hearts Collection [I-III]', 42)`);
    await expect(link()).rejects.toThrow(/also matched to a RAWG entry/);
    expect(await one("select rawg_id, igdb_id, title from public.catalog_games where id = $1", [C])).toEqual({
      rawg_id: null,
      igdb_id: null,
      title: "Kingdom Hearts Collection [I~III]",
    });
    expect(await copy(IGDB_COPY)).toMatchObject({ catalog_id: null, image: "https://x/igdb-old.jpg" });
    expect(await copy(COMMUNITY_COPY)).toMatchObject({ igdb_id: null });
    for (const t of ["game_identity_links", "catalog_provider_links", "catalog_provider_link_events", "game_submissions"]) {
      expect(await one(`select count(*)::int as n from public.${t}`)).toEqual({ n: 0 });
    }
  });

  it("refuses malformed fields and an unknown primary", async () => {
    await expect(link("both")).rejects.toThrow(/primary/);
    await expect(link("provider", { ...MERGED, title: " " })).rejects.toThrow(/malformed/);
    await expect(link("provider", { ...MERGED, genres: "RPG" })).rejects.toThrow(/malformed/);
    await expect(link("provider", { ...MERGED, hours: -1 })).rejects.toThrow(/malformed/);
    expect(await catalogRow()).toMatchObject({ igdb_id: null });
  });
});

describe("unlink_catalog_game_provider", () => {
  it("reverts only the copies that still hold what the link set, and clears the igdb id", async () => {
    await link();
    // Since the link: one adopted copy got a personal cover, another moved on
    // to a different catalog row.
    await db.exec(`update public.games set image = 'https://x/later.jpg' where id = '${IGDB_COPY}'`);
    await db.exec(`update public.games set catalog_id = '${D}' where id = '${CUSTOM_COPY}'`);

    expect(await unlink()).toEqual({ reverted: 2, skipped: 1 });
    expect(await catalogRow()).toMatchObject({ igdb_id: null, title: "Kingdom Hearts Collection [I-III]" });
    expect(await copy(COMMUNITY_COPY)).toMatchObject({ igdb_id: null, catalog_id: C, played_hours: 30 });
    // Leaves the row; the cover the owner changed stays, the stock art goes back.
    expect(await copy(IGDB_COPY)).toMatchObject({
      catalog_id: null,
      igdb_id: X,
      image: "https://x/later.jpg",
      stock_image: "https://x/igdb-old.jpg",
    });
    expect(await copy(CUSTOM_COPY)).toMatchObject({ catalog_id: D });
    expect(await one("select status from public.catalog_provider_links")).toEqual({ status: "unlinked" });
    expect(
      await one("select action, detail->>'reverted' as reverted from public.catalog_provider_link_events where action = 'unlinked'"),
    ).toEqual({ action: "unlinked", reverted: "2" });
  });

  it("restores an untouched adopted copy's own cover", async () => {
    await link();
    await unlink();
    expect(await copy(IGDB_COPY)).toMatchObject({
      catalog_id: null,
      image: "https://x/igdb-old.jpg",
      stock_image: "https://x/igdb-old.jpg",
    });
  });

  it("refuses when nothing is linked, and when the title would duplicate another community entry", async () => {
    await expect(unlink()).rejects.toThrow(/isn't linked/);
    await link();
    await db.exec(`update public.catalog_games set title = 'Kingdom Hearts Collection [I-III]' where id = '${D}'`);
    await expect(unlink()).rejects.toThrow(/already titled/);
    expect(await catalogRow()).toMatchObject({ igdb_id: X });
  });

  it("refuses once a RAWG id has reached the row, leaving it linked", async () => {
    await link();
    await db.exec(`update public.catalog_games set rawg_id = 77 where id = '${C}'`);
    await expect(unlink()).rejects.toThrow(/RAWG #77/);
    expect(await one("select status from public.catalog_provider_links")).toEqual({ status: "linked" });
  });

  it("is not re-linked by the community-row repair statement", async () => {
    const repair = statement(/update public\.catalog_games c\s+set igdb_id = x\.igdb_id, updated_at = now\(\)[^;]+;/g);
    await db.exec(`delete from public.games where id = '${OTHER_ID_COPY}'`);
    await link();
    // A copy added while linked carries both ids and isn't the link's to revert.
    await db.exec(`insert into public.games (id, user_id, title, igdb_id, catalog_id)
      values (gen_random_uuid(), '${U}', 'KH', ${X}, '${C}')`);
    await unlink();
    await db.exec(repair);
    await db.exec(repair);
    expect(await catalogRow()).toMatchObject({ igdb_id: null });
    // Without the unlink on record, the same statement would stamp it.
    await db.exec("delete from public.catalog_provider_links");
    await db.exec(repair);
    expect(await catalogRow()).toMatchObject({ igdb_id: X });
  });
});

describe("catalog manager hooks", () => {
  it("lists the live link with the entry", async () => {
    await link();
    expect(
      await one("select igdb_id, link_primary from public.list_community_catalog() where id = $1", [C]),
    ).toEqual({ igdb_id: X, link_primary: "provider" });
    // A RAWG id reaching a linked row doesn't hide it, so it can still be unlinked.
    await db.exec(`update public.catalog_games set rawg_id = 77 where id = '${C}'`);
    expect(await one("select count(*)::int as n from public.list_community_catalog() where id = $1", [C])).toEqual({
      n: 1,
    });
    await db.exec(`update public.catalog_games set rawg_id = null where id = '${C}'`);
    await unlink();
    expect(
      await one("select igdb_id, link_primary from public.list_community_catalog() where id = $1", [C]),
    ).toEqual({ igdb_id: null, link_primary: null });
  });

  it("won't revert the link's logged edit until the entry is unlinked", async () => {
    await link();
    const { id } = await one<{ id: string }>("select id from public.game_submissions");
    // A revert while linked would push the community values onto adopted IGDB copies.
    await expect(db.query("select public.revert_game_submission($1)", [id])).rejects.toThrow(/Unlink this entry/);
    await unlink();
    const { r } = await one<{ r: { reverted: string[] } }>("select public.revert_game_submission($1) as r", [id]);
    expect(r.reverted).toContain("title");
    expect(await catalogRow()).toMatchObject({ title: "Kingdom Hearts Collection [I~III]", image: "https://x/community.jpg" });
    expect(await copy(IGDB_COPY)).toMatchObject({ catalog_id: null });
  });

  it("refuses to delete a linked entry", async () => {
    await link();
    await expect(db.query("select public.admin_delete_catalog_game($1)", [C])).rejects.toThrow(/unlink it first/);
  });
});
