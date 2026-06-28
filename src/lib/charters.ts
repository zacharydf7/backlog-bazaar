// Pure helpers for Import Charters — the economic license a user spends to move
// a game from the Wishlist into their active Bazaar. The cost and resale percent
// are admin-tuned (app_config) and live in the store; these helpers only do the
// math and the can/can't checks, so they're unit-testable offline. The server
// RPCs (buy_charter / sell_charter / import_with_charter) remain the source of
// truth for the actual economy mutations.

import { computeFormula, type FormulaConfig } from "./economy";
import type { Game } from "../types";

/** Default charter economics, matching the app_config defaults. */
export const DEFAULT_CHARTER_COST = 100;
export const DEFAULT_CHARTER_RESALE_PCT = 75;

/** Coins returned when selling a charter back: a depreciated fraction of the
 *  cost, floored and never negative. Mirrors the server's
 *  floor(cost * pct / 100), so the client preview matches the payout. */
export function charterResale(cost: number, pct: number): number {
  const c = Math.max(0, Math.floor(cost));
  const p = Math.max(0, Math.min(100, pct));
  return Math.floor((c * p) / 100);
}

/** You can buy a charter when you can afford its cost. */
export function canBuyCharter(coins: number, cost: number): boolean {
  return coins >= Math.max(0, cost);
}

/** You can sell (or consume) a charter only if you hold at least one. */
export function canSellCharter(charters: number): boolean {
  return charters >= 1;
}

export function canImport(charters: number): boolean {
  return charters >= 1;
}

// ── Overdraft Guard (soft-lock prevention) ──────────────────────────────────
// Optional, non-essential coin sinks (buying an Import Charter) must not be able
// to drain a player below the point of recovery. The danger is insolvency: you
// can't afford to start ANY game in your Bazaar AND have no game already in play
// to finish for income — the progression loop halts. These helpers detect that
// edge so the buy can be refused (UI + store + server all share the same rule).

/** The buy price of the cheapest game currently in the Bazaar (backlog), per the
 *  live price formula — or null when the Bazaar is empty (there's nothing to be
 *  priced out of, so the guard never trips). This is the floor the guard protects:
 *  spending must not drop you below it while you have no income in progress. */
export function cheapestBazaarPrice(games: Game[], priceFormula: FormulaConfig): number | null {
  let min: number | null = null;
  for (const g of games) {
    if (g.status !== "backlog") continue;
    const price = computeFormula(g, priceFormula);
    if (min === null || price < min) min = price;
  }
  return min;
}

/** Count of games actively generating income: playing and NOT live-service /
 *  ongoing. A live-service game pays only periodic check-ins, not a one-shot
 *  finish bounty, so it doesn't rescue you from a soft-lock — hence excluded,
 *  exactly as the spec requires ("not including live-service/ongoing"). */
export function activeIncomeGameCount(games: Game[]): number {
  return games.filter((g) => g.status === "playing" && !g.ongoing).length;
}

/** Whether spending `cost` coins now would soft-lock the player: leave them unable
 *  to afford the cheapest Bazaar game with no income game already in progress.
 *  Returns false (safe) when they have an active income game, or when the Bazaar
 *  is empty. The Overdraft Guard for optional coin sinks. */
export function wouldSoftLock(
  coins: number,
  cost: number,
  cheapestGamePrice: number | null,
  activeIncomeGames: number,
): boolean {
  if (activeIncomeGames > 0) return false; // income is coming — never locked
  if (cheapestGamePrice === null) return false; // empty Bazaar — nothing to lock
  return coins - cost < cheapestGamePrice;
}
