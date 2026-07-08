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

import type { Compilation, Game } from "../types";
import { orderCompilationChildren, type CollapsedCompilation } from "./compilationGrouping";
import type { UnifiedFamily } from "./familyGrouping";
import { sortMetric, type EconomyViewContext, type SortKey } from "./bazaarView";
import { DEFAULT_ECONOMY, type EconomyConfig } from "./economy";

/** Anything a board grid renders as one card. */
export type BoardCard =
  | { kind: "game"; game: Game }
  | { kind: "compilation"; collapsed: CollapsedCompilation }
  | { kind: "family"; family: UnifiedFamily };

/** The title the card displays — what A–Z sorts by and ties break on. */
export function cardTitle(card: BoardCard): string {
  switch (card.kind) {
    case "game":
      return card.game.title;
    case "compilation":
      return card.collapsed.compilation.title;
    case "family":
      return card.family.name;
  }
}

/** One placed item in the board order: one or more cards rendered contiguously,
 *  standing in for `members` when the board sorts. A plain game / collapsed
 *  bundle / family is a single-card unit; a SPLIT compilation the owner has
 *  ordered is a multi-card unit whose cards stay together in that order. */
interface BoardUnit {
  cards: BoardCard[];
  members: Game[];
  /** The title the unit sorts and ties break on under A–Z. For a split-bundle
   *  block it's the alphabetically-first member, so the block slots among its
   *  siblings while still displaying in the owner's order. */
  sortTitle: string;
}

/** Merge a board's plain games, collapsed compilations, and family cards into
 *  the one list its grid renders, ordered by the active sort. Same economy
 *  context contract as sortGames (coin-value sorts price the way the buy
 *  button will). Returns a new array; the inputs are not mutated.
 *
 *  When a compilation is SPLIT (expanded), its now-individual cards are kept
 *  together as one block rather than scattered by the global board sort — in the
 *  owner's saved child order if there is one, otherwise the bundle's natural
 *  order (which is what the parent card shows by default), so a freshly-added
 *  compilation reads in order without any manual reordering (issue 140ac868).
 *  `compilations` supplies the saved orders; the grouping itself keys off each
 *  game's `compilationId`. */
export function orderBoardCards(
  games: Game[],
  collapsed: CollapsedCompilation[],
  families: UnifiedFamily[],
  key: SortKey,
  economy: EconomyConfig = DEFAULT_ECONOMY,
  ctx: EconomyViewContext = {},
  compilations: Compilation[] = [],
): BoardCard[] {
  const childOrderById = new Map(compilations.map((c) => [c.id, c.childOrder]));

  const units: BoardUnit[] = [];
  // Split (expanded) children of one bundle collect into a single block; every
  // other game is a one-card unit. A game only reaches here as a plain card when
  // its bundle is expanded (collapsed children arrive via `collapsed`).
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
  for (const [compId, members] of byComp) {
    const ordered = orderCompilationChildren(members, childOrderById.get(compId));
    units.push({
      cards: ordered.map((game) => ({ kind: "game" as const, game })),
      members: ordered,
      sortTitle: ordered.reduce((m, g) => (g.title < m ? g.title : m), ordered[0]?.title ?? ""),
    });
  }
  for (const c of collapsed) {
    units.push({
      cards: [{ kind: "compilation", collapsed: c }],
      members: c.children,
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

  const byTitle = (a: BoardUnit, b: BoardUnit) => a.sortTitle.localeCompare(b.sortTitle);
  const metric = sortMetric(key, economy, ctx);
  if (!metric) return units.sort(byTitle).flatMap((u) => u.cards);

  // Best-placed member: min of the members' values ascending, max descending.
  // A unit with no members (can't normally happen — empty bundles are skipped
  // upstream) sinks to the end rather than throwing.
  const values = new Map<BoardUnit, number>(
    units.map((unit) => {
      const v =
        unit.members.length === 0
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
