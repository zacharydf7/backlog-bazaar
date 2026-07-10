import { describe, it, expect } from "vitest";
import { neighbors, boardCardStops, afterRemovalTarget, type PageNavStop } from "./pageNav";
import type { StackedBoardCard } from "./gameStacks";

const g = (id: string): PageNavStop => ({ kind: "game", id });
const c = (id: string): PageNavStop => ({ kind: "compilation", id });

describe("neighbors", () => {
  const stops = [g("a"), g("b"), g("c")];

  it("reports the position (1-based) and both neighbours in the middle", () => {
    expect(neighbors(stops, g("b"))).toEqual({ prev: g("a"), next: g("c"), position: 2, total: 3 });
  });

  it("has no prev at the start and no next at the end", () => {
    expect(neighbors(stops, g("a"))).toEqual({ prev: null, next: g("b"), position: 1, total: 3 });
    expect(neighbors(stops, g("c"))).toEqual({ prev: g("b"), next: null, position: 3, total: 3 });
  });

  it("returns position 0 (not found) when the stop isn't in the sequence", () => {
    expect(neighbors(stops, g("z"))).toEqual({ prev: null, next: null, position: 0, total: 3 });
  });

  it("matches on kind, not just id — a game and a compilation can share an id", () => {
    const mixed = [g("x"), c("x")];
    expect(neighbors(mixed, c("x"))).toEqual({ prev: g("x"), next: null, position: 2, total: 2 });
    expect(neighbors(mixed, g("x"))).toEqual({ prev: null, next: c("x"), position: 1, total: 2 });
  });
});

describe("afterRemovalTarget", () => {
  const stops = [g("a"), g("b"), g("c")];

  it("lands on the previous stop when deleting a middle or last card", () => {
    expect(afterRemovalTarget(stops, g("b"))).toEqual(g("a"));
    expect(afterRemovalTarget(stops, g("c"))).toEqual(g("b"));
  });

  it("lands on the next stop (the new first) when deleting the first card", () => {
    expect(afterRemovalTarget(stops, g("a"))).toEqual(g("b"));
  });

  it("can land on a neighbouring compilation stop", () => {
    expect(afterRemovalTarget([c("bundle"), g("a")], g("a"))).toEqual(c("bundle"));
  });

  it("returns null for the only card, so the caller leaves the page", () => {
    expect(afterRemovalTarget([g("solo")], g("solo"))).toBeNull();
  });

  it("returns null when the game isn't in the sequence", () => {
    expect(afterRemovalTarget(stops, g("z"))).toBeNull();
  });
});

describe("boardCardStops", () => {
  // Only the ids (and card kind) are read, so minimal shapes are enough to
  // exercise which card kinds contribute to the browse sequence.
  const card = (x: unknown) => x as StackedBoardCard;

  it("maps game, fanned and family cards to game stops, in order", () => {
    const cards = [
      card({ kind: "game", game: { id: "g1" } }),
      card({ kind: "family", family: { primary: { id: "fp" } } }),
      card({ kind: "fanned", stackKey: "s", game: { id: "g2" }, first: true, count: 2 }),
    ];
    expect(boardCardStops(cards)).toEqual([g("g1"), g("fp"), g("g2")]);
  });

  it("maps a collapsed compilation card to a compilation stop (issue 28ec4975)", () => {
    const cards = [
      card({ kind: "game", game: { id: "g1" } }),
      card({ kind: "compilation", collapsed: { compilation: { id: "c1" } } }),
      card({ kind: "game", game: { id: "g2" } }),
    ];
    expect(boardCardStops(cards)).toEqual([g("g1"), c("c1"), g("g2")]);
  });

  it("walks INTO a collapsed stack deck — every member is a stop, in deck order (28ec4975)", () => {
    const cards = [
      card({ kind: "game", game: { id: "g1" } }),
      card({ kind: "stack", stackKey: "s", games: [{ id: "x" }, { id: "y" }] }),
      card({ kind: "game", game: { id: "g2" } }),
    ];
    expect(boardCardStops(cards)).toEqual([g("g1"), g("x"), g("y"), g("g2")]);
  });
});
