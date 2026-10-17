// The logged-time gate on finish bounties (coin outliers, 2026-10-17). A finish
// with less than the gate share of a game's length logged pays the activation
// refund — or the logged share of the bounty, if that's more — and holds the
// rest; logging more time releases it in proportion, all of it at the gate.
// Nothing is ever taken back. The server is authoritative (apply_finish and
// the games_release_bounty trigger in supabase/schema.sql); these mirror its
// math for the offline (guest) mode and the previews, so both land on the same
// whole coins.

import type { Game } from "../types";
import { effectiveLength } from "./personalLength";

/** Default share of a game's length (percent) that releases the whole bounty. */
export const DEFAULT_BOUNTY_GATE_PCT = 25;

/** The logged hours that release a finish's whole bounty, or null when the
 *  gate doesn't apply (it's off, or the game has no length). */
export function bountyGateHours(length: number | undefined, gatePct: number): number | null {
  if (!length || length <= 0 || gatePct <= 0) return null;
  return (gatePct / 100) * length;
}

/** How much of a finish's net bounty waits for logged time: the bounty minus
 *  what it pays now (the activation refund or the logged share, whichever is
 *  more). 0 once the gate share is logged. Mirrors apply_finish. */
export function heldAtFinish(opts: {
  net: number;
  pricePaid: number | undefined;
  played: number;
  gateHours: number | null;
}): number {
  const { net, pricePaid, played, gateHours } = opts;
  if (net <= 0 || gateHours == null || played >= gateHours) return 0;
  const upfront = Math.max(Math.min(pricePaid ?? 0, net), Math.round((net * played) / gateHours));
  return net - upfront;
}

/** Coins a rise in logged hours releases from a held bounty: the share the new
 *  total earns, less what's already been paid, never more than is held. Mirrors
 *  games_release_bounty. */
export function bountyRelease(opts: {
  total: number;
  held: number;
  gateHours: number;
  played: number;
}): number {
  const { total, held, gateHours, played } = opts;
  if (held <= 0 || gateHours <= 0) return 0;
  const paid = total - held;
  const target = Math.min(total, Math.max(paid, Math.round(total * Math.min(1, played / gateHours))));
  return Math.min(held, target - paid);
}

/** A clear whose logged time reaches the gate share of its length — the
 *  "verified" mark on finished games. Unknown when the game has no length. */
export function isVerifiedClear(
  game: Pick<Game, "playedHours" | "personalHours" | "hours">,
  gatePct: number,
): boolean | null {
  const gate = bountyGateHours(effectiveLength(game), gatePct);
  if (gate == null) return null;
  return (game.playedHours ?? 0) >= gate;
}
