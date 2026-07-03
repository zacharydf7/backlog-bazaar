import { describe, it, expect } from "vitest";
import { recentClears, RECENT_CLEARS_SHOWN } from "./recentActivity";
import type { Game } from "../types";

let seq = 0;
function game(over: Partial<Game> = {}): Game {
  seq++;
  return {
    id: "g" + seq,
    title: "Game " + seq,
    status: "finished",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

describe("recentClears", () => {
  it("returns dated Beaten and Completed clears, newest first", () => {
    const clears = recentClears([
      game({ title: "Older", finishTag: "beaten", finishedAt: 100 }),
      game({ title: "Newest", finishTag: "completed", finishedAt: 300 }),
      game({ title: "Middle", finishTag: "beaten", finishedAt: 200 }),
    ]);
    expect(clears.map((c) => c.game.title)).toEqual(["Newest", "Middle", "Older"]);
    expect(clears.map((c) => c.tag)).toEqual(["completed", "beaten", "beaten"]);
  });

  it("counts a legacy untagged finish as a standard Beaten clear", () => {
    const clears = recentClears([game({ finishTag: undefined, finishedAt: 50 })]);
    expect(clears).toHaveLength(1);
    expect(clears[0].tag).toBe("beaten");
  });

  it("leaves out endless conclusions, unfinished games, and undated clears", () => {
    const clears = recentClears([
      game({ finishTag: "endless", finishedAt: 400 }),
      game({ status: "playing", finishedAt: 500 }),
      game({ status: "backlog" }),
      game({ finishTag: "beaten", finishedAt: undefined }),
      game({ title: "Keeper", finishTag: "beaten", finishedAt: 10 }),
    ]);
    expect(clears.map((c) => c.game.title)).toEqual(["Keeper"]);
  });

  it("breaks same-moment ties by title so the order is stable", () => {
    const clears = recentClears([
      game({ title: "Zelda", finishTag: "beaten", finishedAt: 100 }),
      game({ title: "Astro", finishTag: "beaten", finishedAt: 100 }),
    ]);
    expect(clears.map((c) => c.game.title)).toEqual(["Astro", "Zelda"]);
  });

  it("keeps the default feed length at five", () => {
    expect(RECENT_CLEARS_SHOWN).toBe(5);
  });
});
