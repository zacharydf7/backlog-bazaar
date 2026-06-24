import { describe, it, expect } from "vitest";
import { effortRank, coerceEffort, DEFAULT_EFFORT, EFFORTS } from "./effort";

describe("effortRank", () => {
  it("orders low < medium < high", () => {
    expect(effortRank("low")).toBeLessThan(effortRank("medium"));
    expect(effortRank("medium")).toBeLessThan(effortRank("high"));
  });
});

describe("coerceEffort", () => {
  it("passes valid efforts through", () => {
    for (const e of EFFORTS) expect(coerceEffort(e)).toBe(e);
  });

  it("defaults unknown/empty values to medium", () => {
    expect(coerceEffort(null)).toBe(DEFAULT_EFFORT);
    expect(coerceEffort(undefined)).toBe(DEFAULT_EFFORT);
    expect(coerceEffort("bogus")).toBe(DEFAULT_EFFORT);
    expect(DEFAULT_EFFORT).toBe("medium");
  });
});
