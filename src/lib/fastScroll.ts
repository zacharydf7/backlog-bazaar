// Fast-scroll rail logic for long mobile boards (issue d2444c65): everything
// the rail needs to map a finger position on its track to a card in the
// board's ordered list, and to caption the jump overlay. The rail renders in
// one of two modes keyed off the active sort — an A–Z letter index under the
// alphabetical sort, or a draggable scrubber (with a metric caption: "Jul
// 2026", "~50h", "120 coins") under every other sort. Pure and React-free so
// the mapping is unit-testable; the component (components/FastScrollRail.tsx)
// only handles pointer events and rendering.

import type { Game } from "../types";
import type { StackedBoardCard } from "./gameStacks";
import { sortMetric, type EconomyViewContext, type SortKey } from "./bazaarView";
import { DEFAULT_ECONOMY, type EconomyConfig } from "./economy";
import { formatPlaytime } from "./playtime";
import { cardTitle } from "./boardOrder";

/** Which face the rail wears: a letter index for the A–Z sort, a scrubber
 *  handle for every metric sort. */
export type RailMode = "alpha" | "scrub";

export function railMode(sort: SortKey): RailMode {
  return sort === "alpha" ? "alpha" : "scrub";
}

/** The displayed title of ANY board card, including the stacking view's
 *  synthetic cards (a deck reads as its first instance's title). */
export function stackedCardTitle(card: StackedBoardCard): string {
  switch (card.kind) {
    case "stack":
      return card.games[0]?.title ?? "";
    case "fanned":
      return card.game.title;
    default:
      return cardTitle(card);
  }
}

/** The games a card stands in for — the same member rule boardOrder places
 *  units by, so the scrubber captions a card with the value that put it there. */
export function cardGames(card: StackedBoardCard): Game[] {
  switch (card.kind) {
    case "game":
    case "fanned":
      return [card.game];
    case "stack":
      return card.games;
    case "family":
      return card.family.members;
    case "compilation":
      return card.collapsed.children;
  }
}

/** The index bucket for a title: its first letter uppercased, or "#" for
 *  anything not starting A–Z (digits, symbols). */
export function letterOf(title: string): string {
  const ch = title.trim().charAt(0).toUpperCase();
  return ch >= "A" && ch <= "Z" ? ch : "#";
}

/** One tappable rung of the A–Z index: a letter and the first card index that
 *  starts with it. */
export interface LetterEntry {
  letter: string;
  index: number;
}

/** The rail's letter rungs, derived from the cards' actual order (only letters
 *  that exist on the board appear, and in board order — so the index always
 *  agrees with the list, whatever the locale collation did). */
export function letterEntries(cards: StackedBoardCard[]): LetterEntry[] {
  const out: LetterEntry[] = [];
  const seen = new Set<string>();
  cards.forEach((card, index) => {
    const letter = letterOf(stackedCardTitle(card));
    if (!seen.has(letter)) {
      seen.add(letter);
      out.push({ letter, index });
    }
  });
  return out;
}

/** Where a pointer sits on the track, as 0..1 of its height. Degenerate
 *  geometry or a coordinate-less event (jsdom) pins to the top rather than
 *  going NaN. */
export function trackFraction(clientY: number, rect: { top: number; height: number }): number {
  if (!Number.isFinite(clientY) || rect.height <= 0) return 0;
  return Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
}

/** The letter rung under a track fraction. The rungs render evenly spaced
 *  (flex-1 each), so an even split of the fraction lands on the letter under
 *  the finger. */
export function entryForFraction(entries: LetterEntry[], fraction: number): LetterEntry | null {
  if (entries.length === 0) return null;
  const i = Math.min(entries.length - 1, Math.max(0, Math.floor(fraction * entries.length)));
  return entries[i];
}

/** The card index a scrubber fraction maps to: 0 at the top of the track, the
 *  last card at the bottom. */
export function indexForFraction(fraction: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, Math.round(fraction * (total - 1))));
}

/** The big center-overlay caption while scrubbing: the card's value under the
 *  active sort, formatted for humans — the letter on A–Z, "Jul 2026" on the
 *  date sorts, "~50h" on playtime, "120 coins" on the coin-value sorts. Uses
 *  the same best-member rule boardOrder placed the card by, so the caption is
 *  the value that actually positioned it. */
export function scrubLabel(
  card: StackedBoardCard,
  sort: SortKey,
  economy: EconomyConfig = DEFAULT_ECONOMY,
  ctx: EconomyViewContext = {},
): string {
  if (sort === "alpha") return letterOf(stackedCardTitle(card));
  const metric = sortMetric(sort, economy, ctx);
  if (!metric) return letterOf(stackedCardTitle(card));
  const games = cardGames(card);
  if (games.length === 0) return "—";
  const values = games.map(metric.value);
  const v = metric.dir === 1 ? Math.min(...values) : Math.max(...values);
  switch (sort) {
    case "added-asc":
    case "added-desc":
      if (!v) return "—";
      return new Date(v).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    case "playtime-asc":
      return `~${formatPlaytime(v)}`;
    case "cost-asc":
    case "bounty-desc":
      return `${Math.round(v)} coins`;
    default:
      return "—";
  }
}
