// Profile Hub "Bazaar summary" module data. Pure (no React/Supabase) so it's
// directly unit-tested — it just rolls a games list up into totals and a genre
// breakdown for the dashboard.

import type { Game, GameStatus } from "../types";

/** One slice of the genre breakdown: how many of the games carry this genre, and
 *  that as a percentage of all genre tags counted (so the slices sum to ~100%). */
export interface GenreSlice {
  genre: string;
  count: number;
  pct: number; // 0–100, rounded
}

export interface ProfileSummary {
  /** Total games in the summarized set. */
  total: number;
  /** Count per status (every status present so callers can read any directly). */
  byStatus: Record<GameStatus, number>;
  /** Genre breakdown: the biggest `topGenres` genres, with the remainder folded
   *  into a single "Other" slice. Largest first, ties broken alphabetically. */
  genres: GenreSlice[];
}

const STATUSES: GameStatus[] = ["backlog", "playing", "finished", "wishlist"];

/** Roll a games list up into totals + a genre breakdown for the profile dashboard.
 *  Each game contributes one tally per genre it carries; percentages are of the
 *  total tally count. `topGenres` (default 4) named slices are kept and the rest
 *  pooled into "Other". */
export function profileSummary(games: Game[], opts: { topGenres?: number } = {}): ProfileSummary {
  const topGenres = opts.topGenres ?? 4;

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<GameStatus, number>;
  const counts = new Map<string, number>();
  let totalTags = 0;
  for (const g of games) {
    if (g.status in byStatus) byStatus[g.status]++;
    for (const raw of g.genres ?? []) {
      const genre = raw.trim();
      if (!genre) continue;
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
      totalTags++;
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = sorted.slice(0, topGenres);
  const restCount = sorted.slice(topGenres).reduce((sum, [, c]) => sum + c, 0);

  const pct = (c: number) => (totalTags > 0 ? Math.round((c / totalTags) * 100) : 0);
  const genres: GenreSlice[] = top.map(([genre, count]) => ({ genre, count, pct: pct(count) }));
  if (restCount > 0) genres.push({ genre: "Other", count: restCount, pct: pct(restCount) });

  return { total: games.length, byStatus, genres };
}
