// Pure helpers for the admin Stats dashboard. The heavy aggregation runs
// server-side (supabase/schema.sql — admin_user_stats), so this module only
// turns the timeframe selector into a date range and derives display metrics
// from the rolled-up row. Kept free of React/Supabase so it's unit-tested offline.

import type { UserStats } from "../types";

/** The selectable analytics windows. */
export type StatsTimeframe = "week" | "month" | "ytd" | "all";

export const STATS_TIMEFRAMES: { value: StatsTimeframe; label: string }[] = [
  { value: "week", label: "Past Week" },
  { value: "month", label: "Past Month" },
  { value: "ytd", label: "Year to Date" },
  { value: "all", label: "All-Time" },
];

const DAY = 24 * 60 * 60 * 1000;

/** The half-open [from, to) range a timeframe covers. `from` is null for
 *  All-Time (no lower bound); `to` is always "now". Week/Month are rolling
 *  windows; Year-to-Date starts at Jan 1 of the current (local) year. */
export function timeframeRange(
  tf: StatsTimeframe,
  now: number = Date.now(),
): { from: Date | null; to: Date } {
  const to = new Date(now);
  switch (tf) {
    case "week":
      return { from: new Date(now - 7 * DAY), to };
    case "month":
      return { from: new Date(now - 30 * DAY), to };
    case "ytd":
      return { from: new Date(to.getFullYear(), 0, 1), to };
    case "all":
      return { from: null, to };
  }
}

/** Net cash flow (earned − spent) over the window. */
export function netCoins(s: Pick<UserStats, "coinsEarned" | "coinsSpent">): number {
  return s.coinsEarned - s.coinsSpent;
}

/** Completion rate as a 0–100 integer: finishes ÷ (finishes + drops). 0 when a
 *  game was neither finished nor shelved in the window. */
export function completionPct(s: Pick<UserStats, "gamesFinished" | "gamesShelved">): number {
  const decided = s.gamesFinished + s.gamesShelved;
  return decided === 0 ? 0 : Math.round((s.gamesFinished / decided) * 100);
}

/** Backlog deficit: games added minus games finished. Positive means the
 *  backlog grew faster than it was cleared. */
export function backlogDeficit(s: Pick<UserStats, "gamesAdded" | "gamesFinished">): number {
  return s.gamesAdded - s.gamesFinished;
}
