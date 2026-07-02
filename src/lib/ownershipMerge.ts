// Unified rendering for overlapping ownership. When you own the same catalog game
// both as a standalone copy and as part of a compilation, those are two separate
// Game records (the standalone is editable and owns the economy; the compilation
// child's cost is managed by the bundle). Rendered naively that's two duplicate
// cards for one game. These pure helpers fold the compilation copy into the
// standalone "master" so the board shows a single unified card — purely a view
// transform: the underlying records are never changed, so every ownership detail
// (and the compilation's cost split) is preserved.

import type { Game, GameStatus } from "../types";

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

// How far along each status is — the merged card for a game owned through several
// compilations reflects its furthest-along copy, so a started/finished copy is never
// hidden behind a backlog one.
const STATUS_RANK: Record<GameStatus, number> = {
  playing: 3,
  finished: 2,
  backlog: 1,
  wishlist: 0,
};

/** Pick the "master" copy of a group: the furthest-along by status, tie-broken by the
 *  earliest added, then the smallest id (so the choice is stable). Assumes a non-empty
 *  list. */
function pickFurthest(games: Game[]): Game {
  return games.reduce((best, g) => {
    const rg = STATUS_RANK[g.status] ?? 0;
    const rb = STATUS_RANK[best.status] ?? 0;
    if (rg !== rb) return rg > rb ? g : best;
    const tg = g.addedAt ?? 0;
    const tb = best.addedAt ?? 0;
    if (tg !== tb) return tg < tb ? g : best;
    return g.id < best.id ? g : best;
  });
}

/** The other copies of the master's game that fold into its single card — every game
 *  in `games` sharing the master's catalog identity that belongs to a compilation
 *  (never the master itself). Empty when the master has no catalog key (an
 *  unidentifiable custom game never absorbs anything). A standalone master absorbs its
 *  compilation children (the standalone always wins). A compilation-copy master only
 *  absorbs its siblings when the group has NO standalone and it's the furthest-along
 *  copy — so the duplicate cards for a game owned only through compilations collapse to
 *  one. First-seen order. */
export function foldedCompilationCopies(games: Game[], master: Game): Game[] {
  const key = catalogKey(master);
  if (!key) return [];
  // The group's other members. `master` may not be present in `games` (e.g. a
  // transient render while switching boards, such as leaving a viewed bazaar), so we
  // exclude it here and add it back explicitly below — never reduce an empty array.
  const others = games.filter((g) => g.id !== master.id && catalogKey(g) === key);
  const compCopies = others.filter((g) => g.compilationId != null);
  if (isStandalone(master)) return compCopies;
  // The master is itself a compilation copy: only fold siblings when nothing standalone
  // claims them and this copy is the group's chosen (furthest-along) master.
  if (others.some(isStandalone)) return [];
  if (pickFurthest([master, ...compCopies]).id !== master.id) return [];
  return compCopies;
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

/** Dedupe a board's games so each catalog game renders as one card. A compilation
 *  copy folds away when another copy of the same game is its master: the standalone
 *  if one exists (it always wins and always shows), otherwise the furthest-along
 *  compilation copy of that game. Standalone records and games with no shared catalog
 *  identity always show. Order-preserving; never mutates or rewrites a record — the
 *  folded copy still exists in the data, just not as its own card. */
export function dedupeOwnership(games: Game[]): Game[] {
  // Per catalog identity: whether a standalone exists, and the chosen master id among
  // the compilation copies (used only when no standalone claims them).
  const groups = new Map<string, Game[]>();
  for (const g of games) {
    const k = catalogKey(g);
    if (!k) continue;
    const arr = groups.get(k);
    if (arr) arr.push(g);
    else groups.set(k, [g]);
  }
  const compMasterByKey = new Map<string, string>();
  for (const [k, group] of groups) {
    if (group.some(isStandalone)) continue; // a standalone is the master; copies hide
    compMasterByKey.set(k, pickFurthest(group.filter((g) => g.compilationId != null)).id);
  }
  return games.filter((g) => {
    if (isStandalone(g)) return true; // standalone records always show
    const k = catalogKey(g);
    if (!k) return true; // no shared identity → its own card
    const compMaster = compMasterByKey.get(k);
    // A standalone in the group → this copy folds into it (no comp master recorded).
    // Otherwise show only the chosen furthest-along copy.
    return compMaster != null && compMaster === g.id;
  });
}

/** Merge each overlapping-ownership group into ONE display row for flat list
 *  views (the Master Ledger): the group's master row with every folded copy's
 *  `copies` concatenated and its playedHours/reward summed — so ownership,
 *  spend, hours and platform facets all reflect the whole group. Games with no
 *  overlap pass through untouched (same object). DISPLAY ONLY: a merged row is
 *  a synthetic composite — never save one. Its `id` stays the master's, so a
 *  detail/edit view must re-look up the real record by id (EditGameModal
 *  already renders folded compilation copies itself, read-only). */
export function mergeOwnershipRows(games: Game[]): Game[] {
  return dedupeOwnership(games).map((master) => {
    const folded = foldedCompilationCopies(games, master);
    if (folded.length === 0) return master;
    return {
      ...master,
      copies: [...(master.copies ?? []), ...folded.flatMap((g) => g.copies ?? [])],
      playedHours:
        (master.playedHours ?? 0) + folded.reduce((sum, g) => sum + (g.playedHours ?? 0), 0),
      reward: (master.reward ?? 0) + folded.reduce((sum, g) => sum + (g.reward ?? 0), 0),
    };
  });
}
