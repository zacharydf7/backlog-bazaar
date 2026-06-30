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

  it("builds a genre breakdown summing to ~100%", () => {
    const s = profileSummary([
      game({ genres: ["RPG", "Action"] }),
      game({ genres: ["RPG"] }),
      game({ genres: ["Action"] }),
      game({ genres: ["Strategy"] }),
    ]);
    // 5 tags: RPG 2, Action 2, Strategy 1.
    const byGenre = Object.fromEntries(s.genres.map((g) => [g.genre, g]));
    expect(byGenre.RPG.count).toBe(2);
    expect(byGenre.RPG.pct).toBe(40);
    expect(byGenre.Action.count).toBe(2);
    expect(byGenre.Strategy.count).toBe(1);
    expect(byGenre.Strategy.pct).toBe(20);
  });

  it("folds genres beyond the top N into an 'Other' slice", () => {
    const s = profileSummary(
      [
        game({ genres: ["A"] }),
        game({ genres: ["A"] }),
        game({ genres: ["B"] }),
        game({ genres: ["C"] }),
        game({ genres: ["D"] }),
      ],
      { topGenres: 2 },
    );
    // Top 2 = A (2), then B/C/D tie at 1 → first by alpha is B; the rest pool into Other.
    expect(s.genres.map((g) => g.genre)).toEqual(["A", "B", "Other"]);
    const other = s.genres.find((g) => g.genre === "Other")!;
    expect(other.count).toBe(2); // C + D
  });

  it("handles an empty library", () => {
    const s = profileSummary([]);
    expect(s.total).toBe(0);
    expect(s.byStatus).toEqual({ backlog: 0, playing: 0, finished: 0, wishlist: 0 });
    expect(s.genres).toEqual([]);
  });

  it("ignores blank genre strings", () => {
    const s = profileSummary([game({ genres: ["RPG", " ", ""] })]);
    expect(s.genres).toEqual([{ genre: "RPG", count: 1, pct: 100 }]);
  });
});
