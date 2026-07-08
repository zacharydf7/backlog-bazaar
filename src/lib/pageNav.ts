// Prev/Next browsing across a game's page (issue 7ad49282). When you open a
// game from a board (the Bazaar/Finished boards or the Master Ledger), the page
// remembers that board's order so you can step to the previous/next game without
// backing out to click the next card. Pure here so it's unit-tested without the
// DOM; App builds the sequence and GamePage renders the controls.

import type { StackedBoardCard } from "./gameStacks";

/** An ordered list of game ids to browse, plus a human label for the source
 *  board ("Bazaar", "Finished", "Master Ledger") shown in the page's position
 *  caption. */
export interface PageNav {
  ids: string[];
  label: string;
}

/** Where a game sits in a browse sequence and who its neighbours are. `position`
 *  is 1-based (0 when the game isn't in the list — e.g. opened from search, so
 *  the caller hides the controls). */
export interface Neighbors {
  prev: string | null;
  next: string | null;
  position: number;
  total: number;
}

export function neighbors(ids: string[], currentId: string): Neighbors {
  const i = ids.indexOf(currentId);
  const total = ids.length;
  if (i < 0) return { prev: null, next: null, position: 0, total };
  return {
    prev: i > 0 ? ids[i - 1] : null,
    next: i < total - 1 ? ids[i + 1] : null,
    position: i + 1,
    total,
  };
}

/** The ordered game ids reachable as a game page from a board's cards, in the
 *  exact order they're displayed. A card opens the page of: the plain game, a
 *  fanned stack member, or a family's primary edition. Collapsed compilation
 *  cards (their own bundle page) and collapsed stack decks (which fan out rather
 *  than open a page) carry no single game page, so they're skipped — Prev/Next
 *  walks only the cards that actually lead to a game page. */
export function boardCardGameIds(cards: StackedBoardCard[]): string[] {
  const ids: string[] = [];
  for (const card of cards) {
    if (card.kind === "game" || card.kind === "fanned") ids.push(card.game.id);
    else if (card.kind === "family") ids.push(card.family.primary.id);
  }
  return ids;
}
