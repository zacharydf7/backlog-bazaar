// Profile Hub "Recent Activity" data: the latest Beaten and Completed clears,
// newest first, ready for the celebratory feed. Pure (no React/Supabase) so
// the selection/sort logic is unit-tested directly; ProfileHub renders the
// rows. Works for visited profiles too — player_library rows carry the same
// finish fields.

import type { Game } from "../types";

/** A clear worth celebrating. `tag` is what the card's treatment keys on:
 *  a standard Beaten clear or the premium 100% Completed run. */
export interface RecentClear {
  game: Game;
  tag: "beaten" | "completed";
  /** Epoch ms of the clear (games.finished_at). */
  finishedAt: number;
}

/** How many clears the feed shows before "Show all". */
export const RECENT_CLEARS_SHOWN = 5;

/** Every dated Beaten/Completed clear, newest first. Endless conclusions are
 *  a retirement, not a clear — they don't belong in a trophy feed — and a
 *  clear with no recorded date can't be placed on a timeline, so both are
 *  left out. A legacy untagged finish counts as Beaten (the same standard-
 *  clear default the milestone capture and platform bars use). */
export function recentClears(games: Game[]): RecentClear[] {
  const out: RecentClear[] = [];
  for (const g of games) {
    if (g.status !== "finished" || g.finishTag === "endless") continue;
    if (g.finishedAt == null) continue;
    out.push({
      game: g,
      tag: g.finishTag === "completed" ? "completed" : "beaten",
      finishedAt: g.finishedAt,
    });
  }
  return out.sort(
    (a, b) => b.finishedAt - a.finishedAt || a.game.title.localeCompare(b.game.title),
  );
}
