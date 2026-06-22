import { describe, it, expect } from "vitest";
import { priorityRank, coercePriority, DEFAULT_PRIORITY, PRIORITIES } from "./priority";

describe("priorityRank", () => {
  it("orders low < medium < high", () => {
    expect(priorityRank("low")).toBeLessThan(priorityRank("medium"));
    expect(priorityRank("medium")).toBeLessThan(priorityRank("high"));
  });
});

describe("coercePriority", () => {
  it("passes valid priorities through", () => {
    for (const p of PRIORITIES) expect(coercePriority(p)).toBe(p);
  });

  it("defaults unknown/empty values to medium", () => {
    expect(coercePriority(null)).toBe(DEFAULT_PRIORITY);
    expect(coercePriority(undefined)).toBe(DEFAULT_PRIORITY);
    expect(coercePriority("bogus")).toBe(DEFAULT_PRIORITY);
    expect(DEFAULT_PRIORITY).toBe("medium");
  });
});
