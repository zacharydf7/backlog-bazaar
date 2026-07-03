// Pre-submission validation and routing for the Add Game flow. Before a new
// game row is created, the request is checked against the user's existing
// library and wishlist (by shared catalog identity — see catalogKey) and routed:
// a second copy of an owned game attaches to the existing card instead of
// duplicating it, adding a wishlisted game warns that it bypasses the Import
// Charter system, and wishlisting is validated at the version (platform +
// format) level so you can hunt a port of a game you already own — but never
// the exact version you have. Pure helpers, unit-tested offline; the store and
// AddGameModal act on the decisions.

import type { CopyFormat, Game, GameCopy, GameStatus } from "../types";
import { catalogKey } from "./ownershipMerge";
import { ownedVersions, versionKey, versionsConflict, type OwnedVersion } from "./copies";
import { parsePlaytime, snapToMinute } from "./playtime";
import type { PlaytimeRow } from "./platformPlaytime";

export type AddDestination = Extract<GameStatus, "backlog" | "wishlist" | "finished">;

/** Initial hours played on one version, captured by the Add Game form. */
export interface VersionHours {
  platform: string;
  format: CopyFormat | null;
  hours: number;
}

export type AddRouteDecision =
  /** No conflict — insert a brand-new game row. */
  | { kind: "clean" }
  /** Already in the library: on confirm, append the copies to `target`. Copies
   *  conflicting with owned versions never reach here — they block instead. */
  | { kind: "attach-library"; target: Game }
  /** On the wishlist while adding to the library, and the versions being added
   *  overlap what's wanted (or either side has no versions to compare): warn
   *  (charter bypass), and on confirm add + delete the wishlist row. */
  | { kind: "wishlist-intercept"; wishlistRow: Game }
  /** On the wishlist while adding to the library, but every version being added
   *  is one the entry does NOT list (e.g. wishlisted on Switch, buying the PC
   *  version). The want isn't fulfilled, so the user chooses: add + remove the
   *  entry, or add + keep it. `wishlistedVersions` are the entry's versions,
   *  for the prompt copy. */
  | { kind: "wishlist-cross-platform"; wishlistRow: Game; wishlistedVersions: OwnedVersion[] }
  /** Already wishlisted: on confirm, append the not-yet-listed versions to the
   *  existing entry. */
  | { kind: "attach-wishlist"; target: Game; freshCopies: GameCopy[] }
  /** A requested copy duplicates something the user already has (see
   *  versionsConflict — a format-less copy collides with any format), on ANY
   *  board. `duplicateVersions` are the existing versions collided with (owned
   *  copies, or the wishlist entry's listed versions when target is a wishlist
   *  row); empty means "you have this game — pick a specific new version". */
  | { kind: "blocked-duplicate-version"; target: Game; duplicateVersions: OwnedVersion[] };

// A library card's precedence when several standalone rows share an identity
// (shouldn't normally happen, but be deterministic): furthest along wins.
const LIBRARY_RANK: Record<GameStatus, number> = {
  playing: 3,
  finished: 2,
  backlog: 1,
  wishlist: 0,
};

/** Standalone rows sharing the game's catalog identity. Compilation children are
 *  excluded on purpose: a standalone add for a game owned only inside a bundle
 *  is legitimate (ownershipMerge folds the two cards), and compilation copies'
 *  economics belong to the bundle. */
function standaloneMatches(games: Game[], key: string): Game[] {
  return games.filter((g) => g.compilationId == null && catalogKey(g) === key);
}

function libraryTarget(matches: Game[]): Game | null {
  const owned = matches.filter((g) => g.status !== "wishlist");
  if (owned.length === 0) return null;
  return owned.reduce((best, g) => {
    if (LIBRARY_RANK[g.status] !== LIBRARY_RANK[best.status])
      return LIBRARY_RANK[g.status] > LIBRARY_RANK[best.status] ? g : best;
    if (g.addedAt !== best.addedAt) return g.addedAt < best.addedAt ? g : best;
    return g.id < best.id ? g : best;
  });
}

/** Every version the user OWNS of this catalog game, anywhere — standalone rows
 *  and compilation children alike (wishlist rows are wants, not ownership).
 *  Drives the "can't add a version you already have" rule. */
export function ownedVersionsFor(
  games: Game[],
  meta: Pick<Game, "rawgId" | "catalogId">,
): OwnedVersion[] {
  const key = catalogKey(meta);
  if (!key) return [];
  const seen = new Set<string>();
  const out: OwnedVersion[] = [];
  for (const g of games) {
    if (g.status === "wishlist" || catalogKey(g) !== key) continue;
    for (const v of ownedVersions(g.copies)) {
      const k = versionKey(v.platform, v.format);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

/** The existing versions the requested ones collide with (versionsConflict —
 *  a format-less copy duplicates any format of that platform), deduped, in the
 *  existing list's order. */
function conflictingVersions(existing: OwnedVersion[], requested: OwnedVersion[]): OwnedVersion[] {
  return existing.filter((e) => requested.some((r) => versionsConflict(e, r)));
}

/** Where this catalog game already lives in the user's collection, for the Add
 *  search's "· in your …" tag: the furthest-along OWNED row's status (any row,
 *  compilation children included — owned via a bundle still reads as owned),
 *  else wishlist when only a wishlist entry exists, else null. */
export function libraryPresence(
  games: Game[],
  meta: Pick<Game, "rawgId" | "catalogId">,
): GameStatus | null {
  const key = catalogKey(meta);
  if (!key) return null;
  const matches = games.filter((g) => catalogKey(g) === key);
  if (matches.length === 0) return null;
  const owned = matches.filter((g) => g.status !== "wishlist");
  if (owned.length === 0) return "wishlist";
  return owned.reduce((best, g) => (LIBRARY_RANK[g.status] > LIBRARY_RANK[best.status] ? g : best))
    .status;
}

/** The owned standalone row for a wishlist card's game, or null. Used to mark a
 *  wishlist card as "you own another version" and to validate wishlist adds. */
export function ownedElsewhere(
  games: Game[],
  game: Pick<Game, "id" | "rawgId" | "catalogId">,
): Game | null {
  const key = catalogKey(game);
  if (!key) return null;
  const matches = standaloneMatches(games, key).filter((g) => g.id !== game.id);
  return libraryTarget(matches);
}

/** Route an Add Game submission against the current library + wishlist. `copies`
 *  must already be canonicalized; copies with a blank platform are ignored for
 *  version matching (they carry no version identity). */
export function routeAdd(input: {
  games: Game[];
  meta: Pick<Game, "rawgId" | "catalogId">;
  destination: AddDestination;
  copies: GameCopy[];
}): AddRouteDecision {
  const key = catalogKey(input.meta);
  // A hand-typed custom game has no shared identity — nothing to match.
  if (!key) return { kind: "clean" };

  const matches = standaloneMatches(input.games, key);
  const library = libraryTarget(matches);
  const wishlistRow = matches.find((g) => g.status === "wishlist") ?? null;

  const requested = ownedVersions(input.copies);
  const ownedVs = ownedVersionsFor(input.games, input.meta);
  // The owned versions the request collides with — a duplicate on ANY board
  // blocks (consistently across Bazaar / Now Playing / Finished / Wishlist);
  // deliberate extra copies of a version remain possible via the Edit modal.
  const ownedConflicts = conflictingVersions(ownedVs, requested);

  if (input.destination !== "wishlist") {
    if (library) {
      if (ownedConflicts.length > 0)
        return { kind: "blocked-duplicate-version", target: library, duplicateVersions: ownedConflicts };
      return { kind: "attach-library", target: library };
    }
    if (wishlistRow) {
      // Wishlisted, but every version being added is one the entry doesn't
      // list → the want isn't fulfilled; let the user keep the entry. Any
      // overlap — or nothing to compare on either side — keeps the plain
      // intercept (the entry is considered fulfilled and removed).
      const listed = ownedVersions(wishlistRow.copies);
      if (
        listed.length > 0 &&
        requested.length > 0 &&
        conflictingVersions(listed, requested).length === 0
      )
        return { kind: "wishlist-cross-platform", wishlistRow, wishlistedVersions: listed };
      return { kind: "wishlist-intercept", wishlistRow };
    }
    return { kind: "clean" };
  }

  // destination === "wishlist": validate at the version level.
  if (wishlistRow) {
    // A version already owned can't be wishlisted, even onto an existing entry.
    if (ownedConflicts.length > 0)
      return { kind: "blocked-duplicate-version", target: wishlistRow, duplicateVersions: ownedConflicts };
    // Versions the entry already lists (or ambiguous with one) block too; only
    // genuinely new ones append.
    const listed = ownedVersions(wishlistRow.copies);
    const listedConflicts = conflictingVersions(listed, requested);
    if (listedConflicts.length > 0)
      return { kind: "blocked-duplicate-version", target: wishlistRow, duplicateVersions: listedConflicts };
    const seen = new Set<string>();
    const freshCopies: GameCopy[] = [];
    for (const c of input.copies) {
      const platform = (c.platform ?? "").trim();
      if (!platform) continue;
      const k = versionKey(platform, c.format);
      if (seen.has(k)) continue;
      seen.add(k);
      freshCopies.push(c);
    }
    if (freshCopies.length === 0)
      return { kind: "blocked-duplicate-version", target: wishlistRow, duplicateVersions: [] };
    return { kind: "attach-wishlist", target: wishlistRow, freshCopies };
  }

  if (library) {
    // Owning the game demands a specific new version to wishlist…
    if (requested.length === 0)
      return { kind: "blocked-duplicate-version", target: library, duplicateVersions: [] };
    // …and none of the requested versions may collide with an owned one
    // (anywhere, including compilation children).
    if (ownedConflicts.length > 0)
      return { kind: "blocked-duplicate-version", target: library, duplicateVersions: ownedConflicts };
    return { kind: "clean" };
  }

  return { kind: "clean" };
}

/** Collect the Add form's per-version played drafts into concrete version hours.
 *  Blank, zero, or unparsable drafts are skipped, as is the version-less
 *  "Unspecified"/plain row bucket (platform null). */
export function versionHoursFromRows(
  rows: PlaytimeRow[],
  drafts: Record<string, string>,
): VersionHours[] {
  const out: VersionHours[] = [];
  for (const r of rows) {
    if (r.platform == null) continue;
    const text = (drafts[r.key] ?? "").trim();
    if (!text) continue;
    const hours = parsePlaytime(text);
    if (hours == null || hours <= 0) continue;
    out.push({ platform: r.platform, format: r.format ?? null, hours: snapToMinute(hours) });
  }
  return out;
}

/** Offline mirror of the import-with-charter merge (the SQL in
 *  import_with_charter): if the user owns a standalone copy of the wishlisted
 *  game, append the wishlist entry's not-yet-owned versions to it and drop the
 *  wishlist row; otherwise leave the array untouched (the caller flips status
 *  as today). Returns the next games array plus what happened. */
export function mergeWishlistIntoOwned(
  games: Game[],
  wishlistId: string,
): { games: Game[]; mergedInto: string | null; mergedCopies: GameCopy[] } {
  const row = games.find((g) => g.id === wishlistId && g.status === "wishlist");
  if (!row) return { games, mergedInto: null, mergedCopies: [] };
  const target = ownedElsewhere(games, row);
  if (!target) return { games, mergedInto: null, mergedCopies: [] };

  // Conflict-based skip (not just exact version match): a format-less wishlist
  // copy for a platform already owned in some format is a duplicate, not new.
  const have: OwnedVersion[] = [...ownedVersions(target.copies)];
  const merged = [...(target.copies ?? [])];
  for (const c of row.copies ?? []) {
    const platform = (c.platform ?? "").trim();
    if (!platform) continue;
    const v: OwnedVersion = { platform, format: c.format };
    if (have.some((h) => versionsConflict(h, v))) continue;
    have.push(v);
    merged.push(c);
  }

  return {
    games: games
      .filter((g) => g.id !== wishlistId)
      .map((g) => (g.id === target.id ? { ...g, copies: merged } : g)),
    mergedInto: target.id,
    mergedCopies: merged,
  };
}
