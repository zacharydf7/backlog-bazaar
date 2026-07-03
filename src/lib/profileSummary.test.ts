import { describe, it, expect } from "vitest";
import { profileSummary } from "./profileSummary";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g" + Math.random().toString(36).slice(2, 7),
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

describe("profileSummary", () => {
  it("counts totals per status", () => {
    const s = profileSummary([
      game({ status: "backlog" }),
      game({ status: "backlog" }),
      game({ status: "playing" }),
      game({ status: "finished" }),
      game({ status: "wishlist" }),
    ]);
    expect(s.total).toBe(5);
    expect(s.byStatus).toEqual({ backlog: 2, playing: 1, finished: 1, wishlist: 1 });
  });

  it("handles an empty library", () => {
    const s = profileSummary([]);
    expect(s.total).toBe(0);
    expect(s.byStatus).toEqual({ backlog: 0, playing: 0, finished: 0, wishlist: 0 });
  });
});
