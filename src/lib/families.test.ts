import { describe, it, expect } from "vitest";
import {
  applyLink,
  applyUnlink,
  familyMembers,
  familySiblings,
  familyStats,
  isLinked,
  isReplayFinish,
  occupantKey,
} from "./families";
import type { Game, GameStatus } from "../types";

const game = (id: string, over: Partial<Game> = {}): Game => ({
  id,
  title: id,
  genres: [],
  status: "backlog" as GameStatus,
  addedAt: Date.now(),
  ...over,
});

describe("isLinked / familyMembers / familySiblings", () => {
  it("an unlinked game is its own sole family", () => {
    const a = game("a");
    const games = [a, game("b")];
    expect(isLinked(a)).toBe(false);
    expect(familyMembers(games, a)).toEqual([a]);
    expect(familySiblings(games, a)).toEqual([]);
  });

  it("collects all members sharing a familyId", () => {
    const games = [
      game("a", { familyId: "F" }),
      game("b", { familyId: "F" }),
      game("c"),
    ];
    expect(isLinked(games[0])).toBe(true);
    expect(familyMembers(games, games[0]).map((g) => g.id)).toEqual(["a", "b"]);
    expect(familySiblings(games, games[0]).map((g) => g.id)).toEqual(["b"]);
  });
});

describe("familyStats", () => {
  it("sums playtime, cost and finished count across versions", () => {
    const members = [
      game("a", { playedHours: 10, copies: [{ id: "1", platform: "PS5", cost: 60 }], status: "finished" }),
      game("b", { playedHours: 5.5, copies: [{ id: "2", platform: "Switch", cost: 40 }] }),
    ];
    const s = familyStats(members);
    expect(s.count).toBe(2);
    expect(s.totalPlayed).toBe(15.5);
    expect(s.totalCost).toBe(100);
    expect(s.finishedCount).toBe(1);
  });

  it("treats missing playtime/copies as zero", () => {
    const s = familyStats([game("a"), game("b")]);
    expect(s).toEqual({ count: 2, totalPlayed: 0, totalCost: 0, finishedCount: 0 });
  });
});

describe("occupantKey", () => {
  it("is the family id when linked, else the game id", () => {
    expect(occupantKey(game("a", { familyId: "F" }))).toBe("F");
    expect(occupantKey(game("a"))).toBe("a");
  });
});

describe("isReplayFinish", () => {
  it("is true once any sibling is already finished", () => {
    const games = [
      game("a", { familyId: "F" }),
      game("b", { familyId: "F", status: "finished" }),
    ];
    expect(isReplayFinish(games, games[0])).toBe(true);
  });

  it("is false for the first clear or an unlinked game", () => {
    const games = [
      game("a", { familyId: "F" }),
      game("b", { familyId: "F", status: "playing" }),
      game("solo"),
    ];
    expect(isReplayFinish(games, games[0])).toBe(false);
    expect(isReplayFinish(games, games[2])).toBe(false);
  });
});

describe("applyLink", () => {
  it("mints a shared family id for two unlinked games", () => {
    const games = applyLink([game("a"), game("b"), game("c")], "a", "b");
    const a = games.find((g) => g.id === "a")!;
    const b = games.find((g) => g.id === "b")!;
    const c = games.find((g) => g.id === "c")!;
    expect(a.familyId).toBeTruthy();
    expect(a.familyId).toBe(b.familyId);
    expect(c.familyId).toBeUndefined();
  });

  it("adds a game to an existing family", () => {
    const games = applyLink(
      [game("a", { familyId: "F" }), game("b", { familyId: "F" }), game("c")],
      "a",
      "c",
    );
    expect(games.find((g) => g.id === "c")!.familyId).toBe("F");
  });

  it("merges two existing families into one", () => {
    const games = applyLink(
      [
        game("a", { familyId: "F1" }),
        game("b", { familyId: "F1" }),
        game("c", { familyId: "F2" }),
        game("d", { familyId: "F2" }),
      ],
      "a",
      "c",
    );
    const fam = games.find((g) => g.id === "a")!.familyId;
    expect(games.every((g) => g.familyId === fam)).toBe(true);
  });

  it("no-ops when already in the same family or ids are bad", () => {
    const start = [game("a", { familyId: "F" }), game("b", { familyId: "F" })];
    expect(applyLink(start, "a", "b")).toBe(start);
    expect(applyLink(start, "a", "a")).toBe(start);
    expect(applyLink(start, "a", "missing")).toBe(start);
  });
});

describe("applyUnlink", () => {
  it("detaches a member and dissolves a now-lonely family", () => {
    // Family of two -> unlinking one leaves a single member, which is also cleared.
    const games = applyUnlink(
      [game("a", { familyId: "F" }), game("b", { familyId: "F" })],
      "a",
    );
    expect(games.find((g) => g.id === "a")!.familyId).toBeNull();
    expect(games.find((g) => g.id === "b")!.familyId).toBeNull();
  });

  it("keeps the family when two or more members remain", () => {
    const games = applyUnlink(
      [
        game("a", { familyId: "F" }),
        game("b", { familyId: "F" }),
        game("c", { familyId: "F" }),
      ],
      "a",
    );
    expect(games.find((g) => g.id === "a")!.familyId).toBeNull();
    expect(games.find((g) => g.id === "b")!.familyId).toBe("F");
    expect(games.find((g) => g.id === "c")!.familyId).toBe("F");
  });

  it("no-ops on an unlinked game", () => {
    const start = [game("a"), game("b")];
    expect(applyUnlink(start, "a")).toBe(start);
  });
});
