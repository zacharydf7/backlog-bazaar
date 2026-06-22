import { describe, it, expect } from "vitest";
import {
  DEFAULT_GENERAL_SLOTS,
  playingGames,
  slotCapacity,
  openSlots,
  canStartGame,
} from "./slots";
import type { Game, GameStatus } from "../types";

const game = (status: GameStatus, over: Partial<Game> = {}): Game => ({
  id: Math.random().toString(36).slice(2),
  title: "G",
  genres: [],
  status,
  addedAt: Date.now(),
  ...over,
});

describe("slots", () => {
  it("defaults to 2 general slots", () => {
    expect(DEFAULT_GENERAL_SLOTS).toBe(2);
  });

  it("counts only playing games as occupying slots", () => {
    const games = [game("playing"), game("backlog"), game("playing"), game("finished")];
    expect(playingGames(games)).toHaveLength(2);
  });

  it("capacity floors at zero and ignores fractions", () => {
    expect(slotCapacity(2)).toBe(2);
    expect(slotCapacity(0)).toBe(0);
    expect(slotCapacity(-3)).toBe(0);
    expect(slotCapacity(2.9)).toBe(2);
  });

  it("reports open slots and whether a game can start", () => {
    const empty: Game[] = [];
    expect(openSlots(empty, 2)).toBe(2);
    expect(canStartGame(empty, 2)).toBe(true);

    const one = [game("playing")];
    expect(openSlots(one, 2)).toBe(1);
    expect(canStartGame(one, 2)).toBe(true);

    const full = [game("playing"), game("playing")];
    expect(openSlots(full, 2)).toBe(0);
    expect(canStartGame(full, 2)).toBe(false);
  });

  it("never reports negative open slots when over capacity", () => {
    const over = [game("playing"), game("playing"), game("playing")];
    expect(openSlots(over, 2)).toBe(0); // admin lowered the count below current load
    expect(canStartGame(over, 2)).toBe(false);
  });
});
