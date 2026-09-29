// @vitest-environment node
//
// Exercises the REAL pact-version helpers from schema.sql inside an embedded
// Postgres (PGlite): co_op_pact_platform (the platform a pact is played on)
// and co_op_card_on_platform (does a card hold that version). Every pact path
// — partner picker, invite links, the pending-invite preview and the accept —
// decides "bind your copy vs. join as Player 2" through these two.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

/** The `create or replace function public.<name>(` ... `$$;` block. */
function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fn("co_op_pact_platform"));
  await db.exec(fn("co_op_card_on_platform"));
});

afterAll(async () => {
  await db.close();
});

async function platformOf(copies: unknown): Promise<string | null> {
  const { rows } = await db.query<{ p: string | null }>(
    "select public.co_op_pact_platform($1::jsonb) as p",
    [copies == null ? null : JSON.stringify(copies)],
  );
  return rows[0].p;
}

async function onPlatform(copies: unknown, platform: string | null): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    "select public.co_op_card_on_platform($1::jsonb, $2) as ok",
    [copies == null ? null : JSON.stringify(copies), platform],
  );
  return rows[0].ok;
}

describe("co_op_pact_platform", () => {
  it("is the first base (non-DLC) copy's platform", async () => {
    expect(
      await platformOf([
        { platform: "PC", format: "dlc" },
        { platform: "", format: "digital" },
        { platform: "PlayStation 5", format: "digital" },
        { platform: "Nintendo Switch", format: "physical" },
      ]),
    ).toBe("PlayStation 5");
  });

  it("is null when the card records no base platform", async () => {
    expect(await platformOf([])).toBeNull();
    expect(await platformOf(null)).toBeNull();
    expect(await platformOf([{ platform: "PC", format: "dlc" }])).toBeNull();
  });
});

describe("co_op_card_on_platform", () => {
  const switchCard = [{ platform: "Nintendo Switch", format: "digital" }];

  it("matches only a base copy on the pact's platform", async () => {
    // The Pumpkin Jack case: inviter on PS5, invitee owns it on Switch.
    expect(await onPlatform(switchCard, "PlayStation 5")).toBe(false);
    expect(await onPlatform(switchCard, "Nintendo Switch")).toBe(true);
    // Tolerates stray case/whitespace in free-typed (CSV) platforms.
    expect(await onPlatform([{ platform: " nintendo switch " }], "Nintendo Switch")).toBe(true);
    // A DLC row on the platform isn't the game itself.
    expect(await onPlatform([{ platform: "PlayStation 5", format: "dlc" }], "PlayStation 5")).toBe(
      false,
    );
    expect(await onPlatform([], "PlayStation 5")).toBe(false);
  });

  it("matches any card when the pact has no platform to tell versions apart by", async () => {
    expect(await onPlatform(switchCard, null)).toBe(true);
    expect(await onPlatform([], null)).toBe(true);
  });
});
