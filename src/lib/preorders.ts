// Pre-orders: games you already BOUGHT that aren't out yet. A pre-order lives
// in the BAZAAR (like a console library, it's part of your collection from
// the moment you commit) as a marked backlog row — preorderedAt +
// preorderExpectedOn on the game, kept backlog-only by the server — that is
// LOCKED from starting until release. Everything here is presentation math:
// countdown labels, the pinned-first ordering on the Bazaar board, and the
// chronological "coming up" strip. Dates are local calendar days
// ("YYYY-MM-DD", the milestone convention) — storefronts promise days, not
// instants.

import type { Game } from "../types";
import type { StackedBoardCard } from "./gameStacks";
import { computeFormula, type FormulaConfig } from "./economy";
import { cardGames } from "./fastScroll";
import { todayISO } from "./milestones";

/** Default "Coming up" strip horizon (days until release) — mirrors the
 *  app_config.preorder_strip_days column default; the admin tunes the live
 *  value on the Economy page. */
export const DEFAULT_PREORDER_STRIP_DAYS = 30;

/** Whether a game is a live pre-order: in the Bazaar and marked — i.e. locked
 *  from starting until its release unlock. (The server clears the marker on
 *  any move off the backlog, but reading both keeps offline mode and stale
 *  snapshots honest.) */
export function isPreordered(g: Pick<Game, "status" | "preorderedAt">): boolean {
  return g.status === "backlog" && g.preorderedAt != null;
}

/** Whole days from `today` until the expected date — 0 on the day itself,
 *  negative once it's out. Both are local "YYYY-MM-DD" strings, compared as
 *  calendar days so timezones can't skew the count. */
export function daysUntil(expectedOn: string, today: string = todayISO()): number {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = expectedOn.split("-").map(Number);
  const a = Date.UTC(y1, (m1 ?? 1) - 1, d1 ?? 1);
  const b = Date.UTC(y2, (m2 ?? 1) - 1, d2 ?? 1);
  return Math.round((b - a) / 86_400_000);
}

/** True once a pre-order's expected date has arrived (or passed). A dateless
 *  pre-order is never "out" — there's nothing to count down to. */
export function isPreorderOut(
  g: Pick<Game, "status" | "preorderedAt" | "preorderExpectedOn">,
  today: string = todayISO(),
): boolean {
  return isPreordered(g) && g.preorderExpectedOn != null && daysUntil(g.preorderExpectedOn, today) <= 0;
}

/** The countdown text for a pre-ordered card: "Arrives in 12 days" /
 *  "Arrives tomorrow" / "Out today!" / "Out now!" — or just "Pre-ordered"
 *  when no date is set. */
export function preorderCountdownLabel(
  expectedOn: string | null | undefined,
  today: string = todayISO(),
): string {
  if (!expectedOn) return "Pre-ordered";
  const days = daysUntil(expectedOn, today);
  if (days < 0) return "Out now!";
  if (days === 0) return "Out today!";
  if (days === 1) return "Arrives tomorrow";
  return `Arrives in ${days} days`;
}

/** The Buy & Start fee a pre-order is projected to cost once it unlocks, so
 *  the locked card can answer "how many coins should I have ready?" (issue
 *  35cd8572). Priced with the normal formula but evaluated AT the expected
 *  release day, so the recency factor decays exactly as far as it will have by
 *  arrival; dateless or already-out orders price at the present (they'd unlock
 *  at today's fee). An estimate, not a quote — played hours, rating, or an
 *  admin formula change before release can still move the real fee. */
export function projectedUnlockPrice(
  g: Game,
  priceFormula: FormulaConfig,
  today: string = todayISO(),
  nowMs: number = Date.now(),
): number {
  const days = g.preorderExpectedOn != null ? Math.max(0, daysUntil(g.preorderExpectedOn, today)) : 0;
  return computeFormula(g, priceFormula, nowMs + days * 86_400_000);
}

/** Whether importing this wishlist entry should first ask "did you pre-order
 *  it?" (issue fe5f7f54): the catalog knows a release date and it hasn't
 *  arrived yet — a game you're paying to shelve before it exists is almost
 *  certainly a pre-order. Unknown or passed dates import as usual. */
export function importNeedsPreorderPrompt(
  g: Pick<Game, "status" | "released">,
  today: string = todayISO(),
): boolean {
  return g.status === "wishlist" && g.released != null && daysUntil(g.released, today) > 0;
}

/** Whether the Add flow should offer "This is a pre-order" at all (issue
 *  a264d7d8): with a verified catalog release date that has already passed the
 *  option is just noise — hide it. Custom entries and unknown dates keep the
 *  option (the user knows better than we do). */
export function canOfferPreorder(
  released: string | null | undefined,
  today: string = todayISO(),
): boolean {
  return released == null || daysUntil(released, today) >= 0;
}

/** The "Coming up" strip's games: dated pre-orders arriving within
 *  `horizonDays` (already-out ones included — they're the most urgent chip).
 *  The strip's job is "get your coins and slots ready", so far-off orders
 *  wait their turn and dateless ones (nothing to count down to) stay off it;
 *  both still pin on the board itself. A 0 horizon disables the strip. */
export function comingUpPreorders(
  games: Game[],
  horizonDays: number,
  today: string = todayISO(),
): Game[] {
  if (horizonDays <= 0) return [];
  return upcomingPreorders(games).filter(
    (g) => g.preorderExpectedOn != null && daysUntil(g.preorderExpectedOn, today) <= horizonDays,
  );
}

/** The library's live pre-orders in arrival order: dated ones first (soonest
 *  arrival leading), dateless ones after, ties broken alphabetically. This is
 *  the "coming up" strip's order and the pinned group's internal order. */
export function upcomingPreorders(games: Game[]): Game[] {
  return games
    .filter(isPreordered)
    .sort((a, b) => {
      const da = a.preorderExpectedOn ?? "9999-99-99";
      const db = b.preorderExpectedOn ?? "9999-99-99";
      return da < db ? -1 : da > db ? 1 : a.title.localeCompare(b.title);
    });
}

/** The Bazaar board's pinned-group ordering: cards holding a pre-ordered
 *  game group at the head (soonest arrival first), everything else keeps its
 *  existing board order. Works on the stacked card list so families/stacks
 *  containing a pre-order pin as a unit. */
export function pinPreorderedCards(cards: StackedBoardCard[]): StackedBoardCard[] {
  const arrivalOf = (card: StackedBoardCard): string | null => {
    const marked = cardGames(card).filter(isPreordered);
    if (marked.length === 0) return null;
    return marked
      .map((g) => g.preorderExpectedOn ?? "9999-99-99")
      .sort()[0];
  };
  const pinned: { card: StackedBoardCard; arrival: string; i: number }[] = [];
  const rest: StackedBoardCard[] = [];
  cards.forEach((card, i) => {
    const arrival = arrivalOf(card);
    if (arrival != null) pinned.push({ card, arrival, i });
    else rest.push(card);
  });
  pinned.sort((a, b) => (a.arrival < b.arrival ? -1 : a.arrival > b.arrival ? 1 : a.i - b.i));
  return [...pinned.map((p) => p.card), ...rest];
}
