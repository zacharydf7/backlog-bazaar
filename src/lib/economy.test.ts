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
  type EconGame,
  type FormulaConfig,
} from "./economy";

function meta(p: Partial<EconGame> = {}): EconGame {
  return { title: "G", genres: [], ...p };
}

/** An acquisition moment `years` in the past (for deterministic freshness tests). */
function yearsAgo(years: number): number {
  return Date.now() - years * 365.25 * 24 * 60 * 60 * 1000;
}

describe("recencyFraction (freshness since acquisition)", () => {
  it("is ~1 for a just-acquired game and 0 once past the decay window", () => {
    expect(recencyFraction(yearsAgo(0), 8)).toBeCloseTo(1, 2);
    expect(recencyFraction(yearsAgo(4), 8)).toBeCloseTo(0.5, 2);
    expect(recencyFraction(yearsAgo(20), 8)).toBe(0);
  });

  it("reads a missing addedAt as acquired-right-now (the add-game previews)", () => {
    expect(recencyFraction(undefined, 8)).toBe(1);
  });

  it("contributes nothing for a non-positive decay", () => {
    expect(recencyFraction(yearsAgo(1), 0)).toBe(0);
    expect(recencyFraction(undefined, 0)).toBe(0);
  });

  it("evaluates at another moment via nowMs (the pre-order projected fee)", () => {
    const added = Date.UTC(2026, 0, 1);
    const fourYears = 4 * 365.25 * 24 * 60 * 60 * 1000;
    expect(recencyFraction(added, 8, added)).toBe(1);
    expect(recencyFraction(added, 8, added + fourYears)).toBeCloseTo(0.5, 6);
    // A missing addedAt reads as acquired at nowMs — full freshness there too.
    expect(recencyFraction(undefined, 8, added)).toBe(1);
  });
});

describe("default price formula", () => {
  it("prices a long-held game at base + length only (freshness fully decayed)", () => {
    // Acquired 8 years ago so freshness is ~0: base 40 + 10h × 3 = 70.
    const g = meta({ hours: 10, addedAt: yearsAgo(8) });
    expect(computeFormula(g, DEFAULT_PRICE_FORMULA)).toBe(70);
  });

  it("adds the fresh-pickup bonus for a just-acquired game", () => {
    // Just added: 40 + 12×3 + 120 = 196.
    const g = meta({ hours: 12, addedAt: yearsAgo(0) });
    expect(computeFormula(g, DEFAULT_PRICE_FORMULA)).toBe(196);
  });

  it("ignores the release date entirely — only the acquisition date matters", () => {
    // A decades-old release picked up today prices at full freshness.
    const g = meta({ hours: 12, released: "1997-03-01", addedAt: yearsAgo(0) });
    expect(computeFormula(g, DEFAULT_PRICE_FORMULA)).toBe(196);
    // And a brand-new release that's languished 8 years (hypothetically) gets none.
    const held = meta({ hours: 10, released: new Date().toISOString(), addedAt: yearsAgo(8) });
    expect(computeFormula(held, DEFAULT_PRICE_FORMULA)).toBe(70);
  });

  it("falls back to the default length when hours is missing", () => {
    const g = meta({ addedAt: yearsAgo(8) });
    expect(computeFormula(g, DEFAULT_PRICE_FORMULA)).toBe(40 + DEFAULT_HOURS * 3);
  });
});

describe("default bounty formula", () => {
  it("is a flat base with every factor off", () => {
    const g = meta({ hours: 99, rating: 5, addedAt: yearsAgo(0) });
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
    },
  };

  it("only counts enabled factors", () => {
    const g = meta({ rating: 4, playedHours: 90 });
    const cfg = cloneFormula(blank);
    cfg.factors.rating = { enabled: true, weight: 10 };
    // played has a weight but is disabled → ignored.
    cfg.factors.played = { enabled: false, weight: 1 };
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
    const g = meta({ hours: 10, playedHours: 4, addedAt: yearsAgo(8) });
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

  it("silently drops a retired factor from a stored config (metacritic)", () => {
    // Live app_config may still carry the retired metacritic factor — loading
    // must shed it without disturbing anything else.
    const out = normalizeFormula(
      {
        base: 40,
        factors: { length: { enabled: true, weight: 3 }, metacritic: { enabled: true, weight: 2 } },
      },
      DEFAULT_PRICE_FORMULA,
    );
    expect("metacritic" in out.factors).toBe(false);
    expect(out.factors.length).toEqual({ enabled: true, weight: 3 });
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
