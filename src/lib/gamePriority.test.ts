import { describe, it, expect } from "vitest";
import {
  GAME_PRIORITIES,
  GAME_PRIORITY_LABEL,
  gamePriorityRank,
  coerceGamePriority,
} from "./gamePriority";

describe("gamePriorityRank", () => {
  it("ranks the tiers most-urgent-highest, unassigned at zero", () => {
    expect(gamePriorityRank("essential")).toBe(4);
    expect(gamePriorityRank("high")).toBe(3);
    expect(gamePriorityRank("medium")).toBe(2);
    expect(gamePriorityRank("low")).toBe(1);
    expect(gamePriorityRank(null)).toBe(0);
    expect(gamePriorityRank(undefined)).toBe(0);
  });

  it("lists tiers in strictly descending rank (picker order)", () => {
    const ranks = GAME_PRIORITIES.map(gamePriorityRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
  });
});

describe("coerceGamePriority", () => {
  it("passes valid tiers through", () => {
    for (const p of GAME_PRIORITIES) expect(coerceGamePriority(p)).toBe(p);
  });

  it("maps junk, null and legacy values to unassigned", () => {
    expect(coerceGamePriority(null)).toBeNull();
    expect(coerceGamePriority(undefined)).toBeNull();
    expect(coerceGamePriority("urgent")).toBeNull();
    expect(coerceGamePriority(3)).toBeNull();
  });
});

describe("GAME_PRIORITY_LABEL", () => {
  it("labels every tier", () => {
    for (const p of GAME_PRIORITIES) expect(GAME_PRIORITY_LABEL[p]).toBeTruthy();
  });
});
