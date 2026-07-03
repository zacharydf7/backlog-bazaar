// Pure logic for the focused Game Family board view: folding a family's member
// editions into ONE focused card on the board of its most-active member, so
// the board shows a single entry with the active edition's controls inline and
// the other editions tucked behind an expander. Like the collapsed-compilation
// rollup, the focused family is a VIEW-LAYER construct — never a games row —
// but unlike a rollup it is fully actionable: the card embeds the
// representative member's own GameActions. A per-family `familySplit` flag
// (denormalized on games, toggled in the Family hub) restores the old
// one-card-per-edition rendering as the escape hatch. Kept free of
// React/Supabase so it's directly unit-tested.

import type { Game, GameStatus } from "../types";
import {
  familyCoverOf,
  familyName,
  familyStats,
  isFamilySplit,
  representativeMember,
  type FamilyStats,
} from "./families";
import { gameMatches, type Filters } from "./bazaarView";
import { gameMatchesQuery } from "./librarySearch";

/** A folded family, ready to render as one focused card. */
export interface FocusedFamily {
  familyId: string;
  /** Every visible member, in collection order. */
  members: Game[];
  /** The edition the card expands inline: highest STATUS_PRIORITY (Now
   *  Playing > Bazaar > Wishlist > Finished), tie-broken by earliest-added. */
  representative: Game;
  /** The ONE board the card renders on — the representative's status. */
  board: GameStatus;
  name: string;
  cover?: string;
  stats: FamilyStats;
}

function buildFocusedFamily(familyId: string, members: Game[]): FocusedFamily {
  const representative = representativeMember(members);
  return {
    familyId,
    members,
    representative,
    board: representative.status,
    name: familyName(members),
    cover: familyCoverOf(members),
    stats: familyStats(members),
  };
}

/** Split a board list into individually-rendered games and focused family
 *  cards. A family folds when it has ≥2 visible members AND no member carries
 *  the split flag. Unlinked games, split families, and families reduced to a
 *  single visible member (e.g. by the compilation fold upstream) pass through
 *  untouched. */
export function groupCollapsedFamilies(games: Game[]): {
  boardGames: Game[];
  families: FocusedFamily[];
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
  const families: FocusedFamily[] = [];
  for (const [familyId, members] of byFamily) {
    if (members.length < 2) continue; // a visible family of one is just a card
    if (isFamilySplit(members)) continue; // the escape hatch
    for (const m of members) hidden.add(m.id);
    families.push(buildFocusedFamily(familyId, members));
  }
  if (hidden.size === 0) return { boardGames: games, families: [] };
  return {
    boardGames: games.filter((g) => !hidden.has(g.id)),
    families,
  };
}

/** A family card matches the board search when ANY member matches (plus the
 *  family's own display name), so searching for an old edition still surfaces
 *  the card that now represents it. */
export function familyMatchesQuery(fam: FocusedFamily, query: string): boolean {
  if (!query.trim()) return true;
  if (fam.name.toLowerCase().includes(query.trim().toLowerCase())) return true;
  return fam.members.some((m) => gameMatchesQuery(m, query));
}

/** A family card passes the board slicers when ANY member passes (mirrors
 *  collapsed compilations: hiding the card because one edition fails a filter
 *  would hide editions that pass). */
export function familyMatchesFilters(fam: FocusedFamily, filters: Filters): boolean {
  return fam.members.some((m) => gameMatches(m, filters));
}
