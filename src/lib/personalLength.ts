// Personal length overrides. A player can set their OWN estimate of how long a
// game will take them — say they meant to mainline it but are now going for
// completion — which takes precedence over the shared catalog length in the
// economy (see src/lib/economy.ts unitOf: effective length = personalHours ??
// hours). It never touches the catalog, mirroring how a personal cover overrides
// the shared one.
//
// Because the economy prices a game off its length, changing the personal length
// on a game you're ALREADY PLAYING re-settles the length-driven activation fee:
// lengthening collects the extra fee (charging what you can afford now and
// deferring the rest as a bounty debt), shortening refunds it. The pure math for
// that split — and the guard that stops you collecting bounty for length you
// never paid to activate — lives here so it's directly unit-testable and stays
// identical between the server RPC (set_personal_length) and the offline mirror.

import type { Game } from "../types";

/** The length the economy actually uses for a game: the player's personal
 *  override when set, else the shared catalog length (undefined when neither is
 *  known — callers fall back to DEFAULT_HOURS). */
export function effectiveLength(game: Pick<Game, "personalHours" | "hours">): number | undefined {
  return game.personalHours ?? game.hours;
}

/** Whether a personal override is in force (differs from just following the
 *  catalog). A value equal to the catalog length still counts as "set" — the
 *  player pinned it deliberately. */
export function hasPersonalLength(game: Pick<Game, "personalHours">): boolean {
  return game.personalHours != null;
}

/** The outcome of re-settling a length change on a game you're playing. All
 *  amounts are non-negative whole coins; `settled` is the signed net movement
 *  (negative = charged, positive = refunded) for the ledger. */
export interface LengthSettlement {
  /** Coins charged from the balance right now (the affordable slice of a raise). */
  chargeNow: number;
  /** Coins of a raise you couldn't afford, added to the bounty debt. */
  deferred: number;
  /** Coins refunded to the balance (from a shorten, after clearing debt). */
  refund: number;
  /** The game's resulting length_premium_owed. */
  newOwed: number;
  /** Signed net coin movement: refund − chargeNow. */
  settled: number;
}

/** Split a length-driven activation-fee change into what's charged now, what's
 *  deferred, and what's refunded — the single source of truth shared by the
 *  server RPC and the offline path.
 *
 *  @param priceDelta  change in the length-driven activation fee (signed; a
 *                     raise is positive, a shorten negative)
 *  @param coins       the player's current coin balance
 *  @param owed        the game's current length_premium_owed
 *
 *  Raising: charge as much as the balance allows, defer the shortfall — so a
 *  change never blocks for want of coins. Shortening: cancel outstanding debt
 *  first, then refund the remainder. */
export function settleLengthChange(priceDelta: number, coins: number, owed: number): LengthSettlement {
  const delta = Math.round(priceDelta);
  const have = Math.max(0, Math.round(coins));
  const debt = Math.max(0, Math.round(owed));

  if (delta > 0) {
    const chargeNow = Math.min(delta, have);
    const deferred = delta - chargeNow;
    // Normalise the sign so a zero charge is +0, never −0 (keeps equality clean).
    return { chargeNow, deferred, refund: 0, newOwed: debt + deferred, settled: chargeNow > 0 ? -chargeNow : 0 };
  }
  if (delta < 0) {
    const giveBack = -delta;
    const cancelled = Math.min(debt, giveBack); // clear deferred debt first
    const refund = giveBack - cancelled;
    return { chargeNow: 0, deferred: 0, refund, newOwed: debt - cancelled, settled: refund };
  }
  return { chargeNow: 0, deferred: 0, refund: 0, newOwed: debt, settled: 0 };
}

/** A settlement plus the fee change that produced it — what set_personal_length
 *  (and its preview) needs in one shot. */
export interface LengthChangeSettlement extends LengthSettlement {
  /** The change in the length-driven activation fee (0 when it doesn't settle). */
  priceDelta: number;
}

/** Resolve a personal-length change into its coin settlement, given a way to
 *  price the game at a length. The `priceAt` function is injected (it needs the
 *  live economy formula, kept out of this pure module) so this single code path
 *  drives both the store action and the modal's live preview.
 *
 *  @param priceAt          length-only activation fee at an effective length
 *                          (see economy.lengthActivationFee) — the ONLY term a
 *                          length edit moves, so the settlement recomputes
 *                          identically server-side and can't be spoofed
 *  @param currentEffective the effective length the game is priced at right now
 *                          (personalHours ?? catalog hours)
 *  @param newEffective     the effective length after the change (the new
 *                          personal length, or the catalog length when clearing)
 *  @param coins            current balance
 *  @param owed             current length_premium_owed
 *  @param settles          whether this game re-settles (playing, economy on,
 *                          not free-started, not ongoing) — else it's free */
export function lengthChangeSettlement(opts: {
  priceAt: (hours: number | undefined) => number;
  currentEffective: number | undefined;
  newEffective: number | undefined;
  coins: number;
  owed: number;
  settles: boolean;
}): LengthChangeSettlement {
  const priceDelta = opts.settles ? opts.priceAt(opts.newEffective) - opts.priceAt(opts.currentEffective) : 0;
  return { priceDelta, ...settleLengthChange(priceDelta, opts.coins, opts.owed) };
}

/** The coins docked from a finish bounty to reclaim a game's deferred length
 *  fee: the whole outstanding debt, but never more than the gross bounty (so it
 *  can't push the payout negative). Returned as a non-negative amount to
 *  subtract. */
export function finishBountyOffset(owed: number | undefined, grossReward: number): number {
  const debt = Math.max(0, Math.round(owed ?? 0));
  const gross = Math.max(0, Math.round(grossReward));
  return Math.min(debt, gross);
}
