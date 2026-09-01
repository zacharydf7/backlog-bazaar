// Sorting & filtering for the game boards (the Bazaar and its sibling boards).
// Once a collection grows to hundreds of games, a flat list is unusable — this
// module slices and orders the games on a board so a player can find the right
// game for their current coin budget and real-world schedule. This works on
// individual games only — Game Families fold into their focused card UPSTREAM
// (src/lib/familyGrouping.ts), so a family's members either arrive here
// already reduced to zero (folded) or as plain per-edition cards (split).
//
// All functions here are pure so they can be unit-tested without React/Supabase.

import type { CopyFormat, Game, ModifierAcquisition } from "../types";
import { computeFormula, DEFAULT_ECONOMY, DEFAULT_HOURS, type EconomyConfig } from "./economy";
import { accessLost, isModifierOnly, ownedPlatformSummary } from "./copies";
import { isFamilyDiscounted } from "./families";
import { computeFamilyDiscountPrice, REPLAY } from "./pricing";
import { GAME_PRIORITIES, gamePriorityRank, type GamePriority } from "./gamePriority";

/** Extra state the coin-value sorts need to price a game the way the buy
 *  button will: the FULL library (Family Discount sibling checks — the board
 *  list being sorted doesn't contain the finished/playing sibling) and the
 *  live Replay-Bonus percentage. All optional so plain callers/tests keep
 *  working. */
export interface EconomyViewContext {
  allGames?: Game[];
  replayBonusPct?: number;
}

/** How a board is ordered. */
export type SortKey =
  | "added-desc" // Date added to the Bazaar, newest first (default)
  | "added-asc" // Date added, oldest first
  | "alpha" // Title A–Z
  | "cost-asc" // Lowest unlock cost (coins to buy) — for low funds
  | "bounty-desc" // Highest completion bounty (est. coin payout) — lucrative targets
  | "playtime-asc" // Shortest estimated playtime — quick wins
  | "priority-desc" // Triage tier, most urgent first (issue 901eb363)
  | "priority-asc"; // Triage tier, least urgent first

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "added-desc", label: "Date added (newest)" },
  { value: "added-asc", label: "Date added (oldest)" },
  { value: "alpha", label: "Name (A–Z)" },
  { value: "cost-asc", label: "Lowest unlock cost" },
  { value: "bounty-desc", label: "Highest completion bounty" },
  { value: "playtime-asc", label: "Shortest playtime" },
  { value: "priority-desc", label: "Priority (highest first)" },
  { value: "priority-asc", label: "Priority (lowest first)" },
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
 *  picking two platforms widens to either, but adding a format narrows to the
 *  intersection — so "Switch" + "Switch 2" + "Physical" = physical copies on
 *  either console. `liked` is a single on/off slice (favorites only).
 *  `priorities` slices by triage tier (issue 901eb363); "none" = unassigned. */
export interface Filters {
  platforms: string[];
  formats: CopyFormat[];
  priorities: (GamePriority | "none")[];
  access: AccessFacet[];
  liked: boolean;
}

/** The "how you hold it" slicer: the three modifier acquisitions (any copy of
 *  that kind, lapsed or not) plus "lost" — games with no playable copy left
 *  (see accessLost). Subscription games are borrowed time, so cutting straight
 *  to them is the "play these before they vanish" view. */
export type AccessFacet = ModifierAcquisition | "lost";

export const ACCESS_FACETS: AccessFacet[] = ["subscription", "borrowed", "player2", "lost"];

export const EMPTY_FILTERS: Filters = {
  platforms: [],
  formats: [],
  priorities: [],
  access: [],
  liked: false,
};

export function activeFilterCount(f: Filters): number {
  return (
    f.platforms.length + f.formats.length + f.priorities.length + f.access.length + (f.liked ? 1 : 0)
  );
}

export function hasActiveFilters(f: Filters): boolean {
  return activeFilterCount(f) > 0;
}

/** The set of checkbox options to offer, derived from what's actually on the
 *  board so we never show a platform/format no game has. */
export interface Facets {
  platforms: string[];
  formats: CopyFormat[];
  /** Triage tiers present, most urgent first with "none" last — offered only
   *  once at least one game on the board carries a tier (issue 901eb363): an
   *  all-unassigned board has nothing to slice, so no control appears. */
  priorities: (GamePriority | "none")[];
  /** Access states present (subscription/borrowed/player2/lost) — offered only
   *  when a game on the board actually carries one, like the other facets. */
  access: AccessFacet[];
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

/** The within-tier nudge for the priority sorts: a playable game held only
 *  through modifier acquisitions (subscription/borrowed/Player 2) is at risk
 *  of vanishing, so among equal priorities it sorts first. Half a rank, so it
 *  can never jump a tier. */
function atRiskBump(g: Game): number {
  return isModifierOnly(g.copies) && !accessLost(g.copies) ? 0.5 : 0;
}

/** The checkbox options present on a board (sorted; formats kept in a fixed
 *  physical→digital order). */
/** Whether a game carries one access state (see AccessFacet). */
export function gameHasAccess(game: Game, a: AccessFacet): boolean {
  if (a === "lost") return accessLost(game.copies);
  return (game.copies ?? []).some((c) => c.acquisition === a);
}

export function collectFacets(games: Game[]): Facets {
  const platforms = new Set<string>();
  const formats = new Set<CopyFormat>();
  const priorities = new Set<GamePriority | "none">();
  const access = new Set<AccessFacet>();
  for (const g of games) {
    for (const p of gameOwnedPlatforms(g)) platforms.add(p);
    for (const f of gameFormats(g)) formats.add(f);
    priorities.add(g.priority ?? "none");
    for (const a of ACCESS_FACETS) if (gameHasAccess(g, a)) access.add(a);
  }
  return {
    platforms: [...platforms].sort((a, b) => a.localeCompare(b)),
    formats: (["physical", "digital", "dlc"] as CopyFormat[]).filter((f) => formats.has(f)),
    // Mirrors ledgerFacets: hidden until the user has actually triaged
    // something (requested in issue 901eb363's follow-up).
    priorities:
      priorities.size > 1 || !priorities.has("none")
        ? [...GAME_PRIORITIES, "none" as const].filter((p) => priorities.has(p))
        : [],
    access: ACCESS_FACETS.filter((a) => access.has(a)),
  };
}

/** Does a game pass the active slicers? Empty categories don't constrain. */
export function gameMatches(game: Game, f: Filters): boolean {
  if (f.liked && game.likedAt == null) return false;
  if (f.priorities.length && !f.priorities.includes(game.priority ?? "none")) return false;
  if (f.access.length && !f.access.some((a) => gameHasAccess(game, a))) return false;
  if (f.platforms.length) {
    const p = gameOwnedPlatforms(game);
    if (!f.platforms.some((x) => p.includes(x))) return false;
  }
  if (f.formats.length) {
    const fm = gameFormats(game);
    if (!f.formats.some((x) => fm.has(x))) return false;
  }
  return true;
}

/** The numeric measure + direction behind a sort key — pricing a game exactly
 *  the way its buy button will (own acquisition date, Family-Discount editions
 *  at their reduced fee). `null` for alpha, which is lexical. Shared by
 *  sortGames and the board-card interleave (src/lib/boardOrder.ts), so a
 *  folded card's best-placed member is judged by the identical measure. */
export function sortMetric(
  key: SortKey,
  economy: EconomyConfig = DEFAULT_ECONOMY,
  ctx: EconomyViewContext = {},
): { value: (g: Game) => number; dir: 1 | -1 } | null {
  const { allGames = [], replayBonusPct = REPLAY.defaultPct } = ctx;
  const price = (g: Game) => {
    const full = computeFormula(g, economy.price);
    return isFamilyDiscounted(allGames, g) ? computeFamilyDiscountPrice(full, replayBonusPct) : full;
  };
  switch (key) {
    case "alpha":
      return null;
    case "cost-asc":
      return { value: price, dir: 1 };
    case "bounty-desc":
      return { value: (g) => computeFormula(g, economy.bounty), dir: -1 };
    case "playtime-asc":
      return { value: gameHours, dir: 1 };
    // Triage sorts (issue 901eb363): unassigned games sink to the bottom in
    // BOTH directions — the point of either view is "my prioritized games,
    // in tier order", never "the unprioritized pile first". The title
    // tiebreak in sortGames supplies the required alphabetical secondary.
    // Within a tier, games held only through modifier acquisitions surface
    // first (2026-09-01): a subscription game is borrowed time, so among
    // equals it's the one to play before it vanishes. An access-lost game
    // gets no bump — it can't be played at all. The half-rank offset can
    // never cross tiers (ranks are whole numbers).
    case "priority-desc":
      return { value: (g) => gamePriorityRank(g.priority) + atRiskBump(g), dir: -1 };
    case "priority-asc":
      return {
        value: (g) => (gamePriorityRank(g.priority) || GAME_PRIORITIES.length + 1) - atRiskBump(g),
        dir: 1,
      };
    case "added-asc":
      return { value: (g) => g.addedAt ?? 0, dir: 1 };
    case "added-desc":
    default:
      return { value: (g) => g.addedAt ?? 0, dir: -1 };
  }
}

/** Order games by the chosen sort. Ties fall back to title for a stable,
 *  predictable order. The economy config drives the coin-value sorts (defaults
 *  to the built-in economy so callers without admin config still sort sanely).
 *  Returns a new array. */
export function sortGames(
  games: Game[],
  key: SortKey,
  economy: EconomyConfig = DEFAULT_ECONOMY,
  ctx: EconomyViewContext = {},
): Game[] {
  const arr = [...games];
  const byTitle = (a: Game, b: Game) => a.title.localeCompare(b.title);
  // Family-Discount sibling checks default to the list being sorted when the
  // caller doesn't supply the full library.
  const metric = sortMetric(key, economy, { ...ctx, allGames: ctx.allGames ?? games });
  if (!metric) return arr.sort(byTitle);
  return arr.sort((a, b) => (metric.value(a) - metric.value(b)) * metric.dir || byTitle(a, b));
}

/** Filter then sort a board's games in one call. */
export function applyView(
  games: Game[],
  sort: SortKey,
  filters: Filters,
  economy: EconomyConfig = DEFAULT_ECONOMY,
  ctx: EconomyViewContext = {},
): Game[] {
  return sortGames(
    games.filter((g) => gameMatches(g, filters)),
    sort,
    economy,
    ctx,
  );
}

/** Toggle a value in a slicer list (add if missing, remove if present). */
export function toggleFilter<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}
