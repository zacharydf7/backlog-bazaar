// Game Families: linking different editions, remasters, or cross-platform
// releases of the same core title into one group that plays as ONE playthrough.
// Linked games share a `familyId` (a plain grouping uuid — not a foreign key)
// and the family renders as a single, indivisible unified card: the PRIMARY
// member's record (its board, box art, actions — see familyPrimary below), with
// every other member hidden from boards/ledger until the link is severed. A
// game with no familyId is "unlinked" and is its own family of one. See
// families across the store, slot logic (a family shares one Now Playing slot),
// and the economy (only the first family clear pays full).

import type { Game, GameStatus } from "../types";
import { ownedPlatformSummary, totalCost, type PlatformOwnership } from "./copies";

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

// --- Family identity helpers -----------------------------------------------

// Status priority: when a family needs a single representative (its display
// name, the focused card's active edition and board), prefer the
// highest-priority member. Now Playing > Bazaar > Wishlist > Finished.
// The focused family card renders on the representative's board (see
// src/lib/familyGrouping.ts); a family split via familySplit falls back to
// one decentralized card per edition.
export const STATUS_PRIORITY: Record<GameStatus, number> = {
  playing: 3,
  backlog: 2,
  wishlist: 1,
  finished: 0,
};

/** The member that represents a family for its name: the highest-priority
 *  status, tie-broken by earliest-added for stability. */
export function representativeMember(members: Game[]): Game {
  return [...members].sort(
    (a, b) =>
      STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status] ||
      (a.addedAt ?? 0) - (b.addedAt ?? 0),
  )[0];
}

/** The family's display name: the editable name set on any member (denormalized
 *  across the family), falling back to the primary edition's title. */
export function familyName(members: Game[]): string {
  const named = members.find((m) => m.familyName && m.familyName.trim());
  return named?.familyName?.trim() || familyPrimary(members).title;
}

/** The family's PRIMARY member — the edition the unified card renders (its
 *  board, box art, actions) and the record all card-driven playtime, milestones
 *  and notes route to. The stored designation wins (denormalized like
 *  family_name; validated against the current members so a stale pointer from
 *  a merge/deletion falls through); a legacy family with no designation falls
 *  back to the representative member until its owner picks one. */
export function familyPrimary(members: Game[]): Game {
  const chosenId = members.find((m) => m.familyPrimaryGameId)?.familyPrimaryGameId;
  const chosen = chosenId ? members.find((m) => m.id === chosenId) : undefined;
  return chosen ?? representativeMember(members);
}

/** The unified card's platform tags: every member's owned platforms side by
 *  side, with the primary's first (the issue's "visually prioritized"), then
 *  the siblings' in collection order. Same-platform copies across members merge
 *  into one tag (formats union), exactly like a single game's summary. */
export function familyPlatformTags(members: Game[]): PlatformOwnership[] {
  const primary = familyPrimary(members);
  const ordered = [primary, ...members.filter((m) => m.id !== primary.id)];
  return ownedPlatformSummary(ordered.flatMap((m) => m.copies ?? []));
}

/** Ids of the non-primary members of every ≥2-member family — the rows the
 *  unified card hides. Surfaces that list games as entries (boards, the Master
 *  Ledger, profile shelves) filter these out; the rows themselves — and their
 *  own game pages — stay fully intact, and severing the family restores them. */
export function hiddenFamilySiblingIds(games: Game[]): Set<string> {
  const byFamily = new Map<string, Game[]>();
  for (const g of games) {
    if (g.familyId == null) continue;
    const list = byFamily.get(g.familyId);
    if (list) list.push(g);
    else byFamily.set(g.familyId, [g]);
  }
  const hidden = new Set<string>();
  for (const members of byFamily.values()) {
    if (members.length < 2) continue;
    const primary = familyPrimary(members);
    for (const m of members) if (m.id !== primary.id) hidden.add(m.id);
  }
  return hidden;
}

/** A games list with hidden family siblings removed — what card/entry surfaces
 *  outside the board pipeline (Master Ledger, profile shelves) should render. */
export function visibleLibrary(games: Game[]): Game[] {
  const hidden = hiddenFamilySiblingIds(games);
  return hidden.size === 0 ? games : games.filter((g) => !hidden.has(g.id));
}

/** Which "occupant unit" a game belongs to for Now Playing slot counting:
 *  its family (so linked editions share one slot) or, unlinked, itself. */
export function occupantKey(game: Pick<Game, "id" | "familyId">): string {
  return game.familyId ?? game.id;
}

/** A sibling that counts as the family's clear: finished, but NOT retired — a
 *  retired edition is an admitted non-clear, so it neither downgrades a future
 *  finish to the Replay Bonus nor discounts a re-entry. Keeping both directions
 *  keyed on the same predicate avoids a discount-in/full-bounty-out asymmetry. */
function isClearedSibling(g: Game): boolean {
  return g.status === "finished" && g.finishTag !== "retired";
}

/** Would finishing this game be a "replay" — i.e. has another edition in its
 *  family already been finished? (The first family clear pays full; replays pay
 *  the smaller bonus.) A retired sibling doesn't count — it was never cleared. */
export function isReplayFinish(games: Game[], game: Pick<Game, "id" | "familyId">): boolean {
  return familySiblings(games, game).some(isClearedSibling);
}

/** Whether a Bazaar edition qualifies for the Family Discount: another edition
 *  of its family is already active or done (Now Playing or Finished), so this
 *  one's finish would likely pay only the Replay Bonus — its activation fee
 *  drops by the same ratio (see computeFamilyDiscountPrice). Derived live from
 *  family state, never stored: unlinking the game or removing the qualifying
 *  sibling instantly restores the full price. A retired sibling never qualifies
 *  (mirroring isReplayFinish, so cost and payout stay in step). */
export function isFamilyDiscounted(
  games: Game[],
  game: Pick<Game, "id" | "familyId" | "status">,
): boolean {
  if (game.status !== "backlog") return false;
  return familySiblings(games, game).some(
    (g) => g.status === "playing" || isClearedSibling(g),
  );
}

/** Link two games into one family (merging their existing families if any),
 *  optionally designating the PRIMARY member (denormalized across the family —
 *  mirrors the link_games RPC; when omitted, the merged family's existing
 *  designation stands). Returns a new games array. No-ops if either id is
 *  missing or they're already in the same family. */
export function applyLink(
  games: Game[],
  aId: string,
  bId: string,
  primaryId?: string | null,
): Game[] {
  if (aId === bId) return games;
  const a = games.find((g) => g.id === aId);
  const b = games.find((g) => g.id === bId);
  if (!a || !b) return games;
  if (a.familyId != null && a.familyId === b.familyId) return games;

  // Keep an existing family id if there is one (prefer a's), else mint a new one.
  const fam = a.familyId ?? b.familyId ?? newFamilyId();
  const oldFams = new Set([a.familyId, b.familyId].filter((f): f is string => f != null));
  const inFamily = (g: Game) =>
    g.id === aId || g.id === bId || (g.familyId != null && oldFams.has(g.familyId));

  // Resolve the primary: an explicit choice wins; else the merged family's
  // stored designation (validated against the merged membership) stands.
  const members = games.filter(inFamily);
  const stored = members.find((m) => m.familyPrimaryGameId)?.familyPrimaryGameId;
  const primary =
    primaryId ?? (stored && members.some((m) => m.id === stored) ? stored : null);

  return games.map((g) =>
    inFamily(g) ? { ...g, familyId: fam, familyPrimaryGameId: primary } : g,
  );
}

/** Remove one game from its family: it leaves as a clean standalone card (all
 *  denormalized family fields cleared), and if it was the primary the survivors
 *  fall back to the representative until a new one is designated. If a single
 *  lonely member would remain, it's unlinked too (a "family" of one is
 *  meaningless). Returns a new games array. Mirrors the unlink_game RPC. */
export function applyUnlink(games: Game[], id: string): Game[] {
  const game = games.find((g) => g.id === id);
  if (!game || game.familyId == null) return games;
  const fam = game.familyId;

  const clearFamily = (g: Game): Game => ({
    ...g,
    familyId: null,
    familyName: undefined,
    familyImage: undefined,
    familyCoverGameId: null,
    familySplit: false,
    familyPrimaryGameId: null,
  });

  const detached = games.map((g) => {
    if (g.id === id) return clearFamily(g);
    if (g.familyId === fam && g.familyPrimaryGameId === id) {
      return { ...g, familyPrimaryGameId: null };
    }
    return g;
  });
  const remaining = detached.filter((g) => g.familyId === fam);
  if (remaining.length <= 1) {
    return detached.map((g) => (g.familyId === fam ? clearFamily(g) : g));
  }
  return detached;
}

/** The Now Playing edition that blocks reassigning the family's primary to
 *  `newId`, or null when the change is allowed. Zero-migration rule: nothing
 *  moves on a primary change, so reassigning away from a mid-run edition would
 *  leave a hidden row silently holding the family's slot and sunk activation
 *  fee — shelve (refund), finish, or retire it first. Mirrors the
 *  set_family_primary RPC's guard so the UI can disable/explain up front. */
export function primaryChangeBlocker(members: Game[], newId: string): Game | null {
  const current = familyPrimary(members);
  if (current.id === newId) return null;
  return current.status === "playing" ? current : null;
}

/** "Set as primary", applied to a local games array — the pure twin of the
 *  set_family_primary RPC. DESIGNATION ONLY: the pointer is re-stamped across
 *  the family and absolutely nothing else moves — historical playtime, notes
 *  and milestones stay permanently on the record that earned them (the unified
 *  card sums playtime across members for display), and only NEW logging routes
 *  to the new primary. Callers check primaryChangeBlocker first. */
export function applySetPrimary(games: Game[], familyId: string, newId: string): Game[] {
  if (!games.some((g) => g.familyId === familyId && g.id === newId)) return games;
  return games.map((g) =>
    g.familyId === familyId ? { ...g, familyPrimaryGameId: newId } : g,
  );
}

/** The cover a family's card should wear: the designated member's LIVE image
 *  (family_cover_game_id, denormalized like family_name; validated against the
 *  current members so a stale pointer falls through), else undefined — callers
 *  fall back to the primary's own cover. */
export function familyCoverImage(members: Game[]): string | undefined {
  const chosenId = members.find((m) => m.familyCoverGameId)?.familyCoverGameId;
  const chosen = chosenId ? members.find((m) => m.id === chosenId) : undefined;
  return chosen?.image || undefined;
}

/** "Use this edition's cover", applied to a local games array — the pure twin
 *  of the set_family_cover RPC (member-cover path). Purely cosmetic: only the
 *  denormalized pointer changes; null restores the primary's own cover. */
export function applySetFamilyCover(
  games: Game[],
  familyId: string,
  coverGameId: string | null,
): Game[] {
  if (coverGameId != null && !games.some((g) => g.familyId === familyId && g.id === coverGameId)) {
    return games;
  }
  return games.map((g) =>
    g.familyId === familyId ? { ...g, familyCoverGameId: coverGameId } : g,
  );
}

/** Sever a whole family: every member returns as a clean standalone card.
 *  Mirrors the sever_family RPC (local/optimistic twin). */
export function applySever(games: Game[], familyId: string): Game[] {
  return games.map((g) =>
    g.familyId === familyId
      ? {
          ...g,
          familyId: null,
          familyName: undefined,
          familyImage: undefined,
          familyCoverGameId: null,
          familySplit: false,
          familyPrimaryGameId: null,
        }
      : g,
  );
}
