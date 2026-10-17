import { describe, it, expect } from "vitest";
import {
  coerceChallenges,
  completionToastMessage,
  daysLeft,
  metricGoalLabel,
  progressCount,
  progressFraction,
  seasonalDraftProblem,
  seasonalPhase,
  unclaimedChallengeRewards,
  type SeasonalDraft,
} from "./challenges";

/** A list_challenges document, the shape supabase-js returns. */
const DOC = {
  month: "2026-10-01",
  ends_at: "2026-11-01T00:00:00+00:00",
  goal_reward: 25,
  set_bonus: 50,
  menu: [{ key: "finish-two", name: "Two Clears", description: "Finish 2 games", icon: "trophy", target: 2, progress: 1 }],
  picks: [
    { id: "p1", goal_key: "finish-two", name: "Two Clears", target: 2, progress: 2, reward: 25,
      completed_at: "2026-10-10T00:00:00Z", reward_paid_at: null },
    { id: "p2", goal_key: "log-twenty", name: "Twenty Hours", target: 20, progress: 7.25, reward: 25,
      completed_at: null, reward_paid_at: null },
  ],
  bonus: null,
  unclaimed_earlier: [{ id: "e1", name: "Dust It Off", reward: 25 }],
  seasonal: [
    { id: "s1", name: "Autumn Push", description: "", metric: "hours_logged", target: 10,
      starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-31T00:00:00Z", reward: 40,
      badge: { name: "Autumn Champion", icon: "leaf" }, progress: 10, entry_id: "u1",
      completed_at: "2026-10-12T00:00:00Z", reward_paid_at: null },
  ],
};

describe("coerceChallenges", () => {
  it("reads the page document", () => {
    const c = coerceChallenges(DOC)!;
    expect(c.month).toBe("2026-10-01");
    expect(c.picks[0]).toMatchObject({ id: "p1", completedAt: Date.parse("2026-10-10T00:00:00Z"), rewardPaidAt: null });
    expect(c.seasonal[0]).toMatchObject({ entryId: "u1", badge: { name: "Autumn Champion" } });
  });

  it("rejects junk", () => {
    expect(coerceChallenges(null)).toBeNull();
    expect(coerceChallenges({})).toBeNull();
  });
});

describe("daily & weekly goals", () => {
  const goal = (over: Record<string, unknown> = {}) => ({
    id: "q1", cadence: "daily", goal_key: "d-half-hour", name: "Half an Hour", description: "Log 30 minutes of play",
    icon: "clock", target: 0.5, progress: 0.25, reward: 10, completed_at: null, reward_paid_at: null, ...over,
  });

  it("reads today's goal, the week's goals, swaps and the sweep", () => {
    const c = coerceChallenges({
      ...DOC,
      daily: [goal()],
      weekly: [goal({ id: "w1", cadence: "weekly", reward: 25, completed_at: "2026-10-14T00:00:00Z" })],
      daily_swap_used: true,
      weekly_swap_used: false,
      weekly_bonus: { id: "s1", reward: 25, completed_at: "2026-10-15T00:00:00Z", reward_paid_at: null },
      week_ends_at: "2026-10-19T00:00:00Z",
      weekly_sweep: 25,
    })!;
    expect(c.daily).toMatchObject({ id: "q1", cadence: "daily", target: 0.5, progress: 0.25 });
    expect(c.weekly[0]).toMatchObject({ cadence: "weekly", completedAt: Date.parse("2026-10-14T00:00:00Z") });
    expect([c.dailySwapUsed, c.weeklySwapUsed]).toEqual([true, false]);
    // The waiting weekly goal (25) and sweep (25) join the monthly/seasonal 90.
    expect(unclaimedChallengeRewards(c)).toEqual({ count: 5, coins: 140 });
  });

  it("has no daily goal when none was dealt", () => {
    expect(coerceChallenges(DOC)!.daily).toBeNull();
  });
});

describe("unclaimedChallengeRewards", () => {
  it("adds up completed goals, leftovers and completed events still waiting", () => {
    expect(unclaimedChallengeRewards(coerceChallenges(DOC))).toEqual({ count: 3, coins: 90 });
  });

  it("drops paid rewards and counts a waiting bonus", () => {
    const c = coerceChallenges({
      ...DOC,
      picks: [{ ...DOC.picks[0], reward_paid_at: "2026-10-11T00:00:00Z" }],
      bonus: { id: "b1", reward: 50, completed_at: "2026-10-12T00:00:00Z", reward_paid_at: null },
      unclaimed_earlier: [],
      seasonal: [],
    });
    expect(unclaimedChallengeRewards(c)).toEqual({ count: 1, coins: 50 });
    expect(unclaimedChallengeRewards(null)).toEqual({ count: 0, coins: 0 });
  });
});

describe("progress formatting", () => {
  it("caps the bar and keeps one decimal for hours", () => {
    expect(progressFraction(30, 20)).toBe(1);
    expect(progressFraction(5, 0)).toBe(0);
    expect(progressCount(7.25, 20)).toBe("7.2 / 20");
    expect(progressCount(3, 8)).toBe("3 / 8");
    expect(metricGoalLabel("hours_logged", 10)).toBe("Hours logged: 10");
  });

  it("counts days left and tells upcoming, live and ended apart", () => {
    const day = 86_400_000;
    expect(daysLeft(10 * day + 1, 0)).toBe(11);
    expect(daysLeft(0, day)).toBe(0);
    const c = { startsAt: 10, endsAt: 20 };
    expect([seasonalPhase(c, 5), seasonalPhase(c, 15), seasonalPhase(c, 20)]).toEqual(["upcoming", "live", "ended"]);
  });
});

describe("completionToastMessage", () => {
  it("names completions and points at waiting coins", () => {
    expect(completionToastMessage([])).toBeNull();
    expect(completionToastMessage(["Two Clears"], 25)).toBe(
      "Challenge complete — Two Clears! Claim 25 coins in Challenges.",
    );
    expect(completionToastMessage(["A", "B", "C"])).toBe("3 challenges complete!");
  });
});

describe("seasonalDraftProblem", () => {
  const ok: SeasonalDraft = {
    id: null, name: "Winter", description: "", metric: "games_finished", target: 3,
    startsAt: 0, endsAt: 1000, reward: 100, badgeId: null,
  };

  it("accepts a complete draft and explains what's missing", () => {
    expect(seasonalDraftProblem(ok)).toBeNull();
    expect(seasonalDraftProblem({ ...ok, name: " " })).toMatch(/name/);
    expect(seasonalDraftProblem({ ...ok, target: 0 })).toMatch(/target/);
    expect(seasonalDraftProblem({ ...ok, endsAt: 0 })).toMatch(/after the start/);
    expect(seasonalDraftProblem({ ...ok, startsAt: NaN })).toMatch(/start and an end/);
    expect(seasonalDraftProblem({ ...ok, reward: -1 })).toMatch(/reward/);
  });
});
