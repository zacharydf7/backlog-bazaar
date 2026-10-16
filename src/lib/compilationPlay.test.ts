import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import { playOptionFor } from "./compilationPlay";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Game",
    status: "backlog",
    genres: [],
    addedAt: 1,
    ...over,
  } as Game;
}

describe("playOptionFor (86fc0b4b)", () => {
  it("offers a regular Buy & Start for an ordinary Bazaar game", () => {
    expect(playOptionFor(game(), [])).toEqual({ kind: "start" });
  });

  it("routes a live-service game to the Rotation lane", () => {
    expect(playOptionFor(game({ ongoing: true }), [])).toEqual({ kind: "rotation" });
  });

  it("blocks a story-locked game, naming the prerequisite", () => {
    const prequel = game({ id: "pre", title: "Pikmin" });
    const sequel = game({ id: "seq", title: "Pikmin 2", prerequisiteGameId: "pre" });
    expect(playOptionFor(sequel, [prequel, sequel])).toEqual({
      kind: "blocked",
      reason: "Story-locked — finish Pikmin first",
    });
    // Finishing the prerequisite unlocks it.
    const done = { ...prequel, status: "finished" as const };
    expect(playOptionFor(sequel, [done, sequel])).toEqual({ kind: "start" });
  });

  it("blocks a pre-ordered game", () => {
    const r = playOptionFor(game({ preorderedAt: 1 }), []);
    expect(r.kind).toBe("blocked");
  });

  it("blocks a game whose every copy has lapsed", () => {
    const lapsed = game({
      copies: [
        { id: "c1", platform: "PC", acquisition: "subscription", lapsedAt: "2026-10-01" },
      ],
    });
    expect(playOptionFor(lapsed, []).kind).toBe("blocked");
  });
});
