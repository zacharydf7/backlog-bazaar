import { describe, it, expect } from "vitest";
import {
  applyLink,
  applyPrimaryHandoff,
  applySever,
  applyUnlink,
  familyMembers,
  familyName,
  familyPlatformTags,
  familyPrimary,
  familySiblings,
  familyStats,
  hiddenFamilySiblingIds,
  isLinked,
  isReplayFinish,
  isFamilyDiscounted,
  occupantKey,
  representativeMember,
  visibleLibrary,
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
  it("falls back to the primary edition's title when unnamed", () => {
    const members = [
      game("a", { familyId: "F", title: "Zelda PC", status: "wishlist" }),
      game("b", { familyId: "F", title: "Zelda Switch", status: "playing" }),
    ];
    // No designation → the representative fallback (playing) fronts the name…
    expect(familyName(members)).toBe("Zelda Switch");
    // …but an explicit primary designation wins.
    const designated = members.map((m) => ({ ...m, familyPrimaryGameId: "a" }));
    expect(familyName(designated)).toBe("Zelda PC");
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

describe("familyPrimary", () => {
  const members = [
    game("a", { familyId: "F", status: "finished", addedAt: 1 }),
    game("b", { familyId: "F", status: "playing", addedAt: 2 }),
  ];

  it("uses the stored designation when it points at a live member", () => {
    const designated = members.map((m) => ({ ...m, familyPrimaryGameId: "a" }));
    expect(familyPrimary(designated).id).toBe("a"); // beats the playing member
  });

  it("falls back to the representative for a legacy family with no designation", () => {
    expect(familyPrimary(members).id).toBe("b");
  });

  it("a stale pointer (member left/deleted) falls back to the representative", () => {
    const stale = members.map((m) => ({ ...m, familyPrimaryGameId: "gone" }));
    expect(familyPrimary(stale).id).toBe("b");
  });
});

describe("familyPlatformTags", () => {
  it("aggregates every member's platforms, primary's first, deduped", () => {
    const members = [
      game("a", {
        familyId: "F",
        familyPrimaryGameId: "b",
        copies: [
          { id: "1", platform: "PlayStation 4", format: "physical" as const },
          { id: "2", platform: "PC", format: "digital" as const },
        ],
      }),
      game("b", {
        familyId: "F",
        familyPrimaryGameId: "b",
        copies: [{ id: "3", platform: "PlayStation 5", format: "digital" as const }],
      }),
    ];
    const tags = familyPlatformTags(members);
    // b is the primary — its platform leads; a's follow in copy order.
    expect(tags.map((t) => t.platform)).toEqual(["PlayStation 5", "PlayStation 4", "PC"]);
  });

  it("merges same-platform copies across members into one tag (formats union)", () => {
    const members = [
      game("a", {
        familyId: "F",
        copies: [{ id: "1", platform: "Nintendo Switch", format: "physical" as const }],
      }),
      game("b", {
        familyId: "F",
        copies: [{ id: "2", platform: "Nintendo Switch", format: "digital" as const }],
      }),
    ];
    const tags = familyPlatformTags(members);
    expect(tags).toHaveLength(1);
    expect(tags[0].formats.sort()).toEqual(["digital", "physical"]);
  });
});

describe("hiddenFamilySiblingIds / visibleLibrary", () => {
  it("hides every non-primary member of a ≥2-member family", () => {
    const games = [
      game("a", { familyId: "F", familyPrimaryGameId: "a" }),
      game("b", { familyId: "F", familyPrimaryGameId: "a", status: "finished" }),
      game("solo"),
      game("lonely", { familyId: "G" }), // family of one visible member
    ];
    expect([...hiddenFamilySiblingIds(games)]).toEqual(["b"]);
    expect(visibleLibrary(games).map((g) => g.id)).toEqual(["a", "solo", "lonely"]);
  });

  it("hides behind the representative fallback for a legacy family", () => {
    const games = [
      game("old", { familyId: "F", status: "finished", addedAt: 1 }),
      game("new", { familyId: "F", status: "playing", addedAt: 2 }),
    ];
    // No designation: the playing member fronts the card, the clear hides.
    expect([...hiddenFamilySiblingIds(games)]).toEqual(["old"]);
  });

  it("returns the same array when nothing hides (no re-render churn)", () => {
    const games = [game("a"), game("b")];
    expect(visibleLibrary(games)).toBe(games);
  });
});

describe("applyPrimaryHandoff", () => {
  it("moves a live Now Playing run whole — status, slot, fee, bounty, hours, note", () => {
    const games = [
      game("old", {
        familyId: "F",
        familyPrimaryGameId: "old",
        status: "playing",
        slotId: "slot-1",
        pricePaid: 120,
        reward: 300,
        playedHours: 12,
        progressNote: "At the water temple",
        startedAt: 111,
      }),
      game("new", { familyId: "F", familyPrimaryGameId: "old", playedHours: 3 }),
    ];
    const next = applyPrimaryHandoff(games, "F", "new");
    const moved = next.find((g) => g.id === "new")!;
    const left = next.find((g) => g.id === "old")!;
    expect(moved.status).toBe("playing");
    expect(moved.slotId).toBe("slot-1");
    expect(moved.pricePaid).toBe(120);
    expect(moved.reward).toBe(300);
    expect(moved.playedHours).toBe(15); // merged
    expect(moved.progressNote).toBe("At the water temple");
    expect(moved.startedAt).toBe(111);
    expect(moved.familyPrimaryGameId).toBe("new");
    expect(left.status).toBe("backlog"); // stepped out of play
    expect(left.slotId).toBeNull();
    expect(left.pricePaid).toBeUndefined();
    expect(left.playedHours).toBe(0);
    expect(left.progressNote).toBeUndefined();
  });

  it("a resumed old primary returns to Finished; a finished new primary resumes", () => {
    const games = [
      game("old", {
        familyId: "F",
        familyPrimaryGameId: "old",
        status: "playing",
        resumed: true,
      }),
      game("new", {
        familyId: "F",
        familyPrimaryGameId: "old",
        status: "finished",
        finishTag: "beaten",
      }),
    ];
    const next = applyPrimaryHandoff(games, "F", "new");
    expect(next.find((g) => g.id === "old")!.status).toBe("finished"); // back to its clear
    const moved = next.find((g) => g.id === "new")!;
    expect(moved.status).toBe("playing");
    expect(moved.resumed).toBe(true); // exit rules will return it to Finished
    expect(moved.finishTag).toBe("beaten"); // its own clear record survives
  });

  it("a FINISHED outgoing primary stays archived — designation only", () => {
    const games = [
      game("old", {
        familyId: "F",
        familyPrimaryGameId: "old",
        status: "finished",
        playedHours: 40,
        progressNote: "Done!",
      }),
      game("new", { familyId: "F", familyPrimaryGameId: "old" }),
    ];
    const next = applyPrimaryHandoff(games, "F", "new");
    const old = next.find((g) => g.id === "old")!;
    expect(old.status).toBe("finished");
    expect(old.playedHours).toBe(40); // the concluded playthrough keeps its record
    expect(old.progressNote).toBe("Done!");
    expect(next.every((g) => g.familyPrimaryGameId === "new")).toBe(true);
  });

  it("keeps an existing note on the new primary below the migrated one", () => {
    const games = [
      game("old", {
        familyId: "F",
        familyPrimaryGameId: "old",
        progressNote: "Chapter 3",
      }),
      game("new", { familyId: "F", familyPrimaryGameId: "old", progressNote: "Own note" }),
    ];
    const moved = applyPrimaryHandoff(games, "F", "new").find((g) => g.id === "new")!;
    expect(moved.progressNote).toBe("Chapter 3\n\nOwn note");
  });

  it("carries rotation state like convert/retire: the lane follows, ongoing restores", () => {
    const games = [
      game("old", {
        familyId: "F",
        familyPrimaryGameId: "old",
        status: "playing",
        inRotation: true,
        rotationOrigin: "backlog" as const,
        ongoing: true,
        preRotationOngoing: false, // was standard before entering the lane
      }),
      game("new", { familyId: "F", familyPrimaryGameId: "old", ongoing: false }),
    ];
    const next = applyPrimaryHandoff(games, "F", "new");
    const moved = next.find((g) => g.id === "new")!;
    const left = next.find((g) => g.id === "old")!;
    expect(moved.inRotation).toBe(true);
    expect(moved.ongoing).toBe(true); // the lane implies live-service traits
    expect(moved.preRotationOngoing).toBe(false); // snapshots ITS pre-lane state
    expect(left.inRotation).toBe(false);
    expect(left.ongoing).toBe(false); // restored to its pre-lane self
    expect(left.preRotationOngoing).toBeNull();
  });

  it("no-ops the migration when both are somehow playing (legacy) — designation only", () => {
    const games = [
      game("old", {
        familyId: "F",
        familyPrimaryGameId: "old",
        status: "playing",
        playedHours: 9,
      }),
      game("new", { familyId: "F", familyPrimaryGameId: "old", status: "playing", playedHours: 4 }),
    ];
    const next = applyPrimaryHandoff(games, "F", "new");
    expect(next.find((g) => g.id === "old")!.playedHours).toBe(9);
    expect(next.find((g) => g.id === "new")!.playedHours).toBe(4);
    expect(next.every((g) => g.familyPrimaryGameId === "new")).toBe(true);
  });
});

describe("applySever", () => {
  it("returns every member as a clean standalone card", () => {
    const games = [
      game("a", {
        familyId: "F",
        familyName: "Saga",
        familyPrimaryGameId: "a",
        familySplit: true,
      }),
      game("b", { familyId: "F", familyName: "Saga", familyPrimaryGameId: "a" }),
      game("solo"),
    ];
    const next = applySever(games, "F");
    for (const id of ["a", "b"]) {
      const g = next.find((x) => x.id === id)!;
      expect(g.familyId).toBeNull();
      expect(g.familyName).toBeUndefined();
      expect(g.familyPrimaryGameId).toBeNull();
      expect(g.familySplit).toBe(false);
    }
    expect(next.find((x) => x.id === "solo")).toBe(games[2]);
  });
});

describe("isFamilyDiscounted", () => {
  it("discounts a Bazaar edition when a sibling is playing or finished", () => {
    const bazaar = game("a", { familyId: "F" });
    expect(isFamilyDiscounted([bazaar, game("b", { familyId: "F", status: "playing" })], bazaar)).toBe(true);
    expect(isFamilyDiscounted([bazaar, game("b", { familyId: "F", status: "finished" })], bazaar)).toBe(true);
  });

  it("gives no discount for backlog/wishlist siblings, unlinked games, or non-Bazaar rows", () => {
    const bazaar = game("a", { familyId: "F" });
    expect(isFamilyDiscounted([bazaar, game("b", { familyId: "F" })], bazaar)).toBe(false);
    expect(isFamilyDiscounted([bazaar, game("b", { familyId: "F", status: "wishlist" })], bazaar)).toBe(false);
    const solo = game("solo");
    expect(isFamilyDiscounted([solo, game("b", { status: "finished" })], solo)).toBe(false);
    const wish = game("w", { familyId: "F", status: "wishlist" });
    expect(isFamilyDiscounted([wish, game("b", { familyId: "F", status: "finished" })], wish)).toBe(false);
  });

  it("reverts when the qualifying sibling is unlinked or removed (derived, not stored)", () => {
    const bazaar = game("a", { familyId: "F" });
    const done = game("b", { familyId: "F", status: "finished" });
    const games = [bazaar, done];
    expect(isFamilyDiscounted(games, bazaar)).toBe(true);

    // Unlink the finished sibling → the discount vanishes with the link…
    const unlinked = applyUnlink(games, "b");
    expect(isFamilyDiscounted(unlinked, unlinked.find((g) => g.id === "a")!)).toBe(false);
    // …and deleting it outright reverts the price the same way.
    expect(isFamilyDiscounted([bazaar], bazaar)).toBe(false);
  });

  it("a RETIRED sibling never counts as the family's clear — no discount, no replay downgrade", () => {
    const bazaar = game("a", { familyId: "F" });
    const retired = game("b", { familyId: "F", status: "finished", finishTag: "retired" });
    // A retired edition is an admitted non-clear: full price in…
    expect(isFamilyDiscounted([bazaar, retired], bazaar)).toBe(false);
    // …and a future finish still pays the FULL bounty (cost and payout in step).
    expect(isReplayFinish([bazaar, retired], bazaar)).toBe(false);
    // A real clear alongside the retirement restores both.
    const beaten = game("c", { familyId: "F", status: "finished", finishTag: "beaten" });
    expect(isFamilyDiscounted([bazaar, retired, beaten], bazaar)).toBe(true);
    expect(isReplayFinish([bazaar, retired, beaten], bazaar)).toBe(true);
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

  it("denormalizes an explicit primary across the whole family", () => {
    const games = applyLink([game("a"), game("b")], "a", "b", "b");
    expect(games.filter((g) => g.familyId != null).every((g) => g.familyPrimaryGameId === "b")).toBe(
      true,
    );
  });

  it("keeps the existing designation when adding a member with no explicit primary", () => {
    const games = applyLink(
      [
        game("a", { familyId: "F", familyPrimaryGameId: "a" }),
        game("b", { familyId: "F", familyPrimaryGameId: "a" }),
        game("c"),
      ],
      "a",
      "c",
    );
    expect(games.find((g) => g.id === "c")!.familyPrimaryGameId).toBe("a");
  });

  it("drops a stale designation when merging a family whose primary is gone", () => {
    const games = applyLink(
      [game("a", { familyId: "F", familyPrimaryGameId: "gone" }), game("b")],
      "a",
      "b",
    );
    expect(games.find((g) => g.id === "b")!.familyPrimaryGameId).toBeNull();
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
