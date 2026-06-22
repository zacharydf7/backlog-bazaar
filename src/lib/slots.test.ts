import { describe, it, expect } from "vitest";
import {
  DEFAULT_GENERAL_SLOTS,
  playingGames,
  slotCapacity,
  totalCapacity,
  openSlots,
  canStartGame,
  gameMatchesDefinition,
  planSlotForGame,
  movableTargetedSlots,
  type SlotDefinition,
  type TargetedSlot,
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

const def = (over: Partial<SlotDefinition> = {}): SlotDefinition => ({
  id: "d" + Math.random().toString(36).slice(2),
  name: "Quick Clear",
  minHours: null,
  maxHours: 10,
  active: true,
  ...over,
});

const grant = (definition: SlotDefinition): TargetedSlot => ({
  id: "g" + Math.random().toString(36).slice(2),
  definition,
});

describe("general slots", () => {
  it("defaults to 2 general slots", () => {
    expect(DEFAULT_GENERAL_SLOTS).toBe(2);
  });

  it("counts only playing games as occupying slots", () => {
    const games = [game("playing"), game("backlog"), game("playing"), game("finished")];
    expect(playingGames(games)).toHaveLength(2);
  });

  it("capacity floors at zero and ignores fractions", () => {
    expect(slotCapacity(2)).toBe(2);
    expect(slotCapacity(-3)).toBe(0);
    expect(slotCapacity(2.9)).toBe(2);
  });

  it("blocks a new game once general slots are full", () => {
    const full = [game("playing"), game("playing")];
    expect(canStartGame({ hours: 5 }, full, 2)).toBe(false);
    expect(canStartGame({ hours: 5 }, [game("playing")], 2)).toBe(true);
  });
});

describe("gameMatchesDefinition", () => {
  it("an unbounded slot accepts anything, including unknown length", () => {
    const d = def({ minHours: null, maxHours: null });
    expect(gameMatchesDefinition(50, d)).toBe(true);
    expect(gameMatchesDefinition(undefined, d)).toBe(true);
  });

  it("respects min and max bounds", () => {
    expect(gameMatchesDefinition(8, def({ maxHours: 10 }))).toBe(true);
    expect(gameMatchesDefinition(12, def({ maxHours: 10 }))).toBe(false);
    expect(gameMatchesDefinition(45, def({ minHours: 40, maxHours: null }))).toBe(true);
    expect(gameMatchesDefinition(20, def({ minHours: 40, maxHours: null }))).toBe(false);
  });

  it("unknown length can't satisfy a bounded slot", () => {
    expect(gameMatchesDefinition(undefined, def({ maxHours: 10 }))).toBe(false);
  });
});

describe("planSlotForGame", () => {
  it("prefers an open matching targeted slot over a general slot", () => {
    const quick = grant(def({ maxHours: 10 }));
    const plan = planSlotForGame({ hours: 5 }, [], 2, [quick]);
    expect(plan).toEqual({ ok: true, slotId: quick.id });
  });

  it("falls back to a general slot when no targeted slot matches", () => {
    const quick = grant(def({ maxHours: 10 }));
    const plan = planSlotForGame({ hours: 50 }, [], 2, [quick]);
    expect(plan).toEqual({ ok: true, slotId: null });
  });

  it("won't reuse an occupied targeted slot", () => {
    const quick = grant(def({ maxHours: 10 }));
    const playing = [game("playing", { hours: 4, slotId: quick.id })];
    // Second short game can't take the taken Quick Clear slot, so a general slot.
    expect(planSlotForGame({ hours: 5 }, playing, 2, [quick])).toEqual({ ok: true, slotId: null });
  });

  it("reports no room when general slots are full and nothing matches", () => {
    const quick = grant(def({ maxHours: 10 }));
    const playing = [
      game("playing", { hours: 50, slotId: null }),
      game("playing", { hours: 50, slotId: null }),
    ];
    expect(planSlotForGame({ hours: 50 }, playing, 2, [quick])).toEqual({ ok: false });
    // …but a short game still fits the empty Quick Clear slot.
    expect(planSlotForGame({ hours: 5 }, playing, 2, [quick])).toEqual({ ok: true, slotId: quick.id });
  });

  it("ignores inactive targeted slots", () => {
    const quick = grant(def({ maxHours: 10, active: false }));
    expect(planSlotForGame({ hours: 5 }, [], 0, [quick])).toEqual({ ok: false });
  });
});

describe("movableTargetedSlots", () => {
  it("offers an open matching targeted slot for a game in a general slot", () => {
    const quick = grant(def({ maxHours: 10 }));
    const inGeneral = game("playing", { hours: 5, slotId: null });
    const moves = movableTargetedSlots(inGeneral, [inGeneral], [quick]);
    expect(moves.map((m) => m.id)).toEqual([quick.id]);
  });

  it("won't offer a slot the game doesn't fit", () => {
    const quick = grant(def({ maxHours: 10 }));
    const big = game("playing", { hours: 40, slotId: null });
    expect(movableTargetedSlots(big, [big], [quick])).toEqual([]);
  });

  it("won't offer an occupied slot or the game's current slot", () => {
    const quick = grant(def({ maxHours: 10 }));
    const other = game("playing", { hours: 4, slotId: quick.id }); // already in Quick
    const mine = game("playing", { hours: 5, slotId: null });
    expect(movableTargetedSlots(mine, [other, mine], [quick])).toEqual([]);

    // The game already in the slot isn't offered its own slot again.
    expect(movableTargetedSlots(other, [other, mine], [quick])).toEqual([]);
  });
});

describe("linked editions share a slot", () => {
  it("a second family edition reuses its sibling's slot (no extra capacity)", () => {
    const playing = [game("playing", { id: "a", familyId: "F", slotId: null })];
    // Both general slots would normally be needed, but the linked sibling shares.
    const plan = planSlotForGame({ id: "b", familyId: "F", hours: 30 }, playing, 2, []);
    expect(plan).toEqual({ ok: true, slotId: null });
  });

  it("shares a targeted slot the family already occupies", () => {
    const quick = grant(def({ maxHours: 10 }));
    const playing = [game("playing", { id: "a", familyId: "F", slotId: quick.id })];
    const plan = planSlotForGame({ id: "b", familyId: "F", hours: 5 }, playing, 0, [quick]);
    expect(plan).toEqual({ ok: true, slotId: quick.id });
  });

  it("lets a family start even when all general slots are otherwise full", () => {
    const playing = [
      game("playing", { id: "a", familyId: "F", slotId: null }),
      game("playing", { id: "x", slotId: null }),
    ];
    // 2 general slots full (family unit + x), but a 2nd family edition still fits.
    expect(canStartGame({ id: "b", familyId: "F", hours: 40 }, playing, 2, [])).toBe(true);
    // …whereas an unrelated new game has no room.
    expect(canStartGame({ id: "z", hours: 40 }, playing, 2, [])).toBe(false);
  });

  it("counts a family as one occupant for open-slot math", () => {
    const games = [
      game("playing", { id: "a", familyId: "F", slotId: null }),
      game("playing", { id: "b", familyId: "F", slotId: null }),
    ];
    // Two editions playing, but one unit -> one general slot used of two.
    expect(openSlots(games, 2)).toBe(1);
  });
});

describe("capacity helpers", () => {
  it("total capacity is general + granted targeted", () => {
    const grants = [grant(def()), grant(def())];
    expect(totalCapacity(2, grants)).toBe(4);
  });

  it("open slots never go negative", () => {
    const over = [game("playing"), game("playing"), game("playing")];
    expect(openSlots(over, 2)).toBe(0);
    expect(openSlots([game("playing")], 2, [grant(def())])).toBe(2);
  });
});
