// @vitest-environment node
//
// The REAL econ_normalize / econ_formula from schema.sql (PGlite) against the
// TypeScript they mirror (normalizeFormula / computeFormula in economy.ts):
// the server prices expansion runs itself, so both sides must agree on every
// formula shape — defaults, partial or malformed configs, signed weights, a
// zero decay, unknown lengths, and fresh-pickup ages.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_BOUNTY_FORMULA,
  DEFAULT_PRICE_FORMULA,
  computeFormula,
  normalizeFormula,
  type FormulaConfig,
} from "./economy";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

const NOW = Date.parse("2026-10-17T12:00:00Z");
const DAY = 86_400_000;
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const name of ["econ_default_formula", "econ_normalize", "econ_formula"]) await db.exec(fn(name));
});

afterAll(async () => {
  await db.close();
});

const LIVE_PRICE = {
  base: 40,
  recencyDecayYears: 1,
  factors: {
    paid: { weight: 1, enabled: true },
    length: { weight: 3, enabled: true },
    played: { weight: 0, enabled: false },
    rating: { weight: 0, enabled: false },
    recency: { weight: 120, enabled: true },
  },
};

const CONFIGS: Record<string, { raw: unknown; game: unknown; kind: "price" | "bounty" }> = {
  "default price": { raw: null, game: null, kind: "price" },
  "default bounty": { raw: null, game: null, kind: "bounty" },
  "live price": { raw: null, game: LIVE_PRICE, kind: "price" },
  "expansion override of one setting": {
    raw: { base: 10, factors: { length: { weight: 6 } } },
    game: LIVE_PRICE,
    kind: "price",
  },
  "malformed values fall back": {
    raw: { base: "lots", recencyDecayYears: null, factors: { paid: { enabled: "yes", weight: "2" } } },
    game: LIVE_PRICE,
    kind: "price",
  },
  "signed weights, every factor on": {
    raw: {
      base: 5,
      recencyDecayYears: 2,
      factors: {
        length: { enabled: true, weight: 4 },
        recency: { enabled: true, weight: 90 },
        paid: { enabled: true, weight: 0.5 },
        played: { enabled: true, weight: -3 },
        rating: { enabled: true, weight: 7 },
      },
    },
    game: null,
    kind: "bounty",
  },
  "zero decay": { raw: { recencyDecayYears: 0 }, game: LIVE_PRICE, kind: "price" },
};

const INPUTS = [
  { hours: 8, cost: 20, ageDays: 0, played: 0, rating: 0 },
  { hours: 15.5, cost: 30, ageDays: 100, played: 4, rating: 3.5 },
  { hours: undefined, cost: undefined, ageDays: 400, played: 0, rating: 0 },
  { hours: 2, cost: 0, ageDays: 730, played: 60, rating: 5 },
];

async function sqlTotal(raw: unknown, game: unknown, kind: string, input: (typeof INPUTS)[number]) {
  const r = await db.query<{ total: number }>(
    `select public.econ_formula(public.econ_normalize($1::jsonb, public.econ_normalize($2::jsonb, public.econ_default_formula($3))),
              $4, $5, $6::timestamptz, $7, $8, $9::timestamptz) as total`,
    [
      raw == null ? null : JSON.stringify(raw),
      game == null ? null : JSON.stringify(game),
      kind,
      input.hours ?? null,
      input.cost ?? null,
      new Date(NOW - input.ageDays * DAY).toISOString(),
      input.played,
      input.rating,
      new Date(NOW).toISOString(),
    ],
  );
  return r.rows[0].total;
}

function tsTotal(raw: unknown, game: unknown, kind: "price" | "bounty", input: (typeof INPUTS)[number]) {
  const fallback: FormulaConfig = normalizeFormula(game, kind === "price" ? DEFAULT_PRICE_FORMULA : DEFAULT_BOUNTY_FORMULA);
  return computeFormula(
    {
      title: "x",
      genres: [],
      hours: input.hours,
      copies: input.cost != null ? [{ id: "c", platform: "", cost: input.cost }] : [],
      addedAt: NOW - input.ageDays * DAY,
      playedHours: input.played,
      rating: input.rating,
    },
    normalizeFormula(raw, fallback),
    NOW,
  );
}

describe("econ_formula matches computeFormula", () => {
  for (const [label, cfg] of Object.entries(CONFIGS)) {
    it(label, async () => {
      for (const input of INPUTS) {
        expect(await sqlTotal(cfg.raw, cfg.game, cfg.kind, input)).toBe(tsTotal(cfg.raw, cfg.game, cfg.kind, input));
      }
    });
  }

  it("never goes below zero", async () => {
    const raw = { base: -500 };
    expect(await sqlTotal(raw, null, "bounty", INPUTS[0])).toBe(0);
    expect(tsTotal(raw, null, "bounty", INPUTS[0])).toBe(0);
  });
});
