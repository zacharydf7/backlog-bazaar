// "Money Well Spent" value tracking (issue 6c60c213): purely-derived metrics
// comparing what a game cost in real money (the USD acquisition costs on its
// copies — informational metadata, never the coin economy) against the hours
// logged on it, judged by the player's personal Target Cost Per Hour
// (profiles.target_cost_per_hour; null/0 = feature off).
//
// Everything here is derived on the fly from live library state — nothing is
// persisted per game, so changing the target retroactively re-judges every
// card and every stat with no recalculation step. Pure so it's unit-tested
// offline; the badge/stat components just render what these return.

import type { Game } from "../types";
import { totalCost } from "./copies";

/** A game's value verdict against the player's target, or null when the logic
 *  doesn't apply (no target set, or a zero-cost game — free-to-play, Player 2
 *  copies, unpriced imports — which bypass value judgement entirely). */
export interface ValueStatus {
  /** True once logged playtime has "paid off" the purchase at the target rate. */
  met: boolean;
  /** USD actually spent on this game (summed copy costs). Always > 0 here. */
  spend: number;
  /** Hours logged so far. */
  hours: number;
  /** Hours required to hit the target: spend ÷ target rate. */
  targetHours: number;
  /** The effective rate paid so far: spend ÷ hours (null while unplayed). */
  costPerHour: number | null;
  /** The value extracted so far in USD at the target rate: hours × target —
   *  the requester's "Value Played" figure. Meets the goal once ≥ spend. */
  valuePlayed: number;
  /** Hours still to log before the goal is met (0 once it is). */
  remainingHours: number;
}

/** True when a target is set and usable (a positive $/hour rate). */
export function hasValueTarget(target: number | null | undefined): target is number {
  return typeof target === "number" && Number.isFinite(target) && target > 0;
}

/** Judge one game (or a family/bundle rollup — pass the summed spend/hours)
 *  against the target rate. Null when the target is off or nothing was spent. */
export function valueStatusOf(
  spend: number,
  hours: number,
  target: number | null | undefined,
): ValueStatus | null {
  if (!hasValueTarget(target)) return null;
  if (!(spend > 0)) return null; // zero-cost games bypass the logic entirely
  const h = Math.max(0, hours || 0);
  const targetHours = spend / target;
  return {
    met: h >= targetHours,
    spend,
    hours: h,
    targetHours,
    costPerHour: h > 0 ? spend / h : null,
    valuePlayed: h * target,
    remainingHours: Math.max(0, targetHours - h),
  };
}

/** The value verdict for a single game card. Wishlist entries are unowned —
 *  their (rare) recorded costs are hunting notes, not purchases — so they're
 *  never judged. */
export function gameValueStatus(game: Game, target: number | null | undefined): ValueStatus | null {
  if (game.status === "wishlist") return null;
  return valueStatusOf(totalCost(game.copies), game.playedHours ?? 0, target);
}

/** Format a $/hour rate for display, e.g. "$1.87/hr". */
export function formatRate(rate: number): string {
  return `$${rate.toFixed(2)}/hr`;
}

/** USD with thousands grouping and cents always shown, e.g. "$1,234.00". */
export function usd(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The badge tooltip's math breakdown, e.g.
 *  "Goal met: $60.00 spent ÷ 32h played = $1.88/hr (target $2.00/hr)". */
export function valueTooltip(v: ValueStatus, target: number): string {
  const hours = `${roundHours(v.hours)}h played`;
  const rate = v.costPerHour != null ? formatRate(v.costPerHour) : "—";
  return `Goal met: ${usd(v.spend)} spent ÷ ${hours} = ${rate} (target ${formatRate(target)})`;
}

/** The Value Played breakdown shown on the game page's spend rollup, e.g.
 *  "Value played: $7.50/hr target × 10.65h played = $79.88". */
export function valuePlayedTooltip(v: ValueStatus, target: number): string {
  return `Value played: ${formatRate(target)} target × ${roundHours(v.hours)}h played = ${usd(v.valuePlayed)}`;
}

/** Hours shown in the tooltip: whole numbers stay whole, fractions keep one
 *  decimal ("32h", "12.5h"). */
function roundHours(h: number): number {
  return Math.round(h * 10) / 10;
}

/** The Master Ledger's "Financials" rollup for the games currently in view.
 *  Recomputed from whatever subset the active filters/search produce, so the
 *  numbers always describe exactly the cards below (like the rest of the
 *  stats bar). */
export interface ValueFinancials {
  /** Cumulative USD purchase cost across the games in view. */
  totalSpent: number;
  /** Spend ÷ hours across PAID games only — zero-cost games are excluded from
   *  the denominator too, so a free game's hours can't flatter the rate. Null
   *  until there's both spend and playtime to divide. */
  costPerHour: number | null;
  /** Games in view whose "Money Well Spent" goal is met. */
  wellSpent: number;
  /** Games in view eligible for judgement (a positive spend; target set). The
   *  percentage base for wellSpent. */
  eligible: number;
  /** wellSpent ÷ eligible as a 0–100 integer (0 when nothing is eligible). */
  wellSpentPct: number;
}

/** Compute the financial rollup for the current ledger view. `target` only
 *  gates the well-spent judgement — total spend and cost-per-hour are always
 *  available. */
export function valueFinancials(games: Game[], target: number | null | undefined): ValueFinancials {
  let totalSpent = 0;
  let paidHours = 0;
  let wellSpent = 0;
  let eligible = 0;
  for (const g of games) {
    const spend = totalCost(g.copies);
    if (!(spend > 0)) continue; // zero-cost: bypass everything (never skews)
    totalSpent += spend;
    paidHours += Math.max(0, g.playedHours ?? 0);
    if (hasValueTarget(target)) {
      eligible++;
      if ((g.playedHours ?? 0) >= spend / target) wellSpent++;
    }
  }
  return {
    totalSpent,
    costPerHour: totalSpent > 0 && paidHours > 0 ? totalSpent / paidHours : null,
    wellSpent,
    eligible,
    wellSpentPct: eligible === 0 ? 0 : Math.round((wellSpent / eligible) * 100),
  };
}
