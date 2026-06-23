// Pure helpers for Import Charters — the economic license a user spends to move
// a game from the Wishlist into their active Bazaar. The cost and resale percent
// are admin-tuned (app_config) and live in the store; these helpers only do the
// math and the can/can't checks, so they're unit-testable offline. The server
// RPCs (buy_charter / sell_charter / import_with_charter) remain the source of
// truth for the actual economy mutations.

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
