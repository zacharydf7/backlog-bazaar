// Prev/Next browsing across a game's page (issue 7ad49282). When you open a
// game from a board (the Bazaar/Finished boards or the Master Ledger), the page
// remembers that board's order so you can step to the previous/next game without
// backing out to click the next card. Pure here so it's unit-tested without the
// DOM; App builds the sequence and the pages render the controls.
//
// A board can also show collapsed-compilation cards, which open a bundle page
// rather than a game page (issue 28ec4975). The sequence therefore walks tagged
// "stops" — each either a game or a compilation — so Prev/Next steps through the
// bundle cards too instead of skipping them, matching what happens when the
// bundle is expanded into its individual game cards.

import type { StackedBoardCard } from "./gameStacks";

/** The DOM id a game's board/ledger card carries, so returning from its page can
 *  scroll it back into view (issue 86dce059). One shared helper keeps every
 *  surface — the card grids, the Now Playing board, and the Master Ledger — using
 *  the same anchor the App's scroll-restore looks up. */
export const boardGameAnchor = (id: string) => `np-game-${id}`;

/** One position in a browse sequence: a game (opens its game page) or a
 *  collapsed compilation (opens its bundle page). Kept distinct because game and
 *  compilation ids are separate id-spaces and open different routes. */
export interface PageNavStop {
  kind: "game" | "compilation";
  id: string;
}

/** An ordered list of stops to browse, plus a human label for the source board
 *  ("Bazaar", "Finished", "Master Ledger") shown in the page's position
 *  caption. */
export interface PageNav {
  stops: PageNavStop[];
  label: string;
}

/** Where a stop sits in a browse sequence and who its neighbours are. `position`
 *  is 1-based (0 when the stop isn't in the list — e.g. opened from search, so
 *  the caller hides the controls). */
export interface Neighbors {
  prev: PageNavStop | null;
  next: PageNavStop | null;
  position: number;
  total: number;
}

/** Locate `current` in `stops` (matched by kind + id) and report its neighbours. */
export function neighbors(stops: PageNavStop[], current: PageNavStop): Neighbors {
  const i = stops.findIndex((s) => s.kind === current.kind && s.id === current.id);
  const total = stops.length;
  if (i < 0) return { prev: null, next: null, position: 0, total };
  return {
    prev: i > 0 ? stops[i - 1] : null,
    next: i < total - 1 ? stops[i + 1] : null,
    position: i + 1,
    total,
  };
}

/** Where to send the reader after they delete the game they're viewing, so the
 *  page steps to a neighbouring card instead of dumping them back on the board
 *  (issue 546c0de8): the previous stop, or — when deleting the first — the one
 *  that becomes the new first (the next stop). Null when there's no browse
 *  sequence, the game isn't in it, or it was the only stop, in which case the
 *  caller leaves the page as before. */
export function afterRemovalTarget(
  stops: PageNavStop[],
  current: PageNavStop,
): PageNavStop | null {
  const { prev, next } = neighbors(stops, current);
  return prev ?? next;
}

/** The ordered stops reachable from a board's cards, in the exact order they're
 *  displayed. A plain game, a fanned stack member and a family card each open a
 *  game page; a collapsed compilation card opens its bundle page (issue
 *  28ec4975). A collapsed same-game stack deck fans out rather than opening a
 *  page itself, but its members each have one — so the deck contributes every
 *  member as a stop, in deck order, exactly as if it were fanned (issue
 *  28ec4975 follow-up: Prev/Next used to skip stacked games entirely). */
export function boardCardStops(cards: StackedBoardCard[]): PageNavStop[] {
  const stops: PageNavStop[] = [];
  for (const card of cards) {
    if (card.kind === "game" || card.kind === "fanned") {
      stops.push({ kind: "game", id: card.game.id });
    } else if (card.kind === "family") {
      stops.push({ kind: "game", id: card.family.primary.id });
    } else if (card.kind === "compilation") {
      stops.push({ kind: "compilation", id: card.collapsed.compilation.id });
    } else if (card.kind === "stack") {
      for (const game of card.games) stops.push({ kind: "game", id: game.id });
    }
  }
  return stops;
}
