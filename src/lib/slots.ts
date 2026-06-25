import type { Game } from "../types";
import { occupantKey } from "./families";

/**
 * Now Playing slots. You can only have as many games "playing" at once as you
 * have open slots — starting (buying) a game requires an open slot, so you're
 * nudged to finish or shelve before piling on another.
 *
 * Slot kinds:
 *   - GENERAL slots accept any game. Every player has a number of them
 *     (default 2); admins can change the count (User Management).
 *   - TARGETED slots are admin-defined and granted per user. Three behaviours:
 *       • standard — accepts games whose length fits an hour rule (e.g. a "Quick
 *         Clear" slot up to 10h). Auto-preferred at purchase.
 *       • endless  — a single ongoing/live-service slot. Length-agnostic and
 *         NEVER auto-filled; the player parks a game in it on purpose (at
 *         purchase, or by moving a playing game in). Doesn't touch general capacity.
 *       • replay   — holds a FINISHED game pulled back into play for free; it's
 *         only entered via the replay action, never a normal start/move.
 *
 * A playing game occupies exactly one slot, recorded on the game (`slotId`:
 * a targeted slot's id, or null for a general slot). When you start a game we
 * prefer an open *matching standard* slot, so general slots stay free for the
 * big games that don't fit anywhere else. This module is the single source of
 * truth for "do I have room to start this game, and where does it go?".
 *
 * Linked editions (a "Game Family") share a single slot: if one version is
 * already playing, starting another version of the same title reuses its slot
 * and consumes no extra capacity. Counting is therefore done per occupant
 * *unit* (a family, or an unlinked game) rather than per game.
 */
export const DEFAULT_GENERAL_SLOTS = 2;

/** A game just enough to plan/measure a slot for. */
type SlotCandidate = Pick<Game, "hours"> & Partial<Pick<Game, "id" | "familyId">>;

/** A targeted slot's behaviour. See the module header. */
export type SlotKind = "standard" | "endless" | "replay";

/** An admin-defined targeted-slot rule. */
export interface SlotDefinition {
  id: string;
  name: string;
  kind: SlotKind;
  minHours: number | null; // null = no lower bound (standard only)
  maxHours: number | null; // null = no upper bound (standard only)
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

/** Distinct occupant units among playing games (a family counts once, however
 *  many of its linked editions are playing). This is the load against capacity. */
export function playingUnits(games: Game[]): number {
  const keys = new Set<string>();
  for (const g of playingGames(games)) keys.add(occupantKey(g));
  return keys.size;
}

/** Distinct occupant units sitting in *general* slots (slotId null). */
export function generalUnitsUsed(playing: Game[]): number {
  const keys = new Set<string>();
  for (const g of playing) if (!g.slotId) keys.add(occupantKey(g));
  return keys.size;
}

/** General-slot capacity (floored at zero, ignores fractions). */
export function slotCapacity(generalSlots: number): number {
  return Math.max(0, Math.floor(generalSlots));
}

/** Total Now Playing capacity = general slots + granted targeted slots. */
export function totalCapacity(generalSlots: number, grants: TargetedSlot[]): number {
  return slotCapacity(generalSlots) + grants.length;
}

/** Does a game of the given length satisfy a targeted slot's rule? Endless and
 *  replay slots are length-agnostic (always eligible). For a standard slot, a
 *  slot with no bounds accepts anything; a game of unknown length can only fill
 *  an unbounded slot (we can't prove it's "under 10h"). */
export function gameMatchesDefinition(hours: number | undefined, def: SlotDefinition): boolean {
  if (def.kind !== "standard") return true;
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

/** Decide which slot a game would occupy if *auto*-placed at purchase. A linked
 *  edition whose family is already playing reuses that slot (no extra capacity).
 *  Otherwise it prefers an open matching STANDARD slot, then a free general slot;
 *  if neither, there's no room. Endless/replay slots are never auto-filled — the
 *  player parks games in them deliberately. `slotId: null` means a general slot. */
export function planSlotForGame(
  game: SlotCandidate,
  playing: Game[],
  generalSlots: number,
  grants: TargetedSlot[],
): SlotPlan {
  // A linked edition shares its family's slot if a sibling is already playing.
  if (game.familyId != null) {
    const sibling = playing.find((g) => g.familyId === game.familyId && g.id !== game.id);
    if (sibling) return { ok: true, slotId: sibling.slotId ?? null };
  }

  const occupied = occupiedTargetedIds(playing);
  const match = grants.find(
    (t) =>
      t.definition.active &&
      t.definition.kind === "standard" &&
      !occupied.has(t.id) &&
      gameMatchesDefinition(game.hours, t.definition),
  );
  if (match) return { ok: true, slotId: match.id };

  const generalUsed = generalUnitsUsed(playing);
  if (generalUsed < slotCapacity(generalSlots)) return { ok: true, slotId: null };

  return { ok: false };
}

/** Open slots of a given kind (active, not currently occupied). */
function openSlotsOfKind(playing: Game[], grants: TargetedSlot[], kind: SlotKind): TargetedSlot[] {
  const occupied = occupiedTargetedIds(playing);
  return grants.filter((t) => t.definition.active && t.definition.kind === kind && !occupied.has(t.id));
}

/** Open Endless slots — a backlog game can be parked in one of these at purchase. */
export function openEndlessSlots(playing: Game[], grants: TargetedSlot[]): TargetedSlot[] {
  return openSlotsOfKind(playing, grants, "endless");
}

/** Open Replay slots — a finished game can be pulled back into one of these. */
export function openReplaySlots(playing: Game[], grants: TargetedSlot[]): TargetedSlot[] {
  return openSlotsOfKind(playing, grants, "replay");
}

/** Is the given slot a Replay slot? (Drives the reduced replay-finish bonus.) */
export function isReplaySlot(slotId: string | null | undefined, grants: TargetedSlot[]): boolean {
  if (slotId == null) return false;
  return grants.some((t) => t.id === slotId && t.definition.kind === "replay");
}

/** Open targeted slots (other than the one this game already holds) a playing
 *  game can move into: matching STANDARD slots and any ENDLESS slot. Replay slots
 *  are excluded (entered only via the replay action). Moving a game out of a
 *  general slot into one of these frees the general slot for something else. */
export function movableTargetedSlots(
  game: Pick<Game, "hours" | "slotId">,
  playing: Game[],
  grants: TargetedSlot[],
): TargetedSlot[] {
  const occupied = occupiedTargetedIds(playing);
  return grants.filter(
    (t) =>
      t.definition.active &&
      t.definition.kind !== "replay" &&
      t.id !== game.slotId &&
      !occupied.has(t.id) &&
      gameMatchesDefinition(game.hours, t.definition),
  );
}

/** Can the player start (buy) this specific game right now? True if it auto-places
 *  (matching standard / general slot) OR there's an open Endless slot to park it
 *  in by choice. */
export function canStartGame(
  game: SlotCandidate,
  games: Game[],
  generalSlots: number,
  grants: TargetedSlot[] = [],
): boolean {
  const playing = playingGames(games);
  return (
    planSlotForGame(game, playing, generalSlots, grants).ok ||
    openEndlessSlots(playing, grants).length > 0
  );
}

/** How many slots are free right now, across general + targeted (never
 *  negative, even if an admin lowered capacity below the current load). A family
 *  counts as a single occupant however many of its editions are playing. */
export function openSlots(games: Game[], generalSlots: number, grants: TargetedSlot[] = []): number {
  return Math.max(0, totalCapacity(generalSlots, grants) - playingUnits(games));
}
