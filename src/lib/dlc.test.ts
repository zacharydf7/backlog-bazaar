import { describe, expect, it } from "vitest";
import {
  coerceGameDlc,
  defaultDlcKind,
  dlcSpend,
  dlcSpendByGame,
  expansionAcquiredAt,
  expansionFormulas,
  expansionLoggedHours,
  expansionPayout,
  expansionQuote,
} from "./dlc";
import { normalizeFormula, DEFAULT_PRICE_FORMULA, DEFAULT_BOUNTY_FORMULA } from "./economy";

const NOW = Date.parse("2026-10-17T12:00:00Z");

// The live formulas (and dlcExpansion.sql.test.ts's): price 40 + 3/h + $1 + 120
// fresh; bounty 40 + 5/h + $1 + 150 fresh.
const ECONOMY = {
  price: normalizeFormula(
    { base: 40, recencyDecayYears: 1, factors: { length: { enabled: true, weight: 3 }, recency: { enabled: true, weight: 120 }, paid: { enabled: true, weight: 1 } } },
    DEFAULT_PRICE_FORMULA,
  ),
  bounty: normalizeFormula(
    { base: 40, recencyDecayYears: 1, factors: { length: { enabled: true, weight: 5 }, recency: { enabled: true, weight: 150 }, paid: { enabled: true, weight: 1 } } },
    DEFAULT_BOUNTY_FORMULA,
  ),
};

const LEGENDS = { name: "Legends", hours: 8, cost: 20, acquiredOn: "2026-10-17", createdAt: NOW };

describe("expansionQuote", () => {
  it("prices a fresh 8h, $20 expansion like the server does", () => {
    expect(expansionQuote(LEGENDS, expansionFormulas(ECONOMY, { price: null, bounty: null }), 2, 50, NOW)).toEqual({
      price: 204,
      bounty: 250,
      gateHours: 4,
      paying: true,
    });
  });

  it("is a free, non-paying run below the minimum length", () => {
    expect(expansionQuote({ ...LEGENDS, hours: 1.5 }, ECONOMY, 2, 50, NOW)).toEqual({
      price: 0,
      bounty: 0,
      gateHours: 0,
      paying: false,
    });
  });

  it("follows an expansion formula's set values and the game formula's for the rest", () => {
    const formulas = expansionFormulas(ECONOMY, { price: { base: 0, factors: { recency: { enabled: false } } }, bounty: null });
    expect(expansionQuote(LEGENDS, formulas, 2, 50, NOW).price).toBe(44);
  });
});

describe("expansionPayout", () => {
  const quote = { price: 204, bounty: 250, gateHours: 4, paying: true };

  it("pays the full bounty once the gate is logged", () => {
    expect(expansionPayout(quote, 204, 4)).toBe(250);
  });

  it("pays the start price back or the logged share under the gate", () => {
    expect(expansionPayout(quote, 204, 1)).toBe(204);
    expect(expansionPayout(quote, 0, 2)).toBe(125);
  });

  it("pays nothing for a non-paying run", () => {
    expect(expansionPayout({ price: 0, bounty: 0, gateHours: 0, paying: false }, 0, 10)).toBe(0);
  });
});

describe("helpers", () => {
  it("counts logged hours from the run's start", () => {
    expect(expansionLoggedHours({ runHoursStart: 40 }, 43.5)).toBe(3.5);
    expect(expansionLoggedHours({ runHoursStart: 40 }, 39)).toBe(0);
  });

  it("dates the fresh pickup from the acquired day, else when it was added", () => {
    expect(expansionAcquiredAt({ acquiredOn: "2026-03-25", createdAt: NOW })).toBe(Date.parse("2026-03-25T00:00:00Z"));
    expect(expansionAcquiredAt({ acquiredOn: null, createdAt: NOW })).toBe(NOW);
  });

  it("starts a finished game on a story expansion, anything else on new content", () => {
    expect(defaultDlcKind({ status: "finished" })).toBe("expansion");
    expect(defaultDlcKind({ status: "playing", inRotation: true })).toBe("update");
    expect(defaultDlcKind({ status: "finished", ongoing: true })).toBe("update");
  });

  it("totals what was spent", () => {
    expect(dlcSpend([{ cost: 50 }, { cost: null }, { cost: 19.99 }])).toBeCloseTo(69.99);
  });

  it("totals what each game's DLC cost, skipping free and unlinked records", () => {
    const byGame = dlcSpendByGame([
      { gameId: "a", cost: 10 },
      { gameId: "a", cost: 5.5 },
      { gameId: "b", cost: null },
      { gameId: null, cost: 9 },
    ]);
    expect([...byGame]).toEqual([["a", 15.5]]);
  });

  it("coerces rows, dropping malformed ones, with a run's frozen quote", () => {
    const list = coerceGameDlc([
      { id: "b", game_id: "g", kind: "update", name: "Set 2", cost: "50", created_at: "2026-02-01T00:00:00Z", run_status: "owned" },
      {
        id: "a",
        game_id: "g",
        kind: "expansion",
        name: "Legends",
        hours: 8,
        created_at: "2026-01-01T00:00:00Z",
        run_status: "playing",
        run_hours_start: 40,
        run_quote: { price: 204, bounty: 250, gate_hours: 4, paying: true },
      },
      { id: "d", kind: "mystery", name: "Bad" },
    ]);
    expect(list.map((d) => d.id)).toEqual(["a", "b"]);
    expect(list[1].cost).toBe(50);
    expect(list[0]).toMatchObject({
      runStatus: "playing",
      runHoursStart: 40,
      runQuote: { price: 204, bounty: 250, gateHours: 4, paying: true },
    });
    expect(list[1].runQuote).toBeNull();
  });
});
