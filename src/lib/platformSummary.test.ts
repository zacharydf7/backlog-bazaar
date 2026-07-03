import { describe, it, expect } from "vitest";
import { platformSummary, PLATFORM_SEGMENTS } from "./platformSummary";
import { NO_PLATFORM_LABEL } from "./ledger";
import type { Game, GameCopy } from "../types";

let seq = 0;
function game(over: Partial<Game> = {}): Game {
  seq++;
  return {
    id: "g" + seq,
    title: "Game " + seq,
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: seq,
    ...over,
  } as Game;
}

function on(...platforms: string[]): GameCopy[] {
  return platforms.map((p, i) => ({ id: "c" + seq + "-" + i, platform: p }) as GameCopy);
}

describe("platformSummary", () => {
  it("buckets each platform's games by status and finish tag, summing to total", () => {
    const rows = platformSummary([
      game({ copies: on("Nintendo Switch") }),
      game({ copies: on("Nintendo Switch"), status: "playing" }),
      game({ copies: on("Nintendo Switch"), status: "finished", finishTag: "beaten" }),
      game({ copies: on("Nintendo Switch"), status: "finished", finishTag: "completed" }),
      game({ copies: on("Nintendo Switch"), status: "finished", finishTag: "endless" }),
    ]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.platform).toBe("Nintendo Switch");
    expect(r.total).toBe(5);
    expect([r.backlog, r.playing, r.beaten, r.completed, r.endless]).toEqual([1, 1, 1, 1, 1]);
    expect(r.backlog + r.playing + r.beaten + r.completed + r.endless).toBe(r.total);
    expect(r.allFinished).toBe(false);
  });

  it("counts a legacy untagged clear as Beaten so the bar stays gap-free", () => {
    const rows = platformSummary([game({ copies: on("PC"), status: "finished" })]);
    expect(rows[0].beaten).toBe(1);
    expect(rows[0].total).toBe(1);
  });

  it("counts a multi-platform game on each of its platforms", () => {
    const rows = platformSummary([game({ copies: on("PC", "Nintendo Switch") })]);
    expect(rows.map((r) => r.platform)).toEqual(["Nintendo Switch", "PC"]);
    expect(rows.every((r) => r.total === 1)).toBe(true);
  });

  it("excludes wishlist games and gathers platform-less games under the bucket, last", () => {
    const rows = platformSummary([
      game({ copies: on("PC") }),
      game({ copies: [] }), // no platform recorded
      game({ copies: on("Xbox One"), status: "wishlist" }), // unowned — ignored
    ]);
    expect(rows.map((r) => r.platform)).toEqual(["PC", NO_PLATFORM_LABEL]);
  });

  it("flags a fully-cleared platform (finishes of any kind count)", () => {
    const rows = platformSummary([
      game({ copies: on("GameCube"), status: "finished", finishTag: "beaten" }),
      game({ copies: on("GameCube"), status: "finished", finishTag: "endless" }),
    ]);
    expect(rows[0].allFinished).toBe(true);
  });

  it("returns nothing for an empty (or wishlist-only) library", () => {
    expect(platformSummary([])).toEqual([]);
    expect(platformSummary([game({ status: "wishlist", copies: on("PC") })])).toEqual([]);
  });

  it("segment catalog covers exactly the row buckets", () => {
    expect(PLATFORM_SEGMENTS.map((s) => s.key)).toEqual([
      "backlog",
      "playing",
      "beaten",
      "completed",
      "endless",
    ]);
  });
});
