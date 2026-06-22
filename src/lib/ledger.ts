// The Master Ledger: one unified, filterable view of every game a player *owns*
// — i.e. every record that isn't a Wishlist item (which is an unowned, wished-for
// asset). Unlike the boards, the Ledger lists each owned edition individually (a
// linked family's editions are separate rows, each with its own status/platform),
// so it's a true "everything I own" dashboard.
//
// All pure here so it's unit-tested without React/Supabase; the component in
// MasterLedger.tsx just renders what these functions return.

import type { Game, GameStatus } from "../types";
import { gameOwnedPlatforms } from "./bazaarView";
import { STATUS_LABEL, OWNED_STATUS_ORDER } from "./status";

/** True for any game the player owns (everything except Wishlist). */
export function isOwned(game: Pick<Game, "status">): boolean {
  return game.status !== "wishlist";
}

/** Every owned game (Wishlist strictly excluded). */
export function ownedGames(games: Game[]): Game[] {
  return games.filter(isOwned);
}

// --- Filtering -------------------------------------------------------------

/** How the Ledger is sliced. Each category is OR-within, AND-across — pick two
 *  platforms to widen to either, add a status to narrow to the intersection. */
export interface LedgerFilters {
  statuses: GameStatus[];
  platforms: string[];
  genres: string[];
}

export const EMPTY_LEDGER_FILTERS: LedgerFilters = { statuses: [], platforms: [], genres: [] };

export function ledgerFilterCount(f: LedgerFilters): number {
  return f.statuses.length + f.platforms.length + f.genres.length;
}

/** The slicer options actually present in the owned set (so we never offer a
 *  filter that would match nothing). Statuses keep the canonical owned order;
 *  platforms and genres are alphabetised. */
export interface LedgerFacets {
  statuses: GameStatus[];
  platforms: string[];
  genres: string[];
}

export function ledgerFacets(owned: Game[]): LedgerFacets {
  const statuses = new Set<GameStatus>();
  const platforms = new Set<string>();
  const genres = new Set<string>();
  for (const g of owned) {
    statuses.add(g.status);
    for (const p of gameOwnedPlatforms(g)) platforms.add(p);
    for (const genre of g.genres ?? []) genres.add(genre);
  }
  return {
    statuses: OWNED_STATUS_ORDER.filter((s) => statuses.has(s)),
    platforms: [...platforms].sort((a, b) => a.localeCompare(b)),
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
  };
}

/** Does an owned game pass the active slicers? Empty categories don't constrain. */
export function ledgerMatches(game: Game, f: LedgerFilters): boolean {
  if (f.statuses.length && !f.statuses.includes(game.status)) return false;
  if (f.platforms.length) {
    const p = gameOwnedPlatforms(game);
    if (!f.platforms.some((x) => p.includes(x))) return false;
  }
  if (f.genres.length) {
    const g = game.genres ?? [];
    if (!f.genres.some((x) => g.includes(x))) return false;
  }
  return true;
}

/** Filter owned games by the slicers, then sort alphabetically by title (a stable
 *  baseline order for a scan-the-whole-library view). Returns a new array. */
export function applyLedgerFilters(owned: Game[], f: LedgerFilters): Game[] {
  return owned
    .filter((g) => ledgerMatches(g, f))
    .sort((a, b) => a.title.localeCompare(b.title));
}

// --- Account-wide analytics ------------------------------------------------

/** Library-health metrics for the sticky header. Computed across the *whole*
 *  owned account, independent of the active filters. */
export interface LedgerStats {
  total: number;
  playing: number;
  backlog: number;
  finished: number;
  /** Finished ÷ total, as a 0–100 integer (0 when nothing is owned). */
  completionPct: number;
  /** Lifetime hours logged across owned games (snapped to the minute). */
  hoursPlayed: number;
  /** Games finished within the current calendar year. */
  finishedThisYear: number;
}

export function ledgerStats(owned: Game[], now: number = Date.now()): LedgerStats {
  const thisYear = new Date(now).getFullYear();
  let playing = 0;
  let backlog = 0;
  let finished = 0;
  let hoursPlayed = 0;
  let finishedThisYear = 0;
  for (const g of owned) {
    hoursPlayed += g.playedHours ?? 0;
    if (g.status === "playing") playing++;
    else if (g.status === "backlog") backlog++;
    else if (g.status === "finished") {
      finished++;
      if (g.finishedAt != null && new Date(g.finishedAt).getFullYear() === thisYear) {
        finishedThisYear++;
      }
    }
  }
  const total = owned.length;
  return {
    total,
    playing,
    backlog,
    finished,
    completionPct: total === 0 ? 0 : Math.round((finished / total) * 100),
    hoursPlayed: Math.round(hoursPlayed * 60) / 60,
    finishedThisYear,
  };
}

// --- Grouping --------------------------------------------------------------

export type LedgerGroupBy = "none" | "platform" | "status";

export const GROUP_BY_OPTIONS: { value: LedgerGroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "platform", label: "Platform" },
  { value: "status", label: "Status" },
];

export interface LedgerGroup {
  key: string;
  label: string;
  games: Game[];
}

/** Games with no platform recorded fall into this bucket when grouping by
 *  platform, so nothing silently disappears. */
export const NO_PLATFORM_LABEL = "Unspecified platform";

/** Bucket games for display. "none" returns a single unlabeled group; "status"
 *  groups by economic status in canonical order; "platform" lists a game under
 *  *each* platform it's owned on (so a multi-platform game appears in several
 *  groups), platforms alphabetised with the no-platform bucket last. Input order
 *  is preserved within each group, so a pre-sorted list stays sorted. */
export function groupLedger(games: Game[], groupBy: LedgerGroupBy): LedgerGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", games }];
  }

  if (groupBy === "status") {
    return OWNED_STATUS_ORDER.map((status) => ({
      key: status,
      label: STATUS_LABEL[status],
      games: games.filter((g) => g.status === status),
    })).filter((grp) => grp.games.length > 0);
  }

  // groupBy === "platform"
  const byPlatform = new Map<string, Game[]>();
  let noPlatform: Game[] = [];
  for (const g of games) {
    const platforms = gameOwnedPlatforms(g);
    if (platforms.length === 0) {
      noPlatform.push(g);
      continue;
    }
    for (const p of platforms) {
      const arr = byPlatform.get(p);
      if (arr) arr.push(g);
      else byPlatform.set(p, [g]);
    }
  }
  const groups: LedgerGroup[] = [...byPlatform.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([platform, list]) => ({ key: platform, label: platform, games: list }));
  if (noPlatform.length) {
    groups.push({ key: "__none__", label: NO_PLATFORM_LABEL, games: noPlatform });
  }
  return groups;
}

/** Toggle a value in a slicer list (add if missing, remove if present). */
export function toggleLedgerValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}
