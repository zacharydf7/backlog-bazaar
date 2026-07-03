import { describe, it, expect } from "vitest";
import {
  REVIEW_MAX,
  clampScore,
  formatScore,
  starParts,
  hasReview,
} from "./reviews";

describe("clampScore", () => {
  it("accepts integers 1–10", () => {
    expect(clampScore(1)).toBe(1);
    expect(clampScore(10)).toBe(10);
    expect(clampScore(7)).toBe(7);
  });
  it("rounds near-integers (defensive against float drift)", () => {
    expect(clampScore(6.4)).toBe(6);
    expect(clampScore(6.6)).toBe(7);
  });
  it("rejects out-of-range, zero, and garbage as no-score", () => {
    expect(clampScore(0)).toBeNull();
    expect(clampScore(11)).toBeNull();
    expect(clampScore(-3)).toBeNull();
    expect(clampScore(NaN)).toBeNull();
    expect(clampScore(null)).toBeNull();
    expect(clampScore(undefined)).toBeNull();
  });
});

describe("formatScore", () => {
  it("renders whole stars without a decimal", () => {
    expect(formatScore(10)).toBe("5");
    expect(formatScore(6)).toBe("3");
  });
  it("renders half stars with one decimal", () => {
    expect(formatScore(9)).toBe("4.5");
    expect(formatScore(1)).toBe("0.5");
  });
});

describe("starParts", () => {
  it("maps 4.5 stars to four full + one half", () => {
    expect(starParts(9)).toEqual(["full", "full", "full", "full", "half"]);
  });
  it("maps 5 stars to all full and ½ star to one half", () => {
    expect(starParts(10)).toEqual(["full", "full", "full", "full", "full"]);
    expect(starParts(1)).toEqual(["half", "empty", "empty", "empty", "empty"]);
  });
  it("maps no score to all empty", () => {
    expect(starParts(null)).toEqual(["empty", "empty", "empty", "empty", "empty"]);
    expect(starParts(undefined)).toEqual(["empty", "empty", "empty", "empty", "empty"]);
    expect(starParts(0)).toEqual(["empty", "empty", "empty", "empty", "empty"]);
  });
});

describe("hasReview", () => {
  it("is true with text, a score, or both", () => {
    expect(hasReview({ review: "Great game." })).toBe(true);
    expect(hasReview({ reviewScore: 8 })).toBe(true);
    expect(hasReview({ review: "x", reviewScore: 8 })).toBe(true);
  });
  it("is false with nothing, blank text, or an invalid score", () => {
    expect(hasReview({})).toBe(false);
    expect(hasReview({ review: "   " })).toBe(false);
    expect(hasReview({ reviewScore: 0 })).toBe(false);
  });
  it("exposes a positive length cap", () => {
    expect(REVIEW_MAX).toBeGreaterThan(0);
  });
});
