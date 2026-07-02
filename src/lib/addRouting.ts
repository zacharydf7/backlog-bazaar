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
import { ownedVersions, versionKey, type OwnedVersion } from "./copies";
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
  /** Already in the library: on confirm, append the copies to `target`. */
  | { kind: "attach-library"; target: Game; duplicateVersions: OwnedVersion[] }
  /** On the wishlist while adding to the library: warn (charter bypass), and on
   *  confirm add + delete the wishlist row. */
  | { kind: "wishlist-intercept"; wishlistRow: Game }
  /** Already wishlisted: on confirm, append the not-yet-listed versions to the
   *  existing entry (duplicates of already-wanted versions are dropped). */
  | { kind: "attach-wishlist"; target: Game; freshCopies: GameCopy[]; duplicateVersions: OwnedVersion[] }
  /** Wishlisting a version the user already owns (or nothing new) — blocked
   *  until the request changes. Empty `duplicateVersions` means "you own this
   *  game; pick the specific version you want". */
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

/** Version keys of every copy the user OWNS of this catalog game, anywhere —
 *  standalone rows and compilation children alike (wishlist rows are wants, not
 *  ownership). Drives the "can't wishlist a version you already have" rule. */
export function ownedVersionKeysFor(
  games: Game[],
  meta: Pick<Game, "rawgId" | "catalogId">,
): Set<string> {
  const key = catalogKey(meta);
  const out = new Set<string>();
  if (!key) return out;
  for (const g of games) {
    if (g.status === "wishlist" || catalogKey(g) !== key) continue;
    for (const v of ownedVersions(g.copies)) out.add(versionKey(v.platform, v.format));
  }
  return out;
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

  if (input.destination !== "wishlist") {
    if (library) {
      // Attaching is always allowed (a second copy of the same version is
      // legitimate) — duplicates are only surfaced in the confirm dialog.
      const ownedKeys = ownedVersionKeysFor(input.games, input.meta);
      const duplicateVersions = ownedVersions(input.copies).filter((v) =>
        ownedKeys.has(versionKey(v.platform, v.format)),
      );
      return { kind: "attach-library", target: library, duplicateVersions };
    }
    if (wishlistRow) return { kind: "wishlist-intercept", wishlistRow };
    return { kind: "clean" };
  }

  // destination === "wishlist": validate at the version level.
  const requested = ownedVersions(input.copies);
  const ownedKeys = ownedVersionKeysFor(input.games, input.meta);
  const ownedDuplicates = requested.filter((v) => ownedKeys.has(versionKey(v.platform, v.format)));

  if (wishlistRow) {
    // A version already owned can't be wishlisted, even onto an existing entry.
    if (ownedDuplicates.length > 0)
      return { kind: "blocked-duplicate-version", target: wishlistRow, duplicateVersions: ownedDuplicates };
    // Versions already wanted are dropped; only genuinely new ones append.
    const listed = new Set(ownedVersions(wishlistRow.copies).map((v) => versionKey(v.platform, v.format)));
    const seen = new Set<string>();
    const freshCopies: GameCopy[] = [];
    const duplicateVersions: OwnedVersion[] = [];
    for (const c of input.copies) {
      const platform = (c.platform ?? "").trim();
      if (!platform) continue;
      const k = versionKey(platform, c.format);
      if (listed.has(k) || seen.has(k)) {
        duplicateVersions.push({ platform, format: c.format });
        continue;
      }
      seen.add(k);
      freshCopies.push(c);
    }
    if (freshCopies.length === 0)
      return { kind: "blocked-duplicate-version", target: wishlistRow, duplicateVersions };
    return { kind: "attach-wishlist", target: wishlistRow, freshCopies, duplicateVersions };
  }

  if (library) {
    // Owning the game demands a specific new version to wishlist…
    if (requested.length === 0)
      return { kind: "blocked-duplicate-version", target: library, duplicateVersions: [] };
    // …and none of the requested versions may already be owned (anywhere,
    // including compilation children).
    if (ownedDuplicates.length > 0)
      return { kind: "blocked-duplicate-version", target: library, duplicateVersions: ownedDuplicates };
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

  const have = new Set(ownedVersions(target.copies).map((v) => versionKey(v.platform, v.format)));
  const merged = [...(target.copies ?? [])];
  for (const c of row.copies ?? []) {
    const platform = (c.platform ?? "").trim();
    if (!platform) continue;
    const k = versionKey(platform, c.format);
    if (have.has(k)) continue;
    have.add(k);
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
