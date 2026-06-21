import { describe, it, expect } from "vitest";
import { ownedPlatforms, totalCost, hasAnyCost, formatUsd } from "./copies";
import type { GameCopy } from "../types";

function copy(over: Partial<GameCopy>): GameCopy {
  return { id: Math.random().toString(36), platform: "PC", ...over };
}

describe("ownedPlatforms", () => {
  it("returns distinct platforms in first-seen order", () => {
    const copies = [
      copy({ platform: "PS5" }),
      copy({ platform: "PC" }),
      copy({ platform: "PS5" }), // duplicate platform (e.g. bought twice)
    ];
    expect(ownedPlatforms(copies)).toEqual(["PS5", "PC"]);
  });

  it("trims and drops blank platforms", () => {
    expect(ownedPlatforms([copy({ platform: " Switch " }), copy({ platform: "  " })])).toEqual([
      "Switch",
    ]);
  });

  it("handles undefined", () => {
    expect(ownedPlatforms(undefined)).toEqual([]);
  });
});

describe("totalCost", () => {
  it("sums recorded costs, treating missing as 0", () => {
    expect(
      totalCost([copy({ cost: 70 }), copy({ cost: 39.99 }), copy({})]),
    ).toBeCloseTo(109.99);
  });

  it("is 0 for no copies", () => {
    expect(totalCost(undefined)).toBe(0);
  });
});

describe("hasAnyCost", () => {
  it("is true only when a copy has a positive cost", () => {
    expect(hasAnyCost([copy({}), copy({ cost: 0 })])).toBe(false);
    expect(hasAnyCost([copy({}), copy({ cost: 20 })])).toBe(true);
  });
});

describe("formatUsd", () => {
  it("drops trailing .00 but keeps cents otherwise", () => {
    expect(formatUsd(70)).toBe("$70");
    expect(formatUsd(59.99)).toBe("$59.99");
    expect(formatUsd(0)).toBe("$0");
  });
});
