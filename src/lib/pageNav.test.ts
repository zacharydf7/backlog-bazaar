import { describe, it, expect } from "vitest";
import { neighbors, boardCardGameIds } from "./pageNav";
import type { StackedBoardCard } from "./gameStacks";

describe("neighbors", () => {
  const ids = ["a", "b", "c"];

  it("reports the position (1-based) and both neighbours in the middle", () => {
    expect(neighbors(ids, "b")).toEqual({ prev: "a", next: "c", position: 2, total: 3 });
  });

  it("has no prev at the start and no next at the end", () => {
    expect(neighbors(ids, "a")).toEqual({ prev: null, next: "b", position: 1, total: 3 });
    expect(neighbors(ids, "c")).toEqual({ prev: "b", next: null, position: 3, total: 3 });
  });

  it("returns position 0 (not found) when the game isn't in the sequence", () => {
    expect(neighbors(ids, "z")).toEqual({ prev: null, next: null, position: 0, total: 3 });
  });
});

describe("boardCardGameIds", () => {
  // Only the id and (for families) the primary id are read, so minimal shapes are
  // enough to exercise which card kinds contribute to the browse sequence.
  const card = (c: unknown) => c as StackedBoardCard;

  it("maps game, fanned and family cards to their game page id, in order", () => {
    const cards = [
      card({ kind: "game", game: { id: "g1" } }),
      card({ kind: "family", family: { primary: { id: "fp" } } }),
      card({ kind: "fanned", stackKey: "s", game: { id: "g2" }, first: true, count: 2 }),
    ];
    expect(boardCardGameIds(cards)).toEqual(["g1", "fp", "g2"]);
  });

  it("skips collapsed compilation and stack cards (they open no single game page)", () => {
    const cards = [
      card({ kind: "game", game: { id: "g1" } }),
      card({ kind: "compilation", collapsed: { compilation: { id: "c1" } } }),
      card({ kind: "stack", stackKey: "s", games: [{ id: "x" }, { id: "y" }] }),
      card({ kind: "game", game: { id: "g2" } }),
    ];
    expect(boardCardGameIds(cards)).toEqual(["g1", "g2"]);
  });
});
