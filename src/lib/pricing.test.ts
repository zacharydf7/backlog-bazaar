import { describe, it, expect } from "vitest";
import {
  computePrice,
  computeReward,
  computeShelvePenalty,
  computeTrickle,
  computeEstimatedPayout,
  priceBreakdown,
  PRICING,
  REWARD,
  TRICKLE,
} from "./pricing";

describe("computePrice", () => {
  it("uses base + default length when a game has no data", () => {
    // 40 base + 12 default hours * 3 = 76
    expect(computePrice({ title: "x", genres: [] })).toBe(
      PRICING.base + PRICING.defaultHours * PRICING.hoursWeight,
    );
  });

  it("charges more for longer games", () => {
    const short = computePrice({ title: "s", genres: [], hours: 5 });
    const long = computePrice({ title: "l", genres: [], hours: 50 });
    expect(long - short).toBe((50 - 5) * PRICING.hoursWeight);
  });

  it("newer games cost more than older ones (clears old backlog first)", () => {
    const newer = computePrice({ title: "n", genres: [], released: "2999-01-01" });
    const older = computePrice({ title: "o", genres: [], released: "1990-01-01" });
    expect(newer).toBeGreaterThan(older);
  });
});

describe("priceBreakdown", () => {
  it("applies the full recency premium to unreleased/future games", () => {
    const bd = priceBreakdown({ title: "f", genres: [], released: "2999-01-01" });
    expect(bd.recency).toBe(PRICING.recencyMax);
  });

  it("applies no recency premium beyond the decay window", () => {
    const bd = priceBreakdown({ title: "o", genres: [], released: "1990-01-01" });
    expect(bd.recency).toBe(0);
  });

  it("has parts that sum to the total", () => {
    const game = { title: "g", genres: [], hours: 20, released: "2999-01-01" };
    const bd = priceBreakdown(game);
    expect(bd.base + bd.length + bd.recency).toBe(bd.total);
    expect(computePrice(game)).toBe(bd.total);
  });
});

describe("computeReward", () => {
  it("is a flat completion bonus, independent of length", () => {
    expect(computeReward()).toBe(REWARD.base);
  });
});

describe("computeTrickle", () => {
  it("pays a flat rate per hour logged", () => {
    expect(computeTrickle(5)).toBe(5 * TRICKLE.perHour);
  });

  it("rounds fractional hours", () => {
    expect(computeTrickle(2.5)).toBe(Math.round(2.5 * TRICKLE.perHour));
  });
});

describe("computeShelvePenalty", () => {
  it("charges the given percentage of the price paid", () => {
    expect(computeShelvePenalty(100, 50)).toBe(50);
    expect(computeShelvePenalty(80, 25)).toBe(20);
  });

  it("rounds to a whole coin", () => {
    expect(computeShelvePenalty(75, 50)).toBe(38); // 37.5 -> 38
  });

  it("is zero at 0% and the full price at 100%", () => {
    expect(computeShelvePenalty(120, 0)).toBe(0);
    expect(computeShelvePenalty(120, 100)).toBe(120);
  });

  it("clamps the percentage to 0–100 and never goes negative", () => {
    expect(computeShelvePenalty(100, 150)).toBe(100);
    expect(computeShelvePenalty(100, -20)).toBe(0);
    expect(computeShelvePenalty(-100, 50)).toBe(0);
  });
});

describe("computeEstimatedPayout", () => {
  it("is the completion bonus plus the trickle for the game's length", () => {
    expect(computeEstimatedPayout({ title: "x", genres: [], hours: 10 })).toBe(
      REWARD.base + computeTrickle(10),
    );
  });

  it("falls back to the default length when unknown", () => {
    expect(computeEstimatedPayout({ title: "x", genres: [] })).toBe(
      REWARD.base + computeTrickle(PRICING.defaultHours),
    );
  });
});
