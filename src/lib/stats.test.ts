import { describe, it, expect } from "vitest";
import {
  timeframeRange,
  netCoins,
  completionPct,
  backlogDeficit,
  STATS_TIMEFRAMES,
} from "./stats";
import type { UserStats } from "../types";

function stats(over: Partial<UserStats> = {}): UserStats {
  return {
    coinsEarned: 0,
    coinsSpent: 0,
    sunkCost: 0,
    hoursPlayed: 0,
    gamesAdded: 0,
    gamesFinished: 0,
    gamesShelved: 0,
    topGame: null,
    topGenre: null,
    topPlatform: null,
    ...over,
  };
}

describe("timeframeRange", () => {
  // 2026-06-23T12:00:00Z, a fixed reference point.
  const now = new Date("2026-06-23T12:00:00Z").getTime();
  const DAY = 24 * 60 * 60 * 1000;

  it("rolls back 7 and 30 days for week/month", () => {
    expect(timeframeRange("week", now).from!.getTime()).toBe(now - 7 * DAY);
    expect(timeframeRange("month", now).from!.getTime()).toBe(now - 30 * DAY);
    expect(timeframeRange("week", now).to.getTime()).toBe(now);
  });

  it("starts year-to-date at Jan 1 of the current year", () => {
    const from = timeframeRange("ytd", now).from!;
    expect(from.getFullYear()).toBe(new Date(now).getFullYear());
    expect(from.getMonth()).toBe(0);
    expect(from.getDate()).toBe(1);
  });

  it("has no lower bound for All-Time", () => {
    expect(timeframeRange("all", now).from).toBeNull();
    expect(timeframeRange("all", now).to.getTime()).toBe(now);
  });

  it("exposes a label for every timeframe", () => {
    expect(STATS_TIMEFRAMES.map((t) => t.value)).toEqual(["week", "month", "ytd", "all"]);
  });
});

describe("derived metrics", () => {
  it("nets cash flow", () => {
    expect(netCoins(stats({ coinsEarned: 300, coinsSpent: 120 }))).toBe(180);
    expect(netCoins(stats({ coinsEarned: 50, coinsSpent: 200 }))).toBe(-150);
  });

  it("computes completion rate, guarding the empty case", () => {
    expect(completionPct(stats({ gamesFinished: 3, gamesShelved: 1 }))).toBe(75);
    expect(completionPct(stats({ gamesFinished: 0, gamesShelved: 0 }))).toBe(0);
    expect(completionPct(stats({ gamesFinished: 1, gamesShelved: 2 }))).toBe(33);
  });

  it("computes backlog deficit (positive = backlog grew)", () => {
    expect(backlogDeficit(stats({ gamesAdded: 5, gamesFinished: 1 }))).toBe(4);
    expect(backlogDeficit(stats({ gamesAdded: 1, gamesFinished: 3 }))).toBe(-2);
  });
});
