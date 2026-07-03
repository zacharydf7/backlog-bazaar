// The tunable economy formula engine. One evaluator drives BOTH the buy price
// (coins to unlock a game from your Bazaar) and the finish bounty (coins paid
// when you complete it), each with its own independent config. Admins tune the
// configs from the Economy page; they're stored in app_config and loaded into
// the store, so the numbers can change without a code deploy.
//
// A formula is a flat `base` plus a contribution from each enabled factor:
//
//   total = round( base + Σ (factor.enabled ? factor.weight × unit(factor) : 0) )
//
// where unit(factor) is the game property that factor reads (hours of length, a
// 0–1 freshness-since-acquisition fraction, dollars paid, …) — so a weight is
// "coins per unit".
//
// All functions here are pure, so they can be unit-tested without React/Supabase.

import type { GameMeta } from "../types";
import { totalCost } from "./copies";

/** Assumed length (hours) when a game has no recorded length. */
export const DEFAULT_HOURS = 12;

/** What the formula engine prices: catalog metadata plus, for owned games, the
 *  moment the game entered the library (ms epoch). An absent addedAt (the
 *  add-game price previews, where the game isn't added yet) reads as "acquired
 *  right now" — full freshness — matching what buyGame would compute seconds
 *  after adding. */
export type EconGame = GameMeta & { addedAt?: number };

/** The inputs a formula can factor in — each maps to one property of a game.
 *  Retired factors (metacritic, and release-date newness before the
 *  acquisition pivot) simply leave this union; normalizeFormula drops their
 *  stored config on load. */
export type FactorKey = "length" | "recency" | "paid" | "played" | "rating";

/** Stable iteration/display order for the factors. */
export const FACTOR_KEYS: FactorKey[] = ["length", "recency", "paid", "played", "rating"];

export interface FactorConfig {
  enabled: boolean;
  /** Coins added per unit of this factor (see unitOf for what a "unit" is). */
  weight: number;
}

/** A complete formula: a flat base plus the enabled factor contributions. */
export interface FormulaConfig {
  base: number;
  /** Years over which the fresh-pickup bonus fades to zero after a game joins
   *  the library (shape for the recency factor only; ignored by the others). */
  recencyDecayYears: number;
  factors: Record<FactorKey, FactorConfig>;
}

/** The two independent formulas that make up the live economy. */
export interface EconomyConfig {
  price: FormulaConfig;
  bounty: FormulaConfig;
}

/** Human-facing copy for each factor, used by the admin Economy editor. */
export interface FactorMeta {
  label: string;
  /** What one point of weight buys, shown beside the weight field. */
  weightUnit: string;
  help: string;
}

export const FACTOR_META: Record<FactorKey, FactorMeta> = {
  length: {
    label: "Length",
    weightUnit: "per hour",
    help: "Coins per hour of game length.",
  },
  recency: {
    label: "Fresh pickup",
    weightUnit: "for a just-acquired game",
    help: "Coins for a game just added to the library, fading linearly to 0 over the decay years.",
  },
  paid: {
    label: "Amount paid",
    weightUnit: "per $1 spent",
    help: "Coins per US dollar across the copies you own.",
  },
  played: {
    label: "Prior playtime",
    weightUnit: "per hour played",
    help: "Coins per hour already logged on the game.",
  },
  rating: {
    label: "Rating",
    weightUnit: "per star (0–5)",
    help: "Coins per star of the game's 0–5 rating.",
  },
};

/** A 0–1 "fresh pickup" fraction: 1 the moment a game joins the library,
 *  fading linearly to 0 over `decayYears`. A missing addedAt means "not
 *  acquired yet" (the add-game previews) and reads as now — full freshness.
 *  A non-positive decay contributes 0. */
export function recencyFraction(addedAt: number | undefined, decayYears: number): number {
  if (decayYears <= 0) return 0;
  const years = Math.max(0, (Date.now() - (addedAt ?? Date.now())) / (365.25 * 24 * 60 * 60 * 1000));
  return Math.max(0, Math.min(1, 1 - years / decayYears));
}

/** The raw value a factor's weight multiplies, for a given game. */
function unitOf(key: FactorKey, game: EconGame, cfg: FormulaConfig): number {
  switch (key) {
    case "length":
      return game.hours ?? DEFAULT_HOURS;
    case "recency":
      return recencyFraction(game.addedAt, cfg.recencyDecayYears);
    case "paid":
      return totalCost(game.copies);
    case "played":
      return game.playedHours ?? 0;
    case "rating":
      return game.rating ?? 0;
  }
}

export interface FormulaBreakdown {
  base: number;
  /** Rounded coins contributed by each factor (0 when disabled). */
  factors: Record<FactorKey, number>;
  total: number;
}

/** Evaluate a formula for a game, returning the base, each factor's coins, and
 *  the rounded, never-negative total. Drives both the buy "why" tooltip and the
 *  admin live preview. */
export function formulaBreakdown(game: EconGame, cfg: FormulaConfig): FormulaBreakdown {
  const factors = {} as Record<FactorKey, number>;
  let sum = cfg.base;
  for (const key of FACTOR_KEYS) {
    const fc = cfg.factors[key];
    const contribution = fc && fc.enabled ? fc.weight * unitOf(key, game, cfg) : 0;
    factors[key] = Math.round(contribution);
    sum += contribution;
  }
  return { base: Math.round(cfg.base), factors, total: Math.max(0, Math.round(sum)) };
}

/** The total coins a formula yields for a game (price or bounty). */
export function computeFormula(game: EconGame, cfg: FormulaConfig): number {
  return formulaBreakdown(game, cfg).total;
}

// ── Signed weights ─────────────────────────────────────────────────────────
// A factor's weight is stored signed: a positive weight ADDS coins per unit, a
// negative weight REDUCES them (e.g. discount a game the more hours you've
// already sunk into it). The total still floors at 0. The admin editor presents
// this as a +/− direction plus a non-negative magnitude, so these helpers split
// and recombine the two.

/** Split a signed weight into a +/− direction and a non-negative magnitude. A
 *  zero weight reads as "+" (adds). */
export function splitWeight(weight: number): { direction: 1 | -1; magnitude: number } {
  return weight < 0 ? { direction: -1, magnitude: -weight } : { direction: 1, magnitude: weight };
}

/** Recombine a direction (+1 adds / −1 reduces) and a non-negative magnitude
 *  into the signed weight the formula stores. */
export function combineWeight(direction: 1 | -1, magnitude: number): number {
  const m = Math.max(0, magnitude);
  return m === 0 ? 0 : direction * m; // avoid a stored -0 when magnitude is 0
}

/** Format a coin amount with an explicit sign for a breakdown row: "+30",
 *  "−18", or "0" (using a true minus glyph). */
export function signedCoins(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${-n}`;
  return "0";
}

function off(): FactorConfig {
  return { enabled: false, weight: 0 };
}

/** Default buy-price formula: base 40, +3 coins/hour, up to +120 for a game
 *  just picked up, fading over the decay years as it waits in the Bazaar. */
export const DEFAULT_PRICE_FORMULA: FormulaConfig = {
  base: 40,
  recencyDecayYears: 8,
  factors: {
    length: { enabled: true, weight: 3 },
    recency: { enabled: true, weight: 120 },
    paid: off(),
    played: off(),
    rating: off(),
  },
};

/** Default finish-bounty formula — a flat 40, matching the original completion
 *  bonus. Admins opt into length/played/etc. to reward longer or deeper plays. */
export const DEFAULT_BOUNTY_FORMULA: FormulaConfig = {
  base: 40,
  recencyDecayYears: 8,
  factors: {
    length: off(),
    recency: off(),
    paid: off(),
    played: off(),
    rating: off(),
  },
};

export const DEFAULT_ECONOMY: EconomyConfig = {
  price: DEFAULT_PRICE_FORMULA,
  bounty: DEFAULT_BOUNTY_FORMULA,
};

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Deep-clone a formula so callers can edit a draft without mutating a default. */
export function cloneFormula(cfg: FormulaConfig): FormulaConfig {
  const factors = {} as Record<FactorKey, FactorConfig>;
  for (const key of FACTOR_KEYS) factors[key] = { ...cfg.factors[key] };
  return { base: cfg.base, recencyDecayYears: cfg.recencyDecayYears, factors };
}

/** Coerce a stored/partial JSON value into a valid FormulaConfig, falling back
 *  to `fallback` for anything missing or malformed. This makes the stored config
 *  forward-compatible: a factor added later picks up its default until an admin
 *  configures it, a RETIRED factor's stored entry is silently dropped (only
 *  FACTOR_KEYS are read), and a corrupt value can never break pricing. */
export function normalizeFormula(raw: unknown, fallback: FormulaConfig): FormulaConfig {
  if (!raw || typeof raw !== "object") return cloneFormula(fallback);
  const r = raw as {
    base?: unknown;
    recencyDecayYears?: unknown;
    factors?: Record<string, { enabled?: unknown; weight?: unknown } | undefined>;
  };
  const factors = {} as Record<FactorKey, FactorConfig>;
  for (const key of FACTOR_KEYS) {
    const f = r.factors?.[key];
    const fb = fallback.factors[key];
    factors[key] = {
      enabled: typeof f?.enabled === "boolean" ? f.enabled : fb.enabled,
      weight: finiteOr(f?.weight, fb.weight),
    };
  }
  return {
    base: finiteOr(r.base, fallback.base),
    recencyDecayYears: finiteOr(r.recencyDecayYears, fallback.recencyDecayYears),
    factors,
  };
}
