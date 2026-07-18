import { describe, it, expect } from "vitest";
import {
  applyLink,
  applySetPrimary,
  applySetFamilyCover,
  applySever,
  applyUnlink,
  familyCoverImage,
  familyMembers,
  familyName,
  familyPlatformTags,
  familyPrimary,
  familySiblings,
  familyStats,
  hiddenFamilySiblingIds,
  primaryChangeBlocker,
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

describe("applySetPrimary (zero migration)", () => {
  it("re-stamps the designation and moves absolutely nothing else", () => {
    const games = [
      game("old", {
        familyId: "F",
        familyPrimaryGameId: "old",
        status: "finished",
        finishTag: "beaten",
        slotId: null,
        playedHours: 40,
        progressNote: "Done!",
      }),
      game("new", { familyId: "F", familyPrimaryGameId: "old", playedHours: 3 }),
      game("solo"),
    ];
    const next = applySetPrimary(games, "F", "new");
    const old = next.find((g) => g.id === "old")!;
    const now = next.find((g) => g.id === "new")!;
    // History stays permanently locked to the record that earned it.
    expect(old.status).toBe("finished");
    expect(old.playedHours).toBe(40);
    expect(old.progressNote).toBe("Done!");
    expect(old.finishTag).toBe("beaten");
    // The new primary keeps ITS record too — only the pointer changed.
    expect(now.playedHours).toBe(3);
    expect(now.status).toBe("backlog");
    expect(next.filter((g) => g.familyId === "F").every((g) => g.familyPrimaryGameId === "new")).toBe(
      true,
    );
    // Untouched outsiders keep their identity (reference equality).
    expect(next.find((g) => g.id === "solo")).toBe(games[2]);
  });

  it("no-ops when the target isn't a member of the family", () => {
    const games = [game("a", { familyId: "F" }), game("b")];
    expect(applySetPrimary(games, "F", "b")).toBe(games);
    expect(applySetPrimary(games, "F", "missing")).toBe(games);
  });
});

describe("primaryChangeBlocker", () => {
  it("blocks reassignment away from a Now Playing primary (the run can't move)", () => {
    const members = [
      game("old", { familyId: "F", familyPrimaryGameId: "old", status: "playing" }),
      game("new", { familyId: "F", familyPrimaryGameId: "old" }),
    ];
    expect(primaryChangeBlocker(members, "new")?.id).toBe("old");
    // Re-designating the SAME primary is always fine (a no-op confirm).
    expect(primaryChangeBlocker(members, "old")).toBeNull();
  });

  it("allows the change when the outgoing primary is not mid-run", () => {
    for (const status of ["backlog", "wishlist", "finished"] as const) {
      const members = [
        game("old", { familyId: "F", familyPrimaryGameId: "old", status }),
        game("new", { familyId: "F", familyPrimaryGameId: "old" }),
      ];
      expect(primaryChangeBlocker(members, "new")).toBeNull();
    }
  });

  it("blocks against the IMPLICIT primary too (legacy family, playing member)", () => {
    const members = [
      game("a", { familyId: "F", status: "playing", addedAt: 1 }),
      game("b", { familyId: "F", status: "backlog", addedAt: 2 }),
    ];
    // No stored designation: the playing member is the acting primary.
    expect(primaryChangeBlocker(members, "b")?.id).toBe("a");
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

describe("familyCoverImage / applySetFamilyCover (9f420872)", () => {
  const members = [
    game("a", { familyId: "F", image: "a.jpg", familyPrimaryGameId: "a" }),
    game("b", { familyId: "F", image: "b.jpg", familyPrimaryGameId: "a" }),
  ];

  it("resolves the designated member's live cover, or nothing without one", () => {
    expect(familyCoverImage(members)).toBeUndefined();
    const designated = members.map((m) => ({ ...m, familyCoverGameId: "b" }));
    expect(familyCoverImage(designated)).toBe("b.jpg");
  });

  it("falls through a stale pointer to a departed member", () => {
    const stale = members.map((m) => ({ ...m, familyCoverGameId: "gone" }));
    expect(familyCoverImage(stale)).toBeUndefined();
  });

  it("stamps the designation across every member, and null clears it", () => {
    const all = [...members, game("z")]; // an unrelated game stays untouched
    const set = applySetFamilyCover(all, "F", "b");
    expect(set.filter((g) => g.familyId === "F").every((g) => g.familyCoverGameId === "b")).toBe(
      true,
    );
    expect(set.find((g) => g.id === "z")?.familyCoverGameId).toBeUndefined();
    const cleared = applySetFamilyCover(set, "F", null);
    expect(cleared.every((g) => !g.familyCoverGameId)).toBe(true);
  });

  it("no-ops when the cover target isn't a member of the family", () => {
    expect(applySetFamilyCover(members, "F", "z")).toEqual(members);
  });

  it("unlink and sever both clear the cover designation", () => {
    const designated = members.map((m) => ({ ...m, familyCoverGameId: "b" }));
    expect(applySever(designated, "F").every((g) => g.familyCoverGameId == null)).toBe(true);
    const unlinked = applyUnlink(designated, "b");
    expect(unlinked.every((g) => g.familyCoverGameId == null)).toBe(true);
  });
});
