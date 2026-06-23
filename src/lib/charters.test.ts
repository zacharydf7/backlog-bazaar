import { describe, it, expect } from "vitest";
import { charterResale, canBuyCharter, canSellCharter, canImport } from "./charters";

describe("charterResale", () => {
  it("returns the depreciated value (cost 100 @ 75% = 75)", () => {
    expect(charterResale(100, 75)).toBe(75);
  });

  it("floors fractional results", () => {
    expect(charterResale(100, 33)).toBe(33); // 33.0
    expect(charterResale(50, 75)).toBe(37); // 37.5 -> 37
  });

  it("clamps the percentage to 0–100 and never goes negative", () => {
    expect(charterResale(100, 150)).toBe(100);
    expect(charterResale(100, -10)).toBe(0);
    expect(charterResale(-5, 75)).toBe(0);
  });
});

describe("canBuyCharter", () => {
  it("requires enough coins (inclusive)", () => {
    expect(canBuyCharter(100, 100)).toBe(true);
    expect(canBuyCharter(99, 100)).toBe(false);
    expect(canBuyCharter(0, 0)).toBe(true);
  });
});

describe("canSellCharter / canImport", () => {
  it("needs at least one charter", () => {
    expect(canSellCharter(1)).toBe(true);
    expect(canSellCharter(0)).toBe(false);
    expect(canImport(2)).toBe(true);
    expect(canImport(0)).toBe(false);
  });
});
