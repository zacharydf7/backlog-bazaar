// Unified rendering for overlapping ownership. When you own the same catalog game
// both as a standalone copy and as part of a compilation, those are two separate
// Game records (the standalone is editable and owns the economy; the compilation
// child's cost is managed by the bundle). Rendered naively that's two duplicate
// cards for one game. These pure helpers fold the compilation copy into the
// standalone "master" so the board shows a single unified card — purely a view
// transform: the underlying records are never changed, so every ownership detail
// (and the compilation's cost split) is preserved.

import type { Game } from "../types";

/** A game's shared catalog identity — the "same game in the dropdown". RAWG-backed
 *  games key on `rawgId`; community games on `catalogId`. Returns null when neither
 *  is set (a hand-typed custom game has no shared identity, so it never merges with
 *  anything). The `r:`/`c:` prefixes keep the two id spaces from ever colliding. */
export function catalogKey(game: Pick<Game, "rawgId" | "catalogId">): string | null {
  if (game.rawgId != null) return "r:" + game.rawgId;
  if (game.catalogId) return "c:" + game.catalogId;
  return null;
}

/** True for a standalone record (not part of a compilation). The standalone is the
 *  editable, economy-bearing copy and acts as the "master" when a compilation copy
 *  of the same game also exists. */
function isStandalone(game: Pick<Game, "compilationId">): boolean {
  return game.compilationId == null;
}

/** The compilation copies that fold into a standalone master: every game in `games`
 *  that belongs to a compilation AND shares the master's catalog identity. Empty
 *  when `master` isn't standalone or has no catalog key (so an unidentifiable
 *  custom game never absorbs anything). First-seen order. */
export function foldedCompilationCopies(games: Game[], master: Game): Game[] {
  if (!isStandalone(master)) return [];
  const key = catalogKey(master);
  if (!key) return [];
  return games.filter(
    (g) => g.id !== master.id && g.compilationId != null && catalogKey(g) === key,
  );
}

/** The compilation copy whose badge to keep for each distinct bundle, deduped by the
 *  name the user actually sees. Owning the same compilation on two platforms is two
 *  separate Compilation records (each has its own `platform`) with the same title, so
 *  a folded master would otherwise show two identical "Part of X" badges. Collapsing
 *  by name shows one badge per named collection; genuinely different bundles (e.g. an
 *  "Indie Bundle" and "Alwa's Collection") still each get a badge. Platforms are
 *  already disambiguated by the card's platform tags, and every per-platform copy stays
 *  reachable in the detail modal. First-seen order; falls back to compilationId then id
 *  when a name is missing, so unnamed bundles never wrongly merge. */
export function dedupeCompilationBadges(parts: Game[]): Game[] {
  const seen = new Set<string>();
  const out: Game[] = [];
  for (const part of parts) {
    const name = part.compilationName?.trim().toLowerCase();
    const key = name ? "n:" + name : part.compilationId ? "i:" + part.compilationId : "g:" + part.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

/** Dedupe a board's games: drop the compilation copies that fold into a standalone
 *  master of the same game, so overlapping ownership renders as one unified card on
 *  the master's board. A compilation copy with no standalone counterpart is left
 *  alone (it still gets its own card, as before). Order-preserving; never mutates or
 *  rewrites a record — the folded copy still exists in the data, just not as a card. */
export function dedupeOwnership(games: Game[]): Game[] {
  // Catalog identities that have a standalone record — the masters that absorb.
  const standaloneKeys = new Set<string>();
  for (const g of games) {
    if (g.compilationId == null) {
      const k = catalogKey(g);
      if (k) standaloneKeys.add(k);
    }
  }
  return games.filter((g) => {
    if (g.compilationId == null) return true; // standalone records always show
    const k = catalogKey(g);
    return !(k != null && standaloneKeys.has(k)); // hide folded compilation copies
  });
}
