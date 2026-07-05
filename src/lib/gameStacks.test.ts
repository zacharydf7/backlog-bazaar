import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import type { BoardCard } from "./boardOrder";
import { stackBoardCards, stackPlatforms } from "./gameStacks";

let seq = 0;
function game(over: Partial<Game> = {}): Game {
  seq += 1;
  return {
    id: over.id ?? `g${seq}`,
    title: over.title ?? `Game ${seq}`,
    genres: [],
    status: "backlog",
    addedAt: seq,
    copies: [],
    ...over,
  } as Game;
}

const card = (g: Game): BoardCard => ({ kind: "game", game: g });

describe("stackBoardCards", () => {
  it("stacks same-game instances into one deck at the first member's position", () => {
    const a = game({ id: "a", rawgId: 1, title: "Hades" });
    const other = game({ id: "o", rawgId: 2 });
    const b = game({ id: "b", rawgId: 1, title: "Hades" });
    const out = stackBoardCards([card(a), card(other), card(b)], new Set());
    expect(out.map((c) => c.kind)).toEqual(["stack", "game"]);
    const stack = out[0] as Extract<(typeof out)[0], { kind: "stack" }>;
    expect(stack.games.map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("leaves singles, custom titles, and synthetic cards untouched", () => {
    const solo = game({ id: "s", rawgId: 1 });
    const custom1 = game({ id: "c1" });
    const custom2 = game({ id: "c2" });
    const fam = { kind: "family", family: { familyId: "F" } } as unknown as BoardCard;
    const out = stackBoardCards([card(solo), card(custom1), fam, card(custom2)], new Set());
    expect(out).toHaveLength(4);
    expect(out.every((c) => c.kind !== "stack")).toBe(true);
  });

  it("an expanded deck fans its members out contiguously, marking the first", () => {
    const a = game({ id: "a", rawgId: 1 });
    const mid = game({ id: "m", rawgId: 2 });
    const b = game({ id: "b", rawgId: 1 });
    const out = stackBoardCards([card(a), card(mid), card(b)], new Set(["r:1"]));
    expect(out.map((c) => c.kind)).toEqual(["fanned", "fanned", "game"]);
    const first = out[0] as Extract<(typeof out)[0], { kind: "fanned" }>;
    const second = out[1] as Extract<(typeof out)[0], { kind: "fanned" }>;
    expect(first.first).toBe(true);
    expect(first.count).toBe(2);
    expect(second.first).toBe(false);
    expect([first.game.id, second.game.id]).toEqual(["a", "b"]);
  });

  it("community games stack on catalogId; id spaces never cross", () => {
    const a = game({ id: "a", catalogId: "alwa" });
    const b = game({ id: "b", catalogId: "alwa" });
    const rawg = game({ id: "r", rawgId: 7 });
    const out = stackBoardCards([card(a), card(rawg), card(b)], new Set());
    expect(out.map((c) => c.kind)).toEqual(["stack", "game"]);
  });
});

describe("stackPlatforms", () => {
  it("collects every member's platforms, deduped, first-seen order", () => {
    const a = game({ copies: [{ id: "1", platform: "PC" }] });
    const b = game({
      copies: [
        { id: "2", platform: "Nintendo Switch", format: "physical" },
        { id: "3", platform: "PC", format: "digital" },
      ],
    });
    expect(stackPlatforms([a, b])).toEqual(["PC", "Nintendo Switch"]);
  });
});
