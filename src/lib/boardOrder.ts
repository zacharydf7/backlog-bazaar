// One ordered list for a board's grid: plain game cards, collapsed compilation
// rollups, and unified Family cards interleaved under the active sort — the
// synthetic cards used to render pinned to the grid's head, ignoring the sort
// entirely ("Pikmin 1+2 Bundle stays in the first slot on A–Z").
//
// A folded card sorts by its BEST-PLACED member: exactly where its
// first-appearing game would land under the active sort (cheapest child for
// Fee↑, biggest child bounty for Bounty↓, …). That's the ordering analog of
// the existing filter rule — a card stands in for its members and passes when
// any member passes — so you never scroll past a bundle whose game should
// already have appeared. A–Z instead uses the card's DISPLAYED title (the
// bundle/family name is what the eye scans for). Pure; unit-tested offline.

import type { Game } from "../types";
import type { CollapsedCompilation } from "./compilationGrouping";
import type { UnifiedFamily } from "./familyGrouping";
import { expansionSortValue, type BazaarExpansion } from "./bazaarExpansions";
import { sortMetric, type EconomyViewContext, type SortKey } from "./bazaarView";
import { DEFAULT_ECONOMY, type EconomyConfig } from "./economy";

/** Anything a board grid renders as one card. */
export type BoardCard =
  | { kind: "game"; game: Game }
  | { kind: "compilation"; collapsed: CollapsedCompilation }
  | { kind: "family"; family: UnifiedFamily }
  | { kind: "expansion"; expansion: BazaarExpansion };

/** The title the card displays — what A–Z sorts by and ties break on. */
export function cardTitle(card: BoardCard): string {
  switch (card.kind) {
    case "game":
      return card.game.title;
    case "compilation":
      return card.collapsed.compilation.title;
    case "family":
      return card.family.name;
    case "expansion":
      return card.expansion.dlc.name;
  }
}

/** One placed item in the board order: one or more cards rendered contiguously,
 *  standing in for `members` when the board sorts. A plain game / bundle card /
 *  family is a single-card unit; a visited library's loose bundle children are
 *  a multi-card unit whose cards stay together. */
interface BoardUnit {
  cards: BoardCard[];
  members: Game[];
  /** A Bazaar expansion card, placed by its own values (it stands in for no
   *  games). */
  expansion?: BazaarExpansion;
  /** The title the unit sorts and ties break on under A–Z. For a split-bundle
   *  block it's the alphabetically-first member, so the block slots among its
   *  siblings while still displaying in the owner's order. */
  sortTitle: string;
}

/** Merge a board's plain games, collapsed compilations, family cards and (on
 *  the Bazaar) expansion cards into the one list its grid renders, ordered by
 *  the active sort. Same economy
 *  context contract as sortGames (coin-value sorts price the way the buy
 *  button will). Returns a new array; the inputs are not mutated.
 *
 *  A compilation's loose child cards (a visited library, where bundles aren't
 *  folded) are kept together as one block rather than scattered by the global
 *  board sort, in the bundle's natural order (issue 140ac868). The grouping
 *  keys off each game's `compilationId`. */
export function orderBoardCards(
  games: Game[],
  collapsed: CollapsedCompilation[],
  families: UnifiedFamily[],
  key: SortKey,
  economy: EconomyConfig = DEFAULT_ECONOMY,
  ctx: EconomyViewContext = {},
  expansions: BazaarExpansion[] = [],
): BoardCard[] {
  const units: BoardUnit[] = [];
  // Loose children of one bundle collect into a single block; every other game
  // is a one-card unit. Children only arrive loose where bundles aren't folded
  // (a visited library); the owner's arrive via `collapsed`.
  const byComp = new Map<string, Game[]>();
  for (const game of games) {
    if (game.compilationId != null) {
      const arr = byComp.get(game.compilationId);
      if (arr) arr.push(game);
      else byComp.set(game.compilationId, [game]);
    } else {
      units.push({ cards: [{ kind: "game", game }], members: [game], sortTitle: game.title });
    }
  }
  for (const members of byComp.values()) {
    units.push({
      cards: members.map((game) => ({ kind: "game" as const, game })),
      members,
      sortTitle: members.reduce((m, g) => (g.title < m ? g.title : m), members[0]?.title ?? ""),
    });
  }
  // A bundle card stands in for its children on THIS board only — a finished
  // child's bounty or length says nothing about where the Bazaar card belongs.
  for (const c of collapsed) {
    units.push({
      cards: [{ kind: "compilation", collapsed: c }],
      members: c.boardChildren,
      sortTitle: c.compilation.title,
    });
  }
  for (const family of families) {
    units.push({
      cards: [{ kind: "family", family }],
      members: family.members,
      sortTitle: family.name,
    });
  }
  for (const expansion of expansions) {
    units.push({
      cards: [{ kind: "expansion", expansion }],
      members: [],
      expansion,
      sortTitle: expansion.dlc.name,
    });
  }

  const byTitle = (a: BoardUnit, b: BoardUnit) => a.sortTitle.localeCompare(b.sortTitle);
  const metric = sortMetric(key, economy, ctx);
  if (!metric) return units.sort(byTitle).flatMap((u) => u.cards);

  // Best-placed member: min of the members' values ascending, max descending.
  // An expansion places by its own value. A unit with no value (an expansion
  // under a priority sort; an empty bundle can't normally happen, they're
  // skipped upstream) sinks to the end rather than throwing.
  const values = new Map<BoardUnit, number>(
    units.map((unit) => {
      const v = unit.expansion
        ? (expansionSortValue(unit.expansion, key) ?? metric.dir * Infinity)
        : unit.members.length === 0
          ? metric.dir * Infinity
          : metric.dir === 1
            ? Math.min(...unit.members.map(metric.value))
            : Math.max(...unit.members.map(metric.value));
      return [unit, v];
    }),
  );
  return units
    .sort((a, b) => (values.get(a)! - values.get(b)!) * metric.dir || byTitle(a, b))
    .flatMap((u) => u.cards);
}
