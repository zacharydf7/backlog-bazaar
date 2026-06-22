// Game Families: linking different editions, remasters, or cross-platform
// releases of the same core title into one group so you can see cumulative
// playtime/cost across the whole property, while each version keeps its own
// status. Linked games share a `familyId` (a plain grouping uuid — not a
// foreign key). A game with no familyId is "unlinked" and is its own family of
// one. See families across the store, slot logic (a family shares one Now
// Playing slot), and the economy (only the first family clear pays full).

import type { Game, GameStatus } from "../types";
import { ownedPlatformSummary, totalCost } from "./copies";

/** A fresh family id. Falls back to a cheap unique string where
 *  crypto.randomUUID isn't available (older browsers / some test envs). */
export function newFamilyId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return "fam-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** True if a game is linked to at least one other edition. */
export function isLinked(game: Pick<Game, "familyId">): boolean {
  return game.familyId != null;
}

/** Every game in `game`'s family, including itself (collection order). An
 *  unlinked game's family is just itself. */
export function familyMembers(games: Game[], game: Pick<Game, "id" | "familyId">): Game[] {
  if (game.familyId == null) return games.filter((g) => g.id === game.id);
  return games.filter((g) => g.familyId === game.familyId);
}

/** The other editions linked to a game (its family minus itself). */
export function familySiblings(games: Game[], game: Pick<Game, "id" | "familyId">): Game[] {
  if (game.familyId == null) return [];
  return games.filter((g) => g.familyId === game.familyId && g.id !== game.id);
}

export interface FamilyStats {
  count: number; // number of versions in the family
  totalPlayed: number; // summed played hours across all versions
  totalCost: number; // summed real-world acquisition cost (USD) across all copies
  finishedCount: number; // how many versions are finished
}

/** Aggregate playtime + real-world cost across a family's members. */
export function familyStats(members: Game[]): FamilyStats {
  let totalPlayed = 0;
  let totalCost_ = 0;
  let finishedCount = 0;
  for (const m of members) {
    totalPlayed += m.playedHours ?? 0;
    totalCost_ += totalCost(m.copies);
    if (m.status === "finished") finishedCount++;
  }
  return {
    count: members.length,
    totalPlayed: Math.round(totalPlayed * 60) / 60, // snap to the minute
    totalCost: totalCost_,
    finishedCount,
  };
}

// --- Master Cards: collapsing a family into one board card -----------------

// Board priority: a family's Master Card lives on the board of its highest-
// priority member. Now Playing > Bazaar > Wishlist > Finished.
export const STATUS_PRIORITY: Record<GameStatus, number> = {
  playing: 3,
  backlog: 2,
  wishlist: 1,
  finished: 0,
};

/** The member that represents a family on the board: the highest-priority
 *  status, tie-broken by earliest-added for stability. It supplies the Master
 *  Card's face (cover art + title) and the family's effective status. */
export function representativeMember(members: Game[]): Game {
  return [...members].sort(
    (a, b) =>
      STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status] ||
      (a.addedAt ?? 0) - (b.addedAt ?? 0),
  )[0];
}

/** A board "unit": either a standalone game or a whole family, with the
 *  representative member that decides where it sits and what it shows. */
export interface GameUnit {
  key: string; // familyId (family) or game id (standalone)
  members: Game[]; // 1 for a standalone, >1 for a family
  isFamily: boolean;
  rep: Game; // representative member (face + effective status)
  status: GameStatus; // effective status (rep's status)
}

function makeUnit(key: string, members: Game[]): GameUnit {
  const rep = representativeMember(members);
  return { key, members, isFamily: members.length > 1, rep, status: rep.status };
}

/** Collapse a games list into units: one per family (grouped by familyId), plus
 *  each unlinked game on its own. Callers sort the result for display. */
export function buildUnits(games: Game[]): GameUnit[] {
  const byFam = new Map<string, Game[]>();
  const units: GameUnit[] = [];
  for (const g of games) {
    if (g.familyId == null) {
      units.push(makeUnit(g.id, [g]));
    } else {
      const arr = byFam.get(g.familyId);
      if (arr) arr.push(g);
      else byFam.set(g.familyId, [g]);
    }
  }
  for (const [fam, members] of byFam) units.push(makeUnit(fam, members));
  return units;
}

/** The family's display name: the editable name set on any member (denormalized
 *  across the family), falling back to the representative edition's title. */
export function familyName(members: Game[]): string {
  const named = members.find((m) => m.familyName && m.familyName.trim());
  return named?.familyName?.trim() || representativeMember(members).title;
}

/** The distinct platforms a family spans, for the Master Card's tags: the
 *  platforms you own copies on across every edition, falling back to the
 *  editions' available platforms when no copies are recorded. */
export function familyPlatformTags(members: Game[]): string[] {
  const owned = new Set<string>();
  for (const m of members) {
    for (const o of ownedPlatformSummary(m.copies)) owned.add(o.platform);
  }
  if (owned.size > 0) return [...owned];
  const available = new Set<string>();
  for (const m of members) for (const p of m.platforms ?? []) available.add(p);
  return [...available];
}

/** Which "occupant unit" a game belongs to for Now Playing slot counting:
 *  its family (so linked editions share one slot) or, unlinked, itself. */
export function occupantKey(game: Pick<Game, "id" | "familyId">): string {
  return game.familyId ?? game.id;
}

/** Would finishing this game be a "replay" — i.e. has another edition in its
 *  family already been finished? (The first family clear pays full; replays pay
 *  the smaller bonus.) */
export function isReplayFinish(games: Game[], game: Pick<Game, "id" | "familyId">): boolean {
  return familySiblings(games, game).some((g) => g.status === "finished");
}

/** Link two games into one family (merging their existing families if any).
 *  Returns a new games array. No-ops if either id is missing or they're already
 *  in the same family. */
export function applyLink(games: Game[], aId: string, bId: string): Game[] {
  if (aId === bId) return games;
  const a = games.find((g) => g.id === aId);
  const b = games.find((g) => g.id === bId);
  if (!a || !b) return games;
  if (a.familyId != null && a.familyId === b.familyId) return games;

  // Keep an existing family id if there is one (prefer a's), else mint a new one.
  const fam = a.familyId ?? b.familyId ?? newFamilyId();
  const oldFams = new Set([a.familyId, b.familyId].filter((f): f is string => f != null));

  return games.map((g) => {
    const inPair = g.id === aId || g.id === bId;
    const inOldFamily = g.familyId != null && oldFams.has(g.familyId);
    return inPair || inOldFamily ? { ...g, familyId: fam } : g;
  });
}

/** Remove one game from its family. If that leaves a single lonely member, the
 *  remaining member is unlinked too (a "family" of one is meaningless). Returns
 *  a new games array. */
export function applyUnlink(games: Game[], id: string): Game[] {
  const game = games.find((g) => g.id === id);
  if (!game || game.familyId == null) return games;
  const fam = game.familyId;

  const detached = games.map((g) => (g.id === id ? { ...g, familyId: null } : g));
  const remaining = detached.filter((g) => g.familyId === fam);
  if (remaining.length <= 1) {
    return detached.map((g) => (g.familyId === fam ? { ...g, familyId: null } : g));
  }
  return detached;
}
