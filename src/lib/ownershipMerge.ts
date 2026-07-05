// Cross-instance identity and awareness. Every library record is its own
// independent instance — one card per record, with its own status, playtime and
// economy. Records are NEVER folded together: a game owned standalone and again
// inside a compilation renders as two cards (the bundle child keeps its badge
// and bundle-managed cost; the standalone keeps its own economy). What connects
// instances of the same game is purely informational: the shared catalog
// identity (catalogKey) and the "Cleared Elsewhere" marker, which tells you an
// unplayed copy has already been beaten on another instance without ever
// syncing status or coins across records.

import type { Game } from "../types";

/** A game's shared catalog identity — the "same game in the dropdown". RAWG-backed
 *  games key on `rawgId`; community games on `catalogId`. Returns null when neither
 *  is set (a hand-typed custom game has no shared identity, so it never matches
 *  anything). The `r:`/`c:` prefixes keep the two id spaces from ever colliding. */
export function catalogKey(game: Pick<Game, "rawgId" | "catalogId">): string | null {
  if (game.rawgId != null) return "r:" + game.rawgId;
  if (game.catalogId) return "c:" + game.catalogId;
  return null;
}

/** Whether a finished record counts as a genuine clear for cross-instance
 *  awareness: beaten or 100%-completed (a legacy finish with no tag recorded
 *  counts as beaten). "Endless" is a live-service graduation, not a clear, and
 *  "retired" is an admitted non-clear. */
function isClear(game: Game): boolean {
  if (game.status !== "finished") return false;
  const tag = game.finishTag ?? "beaten";
  return tag === "beaten" || tag === "completed";
}

/** The other instance that already cleared this game, if any — drives the
 *  "Cleared Elsewhere" badge on an unplayed copy (backlog/wishlist), giving
 *  historical context without disrupting the copy's own status or bounty.
 *  Matches by shared catalog identity across every record (standalone and
 *  compilation children alike). Prefers a 100% completion over a plain beat,
 *  then the earliest finish, then the smallest id (stable). Strictly
 *  informational: callers must never sync state based on it. */
export function clearedElsewhere(games: Game[], game: Game): Game | null {
  if (game.status !== "backlog" && game.status !== "wishlist") return null;
  const key = catalogKey(game);
  if (!key) return null;
  const clears = games.filter((g) => g.id !== game.id && catalogKey(g) === key && isClear(g));
  if (clears.length === 0) return null;
  return clears.reduce((best, g) => {
    const bc = best.finishTag === "completed" ? 1 : 0;
    const gc = g.finishTag === "completed" ? 1 : 0;
    if (gc !== bc) return gc > bc ? g : best;
    const bt = best.finishedAt ?? Infinity;
    const gt = g.finishedAt ?? Infinity;
    if (gt !== bt) return gt < bt ? g : best;
    return g.id < best.id ? g : best;
  });
}
