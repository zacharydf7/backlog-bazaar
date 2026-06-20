import type { GameMeta } from "../types";

/**
 * All economy knobs live here. Tune these to change how the game "feels".
 * The design intent:
 *   - Newer + longer + higher-rated games cost MORE  -> tempting games are
 *     expensive, so old/short backlog games are cheap and easy to clear first.
 *   - Finishing a game rewards coins scaled to its length, so you can roughly
 *     afford one new purchase per game you finish. You must FINISH to EARN to
 *     BUY, which stops you binge-starting games.
 */
export const PRICING = {
  base: 40, // every game costs at least this
  hoursWeight: 3, // coins added per hour of length
  recencyMax: 120, // extra coins for a brand-new release...
  recencyDecayYears: 8, // ...fading linearly to 0 over this many years
  ratingWeight: 12, // coins per rating point (RAWG rating is 0–5)
  defaultHours: 12, // assumed length when a game has no playtime data
};

export const REWARD = {
  base: 40, // flat reward for finishing anything
  hoursWeight: 8, // coins per hour of length
  defaultHours: 12,
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
  rating: number;
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

  const rating = (game.rating ?? 0) * PRICING.ratingWeight;

  return {
    base: Math.round(PRICING.base),
    length: Math.round(length),
    recency: Math.round(recency),
    rating: Math.round(rating),
    total: Math.round(PRICING.base + length + recency + rating),
  };
}

export function computePrice(game: GameMeta): number {
  return priceBreakdown(game).total;
}

/** Coins earned for finishing a game. */
export function computeReward(game: GameMeta): number {
  const hours = game.hours ?? REWARD.defaultHours;
  return Math.round(REWARD.base + hours * REWARD.hoursWeight);
}
