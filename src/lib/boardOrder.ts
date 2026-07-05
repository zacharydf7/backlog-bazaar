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

/** The games a card stands in for (a plain card stands in for itself). */
function cardMembers(card: BoardCard): Game[] {
  switch (card.kind) {
    case "game":
      return [card.game];
    case "compilation":
      return card.collapsed.children;
    case "family":
      return card.family.members;
  }
}

/** Merge a board's plain games, collapsed compilations, and family cards into
 *  the one list its grid renders, ordered by the active sort. Same economy
 *  context contract as sortGames (coin-value sorts price the way the buy
 *  button will). Returns a new array; the inputs are not mutated. */
export function orderBoardCards(
  games: Game[],
  collapsed: CollapsedCompilation[],
  families: UnifiedFamily[],
  key: SortKey,
  economy: EconomyConfig = DEFAULT_ECONOMY,
  ctx: EconomyViewContext = {},
): BoardCard[] {
  const cards: BoardCard[] = [
    ...games.map((game) => ({ kind: "game" as const, game })),
    ...collapsed.map((c) => ({ kind: "compilation" as const, collapsed: c })),
    ...families.map((family) => ({ kind: "family" as const, family })),
  ];
  const byTitle = (a: BoardCard, b: BoardCard) => cardTitle(a).localeCompare(cardTitle(b));
  const metric = sortMetric(key, economy, ctx);
  if (!metric) return cards.sort(byTitle);

  // Best-placed member: min of the members' values ascending, max descending.
  // A card with no members (can't normally happen — empty bundles are skipped
  // upstream) sinks to the end rather than throwing.
  const values = new Map<BoardCard, number>(
    cards.map((card) => {
      const members = cardMembers(card);
      const v =
        members.length === 0
          ? metric.dir * Infinity
          : metric.dir === 1
            ? Math.min(...members.map(metric.value))
            : Math.max(...members.map(metric.value));
      return [card, v];
    }),
  );
  return cards.sort(
    (a, b) => (values.get(a)! - values.get(b)!) * metric.dir || byTitle(a, b),
  );
}
