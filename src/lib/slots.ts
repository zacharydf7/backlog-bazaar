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

/** The game metadata a STANDARD slot matches against (all optional — a missing
 *  field just can't satisfy a bounded criterion). */
type SlotMatchFields = Partial<
  Pick<Game, "hours" | "released" | "genres" | "platforms" | "metacritic">
>;

/** A game just enough to plan/measure a slot for. */
type SlotCandidate = SlotMatchFields & Partial<Pick<Game, "id" | "familyId">>;

/** A targeted slot's behaviour. See the module header. */
export type SlotKind = "standard" | "endless" | "replay";

/** An admin-defined targeted-slot rule. A STANDARD slot matches a game when it
 *  satisfies every *set* criterion (AND); endless/replay ignore all criteria. */
export interface SlotDefinition {
  id: string;
  name: string;
  kind: SlotKind;
  minHours: number | null; // null = no lower bound
  maxHours: number | null; // null = no upper bound
  minYear: number | null; // release-year lower bound (e.g. "Modern" ≥ 2015)
  maxYear: number | null; // release-year upper bound (e.g. "Classic" ≤ 2009)
  minMetacritic: number | null;
  maxMetacritic: number | null;
  genres: string[]; // any-of (case-insensitive); empty = no constraint
  platforms: string[]; // any-of (case-insensitive); empty = no constraint. Doubles as a group (e.g. "Handheld")
  defaultGrantCount: number; // copies granted to new accounts by default (admin loadout)
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

/** Distinct occupant units sitting in *general* slots (slotId null). Rotation-lane
 *  games also have a null slotId but occupy no focus slot, so they're excluded. */
export function generalUnitsUsed(playing: Game[]): number {
  const keys = new Set<string>();
  for (const g of playing) if (!g.slotId && !g.inRotation) keys.add(occupantKey(g));
  return keys.size;
}

/** Games currently in the Rotation lane (playing + flagged). */
export function rotationGames(games: Game[]): Game[] {
  return games.filter((g) => g.status === "playing" && g.inRotation);
}

/** Distinct occupant units in the Rotation lane (a linked family counts once). */
export function rotationUnitsUsed(games: Game[]): number {
  const keys = new Set<string>();
  for (const g of rotationGames(games)) keys.add(occupantKey(g));
  return keys.size;
}

/** Open Rotation-lane room right now (never negative). */
export function openRotation(games: Game[], rotationSlots: number): number {
  return Math.max(0, Math.max(0, Math.floor(rotationSlots)) - rotationUnitsUsed(games));
}

/** Can this game enter the Rotation lane right now? True when the lane has an open
 *  unit of capacity — a game already in the lane never counts against itself. */
export function canEnterRotation(
  game: { id?: string; familyId?: string | null },
  games: Game[],
  rotationSlots: number,
): boolean {
  const unit = occupantKey(game as Game);
  const used = new Set<string>();
  for (const g of rotationGames(games)) {
    const k = occupantKey(g);
    if (k !== unit) used.add(k);
  }
  return used.size < Math.max(0, Math.floor(rotationSlots));
}

/** General-slot capacity (floored at zero, ignores fractions). */
export function slotCapacity(generalSlots: number): number {
  return Math.max(0, Math.floor(generalSlots));
}

/** Total Now Playing capacity = general slots + granted targeted slots. */
export function totalCapacity(generalSlots: number, grants: TargetedSlot[]): number {
  return slotCapacity(generalSlots) + grants.length;
}

function inRange(value: number | null | undefined, min: number | null, max: number | null): boolean {
  if (min != null && !(value != null && value >= min)) return false;
  if (max != null && !(value != null && value <= max)) return false;
  return true;
}

/** Case-insensitive "any-of": does the game's list intersect the slot's? An empty
 *  slot list imposes no constraint. */
function anyOf(slotList: string[], gameList: string[] | undefined): boolean {
  if (slotList.length === 0) return true;
  const have = new Set((gameList ?? []).map((s) => s.toLowerCase()));
  return slotList.some((s) => have.has(s.toLowerCase()));
}

/** Does a game satisfy a targeted slot's rules? Endless and replay slots are
 *  criteria-agnostic (always eligible). A STANDARD slot must satisfy every set
 *  criterion (AND): hours/release-year/Metacritic ranges plus any-of genre and
 *  platform lists. A bounded numeric range rejects an unknown value (we can't
 *  prove an unknown length is "under 10h"). Mirrors the SQL `slot_matches`. */
export function gameMatchesDefinition(game: SlotMatchFields, def: SlotDefinition): boolean {
  if (def.kind !== "standard") return true;
  const year = game.released ? Number(game.released.slice(0, 4)) : null;
  return (
    inRange(game.hours, def.minHours, def.maxHours) &&
    inRange(year, def.minYear, def.maxYear) &&
    inRange(game.metacritic ?? null, def.minMetacritic, def.maxMetacritic) &&
    anyOf(def.genres, game.genres) &&
    anyOf(def.platforms, game.platforms)
  );
}

/** A short human summary of a slot's matching rules (for chips/badges/options).
 *  The single source of truth for slot rule labels across the app. */
export function slotCriteriaSummary(def: SlotDefinition): string {
  if (def.kind === "endless") return "ongoing · any length";
  if (def.kind === "replay") return "replay finished games";
  const parts: string[] = [];
  const hours = boundText(def.minHours, def.maxHours, "h");
  if (hours) parts.push(hours);
  const years = boundText(def.minYear, def.maxYear, "", true);
  if (years) parts.push(years);
  if (def.genres.length) parts.push(def.genres.join("/"));
  if (def.platforms.length) parts.push(def.platforms.join("/"));
  const mc = boundText(def.minMetacritic, def.maxMetacritic, "", false, "MC ");
  if (mc) parts.push(mc);
  return parts.length ? parts.join(" · ") : "any game";
}

/** Render a min/max bound as a compact label, e.g. "≤10h", "≥40h", "2010–2015",
 *  "MC 85+". `plain` years drop the unit; `prefix` leads (e.g. "MC "). */
function boundText(
  min: number | null,
  max: number | null,
  unit: string,
  plain = false,
  prefix = "",
): string {
  if (min == null && max == null) return "";
  const u = plain ? "" : unit;
  if (min != null && max != null) return `${prefix}${min}–${max}${u}`;
  if (max != null) return `${prefix}≤${max}${u}`;
  return `${prefix}${min}${u}+`;
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
      gameMatchesDefinition(game, t.definition),
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
 *  game can move into: matching STANDARD slots only. Replay slots are entered via
 *  the replay action; the Rotation lane is a separate move (see canEnterRotation).
 *  Moving a game out of a general slot into one of these frees the general slot. */
export function movableTargetedSlots(
  game: SlotMatchFields & Pick<Game, "slotId">,
  playing: Game[],
  grants: TargetedSlot[],
): TargetedSlot[] {
  const occupied = occupiedTargetedIds(playing);
  return grants.filter(
    (t) =>
      t.definition.active &&
      t.definition.kind === "standard" &&
      t.id !== game.slotId &&
      !occupied.has(t.id) &&
      gameMatchesDefinition(game, t.definition),
  );
}

/** Can the player start (buy) this specific game right now? True if it auto-places
 *  into a focus slot (matching standard / general) OR the Rotation lane has room. */
export function canStartGame(
  game: SlotCandidate,
  games: Game[],
  generalSlots: number,
  grants: TargetedSlot[] = [],
  rotationSlots = 0,
): boolean {
  const playing = playingGames(games);
  return (
    planSlotForGame(game, playing, generalSlots, grants).ok ||
    canEnterRotation(game, games, rotationSlots)
  );
}

/** How many slots are free right now, across general + targeted (never
 *  negative, even if an admin lowered capacity below the current load). A family
 *  counts as a single occupant however many of its editions are playing. */
export function openSlots(games: Game[], generalSlots: number, grants: TargetedSlot[] = []): number {
  return Math.max(0, totalCapacity(generalSlots, grants) - playingUnits(games));
}

/** Where a player chooses to start a game: let the server auto-place, force a
 *  general slot, a specific targeted slot, or the (free) Rotation lane. The first
 *  three map to apply_purchase's p_slot/p_general; "rotation" routes to
 *  enter_rotation instead (no coins). */
export type SlotChoice =
  | { kind: "auto" }
  | { kind: "general" }
  | { kind: "slot"; id: string }
  | { kind: "rotation" };

/** One selectable option in the activation slot picker. */
export interface StartOption {
  choice: SlotChoice;
  kind: SlotKind | "general" | "rotation";
  label: string; // the slot's display name ("General slot", "Quick Play", "Rotation", …)
  sub: string; // its rule ("any game", "≤10h", "ongoing · free", …)
}

/** The places a backlog game can start in right now, for the activation picker: a
 *  General option (when a general slot is free), every open matching STANDARD slot,
 *  and a single Rotation-lane option (free) when the lane has room. Replay slots are
 *  excluded (entered only from a finished game). Order: General, standard, Rotation. */
export function eligibleStartSlots(
  game: SlotCandidate,
  playing: Game[],
  generalSlots: number,
  grants: TargetedSlot[],
  rotationSlots = 0,
): StartOption[] {
  const options: StartOption[] = [];
  if (generalUnitsUsed(playing) < slotCapacity(generalSlots)) {
    options.push({ choice: { kind: "general" }, kind: "general", label: "General slot", sub: "any game" });
  }
  const occupied = occupiedTargetedIds(playing);
  const open = grants.filter((t) => t.definition.active && !occupied.has(t.id));
  for (const t of open) {
    if (t.definition.kind === "standard" && gameMatchesDefinition(game, t.definition)) {
      options.push({
        choice: { kind: "slot", id: t.id },
        kind: "standard",
        label: t.definition.name,
        sub: slotCriteriaSummary(t.definition),
      });
    }
  }
  if (canEnterRotation(game, playing, rotationSlots)) {
    options.push({ choice: { kind: "rotation" }, kind: "rotation", label: "Rotation", sub: "ongoing · free" });
  }
  return options;
}

/** The smart default selection for the activation picker: the slot auto-placement
 *  would pick (matching standard → that slot, else general), or — when nothing
 *  auto-places (e.g. only the Rotation lane is open) — the first eligible option. */
export function defaultStartChoice(
  game: SlotCandidate,
  playing: Game[],
  generalSlots: number,
  grants: TargetedSlot[],
  rotationSlots = 0,
): SlotChoice {
  const plan = planSlotForGame(game, playing, generalSlots, grants);
  if (plan.ok) return plan.slotId == null ? { kind: "general" } : { kind: "slot", id: plan.slotId };
  return eligibleStartSlots(game, playing, generalSlots, grants, rotationSlots)[0]?.choice ?? { kind: "auto" };
}
