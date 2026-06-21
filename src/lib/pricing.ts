import type { GameMeta } from "../types";

/**
 * All economy knobs live here. Tune these to change how the game "feels".
 * The design intent:
 *   - Newer + longer games cost MORE  -> tempting games are expensive, so
 *     old/short backlog games are cheap and easy to clear first.
 *   - You earn a TRICKLE of coins for every hour you log while playing, plus a
 *     flat bonus for finishing. Progress is rewarded as you go, not just in one
 *     lump at the end. You must PLAY to EARN to BUY, which stops you
 *     binge-starting games.
 */
export const PRICING = {
  base: 40, // every game costs at least this
  hoursWeight: 3, // coins added per hour of length
  recencyMax: 120, // extra coins for a brand-new release...
  recencyDecayYears: 8, // ...fading linearly to 0 over this many years
  defaultHours: 12, // assumed length when a game has no playtime data
};

export const REWARD = {
  base: 40, // flat completion bonus for finishing anything
};

export const TRICKLE = {
  perHour: 8, // coins earned per hour of play logged (see log_playtime in schema.sql)
};

export const STARTING_COINS = 120;

/** Years elapsed since a release date (0 if unknown/future). */
function yearsSince(released?: string): number | null {
  if (!released) return null;
  const t = new Date(released).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / (365.25 * 24 * 60 * 60 * 1000));
}

export interface PriceBreakdown {
  total: number;
  base: number;
  length: number;
  recency: number;
}

/** Cost (in coins) to buy a game out of the backlog. */
export function priceBreakdown(game: GameMeta): PriceBreakdown {
  const hours = game.hours ?? PRICING.defaultHours;
  const length = hours * PRICING.hoursWeight;

  const years = yearsSince(game.released);
  const recency =
    years === null
      ? 0
      : Math.max(0, PRICING.recencyMax * (1 - years / PRICING.recencyDecayYears));

  return {
    base: Math.round(PRICING.base),
    length: Math.round(length),
    recency: Math.round(recency),
    total: Math.round(PRICING.base + length + recency),
  };
}

export function computePrice(game: GameMeta): number {
  return priceBreakdown(game).total;
}

/** Flat completion bonus for finishing a game (length is rewarded via the
 *  per-hour trickle while playing — see computeTrickle). */
export function computeReward(): number {
  return REWARD.base;
}

/** Coins earned for logging a stretch of play time. */
export function computeTrickle(hours: number): number {
  return Math.round(hours * TRICKLE.perHour);
}

/** Rough total coins you'll earn over a playthrough: the flat completion bonus
 *  plus the trickle for the game's estimated length. The real payout depends on
 *  how many hours you actually log, so this is only an estimate. */
export function computeEstimatedPayout(game: GameMeta): number {
  const hours = game.hours ?? PRICING.defaultHours;
  return REWARD.base + computeTrickle(hours);
}
