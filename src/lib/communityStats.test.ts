import { describe, it, expect } from "vitest";
import {
  coerceCommunityStats,
  coerceGameLikers,
  hasCommunityData,
  formatAvgScore,
  distributionBars,
  formatHours,
} from "./communityStats";

describe("coerceCommunityStats", () => {
  it("coerces a full row, tolerating string bigints/numerics and a jsonb dist", () => {
    const s = coerceCommunityStats({
      owners: "52",
      playing: 2,
      backlog: "31",
      finished: 17,
      wishlist: "9",
      review_count: 8,
      rating_count: "14",
      avg_score: "7.5",
      hours_total: "420",
      hours_avg: "12.3",
      dist: { "7": 3, "8": "5", "10": 6 },
      likes: "6",
    });
    expect(s.owners).toBe(52);
    expect(s.backlog).toBe(31);
    expect(s.ratingCount).toBe(14);
    expect(s.avgHalfStars).toBeCloseTo(7.5);
    expect(s.hoursTotal).toBe(420);
    expect(s.hoursAvg).toBeCloseTo(12.3);
    expect(s.dist).toEqual({ 7: 3, 8: 5, 10: 6 });
    expect(s.likes).toBe(6);
  });

  it("yields all-zero stats for a null/empty row rather than crashing", () => {
    const s = coerceCommunityStats(null);
    expect(s.owners).toBe(0);
    expect(s.avgHalfStars).toBeNull();
    expect(s.hoursAvg).toBeNull();
    expect(s.dist).toEqual({});
    expect(s.likes).toBe(0);
  });
});

describe("coerceGameLikers", () => {
  it("coerces rows, defaults a blank name, and drops malformed entries", () => {
    const likers = coerceGameLikers([
      {
        user_id: "u1",
        display_name: "Rey",
        avatar_url: "a.png",
        liked_at: "2026-07-04T00:00:00Z",
      },
      { user_id: "u2", display_name: "", avatar_url: null, liked_at: null },
      { display_name: "no-id" },
      null,
    ]);
    expect(likers).toHaveLength(2);
    expect(likers[0]).toEqual({
      userId: "u1",
      displayName: "Rey",
      avatarUrl: "a.png",
      likedAt: Date.parse("2026-07-04T00:00:00Z"),
    });
    expect(likers[1].displayName).toBe("Player");
  });

  it("returns [] for a non-array payload", () => {
    expect(coerceGameLikers(null)).toEqual([]);
  });
});

describe("hasCommunityData", () => {
  const base = coerceCommunityStats(null);
  it("is false when nobody owns, wishlists, or rates it", () => {
    expect(hasCommunityData(base)).toBe(false);
  });
  it("is true as soon as anyone owns, wishlists, or rates it", () => {
    expect(hasCommunityData({ ...base, owners: 1 })).toBe(true);
    expect(hasCommunityData({ ...base, wishlist: 1 })).toBe(true);
    expect(hasCommunityData({ ...base, ratingCount: 1 })).toBe(true);
  });
});

describe("formatAvgScore", () => {
  it("renders half-star units as a one-decimal /5 score", () => {
    expect(formatAvgScore(7.5)).toBe("3.8"); // 7.5/2 = 3.75 → 3.8
    expect(formatAvgScore(8)).toBe("4.0");
    expect(formatAvgScore(10)).toBe("5.0");
  });
});

describe("distributionBars", () => {
  it("always returns ten bars (units 1–10) with heights relative to the tallest", () => {
    const bars = distributionBars({ 8: 10, 6: 5, 2: 0 });
    expect(bars).toHaveLength(10);
    expect(bars[7]).toEqual({ unit: 8, count: 10, pct: 100 }); // tallest
    expect(bars[5]).toEqual({ unit: 6, count: 5, pct: 50 });
    expect(bars[0]).toEqual({ unit: 1, count: 0, pct: 0 });
  });

  it("does not divide by zero on an empty distribution", () => {
    const bars = distributionBars({});
    expect(bars.every((b) => b.count === 0 && b.pct === 0)).toBe(true);
  });
});

describe("formatHours", () => {
  it("rounds a total to whole hours and an average to one decimal", () => {
    expect(formatHours(419.6)).toBe("420h");
    expect(formatHours(12.34, true)).toBe("12.3h");
    expect(formatHours(3, true)).toBe("3h");
  });
});
