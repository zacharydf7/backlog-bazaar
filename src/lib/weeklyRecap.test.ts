import { describe, it, expect } from "vitest";
import { coerceWeeklyRecap, hoursLabel, medalLabel, weekRangeLabel } from "./weeklyRecap";

const ROW = {
  id: "r1",
  week_start: "2026-10-12",
  seen_at: null,
  data: {
    play: { hours: "5.5", days: 2, sessions: 1, top_game: { id: "g", title: "Hades", hours: 3 } },
    clears: { finished: 1, verified: 1, titles: ["Celeste"], streak: 2, best_streak: 5 },
    coins: { earned: 300, spent: 120, top_sources: [{ kind: "bounty", coins: 300 }] },
    progress: {
      achievements: [{ name: "Sworn Record", tier: 3 }],
      goals: ["Two Clears"],
      close: [{ name: "Seasoned Finisher", description: "Finish 10 games", value: 8, threshold: 10 }],
      unclaimed: 25,
    },
  },
};

describe("coerceWeeklyRecap", () => {
  it("reads the stored recap", () => {
    const r = coerceWeeklyRecap(ROW)!;
    expect(r.play).toEqual({ hours: 5.5, days: 2, sessions: 1, topGame: { id: "g", title: "Hades", hours: 3 } });
    expect(r.clears.bestStreak).toBe(5);
    expect(r.coins!.topSources).toEqual([{ kind: "bounty", coins: 300 }]);
    expect(r.progress.achievements).toEqual([{ name: "Sworn Record", tier: 3 }]);
    expect(r.seenAt).toBeNull();
  });

  it("keeps coins null with the economy off, and tolerates gaps", () => {
    const r = coerceWeeklyRecap({ ...ROW, data: { ...ROW.data, coins: null, play: {} } })!;
    expect(r.coins).toBeNull();
    expect(r.play.topGame).toBeNull();
    expect(coerceWeeklyRecap({})).toBeNull();
  });
});

describe("labels", () => {
  it("formats the week, hours and medals", () => {
    expect(weekRangeLabel("2026-10-12")).toMatch(/Oct 12 – 18/);
    expect(weekRangeLabel("2026-09-28")).toMatch(/Sep 28 – Oct 4/);
    expect(hoursLabel(356)).toBe("356h");
    expect(hoursLabel(5.55)).toBe("5.6h");
    expect(medalLabel({ name: "Sworn Record", tier: 3 })).toBe("Gold · Sworn Record");
  });
});
