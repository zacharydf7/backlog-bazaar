// Sorting & filtering for the game boards (the Bazaar and its sibling boards).
// Once a collection grows to hundreds of games, a flat list is unusable — this
// module slices and orders the *units* on a board (a unit is one standalone game
// or a whole linked family; see buildUnits in ./families) so a player can find
// the right game for their current coin budget and real-world schedule.
//
// All functions here are pure so they can be unit-tested without React/Supabase.

import type { CopyFormat, Game } from "../types";
import type { GameUnit } from "./families";
import { computeEstimatedPayout, computePrice, PRICING } from "./pricing";
import { ownedPlatformSummary } from "./copies";

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

// --- Per-unit value extraction ---------------------------------------------
// A unit can be a whole family, so platform/genre/format sets union across every
// member, while economy/time/sort values come from the representative member
// (the one whose card you see).

/** Platforms a unit can be played on: the platforms you own copies on across
 *  every edition, unioned with each edition's available platforms — so the
 *  filter works whether or not you've recorded which copies you own. */
export function unitPlatforms(members: Game[]): Set<string> {
  const s = new Set<string>();
  for (const m of members) {
    for (const o of ownedPlatformSummary(m.copies)) s.add(o.platform);
    for (const p of m.platforms ?? []) s.add(p);
  }
  return s;
}

export function unitGenres(members: Game[]): Set<string> {
  const s = new Set<string>();
  for (const m of members) for (const g of m.genres ?? []) s.add(g);
  return s;
}

/** Formats (physical/digital) a unit is owned in — derived from recorded copies,
 *  so a game with no copies recorded has no format. */
export function unitFormats(members: Game[]): Set<CopyFormat> {
  const s = new Set<CopyFormat>();
  for (const m of members) for (const c of m.copies ?? []) if (c.format) s.add(c.format);
  return s;
}

function unitHours(u: GameUnit): number {
  return u.rep.hours ?? PRICING.defaultHours;
}

/** The checkbox options present on a board (sorted; formats kept in a fixed
 *  physical→digital order). */
export function collectFacets(units: GameUnit[]): Facets {
  const platforms = new Set<string>();
  const genres = new Set<string>();
  const formats = new Set<CopyFormat>();
  for (const u of units) {
    for (const p of unitPlatforms(u.members)) platforms.add(p);
    for (const g of unitGenres(u.members)) genres.add(g);
    for (const f of unitFormats(u.members)) formats.add(f);
  }
  return {
    platforms: [...platforms].sort((a, b) => a.localeCompare(b)),
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
    formats: (["physical", "digital"] as CopyFormat[]).filter((f) => formats.has(f)),
  };
}

/** Does a unit pass the active slicers? Empty categories don't constrain. */
export function unitMatches(unit: GameUnit, f: Filters): boolean {
  if (f.platforms.length) {
    const p = unitPlatforms(unit.members);
    if (!f.platforms.some((x) => p.has(x))) return false;
  }
  if (f.genres.length) {
    const g = unitGenres(unit.members);
    if (!f.genres.some((x) => g.has(x))) return false;
  }
  if (f.formats.length) {
    const fm = unitFormats(unit.members);
    if (!f.formats.some((x) => fm.has(x))) return false;
  }
  return true;
}

/** Order units by the chosen sort. Ties fall back to title for a stable,
 *  predictable order. Returns a new array. */
export function sortUnits(units: GameUnit[], key: SortKey): GameUnit[] {
  const arr = [...units];
  const byTitle = (a: GameUnit, b: GameUnit) => a.rep.title.localeCompare(b.rep.title);
  switch (key) {
    case "alpha":
      arr.sort(byTitle);
      break;
    case "cost-asc":
      arr.sort((a, b) => computePrice(a.rep) - computePrice(b.rep) || byTitle(a, b));
      break;
    case "bounty-desc":
      arr.sort(
        (a, b) => computeEstimatedPayout(b.rep) - computeEstimatedPayout(a.rep) || byTitle(a, b),
      );
      break;
    case "playtime-asc":
      arr.sort((a, b) => unitHours(a) - unitHours(b) || byTitle(a, b));
      break;
    case "added-asc":
      arr.sort((a, b) => (a.rep.addedAt ?? 0) - (b.rep.addedAt ?? 0) || byTitle(a, b));
      break;
    case "added-desc":
    default:
      arr.sort((a, b) => (b.rep.addedAt ?? 0) - (a.rep.addedAt ?? 0) || byTitle(a, b));
      break;
  }
  return arr;
}

/** Filter then sort a board's units in one call. */
export function applyView(units: GameUnit[], sort: SortKey, filters: Filters): GameUnit[] {
  return sortUnits(
    units.filter((u) => unitMatches(u, filters)),
    sort,
  );
}

/** Toggle a value in a slicer list (add if missing, remove if present). */
export function toggleFilter<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}
