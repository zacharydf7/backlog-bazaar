// @vitest-environment node
//
// Exercises the REAL cover-convergence and term-validation triggers from
// schema.sql inside an embedded Postgres (PGlite), for issue 86fc0b4b: a
// compilation's games follow their bundle, not the catalog, and a bundled
// game's original-platform label must be a known platform. Tables are trimmed
// to the columns these triggers touch.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

/** The `create or replace function public.<name>(` ... `$$;` block. */
function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

/** The `drop trigger if exists <name> ... execute function ...;` pair. */
function trigger(name: string): string {
  const start = schema.indexOf(`drop trigger if exists ${name} on public.games;`);
  if (start < 0) throw new Error(`trigger ${name} not found in schema.sql`);
  const execAt = schema.indexOf("execute function", start);
  return schema.slice(start, schema.indexOf(";", execAt) + 1);
}

const CATALOG = "00000000-0000-4000-8000-0000000000c1";
const BUNDLE = "00000000-0000-4000-8000-0000000000b1";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.catalog_games (id uuid primary key, image text);
    create table public.platforms (name text not null);
    create table public.genres (name text not null);
    create table public.games (
      id                uuid primary key default gen_random_uuid(),
      catalog_id        uuid,
      compilation_id    uuid,
      image             text,
      stock_image       text,
      genres            jsonb not null default '[]',
      platforms         jsonb not null default '[]',
      copies            jsonb not null default '[]',
      original_platform text
    );
    insert into public.catalog_games values ('${CATALOG}', 'catalog.png');
    insert into public.platforms values ('PlayStation'), ('Game Boy Color');
  `);
  await db.exec(fn("converge_stock_cover"));
  await db.exec(trigger("games_converge_stock_cover"));
  await db.exec(fn("assert_known_terms"));
  await db.exec(fn("games_validate_terms"));
  await db.exec(trigger("games_validate_terms"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec("delete from public.games");
});

async function insert(cols: Record<string, string | null>): Promise<string> {
  const keys = Object.keys(cols);
  const res = await db.query<{ id: string }>(
    `insert into public.games (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(cols),
  );
  return res.rows[0].id;
}

async function row(id: string) {
  const res = await db.query<{ image: string | null; stock_image: string | null }>(
    "select image, stock_image from public.games where id = $1",
    [id],
  );
  return res.rows[0];
}

describe("converge_stock_cover (86fc0b4b)", () => {
  it("still gives a standalone linked game the catalog cover", async () => {
    const id = await insert({ catalog_id: CATALOG });
    expect(await row(id)).toEqual({ image: "catalog.png", stock_image: "catalog.png" });
  });

  it("leaves a bundled game's cover alone, on insert and on a later relink", async () => {
    const id = await insert({ catalog_id: CATALOG, compilation_id: BUNDLE });
    expect(await row(id)).toEqual({ image: null, stock_image: null });
    // A cascade rewriting catalog_id fires the trigger again; still untouched.
    await db.query("update public.games set catalog_id = $1 where id = $2", [CATALOG, id]);
    expect(await row(id)).toEqual({ image: null, stock_image: null });
  });
});

describe("games_validate_terms — original platform (86fc0b4b)", () => {
  it("accepts a known platform (any case) and an unset label", async () => {
    await insert({ compilation_id: BUNDLE, original_platform: "game boy color" });
    await insert({ compilation_id: BUNDLE, original_platform: null });
  });

  it("rejects an off-list platform, on insert and on update", async () => {
    await expect(
      insert({ compilation_id: BUNDLE, original_platform: "Virtual Boy" }),
    ).rejects.toThrow(/UNKNOWN_PLATFORM:Virtual Boy/);
    const id = await insert({ compilation_id: BUNDLE, original_platform: "PlayStation" });
    await expect(
      db.query("update public.games set original_platform = 'Virtual Boy' where id = $1", [id]),
    ).rejects.toThrow(/UNKNOWN_PLATFORM:Virtual Boy/);
  });
});
