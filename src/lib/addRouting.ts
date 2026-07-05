// Pre-submission validation and routing for the Add Game flow, under the
// per-platform instance model: one library card per (game × platform).
// Physical/digital copies of the SAME platform live together on that
// platform's card; a different platform is its own independent card with its
// own status, playtime and economy. Before a new game row is created, the
// request is split into per-platform groups and each group is routed against
// the user's existing instances: a copy on an already-owned platform attaches
// to that platform's card, a new platform becomes a new card, and the exact
// version you already own blocks. Compilation children are never routing
// targets — a standalone purchase of a bundle-owned game is a legitimate
// separate record (instance isolation). Pure helpers, unit-tested offline;
// the store and AddGameModal act on the decisions.

import type { CopyFormat, Game, GameCopy, GameMeta, GameStatus } from "../types";
import { catalogKey } from "./ownershipMerge";
import {
  ownedPlatformSummary,
  ownedVersions,
  versionKey,
  versionsConflict,
  type OwnedVersion,
} from "./copies";
import { parsePlaytime, snapToMinute } from "./playtime";
import type { PlaytimeRow } from "./platformPlaytime";

export type AddDestination = Extract<GameStatus, "backlog" | "wishlist" | "finished">;

/** Initial hours played on one version, captured by the Add Game form. */
export interface VersionHours {
  platform: string;
  format: CopyFormat | null;
  hours: number;
}

/** One platform's slice of an Add request, with where it lands: a brand-new
 *  instance card, or attached to the existing card for that platform. */
export interface PlatformAddGroup {
  /** The platform this group is for; null = the platform-less bucket (a
   *  custom/no-copy add, or an ongoing game — copies carry no platform). */
  platform: string | null;
  copies: GameCopy[];
  action: "new" | "attach";
  /** The same-platform instance an "attach" group appends its copies to (an
   *  owned card for library adds, a wishlist entry for wishlist adds). */
  target?: Game;
}

export type AddRouteDecision =
  /** No existing instance is touched — insert one new row per group, silently. */
  | { kind: "clean"; groups: PlatformAddGroup[] }
  /** A requested copy duplicates a version already on an instance (see
   *  versionsConflict — a format-less copy collides with any format).
   *  `duplicateVersions` are the existing versions collided with; empty means
   *  "you have this game — pick a specific new version". */
  | { kind: "blocked-duplicate-version"; target: Game; duplicateVersions: OwnedVersion[] }
  /** The add lands on or beside existing instances — confirm before executing:
   *  each group either attaches to its target or becomes a new card, and every
   *  `intercepts` wishlist entry is fulfilled by this add and will be removed
   *  (the charter-bypass warning applies when any exist). */
  | { kind: "confirm-plan"; groups: PlatformAddGroup[]; intercepts: Game[] };

// A library card's precedence when several instances share a platform
// (shouldn't normally happen, but be deterministic): furthest along wins.
const LIBRARY_RANK: Record<GameStatus, number> = {
  playing: 3,
  finished: 2,
  backlog: 1,
  wishlist: 0,
};

function pickBest(matches: Game[]): Game {
  return matches.reduce((best, g) => {
    if (LIBRARY_RANK[g.status] !== LIBRARY_RANK[best.status])
      return LIBRARY_RANK[g.status] > LIBRARY_RANK[best.status] ? g : best;
    if (g.addedAt !== best.addedAt) return g.addedAt < best.addedAt ? g : best;
    return g.id < best.id ? g : best;
  });
}

/** Standalone rows sharing the game's catalog identity. Compilation children are
 *  excluded on purpose: their economics belong to the bundle, and instance
 *  isolation makes a standalone add of a bundle-owned game legitimate — even on
 *  the same platform. */
function standaloneMatches(games: Game[], key: string): Game[] {
  return games.filter((g) => g.compilationId == null && catalogKey(g) === key);
}

/** The distinct platforms an instance's copies cover (DLC rows included — a
 *  DLC-only card still claims its platform). */
export function instancePlatforms(game: Pick<Game, "copies">): string[] {
  return ownedPlatformSummary(game.copies).map((o) => o.platform);
}

/** The Add-flow metadata of an existing library instance — what the hub's
 *  "Add another platform" seeds the Add Game form with, as if the user had
 *  searched and picked the game. Catalog-level fields only: the shared cover
 *  (stockImage) is preferred over a personal custom one, and personal state
 *  (copies, playtime, status) never carries onto the new instance. */
export function gameToAddMeta(game: Game): GameMeta {
  return {
    title: game.title,
    rawgId: game.rawgId,
    catalogId: game.catalogId,
    image: game.stockImage ?? game.image,
    released: game.released,
    hours: game.hours,
    metacritic: game.metacritic,
    genres: game.genres ?? [],
    platforms: game.platforms,
    developers: game.developers,
    esrb: game.esrb,
    ongoing: game.ongoing,
  };
}

/** Split a request's copies into per-platform groups (first-seen platform
 *  order); copies with a blank platform pool into one trailing null group. */
export function splitCopiesByPlatform(
  copies: GameCopy[],
): { platform: string | null; copies: GameCopy[] }[] {
  const order: string[] = [];
  const byPlatform = new Map<string, GameCopy[]>();
  const blank: GameCopy[] = [];
  for (const c of copies) {
    const p = (c.platform ?? "").trim();
    if (!p) {
      blank.push(c);
      continue;
    }
    if (!byPlatform.has(p)) {
      byPlatform.set(p, []);
      order.push(p);
    }
    byPlatform.get(p)!.push(c);
  }
  const out: { platform: string | null; copies: GameCopy[] }[] = order.map((platform) => ({
    platform,
    copies: byPlatform.get(platform)!,
  }));
  if (blank.length > 0) out.push({ platform: null, copies: blank });
  return out;
}

/** Every version the user OWNS of this catalog game across standalone rows and
 *  compilation children alike (wishlist rows are wants, not ownership). Used
 *  for display hints; routing itself checks per-instance. */
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
 *  wishlist card as "you own another version". */
export function ownedElsewhere(
  games: Game[],
  game: Pick<Game, "id" | "rawgId" | "catalogId">,
): Game | null {
  const key = catalogKey(game);
  if (!key) return null;
  const matches = standaloneMatches(games, key).filter(
    (g) => g.id !== game.id && g.status !== "wishlist",
  );
  return matches.length > 0 ? pickBest(matches) : null;
}

/** Route an Add Game submission against the current library + wishlist. `copies`
 *  must already be canonicalized. */
export function routeAdd(input: {
  games: Game[];
  meta: Pick<Game, "rawgId" | "catalogId">;
  destination: AddDestination;
  copies: GameCopy[];
}): AddRouteDecision {
  const requested = splitCopiesByPlatform(input.copies);
  const key = catalogKey(input.meta);
  // A hand-typed custom game has no shared identity — nothing to match.
  if (!key)
    return {
      kind: "clean",
      groups: (requested.length > 0 ? requested : [{ platform: null, copies: [] }]).map((g) => ({
        ...g,
        action: "new" as const,
      })),
    };

  const standalone = standaloneMatches(input.games, key);
  const libraryRows = standalone.filter((g) => g.status !== "wishlist");
  const wishRows = standalone.filter((g) => g.status === "wishlist");
  const requestedPlatforms = new Set(
    requested.map((g) => g.platform).filter((p): p is string => p != null),
  );

  const withPlatform = (rows: Game[], platform: string) =>
    rows.filter((g) => instancePlatforms(g).includes(platform));

  if (input.destination !== "wishlist") {
    const groups: PlatformAddGroup[] = [];
    // No copies at all (an ongoing game, or nothing tagged yet): an existing
    // owned instance means "pick a specific new version"; otherwise one
    // platform-less card.
    if (requested.length === 0) {
      if (libraryRows.length > 0)
        return { kind: "blocked-duplicate-version", target: pickBest(libraryRows), duplicateVersions: [] };
      groups.push({ platform: null, copies: [], action: "new" });
    }
    for (const g of requested) {
      if (g.platform == null) {
        // A platform-less copy of a game already owned is ambiguous — demand a
        // specific version.
        if (libraryRows.length > 0)
          return {
            kind: "blocked-duplicate-version",
            target: pickBest(libraryRows),
            duplicateVersions: [],
          };
        groups.push({ ...g, action: "new" });
        continue;
      }
      const candidates = withPlatform(libraryRows, g.platform);
      if (candidates.length > 0) {
        const target = pickBest(candidates);
        const conflicts = conflictingVersions(
          ownedVersions(target.copies),
          ownedVersions(g.copies),
        );
        if (conflicts.length > 0)
          return { kind: "blocked-duplicate-version", target, duplicateVersions: conflicts };
        groups.push({ ...g, action: "attach", target });
      } else {
        groups.push({ ...g, action: "new" });
      }
    }

    // Wishlist entries this add fulfills (their platform is being bought, or
    // they list no platform — an ambiguous want any add satisfies). Removed on
    // confirm, with the charter-bypass warning. A wishlist entry for a platform
    // NOT being added is simply untouched — it keeps hunting its own version.
    const intercepts = wishRows.filter((w) => {
      const platforms = instancePlatforms(w);
      if (platforms.length === 0) return true;
      return platforms.some((p) => requestedPlatforms.has(p));
    });

    const needsConfirm =
      intercepts.length > 0 || groups.some((g) => g.action === "attach") || libraryRows.length > 0;
    return needsConfirm ? { kind: "confirm-plan", groups, intercepts } : { kind: "clean", groups };
  }

  // destination === "wishlist": validate at the version level, per platform.
  const groups: PlatformAddGroup[] = [];
  if (requested.length === 0) {
    // A blank wishlist entry duplicates any existing presence of the game.
    if (libraryRows.length > 0 || wishRows.length > 0) {
      return {
        kind: "blocked-duplicate-version",
        target: pickBest([...libraryRows, ...wishRows]),
        duplicateVersions: [],
      };
    }
    groups.push({ platform: null, copies: [], action: "new" });
  }
  for (const g of requested) {
    if (g.platform == null) {
      if (libraryRows.length > 0 || wishRows.length > 0)
        return {
          kind: "blocked-duplicate-version",
          target: pickBest([...libraryRows, ...wishRows]),
          duplicateVersions: [],
        };
      groups.push({ ...g, action: "new" });
      continue;
    }
    // A version already owned on this platform's instance can't be wishlisted.
    const ownedHere = withPlatform(libraryRows, g.platform);
    if (ownedHere.length > 0) {
      const target = pickBest(ownedHere);
      const conflicts = conflictingVersions(ownedVersions(target.copies), ownedVersions(g.copies));
      if (conflicts.length > 0)
        return { kind: "blocked-duplicate-version", target, duplicateVersions: conflicts };
    }
    const wishHere = withPlatform(wishRows, g.platform);
    if (wishHere.length > 0) {
      // Versions the entry already lists (or ambiguous with one) block; only
      // genuinely new ones append.
      const target = pickBest(wishHere);
      const conflicts = conflictingVersions(ownedVersions(target.copies), ownedVersions(g.copies));
      if (conflicts.length > 0)
        return { kind: "blocked-duplicate-version", target, duplicateVersions: conflicts };
      // Dedupe within the request itself, matching the entry's append semantics.
      const seen = new Set<string>();
      const fresh: GameCopy[] = [];
      for (const c of g.copies) {
        const k = versionKey(g.platform, c.format);
        if (seen.has(k)) continue;
        seen.add(k);
        fresh.push(c);
      }
      groups.push({ platform: g.platform, copies: fresh, action: "attach", target });
    } else {
      groups.push({ ...g, action: "new" });
    }
  }
  const needsConfirm = groups.some((g) => g.action === "attach");
  return needsConfirm
    ? { kind: "confirm-plan", groups, intercepts: [] }
    : { kind: "clean", groups };
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

/** The slice of captured version hours belonging to one platform group. */
export function versionHoursForGroup(
  hours: VersionHours[],
  platform: string | null,
): VersionHours[] {
  if (platform == null) return [];
  return hours.filter((vh) => vh.platform === platform);
}

/** Offline mirror of the import-with-charter merge (the SQL in
 *  import_with_charter), platform-aware: importing a wishlist entry merges into
 *  the owned standalone instance that covers EVERY platform the entry lists
 *  (post-split entries list exactly one, so this is "the same platform's
 *  card"), appending its not-yet-owned versions and dropping the wishlist row.
 *  A platform-less entry merges into the best owned instance, as before. With
 *  no covering instance the array is untouched (the caller flips status as
 *  today — the entry becomes its own card, never smearing a foreign platform
 *  onto another platform's instance). */
export function mergeWishlistIntoOwned(
  games: Game[],
  wishlistId: string,
): { games: Game[]; mergedInto: string | null; mergedCopies: GameCopy[] } {
  const row = games.find((g) => g.id === wishlistId && g.status === "wishlist");
  if (!row) return { games, mergedInto: null, mergedCopies: [] };
  const key = catalogKey(row);
  if (!key) return { games, mergedInto: null, mergedCopies: [] };
  const owned = standaloneMatches(games, key).filter(
    (g) => g.id !== row.id && g.status !== "wishlist",
  );
  const rowPlatforms = instancePlatforms(row);
  const candidates = owned.filter((g) => {
    const have = instancePlatforms(g);
    return rowPlatforms.every((p) => have.includes(p));
  });
  if (candidates.length === 0) return { games, mergedInto: null, mergedCopies: [] };
  const target = pickBest(candidates);

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
