import { describe, it, expect } from "vitest";
import {
  hasValueTarget,
  valueStatusOf,
  gameValueStatus,
  valueTooltip,
  formatRate,
  valueFinancials,
} from "./valueMetrics";
import type { Game, GameCopy } from "../types";

const copy = (cost: number | undefined, over: Partial<GameCopy> = {}): GameCopy =>
  ({ id: Math.random().toString(36).slice(2), platform: "PC", cost, ...over }) as GameCopy;

const game = (over: Partial<Game> = {}): Game =>
  ({
    id: "g1",
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    familyId: null,
    ...over,
  }) as Game;

describe("hasValueTarget", () => {
  it("requires a positive, finite rate — null/0/negative mean the feature is off", () => {
    expect(hasValueTarget(1)).toBe(true);
    expect(hasValueTarget(0.5)).toBe(true);
    expect(hasValueTarget(0)).toBe(false);
    expect(hasValueTarget(null)).toBe(false);
    expect(hasValueTarget(undefined)).toBe(false);
    expect(hasValueTarget(-2)).toBe(false);
    expect(hasValueTarget(Number.NaN)).toBe(false);
    expect(hasValueTarget(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("valueStatusOf", () => {
  it("is inactive with no target set", () => {
    expect(valueStatusOf(60, 100, null)).toBeNull();
    expect(valueStatusOf(60, 100, 0)).toBeNull();
  });

  it("bypasses zero-cost games entirely", () => {
    expect(valueStatusOf(0, 100, 2)).toBeNull();
  });

  it("meets the goal once hours reach spend ÷ target", () => {
    // $60 at a $2/hr target → 30h required.
    expect(valueStatusOf(60, 29.9, 2)).toMatchObject({ met: false, targetHours: 30 });
    expect(valueStatusOf(60, 30, 2)).toMatchObject({ met: true, targetHours: 30 });
    expect(valueStatusOf(60, 32, 2)).toMatchObject({ met: true, costPerHour: 1.875 });
  });

  it("handles the unplayed case (no effective rate yet)", () => {
    const v = valueStatusOf(60, 0, 2)!;
    expect(v.met).toBe(false);
    expect(v.costPerHour).toBeNull();
  });
});

describe("gameValueStatus", () => {
  it("sums copy costs and reads logged hours", () => {
    const g = game({ copies: [copy(40), copy(20)], playedHours: 32 });
    const v = gameValueStatus(g, 2)!;
    expect(v).toMatchObject({ met: true, spend: 60, hours: 32 });
  });

  it("ignores copies with no recorded cost (a Player 2 copy stores none)", () => {
    const g = game({ copies: [copy(undefined, { acquisition: "player2" })], playedHours: 90 });
    expect(gameValueStatus(g, 2)).toBeNull();
  });

  it("never judges a wishlist entry — its cost is a hunting note, not a purchase", () => {
    const g = game({ status: "wishlist", copies: [copy(60)], playedHours: 90 });
    expect(gameValueStatus(g, 2)).toBeNull();
  });
});

describe("valueTooltip", () => {
  it("spells out the math breakdown", () => {
    const v = valueStatusOf(60, 32, 2)!;
    expect(valueTooltip(v, 2)).toBe(
      "Goal met: $60.00 spent ÷ 32h played = $1.88/hr (target $2.00/hr)",
    );
  });

  it("keeps one decimal on fractional hours", () => {
    const v = valueStatusOf(25, 12.53, 1)!;
    expect(valueTooltip(v, 1)).toContain("12.5h played");
  });

  it("formats rates to cents", () => {
    expect(formatRate(1.875)).toBe("$1.88/hr");
    expect(formatRate(2)).toBe("$2.00/hr");
  });
});

describe("valueFinancials", () => {
  const lib = [
    game({ id: "a", copies: [copy(60)], playedHours: 40 }), // met at $2/hr (needs 30h)
    game({ id: "b", copies: [copy(30)], playedHours: 5 }), // not met (needs 15h)
    game({ id: "c", copies: [], playedHours: 100 }), // free: bypassed entirely
    game({ id: "d", copies: [copy(0)], playedHours: 50 }), // $0 cost: bypassed too
  ];

  it("sums spend and computes cost-per-hour over PAID games only", () => {
    const f = valueFinancials(lib, 2);
    expect(f.totalSpent).toBe(90);
    // 90 ÷ (40 + 5) — the free games' 150h never flatter the rate.
    expect(f.costPerHour).toBe(2);
  });

  it("counts well-spent games against the eligible (paid) base", () => {
    const f = valueFinancials(lib, 2);
    expect(f.eligible).toBe(2);
    expect(f.wellSpent).toBe(1);
    expect(f.wellSpentPct).toBe(50);
  });

  it("recomputes for a filtered subset (filter responsiveness)", () => {
    const f = valueFinancials([lib[0]], 2);
    expect(f).toMatchObject({ totalSpent: 60, wellSpent: 1, eligible: 1, wellSpentPct: 100 });
  });

  it("still totals spend + rate with no target set (judgement off)", () => {
    const f = valueFinancials(lib, null);
    expect(f.totalSpent).toBe(90);
    expect(f.costPerHour).toBe(2);
    expect(f.eligible).toBe(0);
    expect(f.wellSpentPct).toBe(0);
  });

  it("is all-zero/null on an empty or all-free view", () => {
    expect(valueFinancials([], 2)).toEqual({
      totalSpent: 0,
      costPerHour: null,
      wellSpent: 0,
      eligible: 0,
      wellSpentPct: 0,
    });
    expect(valueFinancials([lib[2]], 2).costPerHour).toBeNull();
  });
});
