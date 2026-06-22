import type { Game } from "../types";

/**
 * Now Playing slots. You can only have as many games "playing" at once as you
 * have open slots — starting (buying) a game requires an open slot, so you're
 * nudged to finish or shelve before piling on another.
 *
 * Two kinds of slot:
 *   - GENERAL slots accept any game. Every player has a number of them
 *     (default 2); admins can change the count (User Management).
 *   - TARGETED slots only accept games whose length fits an admin-defined rule
 *     (e.g. a "Quick Clear" slot for games under 10h). They're granted per user.
 *
 * A playing game occupies exactly one slot, recorded on the game (`slotId`:
 * a targeted slot's id, or null for a general slot). When you start a game we
 * prefer an open *matching targeted* slot, so general slots stay free for the
 * big games that don't fit anywhere else. This module is the single source of
 * truth for "do I have room to start this game, and where does it go?".
 */
export const DEFAULT_GENERAL_SLOTS = 2;

/** An admin-defined targeted-slot rule. */
export interface SlotDefinition {
  id: string;
  name: string;
  minHours: number | null; // null = no lower bound
  maxHours: number | null; // null = no upper bound
  active: boolean;
}

/** A targeted slot granted to a user (one row = one usable slot). */
export interface TargetedSlot {
  id: string; // the grant id, stored on a game's slotId when it occupies this slot
  definition: SlotDefinition;
}

/** Games that currently occupy a Now Playing slot. */
export function playingGames(games: Game[]): Game[] {
  return games.filter((g) => g.status === "playing");
}

/** General-slot capacity (floored at zero, ignores fractions). */
export function slotCapacity(generalSlots: number): number {
  return Math.max(0, Math.floor(generalSlots));
}

/** Total Now Playing capacity = general slots + granted targeted slots. */
export function totalCapacity(generalSlots: number, grants: TargetedSlot[]): number {
  return slotCapacity(generalSlots) + grants.length;
}

/** Does a game of the given length satisfy a targeted slot's rule? A slot with
 *  no bounds accepts anything; a game of unknown length can only fill an
 *  unbounded slot (we can't prove it's "under 10h"). */
export function gameMatchesDefinition(hours: number | undefined, def: SlotDefinition): boolean {
  if (def.minHours == null && def.maxHours == null) return true;
  if (hours == null) return false;
  if (def.minHours != null && hours < def.minHours) return false;
  if (def.maxHours != null && hours > def.maxHours) return false;
  return true;
}

function occupiedTargetedIds(playing: Game[]): Set<string> {
  const ids = new Set<string>();
  for (const g of playing) if (g.slotId) ids.add(g.slotId);
  return ids;
}

export type SlotPlan = { ok: true; slotId: string | null } | { ok: false };

/** Decide which slot a game would occupy if started now. Prefers an open
 *  matching targeted slot, then a free general slot; otherwise there's no room.
 *  `slotId: null` means a general slot. */
export function planSlotForGame(
  game: Pick<Game, "hours">,
  playing: Game[],
  generalSlots: number,
  grants: TargetedSlot[],
): SlotPlan {
  const occupied = occupiedTargetedIds(playing);
  const match = grants.find(
    (t) =>
      t.definition.active && !occupied.has(t.id) && gameMatchesDefinition(game.hours, t.definition),
  );
  if (match) return { ok: true, slotId: match.id };

  const generalUsed = playing.filter((g) => !g.slotId).length;
  if (generalUsed < slotCapacity(generalSlots)) return { ok: true, slotId: null };

  return { ok: false };
}

/** Open targeted slots (other than the one this game already holds) that the
 *  game is eligible to move into. Moving a game out of a general slot into one
 *  of these frees the general slot for something that doesn't fit anywhere. */
export function movableTargetedSlots(
  game: Pick<Game, "hours" | "slotId">,
  playing: Game[],
  grants: TargetedSlot[],
): TargetedSlot[] {
  const occupied = occupiedTargetedIds(playing);
  return grants.filter(
    (t) =>
      t.definition.active &&
      t.id !== game.slotId &&
      !occupied.has(t.id) &&
      gameMatchesDefinition(game.hours, t.definition),
  );
}

/** Can the player start (buy) this specific game right now? */
export function canStartGame(
  game: Pick<Game, "hours">,
  games: Game[],
  generalSlots: number,
  grants: TargetedSlot[] = [],
): boolean {
  return planSlotForGame(game, playingGames(games), generalSlots, grants).ok;
}

/** How many slots are free right now, across general + targeted (never
 *  negative, even if an admin lowered capacity below the current load). */
export function openSlots(games: Game[], generalSlots: number, grants: TargetedSlot[] = []): number {
  return Math.max(0, totalCapacity(generalSlots, grants) - playingGames(games).length);
}
