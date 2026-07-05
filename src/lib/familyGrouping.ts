// Pure logic for the unified Game Family board view: a family's members fold
// into ONE flat, indivisible card — the PRIMARY member's record, on the
// primary's board, wearing the primary's box art and embedding the primary's
// own GameActions — with every other member hidden until the link is severed.
// Unlike the collapsed-compilation rollup, the unified card IS a real game
// card (the primary's); the family only adds aggregated platform tags, a
// subtle badge and the Change Primary / Sever menu tools. Kept free of
// React/Supabase so it's directly unit-tested.

import type { Game, GameStatus } from "../types";
import { familyName, familyPrimary } from "./families";
import { gameMatches, type Filters } from "./bazaarView";
import { gameMatchesQuery } from "./librarySearch";

/** A folded family, ready to render as one unified card. */
export interface UnifiedFamily {
  familyId: string;
  /** Every visible member, in collection order. */
  members: Game[];
  /** The user-designated primary (or, for a legacy family with no designation,
   *  the representative fallback) — the card renders THIS game. */
  primary: Game;
  /** The ONE board the card renders on — the primary's status. */
  board: GameStatus;
  name: string;
}

function buildUnifiedFamily(familyId: string, members: Game[]): UnifiedFamily {
  const primary = familyPrimary(members);
  return {
    familyId,
    members,
    primary,
    board: primary.status,
    name: familyName(members),
  };
}

/** Split a board list into individually-rendered games and unified family
 *  cards. A family folds when it has ≥2 visible members. Unlinked games and
 *  families reduced to a single visible member (e.g. by the compilation fold
 *  upstream) pass through untouched. */
export function groupCollapsedFamilies(games: Game[]): {
  boardGames: Game[];
  families: UnifiedFamily[];
} {
  const byFamily = new Map<string, Game[]>();
  for (const g of games) {
    if (g.familyId == null) continue;
    const list = byFamily.get(g.familyId);
    if (list) list.push(g);
    else byFamily.set(g.familyId, [g]);
  }
  if (byFamily.size === 0) return { boardGames: games, families: [] };

  const hidden = new Set<string>();
  const families: UnifiedFamily[] = [];
  for (const [familyId, members] of byFamily) {
    if (members.length < 2) continue; // a visible family of one is just a card
    for (const m of members) hidden.add(m.id);
    families.push(buildUnifiedFamily(familyId, members));
  }
  if (hidden.size === 0) return { boardGames: games, families: [] };
  return {
    boardGames: games.filter((g) => !hidden.has(g.id)),
    families,
  };
}

/** A family card matches the board search when ANY member matches (plus the
 *  family's own display name), so searching for a hidden edition still surfaces
 *  the card that stands in for it. */
export function familyMatchesQuery(fam: UnifiedFamily, query: string): boolean {
  if (!query.trim()) return true;
  if (fam.name.toLowerCase().includes(query.trim().toLowerCase())) return true;
  return fam.members.some((m) => gameMatchesQuery(m, query));
}

/** A family card passes the board slicers when ANY member passes (mirrors
 *  collapsed compilations: hiding the card because one edition fails a filter
 *  would hide editions that pass). */
export function familyMatchesFilters(fam: UnifiedFamily, filters: Filters): boolean {
  return fam.members.some((m) => gameMatches(m, filters));
}
