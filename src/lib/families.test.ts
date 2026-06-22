import { describe, it, expect } from "vitest";
import {
  applyLink,
  applyUnlink,
  buildUnits,
  familyMembers,
  familyName,
  familyPlatformTags,
  familySiblings,
  familyStats,
  isLinked,
  isReplayFinish,
  occupantKey,
  representativeMember,
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

describe("familyName", () => {
  it("falls back to the representative edition's title when unnamed", () => {
    const members = [
      game("a", { familyId: "F", title: "Zelda PC", status: "wishlist" }),
      game("b", { familyId: "F", title: "Zelda Switch", status: "playing" }),
    ];
    // representative = highest priority status (playing) → "Zelda Switch".
    expect(familyName(members)).toBe("Zelda Switch");
  });

  it("uses the editable family name when any member has one set", () => {
    const members = [
      game("a", { familyId: "F", title: "Zelda PC" }),
      game("b", { familyId: "F", title: "Zelda Switch", familyName: "The Legend of Zelda" }),
    ];
    expect(familyName(members)).toBe("The Legend of Zelda");
  });

  it("ignores a blank family name", () => {
    const members = [game("a", { familyId: "F", title: "Mario", familyName: "   " })];
    expect(familyName(members)).toBe("Mario");
  });
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

describe("representativeMember / status hierarchy", () => {
  it("picks the highest-priority status: playing > backlog > wishlist > finished", () => {
    const members = [
      game("fin", { status: "finished", addedAt: 1 }),
      game("wish", { status: "wishlist", addedAt: 2 }),
      game("back", { status: "backlog", addedAt: 3 }),
    ];
    expect(representativeMember(members).id).toBe("back");
    members.push(game("play", { status: "playing", addedAt: 4 }));
    expect(representativeMember(members).id).toBe("play");
  });

  it("breaks ties by earliest added", () => {
    const members = [
      game("late", { status: "backlog", addedAt: 200 }),
      game("early", { status: "backlog", addedAt: 100 }),
    ];
    expect(representativeMember(members).id).toBe("early");
  });
});

describe("buildUnits", () => {
  it("groups a family into one unit and leaves standalones alone", () => {
    const games = [
      game("a", { familyId: "F", status: "finished", addedAt: 1 }),
      game("b", { familyId: "F", status: "backlog", addedAt: 2 }),
      game("solo", { status: "wishlist" }),
    ];
    const units = buildUnits(games);
    expect(units).toHaveLength(2);
    const fam = units.find((u) => u.isFamily)!;
    expect(fam.members.map((g) => g.id).sort()).toEqual(["a", "b"]);
    expect(fam.status).toBe("backlog"); // highest priority among finished+backlog
    expect(fam.rep.id).toBe("b");
    const solo = units.find((u) => !u.isFamily)!;
    expect(solo.status).toBe("wishlist");
    expect(solo.members).toHaveLength(1);
  });
});

describe("familyPlatformTags", () => {
  it("unions the platforms you own copies on across editions", () => {
    const members = [
      game("a", { copies: [{ id: "1", platform: "GameCube" }] }),
      game("b", { copies: [{ id: "2", platform: "PlayStation 4" }] }),
    ];
    expect(familyPlatformTags(members).sort()).toEqual(["GameCube", "PlayStation 4"]);
  });

  it("falls back to available platforms when no copies are recorded", () => {
    const members = [game("a", { platforms: ["PC", "Switch"] }), game("b", { platforms: ["PC"] })];
    expect(familyPlatformTags(members).sort()).toEqual(["PC", "Switch"]);
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
