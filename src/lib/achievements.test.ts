import { describe, it, expect } from "vitest";
import {
  coerceAchievements,
  groupAchievements,
  earnedAchievements,
  displayMedals,
  achievementProgress,
  progressLabel,
  rarityLabel,
  earnedSummary,
  earnToastMessage,
  tierLabel,
  TIER_META,
} from "./achievements";
import type { Achievement } from "../types";

/** A raw RPC row, the shape supabase-js returns (numerics as strings). */
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "a1",
    slug: "first-clear",
    family: "finisher",
    tier: 1,
    name: "First Clear",
    description: "Finish your first game",
    icon: "trophy",
    metric: "games_finished",
    threshold: "1",
    sort: 1,
    earned_at: null,
    metric_value: "0",
    holders: "3",
    players: "20",
    ...over,
  };
}

function ach(over: Partial<Achievement> = {}): Achievement {
  return {
    id: "a1",
    slug: "first-clear",
    family: "finisher",
    tier: 1,
    name: "First Clear",
    description: "Finish your first game",
    icon: "trophy",
    metric: "games_finished",
    threshold: 1,
    sort: 1,
    earnedAt: null,
    metricValue: 0,
    holders: 3,
    players: 20,
    ...over,
  };
}

describe("coerceAchievements", () => {
  it("coerces string numerics and ISO dates from raw RPC rows", () => {
    const [a] = coerceAchievements([
      row({ earned_at: "2026-07-04T12:00:00Z", metric_value: "37.5", threshold: "50" }),
    ]);
    expect(a.threshold).toBe(50);
    expect(a.metricValue).toBe(37.5);
    expect(a.holders).toBe(3);
    expect(a.players).toBe(20);
    expect(a.earnedAt).toBe(Date.parse("2026-07-04T12:00:00Z"));
  });

  it("keeps metricValue null (another player's rows) and tolerates junk", () => {
    const list = coerceAchievements([
      row({ metric_value: null }),
      null,
      "junk",
      { no: "id" },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].metricValue).toBeNull();
  });

  it("orders by catalog sort, then tier, and never returns players=0", () => {
    const list = coerceAchievements([
      row({ id: "b2", slug: "s2", sort: "2", tier: 2, players: "0" }),
      row({ id: "b1", slug: "s1", sort: "2", tier: 1 }),
      row({ id: "a1", slug: "s0", sort: "1", tier: 3 }),
    ]);
    expect(list.map((a) => a.slug)).toEqual(["s0", "s1", "s2"]);
    expect(list[2].players).toBe(1);
  });

  it("returns [] for a non-array payload", () => {
    expect(coerceAchievements(null)).toEqual([]);
    expect(coerceAchievements({})).toEqual([]);
  });
});

describe("groupAchievements / displayMedals", () => {
  const bronze = ach({ id: "1", tier: 1, earnedAt: 100, threshold: 1 });
  const silver = ach({ id: "2", slug: "seasoned", tier: 2, earnedAt: 200, threshold: 10 });
  const gold = ach({ id: "3", slug: "slayer", tier: 3, threshold: 50, metricValue: 12 });
  const otherLocked = ach({
    id: "4",
    slug: "completionist",
    family: "perfectionist",
    tier: 1,
    sort: 2,
    metricValue: 0,
  });

  it("shows the highest earned tier and targets the lowest locked one", () => {
    const [fin, perf] = groupAchievements([bronze, silver, gold, otherLocked]);
    // Silver overwrites Bronze as the displayed medal; Gold is the next target.
    expect(fin.display?.id).toBe("2");
    expect(fin.next?.id).toBe("3");
    expect(fin.earnedCount).toBe(2);
    // A never-earned family displays nothing and targets Bronze.
    expect(perf.display).toBeNull();
    expect(perf.next?.id).toBe("4");
  });

  it("displayMedals returns one medal per family, newest earn first", () => {
    const perfEarned = { ...otherLocked, earnedAt: 300 };
    const medals = displayMedals([bronze, silver, gold, perfEarned]);
    expect(medals.map((m) => m.id)).toEqual(["4", "2"]);
  });

  it("earnedAchievements sorts newest first and drops locked rows", () => {
    expect(earnedAchievements([bronze, silver, gold]).map((a) => a.id)).toEqual(["2", "1"]);
  });
});

describe("progress / rarity / summary formatting", () => {
  it("computes clamped progress and a floor'd label", () => {
    const a = ach({ metricValue: 37.8, threshold: 50 });
    expect(achievementProgress(a)).toBeCloseTo(0.756);
    expect(progressLabel(a)).toBe("37 / 50");
    // Overshoot (metric passed but not yet evaluated) clamps to a full bar.
    expect(achievementProgress(ach({ metricValue: 80, threshold: 50 }))).toBe(1);
    // Unknown progress (another player) yields null.
    expect(achievementProgress(ach({ metricValue: null }))).toBeNull();
    expect(progressLabel(ach({ metricValue: null }))).toBeNull();
  });

  it("formats rarity with a <1% floor and an unearned fallback", () => {
    expect(rarityLabel(ach({ holders: 3, players: 20 }))).toBe("Earned by 15% of players");
    expect(rarityLabel(ach({ holders: 1, players: 500 }))).toBe("Earned by <1% of players");
    expect(rarityLabel(ach({ holders: 0 }))).toBe("Not yet earned by anyone");
  });

  it("summarizes earned counts for the page header", () => {
    expect(earnedSummary([ach({ earnedAt: 1 }), ach({ id: "b", slug: "x" })])).toBe(
      "1 of 2 earned",
    );
  });

  it("labels tiers Bronze/Silver/Gold", () => {
    expect(tierLabel(1)).toBe("Bronze");
    expect(tierLabel(2)).toBe("Silver");
    expect(tierLabel(3)).toBe("Gold");
    expect(TIER_META[3].color).toMatch(/^#/);
  });
});

describe("earnToastMessage", () => {
  it("names one or two earns and collapses a burst into a count", () => {
    expect(earnToastMessage([])).toBeNull();
    expect(earnToastMessage(["First Clear"])).toBe("Achievement unlocked — First Clear!");
    expect(earnToastMessage(["A", "B"])).toBe("Achievements unlocked — A and B!");
    expect(earnToastMessage(["A", "B", "C", "D"])).toBe(
      "4 achievements unlocked — see your Profile!",
    );
  });
});
