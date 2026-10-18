// Fast-scroll thumb logic for long mobile boards (issues d2444c65, 3e5eee26):
// everything the thumb needs to decide when to appear, map a finger position to
// a card in the board's ordered list, and caption the bubble beside it with the
// active sort's value ("H", "Jul 2026", "~50h", "120 coins"). Pure and
// React-free so the mapping is unit-testable; the component
// (components/FastScrollRail.tsx) only handles pointer events and rendering.

import type { Game } from "../types";
import type { StackedBoardCard } from "./gameStacks";
import { sortMetric, type EconomyViewContext, type SortKey } from "./bazaarView";
import { DEFAULT_ECONOMY, type EconomyConfig } from "./economy";
import { formatPlaytime } from "./playtime";
import { cardTitle } from "./boardOrder";
import { expansionSortValue } from "./bazaarExpansions";

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
    // An expansion card stands in for no games; it places by its own values.
    case "expansion":
      return [];
  }
}

/** The index bucket for a title: its first letter uppercased, or "#" for
 *  anything not starting A–Z (digits, symbols). */
export function letterOf(title: string): string {
  const ch = title.trim().charAt(0).toUpperCase();
  return ch >= "A" && ch <= "Z" ? ch : "#";
}

/** Where a pointer sits on the track, as 0..1 of its height. Degenerate
 *  geometry or a coordinate-less event (jsdom) pins to the top rather than
 *  going NaN. */
export function trackFraction(clientY: number, rect: { top: number; height: number }): number {
  if (!Number.isFinite(clientY) || rect.height <= 0) return 0;
  return Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
}

/** Where the thumb's centre sits along its travel, as 0..1: the thumb can't
 *  leave the track, so its centre only travels the track height minus its own. */
export function thumbFraction(
  clientY: number,
  rect: { top: number; height: number },
  thumbPx: number,
): number {
  return trackFraction(clientY - thumbPx / 2, { top: rect.top, height: rect.height - thumbPx });
}

/** A run of page scrolling with no pause longer than SCROLL_GAP_MS. */
export interface ScrollRun {
  lastY: number;
  lastT: number;
  /** Distance scrolled so far in this run, in px (either direction). */
  travelled: number;
}

/** A pause this long ends the run — the next scroll starts counting afresh. */
export const SCROLL_GAP_MS = 800;
/** Screens of continuous scrolling before the thumb offers itself. */
export const REVEAL_SCREENS = 2;

/** Fold one scroll event into the current run (or start a new one). */
export function trackScroll(run: ScrollRun | null, y: number, t: number): ScrollRun {
  if (!run || t - run.lastT > SCROLL_GAP_MS) return { lastY: y, lastT: t, travelled: 0 };
  return { lastY: y, lastT: t, travelled: run.travelled + Math.abs(y - run.lastY) };
}

/** Is this run someone hunting through a long list (worth a fast-scroll thumb),
 *  rather than an ordinary flick? */
export function isHuntingScroll(run: ScrollRun, viewportPx: number): boolean {
  return viewportPx > 0 && run.travelled >= REVEAL_SCREENS * viewportPx;
}

/** The card index a scrubber fraction maps to: 0 at the top of the track, the
 *  last card at the bottom. */
export function indexForFraction(fraction: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, Math.round(fraction * (total - 1))));
}

/** The bubble caption while scrubbing: the card's value under the active sort,
 *  formatted for humans — the letter on A–Z, "Jul 2026" on the
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
  const values =
    card.kind === "expansion"
      ? [expansionSortValue(card.expansion, sort)].filter((n): n is number => n != null)
      : cardGames(card).map(metric.value);
  if (values.length === 0) return "—";
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
