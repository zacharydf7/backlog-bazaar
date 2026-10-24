// The Master Ledger: one unified, filterable view of every game a player *owns*
// — i.e. every record that isn't a Wishlist item (which is an unowned, wished-for
// asset). Unlike the boards, the Ledger lists each owned edition individually (a
// linked family's editions are separate rows, each with its own status/platform),
// so it's a true "everything I own" dashboard.
//
// All pure here so it's unit-tested without React/Supabase; the component in
// MasterLedger.tsx just renders what these functions return.

import type { Compilation, CopyFormat, Game, GameStatus } from "../types";
import { gameOwnedPlatforms } from "./bazaarView";
import { GAME_PRIORITIES, type GamePriority } from "./gamePriority";
import { orderedFormats } from "./copies";
import { STATUS_LABEL, OWNED_STATUS_ORDER } from "./status";
import { visibleLibrary } from "./families";
import { filterByQuery } from "./librarySearch";
import { orderCompilationChildren, ownershipUnits } from "./compilationGrouping";
import type { PageNavStop } from "./pageNav";

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
 *  platforms to widen to either, add a status to narrow to the intersection.
 *  `formats` slices by how you HOLD a copy (physical / digital / DLC), so a
 *  shelf audit is one tap (issue de55c48b). `liked` and `player2` are single
 *  on/off slices: favorites only, and games held as a Player 2 seat on someone
 *  else's copy (issue 3eb956ff). */
export interface LedgerFilters {
  statuses: GameStatus[];
  platforms: string[];
  formats: CopyFormat[];
  /** Triage tiers (issue 901eb363); "none" slices to unassigned games. */
  priorities: (GamePriority | "none")[];
  liked: boolean;
  player2: boolean;
}

export const EMPTY_LEDGER_FILTERS: LedgerFilters = {
  statuses: [],
  platforms: [],
  formats: [],
  priorities: [],
  liked: false,
  player2: false,
};

export function ledgerFilterCount(f: LedgerFilters): number {
  return (
    f.statuses.length +
    f.platforms.length +
    f.formats.length +
    f.priorities.length +
    (f.liked ? 1 : 0) +
    (f.player2 ? 1 : 0)
  );
}

/** The slicer options actually present in the owned set (so we never offer a
 *  filter that would match nothing). Statuses keep the canonical owned order;
 *  platforms are alphabetised; formats keep their canonical order. */
export interface LedgerFacets {
  statuses: GameStatus[];
  platforms: string[];
  formats: CopyFormat[];
  priorities: (GamePriority | "none")[];
}

export function ledgerFacets(owned: Game[]): LedgerFacets {
  const statuses = new Set<GameStatus>();
  const platforms = new Set<string>();
  const formats = new Set<CopyFormat>();
  const priorities = new Set<GamePriority | "none">();
  for (const g of owned) {
    statuses.add(g.status);
    for (const p of gameOwnedPlatforms(g)) platforms.add(p);
    // A copy saved without a format says nothing about how it's held, so it
    // offers no facet — same reasoning as an untagged platform.
    for (const c of g.copies ?? []) if (c.format) formats.add(c.format);
    priorities.add(g.priority ?? "none");
  }
  return {
    statuses: OWNED_STATUS_ORDER.filter((s) => statuses.has(s)),
    platforms: [...platforms].sort((a, b) => a.localeCompare(b)),
    formats: orderedFormats([...formats]),
    // Most urgent first, the unassigned slice last. Offered only once at least
    // one game carries a tier — an all-unassigned library has nothing to slice.
    priorities:
      priorities.size > 1 || !priorities.has("none")
        ? [...GAME_PRIORITIES, "none" as const].filter((p) => priorities.has(p))
        : [],
  };
}

/** Does an owned game pass the active slicers? Empty categories don't constrain. */
export function ledgerMatches(game: Game, f: LedgerFilters): boolean {
  if (f.liked && game.likedAt == null) return false;
  if (f.player2 && !(game.copies ?? []).some((c) => c.acquisition === "player2")) return false;
  if (f.statuses.length && !f.statuses.includes(game.status)) return false;
  if (f.priorities.length && !f.priorities.includes(game.priority ?? "none")) return false;
  if (f.platforms.length) {
    const p = gameOwnedPlatforms(game);
    if (!f.platforms.some((x) => p.includes(x))) return false;
  }
  if (f.formats.length) {
    // Any copy in a chosen format keeps the game — a title owned on disc AND
    // digitally belongs in both shelves.
    const held = (game.copies ?? []).map((c) => c.format);
    if (!f.formats.some((x) => held.includes(x))) return false;
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
  finishedPct: number;
  /** Finished games bucketed by how they concluded (see finishTags.ts). The
   *  buckets are exclusive; finished games without a tag (clears predating
   *  finish tags) count in `finished` but in no bucket. */
  beaten: number;
  completed: number;
  endless: number;
  /** Beaten / Completed ÷ total owned, as 0–100 integers. */
  beatenPct: number;
  completedPct: number;
  /** Lifetime hours logged across owned games (snapped to the minute). */
  hoursPlayed: number;
  /** Clears dated to the current calendar year. Retirements aren't clears, so
   *  they never count — and the year comes from the owner's own milestones when
   *  they've dated the clear (see clearYear), so backdating a game you actually
   *  beat in 2025 moves it out of this year's tally (issue f9b7b594). */
  finishedThisYear: number;
  /** Lifetime coins earned from clears (summed reward snapshots on finished
   *  games). Excludes admin grants, which aren't recorded per-game. */
  coinsEarned: number;
}

/** The calendar year a finished game's clear belongs to, or null when it isn't a
 *  clear (a Retire It is a drop, not a finish) or carries no date at all. The
 *  owner's milestone date wins over the moment the status write happened: dating
 *  a clear to 2025 is a statement about when it happened, and every count must
 *  respect it. `clearedOn` is a plain "YYYY-MM-DD", so the year is read off the
 *  string rather than parsed — a UTC parse would shift Jan 1 into the year
 *  before for anyone west of Greenwich. */
export function clearYear(g: Game): number | null {
  if (g.status !== "finished" || g.finishTag === "retired") return null;
  if (g.clearedOn) {
    const year = Number(g.clearedOn.slice(0, 4));
    if (Number.isFinite(year)) return year;
  }
  return g.finishedAt != null ? new Date(g.finishedAt).getFullYear() : null;
}

/** The header's numbers. The collection block (games owned, playing / Bazaar /
 *  finished and their percentages, how they finished) counts each compilation
 *  as one entry — one item on the shelf (issue 86fc0b4b) — while the activity
 *  line (hours, clears this year, coins) counts every game, since each bundled
 *  game is its own playthrough. */
export function ledgerStats(owned: Game[], now: number = Date.now()): LedgerStats {
  const thisYear = new Date(now).getFullYear();
  let playing = 0;
  let backlog = 0;
  let finished = 0;
  let beaten = 0;
  let completed = 0;
  let endless = 0;
  let hoursPlayed = 0;
  let finishedThisYear = 0;
  let coinsEarned = 0;
  for (const g of owned) {
    hoursPlayed += g.playedHours ?? 0;
    coinsEarned += g.reward ?? 0;
    if (clearYear(g) === thisYear) finishedThisYear++;
  }
  const units = ownershipUnits(owned);
  for (const g of units) {
    if (g.status === "playing") playing++;
    else if (g.status === "backlog") backlog++;
    else if (g.status === "finished") {
      finished++;
      if (g.finishTag === "beaten") beaten++;
      else if (g.finishTag === "completed") completed++;
      else if (g.finishTag === "endless") endless++;
    }
  }
  const total = units.length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return {
    total,
    playing,
    backlog,
    finished,
    finishedPct: pct(finished),
    beaten,
    completed,
    endless,
    beatenPct: pct(beaten),
    completedPct: pct(completed),
    hoursPlayed: Math.round(hoursPlayed * 60) / 60,
    finishedThisYear,
    coinsEarned,
  };
}

// --- Grouping --------------------------------------------------------------

export type LedgerGroupBy = "none" | "platform" | "status";

export const GROUP_BY_OPTIONS: { value: LedgerGroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "platform", label: "Platform" },
  { value: "status", label: "Status" },
];

/** One card in the ledger: a game, or one of your compilations standing in
 *  for its games in this group (issue 9f958571), opening the compilation's
 *  page. */
export type LedgerRow =
  | { kind: "game"; game: Game }
  | { kind: "compilation"; compilation: Compilation; games: Game[] };

export interface LedgerGroup {
  key: string;
  label: string;
  /** Every game in the group, in display order. */
  games: Game[];
  /** The cards: each compilation's games fold into one row. */
  rows: LedgerRow[];
}

/** Games with no platform recorded fall into this bucket when grouping by
 *  platform, so nothing silently disappears. */
export const NO_PLATFORM_LABEL = "Unspecified platform";

/** Keep a compilation's games together, in the owner's chosen order (or the
 *  bundle's natural order when none is set), instead of letting the ledger's
 *  A–Z sort scatter them (issue 140ac868). Each bundle becomes one block placed
 *  by its alphabetically-first game — mirroring the boards — so a title-sorted
 *  list stays title-sorted apart from bundles pulling their pieces together.
 *  Games with no `compilationId` are untouched. Pure; non-mutating. */
export function clusterCompilationRows(games: Game[], compilations: Compilation[]): Game[] {
  // Fast path: nothing in this list belongs to a bundle.
  if (!games.some((g) => g.compilationId != null)) return games;
  const childOrderById = new Map(compilations.map((c) => [c.id, c.childOrder]));

  type Unit = { games: Game[]; sortTitle: string };
  const units: Unit[] = [];
  const byComp = new Map<string, Game[]>();
  for (const g of games) {
    if (g.compilationId != null) {
      const arr = byComp.get(g.compilationId);
      if (arr) arr.push(g);
      else byComp.set(g.compilationId, [g]);
    } else {
      units.push({ games: [g], sortTitle: g.title });
    }
  }
  for (const [compId, members] of byComp) {
    const ordered = orderCompilationChildren(members, childOrderById.get(compId));
    units.push({
      games: ordered,
      sortTitle: ordered.reduce((m, g) => (g.title < m ? g.title : m), ordered[0]?.title ?? ""),
    });
  }
  return units.sort((a, b) => a.sortTitle.localeCompare(b.sortTitle)).flatMap((u) => u.games);
}

/** The cards for one group's games (already clustered): each run of a known
 *  compilation's games becomes one compilation row. A compilation not in
 *  `compilations` (a visited library's) leaves its games as their own rows. */
export function ledgerRowsOf(games: Game[], compilations: Compilation[]): LedgerRow[] {
  const byId = new Map(compilations.map((c) => [c.id, c]));
  const rows: LedgerRow[] = [];
  for (const g of games) {
    const compilation = g.compilationId != null ? byId.get(g.compilationId) : undefined;
    const last = rows[rows.length - 1];
    if (compilation && last?.kind === "compilation" && last.compilation.id === compilation.id) {
      last.games.push(g);
    } else if (compilation) {
      rows.push({ kind: "compilation", compilation, games: [g] });
    } else {
      rows.push({ kind: "game", game: g });
    }
  }
  return rows;
}

/** Bucket games for display. "none" returns a single unlabeled group; "status"
 *  groups by economic status in canonical order; "platform" lists a game under
 *  *each* platform it's owned on (so a multi-platform game appears in several
 *  groups), platforms alphabetised with the no-platform bucket last. Input order
 *  is preserved within each group, so a pre-sorted list stays sorted — except
 *  that each group clusters a compilation's games together in order when
 *  `compilations` is supplied (issue 140ac868). */
export function groupLedger(
  games: Game[],
  groupBy: LedgerGroupBy,
  compilations: Compilation[] = [],
): LedgerGroup[] {
  const group = (key: string, label: string, list: Game[]): LedgerGroup => {
    const clustered = clusterCompilationRows(list, compilations);
    return { key, label, games: clustered, rows: ledgerRowsOf(clustered, compilations) };
  };

  if (groupBy === "none") {
    return [group("all", "", games)];
  }

  if (groupBy === "status") {
    return OWNED_STATUS_ORDER.map((status) =>
      group(status, STATUS_LABEL[status], games.filter((g) => g.status === status)),
    ).filter((grp) => grp.games.length > 0);
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
    .map(([platform, list]) => group(platform, platform, list));
  if (noPlatform.length) {
    groups.push(group("__none__", NO_PLATFORM_LABEL, noPlatform));
  }
  return groups;
}

/** Toggle a value in a slicer list (add if missing, remove if present). */
export function toggleLedgerValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** Total rows across the grouped ledger — the unit the incremental reveal
 *  counts in. Platform grouping lists a multi-platform game once per platform,
 *  so this can exceed the number of distinct games; a compilation is one row. */
export function ledgerRowTotal(groups: LedgerGroup[]): number {
  return groups.reduce((n, g) => n + g.rows.length, 0);
}

/** The grouped ledger cut down to its first `count` rows, for progressive
 *  rendering (issue 86dce059 — the boards page this way; the Ledger matches).
 *  The group at the cut renders partially; groups wholly past it are dropped so
 *  no empty headings render. */
export function sliceLedgerGroups(groups: LedgerGroup[], count: number): LedgerGroup[] {
  const out: LedgerGroup[] = [];
  let left = Math.max(0, count);
  for (const group of groups) {
    if (left <= 0) break;
    if (group.rows.length <= left) {
      out.push(group);
      left -= group.rows.length;
    } else {
      const rows = group.rows.slice(0, left);
      const games = rows.flatMap((r) => (r.kind === "game" ? [r.game] : r.games));
      out.push({ ...group, games, rows });
      left = 0;
    }
  }
  return out;
}

/** The flattened row index of a game's FIRST appearance across the grouped
 *  ledger (the row that carries its scroll anchor), or -1. Returning from a
 *  game's page, the reveal must already span this row for the scroll-restore
 *  to land on it. A compilation's id, or any of its games', finds its row. */
export function ledgerRowIndexOf(groups: LedgerGroup[], gameId: string): number {
  let i = 0;
  for (const group of groups) {
    for (const r of group.rows) {
      const hit =
        r.kind === "game"
          ? r.game.id === gameId
          : r.compilation.id === gameId || r.games.some((g) => g.id === gameId);
      if (hit) return i;
      i++;
    }
  }
  return -1;
}

/** The Master Ledger's cards in exactly the order it displays them — the same
 *  pipeline the component runs (hide family siblings → owned only → slicers +
 *  search → group), flattened across groups, as Prev/Next stops on a page
 *  (issue 7ad49282): a game card is a game stop, and one of your compilations'
 *  cards a compilation stop (issue 9f958571), as on the boards. Platform
 *  grouping lists a multi-platform card under each of its platforms, so the
 *  result keeps each card's first appearance: you browse every card once. */
export function orderedLedgerStops(
  rawGames: Game[],
  filters: LedgerFilters,
  searchQuery: string,
  groupBy: LedgerGroupBy,
  compilations: Compilation[] = [],
): PageNavStop[] {
  const owned = ownedGames(visibleLibrary(rawGames));
  const filtered = filterByQuery(applyLedgerFilters(owned, filters), searchQuery);
  const seen = new Set<string>();
  const stops: PageNavStop[] = [];
  for (const row of groupLedger(filtered, groupBy, compilations).flatMap((g) => g.rows)) {
    const stop: PageNavStop =
      row.kind === "game"
        ? { kind: "game", id: row.game.id }
        : { kind: "compilation", id: row.compilation.id };
    const key = `${stop.kind}:${stop.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      stops.push(stop);
    }
  }
  return stops;
}
