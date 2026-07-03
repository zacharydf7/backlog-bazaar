// Sorting & filtering for the game boards (the Bazaar and its sibling boards).
// Once a collection grows to hundreds of games, a flat list is unusable — this
// module slices and orders the games on a board so a player can find the right
// game for their current coin budget and real-world schedule. Linked editions
// are decentralized: each one is its own card on the board matching its status,
// so this works on individual games (no family collapsing here).
//
// All functions here are pure so they can be unit-tested without React/Supabase.

import type { Compilation, CopyFormat, Game } from "../types";
import { computeFormula, DEFAULT_ECONOMY, DEFAULT_HOURS, type EconomyConfig } from "./economy";
import { ownedPlatformSummary } from "./copies";
import { withBundleReleased } from "./compilations";

/** How a board is ordered. */
export type SortKey =
  | "added-desc" // Date added to the Bazaar, newest first (default)
  | "added-asc" // Date added, oldest first
  | "alpha" // Title A–Z
  | "cost-asc" // Lowest unlock cost (coins to buy) — for low funds
  | "bounty-desc" // Highest completion bounty (est. coin payout) — lucrative targets
  | "playtime-asc"; // Shortest estimated playtime — quick wins

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "added-desc", label: "Date added (newest)" },
  { value: "added-asc", label: "Date added (oldest)" },
  { value: "alpha", label: "Name (A–Z)" },
  { value: "cost-asc", label: "Lowest unlock cost" },
  { value: "bounty-desc", label: "Highest completion bounty" },
  { value: "playtime-asc", label: "Shortest playtime" },
];

export const DEFAULT_SORT: SortKey = "added-desc";

/** The set of valid sort keys, for validating a persisted preference. */
const SORT_KEYS = new Set<string>(SORT_OPTIONS.map((o) => o.value));

const SORT_PREF_KEY = "bb:board-sort";

/** The player's saved board-sort preference, so a chosen order survives a refresh.
 *  Falls back to the default when nothing's stored, the value is unrecognized, or
 *  localStorage is unavailable. */
export function loadSortPref(): SortKey {
  try {
    const v = localStorage.getItem(SORT_PREF_KEY);
    return v && SORT_KEYS.has(v) ? (v as SortKey) : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

/** Remember the player's board-sort choice for next time. */
export function saveSortPref(key: SortKey): void {
  try {
    localStorage.setItem(SORT_PREF_KEY, key);
  } catch {
    /* ignore */
  }
}

/** The active multi-select slicers. Each category is OR-within, AND-across:
 *  picking two platforms widens to either, but adding a genre narrows to the
 *  intersection — so "Switch" + "Switch 2" + "RPG" = RPGs on either console. */
export interface Filters {
  platforms: string[];
  genres: string[];
  formats: CopyFormat[];
}

export const EMPTY_FILTERS: Filters = { platforms: [], genres: [], formats: [] };

export function activeFilterCount(f: Filters): number {
  return f.platforms.length + f.genres.length + f.formats.length;
}

export function hasActiveFilters(f: Filters): boolean {
  return activeFilterCount(f) > 0;
}

/** The set of checkbox options to offer, derived from what's actually on the
 *  board so we never show a platform/genre no game has. */
export interface Facets {
  platforms: string[];
  genres: string[];
  formats: CopyFormat[];
}

// --- Per-game value extraction ---------------------------------------------

/** Platforms a game is filterable by: the platforms you actually *own* it on.
 *  For an edition with recorded copies that means only those copies' platforms —
 *  owning Switch 2 but not the Switch release means the Switch filter shouldn't
 *  surface it. An edition with no copies recorded falls back to its release
 *  platforms, so the filter still works before you've logged ownership. */
export function gameOwnedPlatforms(game: Game): string[] {
  const owned = ownedPlatformSummary(game.copies);
  if (owned.length) return owned.map((o) => o.platform);
  return [...(game.platforms ?? [])];
}

/** Formats (physical/digital) a game is owned in — derived from recorded copies,
 *  so a game with no copies recorded has no format. */
export function gameFormats(game: Game): Set<CopyFormat> {
  const s = new Set<CopyFormat>();
  for (const c of game.copies ?? []) if (c.format) s.add(c.format);
  return s;
}

function gameHours(g: Game): number {
  return g.hours ?? DEFAULT_HOURS;
}

/** The checkbox options present on a board (sorted; formats kept in a fixed
 *  physical→digital order). */
export function collectFacets(games: Game[]): Facets {
  const platforms = new Set<string>();
  const genres = new Set<string>();
  const formats = new Set<CopyFormat>();
  for (const g of games) {
    for (const p of gameOwnedPlatforms(g)) platforms.add(p);
    for (const gen of g.genres ?? []) genres.add(gen);
    for (const f of gameFormats(g)) formats.add(f);
  }
  return {
    platforms: [...platforms].sort((a, b) => a.localeCompare(b)),
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
    formats: (["physical", "digital"] as CopyFormat[]).filter((f) => formats.has(f)),
  };
}

/** Does a game pass the active slicers? Empty categories don't constrain. */
export function gameMatches(game: Game, f: Filters): boolean {
  if (f.platforms.length) {
    const p = gameOwnedPlatforms(game);
    if (!f.platforms.some((x) => p.includes(x))) return false;
  }
  if (f.genres.length) {
    const g = game.genres ?? [];
    if (!f.genres.some((x) => g.includes(x))) return false;
  }
  if (f.formats.length) {
    const fm = gameFormats(game);
    if (!f.formats.some((x) => fm.has(x))) return false;
  }
  return true;
}

/** Order games by the chosen sort. Ties fall back to title for a stable,
 *  predictable order. The economy config drives the coin-value sorts (defaults
 *  to the built-in economy so callers without admin config still sort sanely).
 *  Returns a new array. */
export function sortGames(
  games: Game[],
  key: SortKey,
  economy: EconomyConfig = DEFAULT_ECONOMY,
  compilations: Compilation[] = [],
): Game[] {
  const arr = [...games];
  const byTitle = (a: Game, b: Game) => a.title.localeCompare(b.title);
  // Coin-value sorts see compilation children through the same lens as the
  // price/bounty they'll actually pay/earn (bundle release date — see
  // withBundleReleased).
  const price = (g: Game) => computeFormula(withBundleReleased(g, compilations), economy.price);
  const bounty = (g: Game) => computeFormula(withBundleReleased(g, compilations), economy.bounty);
  switch (key) {
    case "alpha":
      arr.sort(byTitle);
      break;
    case "cost-asc":
      arr.sort((a, b) => price(a) - price(b) || byTitle(a, b));
      break;
    case "bounty-desc":
      arr.sort((a, b) => bounty(b) - bounty(a) || byTitle(a, b));
      break;
    case "playtime-asc":
      arr.sort((a, b) => gameHours(a) - gameHours(b) || byTitle(a, b));
      break;
    case "added-asc":
      arr.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0) || byTitle(a, b));
      break;
    case "added-desc":
    default:
      arr.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0) || byTitle(a, b));
      break;
  }
  return arr;
}

/** Filter then sort a board's games in one call. */
export function applyView(
  games: Game[],
  sort: SortKey,
  filters: Filters,
  economy: EconomyConfig = DEFAULT_ECONOMY,
  compilations: Compilation[] = [],
): Game[] {
  return sortGames(
    games.filter((g) => gameMatches(g, filters)),
    sort,
    economy,
    compilations,
  );
}

/** Toggle a value in a slicer list (add if missing, remove if present). */
export function toggleFilter<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}
