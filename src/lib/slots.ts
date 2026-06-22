import type { Game } from "../types";

/**
 * Now Playing slots. You can only have as many games "playing" at once as you
 * have open slots — starting (buying) a game requires an open slot, so you're
 * nudged to finish or shelve before piling on another.
 *
 * Phase 1: every player has a number of *general* slots (default 2) that accept
 * any game. Admins can change a player's count (User Management). Targeted slots
 * with hour constraints are layered on later — this module is the single source
 * of truth for "do I have room to start another game?" so that stays easy.
 */
export const DEFAULT_GENERAL_SLOTS = 2;

/** Games that currently occupy a Now Playing slot. */
export function playingGames(games: Game[]): Game[] {
  return games.filter((g) => g.status === "playing");
}

/** Total Now Playing capacity for a player. */
export function slotCapacity(generalSlots: number): number {
  return Math.max(0, Math.floor(generalSlots));
}

/** How many slots are free right now (never negative, even if over capacity
 *  after an admin lowers someone's slot count). */
export function openSlots(games: Game[], generalSlots: number): number {
  return Math.max(0, slotCapacity(generalSlots) - playingGames(games).length);
}

/** Can the player start (buy) another game right now? */
export function canStartGame(games: Game[], generalSlots: number): boolean {
  return openSlots(games, generalSlots) > 0;
}
