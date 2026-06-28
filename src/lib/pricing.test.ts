import { describe, it, expect } from "vitest";
import {
  computeReplayBonus,
  computeFinishReward,
  computeShelveRefund,
  computeCompletionBonus,
  computeCompletionReward,
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
