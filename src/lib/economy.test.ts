import { describe, it, expect } from "vitest";
import {
  computeFormula,
  formulaBreakdown,
  recencyFraction,
  normalizeFormula,
  cloneFormula,
  splitWeight,
  combineWeight,
  signedCoins,
  DEFAULT_PRICE_FORMULA,
  DEFAULT_BOUNTY_FORMULA,
  DEFAULT_HOURS,
  type FormulaConfig,
} from "./economy";
import type { GameMeta } from "../types";

function meta(p: Partial<GameMeta> = {}): GameMeta {
  return { title: "G", genres: [], ...p };
}

/** A release date `years` in the past (for deterministic recency tests). */
function yearsAgo(years: number): string {
  return new Date(Date.now() - years * 365.25 * 24 * 60 * 60 * 1000).toISOString();
}

describe("recencyFraction", () => {
  it("is ~1 for a brand-new game and 0 once past the decay window", () => {
    expect(recencyFraction(yearsAgo(0), 8)).toBeCloseTo(1, 2);
    expect(recencyFraction(yearsAgo(4), 8)).toBeCloseTo(0.5, 2);
    expect(recencyFraction(yearsAgo(20), 8)).toBe(0);
  });

  it("contributes nothing for unknown dates or a non-positive decay", () => {
    expect(recencyFraction(undefined, 8)).toBe(0);
    expect(recencyFraction("not-a-date", 8)).toBe(0);
    expect(recencyFraction(yearsAgo(1), 0)).toBe(0);
  });
});

describe("default price formula", () => {
  it("reproduces the original pricing (base + length + recency)", () => {
    // 8-year-old game so recency is ~0: base 40 + 10h × 3 = 70.
    const g = meta({ hours: 10, released: yearsAgo(8) });
    expect(computeFormula(g, DEFAULT_PRICE_FORMULA)).toBe(70);
  });

  it("adds the newness bonus for a fresh release", () => {
    // Brand new + 0h length default (12): 40 + 12×3 + 120 = 196.
    const g = meta({ hours: 12, released: yearsAgo(0) });
    expect(computeFormula(g, DEFAULT_PRICE_FORMULA)).toBe(196);
  });

  it("falls back to the default length when hours is missing", () => {
    const g = meta({ released: yearsAgo(8) });
    expect(computeFormula(g, DEFAULT_PRICE_FORMULA)).toBe(40 + DEFAULT_HOURS * 3);
  });
});

describe("default bounty formula", () => {
  it("is a flat base with every factor off", () => {
    const g = meta({ hours: 99, rating: 5, released: yearsAgo(0) });
    expect(computeFormula(g, DEFAULT_BOUNTY_FORMULA)).toBe(40);
  });
});

describe("factor contributions", () => {
  const blank: FormulaConfig = {
    base: 0,
    recencyDecayYears: 8,
    factors: {
      length: { enabled: false, weight: 0 },
      recency: { enabled: false, weight: 0 },
      paid: { enabled: false, weight: 0 },
      played: { enabled: false, weight: 0 },
      rating: { enabled: false, weight: 0 },
      metacritic: { enabled: false, weight: 0 },
    },
  };

  it("only counts enabled factors", () => {
    const g = meta({ rating: 4, metacritic: 90 });
    const cfg = cloneFormula(blank);
    cfg.factors.rating = { enabled: true, weight: 10 };
    // metacritic has a weight but is disabled → ignored.
    cfg.factors.metacritic = { enabled: false, weight: 1 };
    expect(computeFormula(g, cfg)).toBe(40); // 4 stars × 10
  });

  it("reads paid from owned copies and played from logged hours", () => {
    const g = meta({
      playedHours: 6,
      copies: [
        { id: "a", platform: "PC", cost: 30 },
        { id: "b", platform: "PS5", cost: 20 },
      ],
    });
    const cfg = cloneFormula(blank);
    cfg.base = 5;
    cfg.factors.paid = { enabled: true, weight: 2 }; // $50 × 2 = 100
    cfg.factors.played = { enabled: true, weight: 3 }; // 6h × 3 = 18
    expect(computeFormula(g, cfg)).toBe(5 + 100 + 18);
  });

  it("never returns a negative total", () => {
    const cfg = cloneFormula(blank);
    cfg.base = 10;
    cfg.factors.length = { enabled: true, weight: -100 };
    expect(computeFormula(meta({ hours: 5 }), cfg)).toBe(0);
  });

  it("breaks the total down per factor", () => {
    const g = meta({ hours: 10, rating: 3 });
    const cfg = cloneFormula(blank);
    cfg.base = 40;
    cfg.factors.length = { enabled: true, weight: 3 };
    cfg.factors.rating = { enabled: true, weight: 5 };
    const bd = formulaBreakdown(g, cfg);
    expect(bd.base).toBe(40);
    expect(bd.factors.length).toBe(30);
    expect(bd.factors.rating).toBe(15);
    expect(bd.factors.paid).toBe(0);
    expect(bd.total).toBe(85);
  });
});

describe("signed weights", () => {
  it("splits a signed weight into direction + non-negative magnitude", () => {
    expect(splitWeight(3)).toEqual({ direction: 1, magnitude: 3 });
    expect(splitWeight(-18)).toEqual({ direction: -1, magnitude: 18 });
    // Zero reads as "+" so the editor defaults to adding.
    expect(splitWeight(0)).toEqual({ direction: 1, magnitude: 0 });
  });

  it("recombines direction + magnitude into the stored weight", () => {
    expect(combineWeight(1, 3)).toBe(3);
    expect(combineWeight(-1, 18)).toBe(-18);
    // A stray negative magnitude is clamped to 0 (never flips the sign twice).
    expect(combineWeight(-1, -5)).toBe(0);
  });

  it("round-trips through split → combine", () => {
    for (const w of [0, 3, -3, 120, -120]) {
      const { direction, magnitude } = splitWeight(w);
      expect(combineWeight(direction, magnitude)).toBe(w === 0 ? 0 : w);
    }
  });

  it("a negative-weight factor reduces the total, flooring at 0", () => {
    const cfg = cloneFormula(DEFAULT_PRICE_FORMULA);
    cfg.factors.played = { enabled: true, weight: combineWeight(-1, 5) }; // −5/hr played
    const g = meta({ hours: 10, playedHours: 4, released: yearsAgo(8) });
    // base 40 + length 10×3 + played 4×(−5) = 40 + 30 − 20 = 50.
    expect(computeFormula(g, cfg)).toBe(50);
  });

  it("formats signed coins with an explicit sign", () => {
    expect(signedCoins(30)).toBe("+30");
    expect(signedCoins(-18)).toBe("−18");
    expect(signedCoins(0)).toBe("0");
  });
});

describe("normalizeFormula", () => {
  it("returns a clone of the fallback for missing/garbage input", () => {
    expect(normalizeFormula(undefined, DEFAULT_PRICE_FORMULA)).toEqual(DEFAULT_PRICE_FORMULA);
    expect(normalizeFormula("nope", DEFAULT_PRICE_FORMULA)).toEqual(DEFAULT_PRICE_FORMULA);
    expect(normalizeFormula(42, DEFAULT_PRICE_FORMULA)).toEqual(DEFAULT_PRICE_FORMULA);
  });

  it("does not mutate or alias the fallback", () => {
    const out = normalizeFormula({}, DEFAULT_PRICE_FORMULA);
    out.factors.length.weight = 999;
    expect(DEFAULT_PRICE_FORMULA.factors.length.weight).toBe(3);
  });

  it("merges a partial config onto the fallback, filling missing factors", () => {
    const out = normalizeFormula(
      { base: 100, factors: { length: { enabled: false } } },
      DEFAULT_PRICE_FORMULA,
    );
    expect(out.base).toBe(100);
    // length: enabled overridden, weight kept from fallback.
    expect(out.factors.length).toEqual({ enabled: false, weight: 3 });
    // recency untouched → fallback value.
    expect(out.factors.recency).toEqual({ enabled: true, weight: 120 });
    // a factor absent from the JSON still gets its fallback.
    expect(out.factors.rating).toEqual({ enabled: false, weight: 0 });
  });

  it("ignores non-finite numbers in favour of the fallback", () => {
    const out = normalizeFormula(
      { base: Number.NaN, recencyDecayYears: "x", factors: { paid: { weight: null } } },
      DEFAULT_PRICE_FORMULA,
    );
    expect(out.base).toBe(40);
    expect(out.recencyDecayYears).toBe(8);
    expect(out.factors.paid.weight).toBe(0);
  });
});
