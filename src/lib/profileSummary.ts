// Profile Hub "Bazaar summary" module data. Pure (no React/Supabase) so it's
// directly unit-tested — it just rolls a games list up into status totals for
// the dashboard.

import type { Game, GameStatus } from "../types";

export interface ProfileSummary {
  /** Total games in the summarized set. */
  total: number;
  /** Count per status (every status present so callers can read any directly). */
  byStatus: Record<GameStatus, number>;
}

const STATUSES: GameStatus[] = ["backlog", "playing", "finished", "wishlist"];

/** Roll a games list up into totals per status for the profile dashboard. */
export function profileSummary(games: Game[]): ProfileSummary {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<GameStatus, number>;
  for (const g of games) {
    if (g.status in byStatus) byStatus[g.status]++;
  }
  return { total: games.length, byStatus };
}
