import { describe, it, expect } from "vitest";
import {
  computeReplayBonus,
  computeFinishReward,
  computeShelveRefund,
  computeCompletionBonus,
  computeCompletionReward,
  computeFamilyDiscountPrice,
  computeClearStreakBonus,
  isClearStreakActive,
  clearStreakAtRisk,
  addBreaksClearStreak,
  CLEAR_STREAK,
} from "./pricing";

describe("computeReplayBonus / computeFinishReward", () => {
  it("pays a percentage of the game's full bounty", () => {
    expect(computeReplayBonus(40, 25)).toBe(10);
    expect(computeReplayBonus(40, 0)).toBe(0);
    expect(computeReplayBonus(40, 100)).toBe(40);
  });

  it("clamps the percentage to 0–100 and never goes negative", () => {
    expect(computeReplayBonus(40, 150)).toBe(40);
    expect(computeReplayBonus(40, -10)).toBe(0);
    expect(computeReplayBonus(-40, 50)).toBe(0);
  });

  it("pays the full bounty for a first clear and the replay bonus otherwise", () => {
    expect(computeFinishReward(false, 80, 25)).toBe(80);
    expect(computeFinishReward(true, 80, 25)).toBe(computeReplayBonus(80, 25));
  });
});

describe("computeCompletionBonus / computeCompletionReward", () => {
  it("pays a percentage of the full bounty as the bonus", () => {
    expect(computeCompletionBonus(40, 50)).toBe(20);
    expect(computeCompletionBonus(40, 0)).toBe(0);
    expect(computeCompletionBonus(40, 100)).toBe(40);
  });

  it("clamps the percentage to 0–100 and never goes negative", () => {
    expect(computeCompletionBonus(40, 150)).toBe(40);
    expect(computeCompletionBonus(40, -10)).toBe(0);
    expect(computeCompletionBonus(-40, 50)).toBe(0);
  });

  it("a first completion pays the full bounty plus the bonus", () => {
    // 80 bounty + 50% completion bonus (40) = 120
    expect(computeCompletionReward(false, 80, 50)).toBe(120);
  });

  it("completing an already-finished (pulled-back) game pays the bonus only", () => {
    expect(computeCompletionReward(true, 80, 50)).toBe(40);
  });
});

describe("computeFamilyDiscountPrice", () => {
  it("charges the Replay-Bonus percentage of the full fee (cost mirrors payout)", () => {
    // At 25% the bounty pays 25% — so the fee costs 25% too.
    expect(computeFamilyDiscountPrice(120, 25)).toBe(30);
    expect(computeFamilyDiscountPrice(120, 50)).toBe(60);
    expect(computeFamilyDiscountPrice(40, 25)).toBe(computeReplayBonus(40, 25));
  });

  it("rounds to a whole coin", () => {
    expect(computeFamilyDiscountPrice(75, 50)).toBe(38); // 37.5 → 38
  });

  it("clamps the percentage to 0–100 and never goes negative", () => {
    expect(computeFamilyDiscountPrice(100, 150)).toBe(100);
    expect(computeFamilyDiscountPrice(100, -20)).toBe(0);
    expect(computeFamilyDiscountPrice(-100, 50)).toBe(0);
  });
});

describe("computeClearStreakBonus", () => {
  const cfg = CLEAR_STREAK;

  it("pays nothing until the streak reaches the activation threshold", () => {
    expect(computeClearStreakBonus(0, cfg)).toBe(0);
    expect(computeClearStreakBonus(1, cfg)).toBe(0);
    expect(computeClearStreakBonus(2, cfg)).toBe(0);
  });

  it("pays the flat base at the threshold, then escalates by step per finish", () => {
    expect(computeClearStreakBonus(3, cfg)).toBe(100); // base
    expect(computeClearStreakBonus(4, cfg)).toBe(125); // +25
    expect(computeClearStreakBonus(5, cfg)).toBe(150);
    expect(computeClearStreakBonus(6, cfg)).toBe(175);
  });

  it("caps the bonus so a long streak stays balanced", () => {
    // 100 + 25*(9-3) = 250 hits the cap; nothing beyond pays more.
    expect(computeClearStreakBonus(9, cfg)).toBe(250);
    expect(computeClearStreakBonus(50, cfg)).toBe(250);
  });

  it("floors fractional streaks and never goes negative", () => {
    expect(computeClearStreakBonus(4.9, cfg)).toBe(125);
    expect(computeClearStreakBonus(-3, cfg)).toBe(0);
  });

  it("honours custom admin knobs", () => {
    const custom = { threshold: 2, base: 50, step: 10, cap: 80 };
    expect(computeClearStreakBonus(1, custom)).toBe(0);
    expect(computeClearStreakBonus(2, custom)).toBe(50);
    expect(computeClearStreakBonus(3, custom)).toBe(60);
    expect(computeClearStreakBonus(10, custom)).toBe(80); // capped
  });
});

describe("isClearStreakActive / clearStreakAtRisk", () => {
  it("lights the flame from 2 consecutive finishes", () => {
    expect(isClearStreakActive(0)).toBe(false);
    expect(isClearStreakActive(1)).toBe(false);
    expect(isClearStreakActive(2)).toBe(true);
    expect(isClearStreakActive(7)).toBe(true);
  });

  it("warns about a break from the very first consecutive finish", () => {
    expect(clearStreakAtRisk(0)).toBe(false);
    expect(clearStreakAtRisk(1)).toBe(true);
    expect(clearStreakAtRisk(2)).toBe(true);
  });
});

describe("addBreaksClearStreak", () => {
  it("only a new game to play breaks the streak", () => {
    expect(addBreaksClearStreak("backlog")).toBe(true);
    expect(addBreaksClearStreak("playing")).toBe(true);
  });

  it("cataloging the past or wishing never breaks it", () => {
    expect(addBreaksClearStreak("finished")).toBe(false);
    expect(addBreaksClearStreak("wishlist")).toBe(false);
  });
});

describe("computeShelveRefund", () => {
  it("refunds the given percentage of the price paid", () => {
    expect(computeShelveRefund(100, 50)).toBe(50);
    expect(computeShelveRefund(80, 25)).toBe(20);
  });

  it("rounds to a whole coin", () => {
    expect(computeShelveRefund(75, 50)).toBe(38); // 37.5 -> 38
  });

  it("refunds nothing at 0% and the full price at 100%", () => {
    expect(computeShelveRefund(120, 0)).toBe(0);
    expect(computeShelveRefund(120, 100)).toBe(120);
  });

  it("clamps the percentage to 0–100 and never goes negative", () => {
    expect(computeShelveRefund(100, 150)).toBe(100);
    expect(computeShelveRefund(100, -20)).toBe(0);
    expect(computeShelveRefund(-100, 50)).toBe(0);
  });
});
