// Optional "Stack by game" board view: per-platform instances of the SAME
// catalog game visually stack into one deck at the position of their
// best-placed member, and clicking a deck fans it out into the individual,
// fully-functional cards (each keeps its own menu, status and actions).
// Purely a view transform layered AFTER sorting/filtering (lib/boardOrder.ts)
// — no record is ever modified, and cards with no shared identity, focused
// family cards and collapsed compilations pass straight through. Pure;
// unit-tested offline.

import type { Game } from "../types";
import type { BoardCard } from "./boardOrder";
import { catalogKey } from "./ownershipMerge";

/** A board card under the stacking view: everything boardOrder emits, plus a
 *  collapsed deck of same-game instances, plus a "fanned" wrapper marking a
 *  member of an opened deck (so the grid can offer re-stacking on the first). */
export type StackedBoardCard =
  | BoardCard
  | { kind: "stack"; stackKey: string; games: Game[] }
  | { kind: "fanned"; stackKey: string; game: Game; first: boolean; count: number };

/** Apply the stacking view to an ordered board: game cards sharing a catalog
 *  identity (2+ on this board) collapse into one deck at their first (i.e.
 *  best-sorted) position — unless the deck's key is in `expanded`, in which
 *  case its members render fanned out, contiguously, in board order. Cards
 *  with no shared identity and synthetic cards are untouched. */
export function stackBoardCards(
  cards: BoardCard[],
  expanded: ReadonlySet<string>,
): StackedBoardCard[] {
  const byKey = new Map<string, Game[]>();
  for (const card of cards) {
    if (card.kind !== "game") continue;
    const key = catalogKey(card.game);
    if (!key) continue;
    const arr = byKey.get(key);
    if (arr) arr.push(card.game);
    else byKey.set(key, [card.game]);
  }

  const seen = new Set<string>();
  const out: StackedBoardCard[] = [];
  for (const card of cards) {
    if (card.kind !== "game") {
      out.push(card);
      continue;
    }
    const key = catalogKey(card.game);
    const group = key ? byKey.get(key) : undefined;
    if (!key || !group || group.length < 2) {
      out.push(card);
      continue;
    }
    if (seen.has(key)) continue; // folded into (or fanned at) its first position
    seen.add(key);
    if (expanded.has(key)) {
      group.forEach((game, i) =>
        out.push({ kind: "fanned", stackKey: key, game, first: i === 0, count: group.length }),
      );
    } else {
      out.push({ kind: "stack", stackKey: key, games: group });
    }
  }
  return out;
}

/** The platforms behind a deck's top card, for its chip tooltip — every
 *  member's platforms, first-seen order, deduped. */
export function stackPlatforms(games: Game[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of games) {
    for (const c of g.copies ?? []) {
      const p = (c.platform ?? "").trim();
      if (!p || seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}
