import { describe, it, expect } from "vitest";
import { catalogKey, clearedElsewhere } from "./ownershipMerge";
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

describe("catalogKey", () => {
  it("prefers rawgId, falls back to catalogId, else null", () => {
    expect(catalogKey({ rawgId: 42, catalogId: "abc" })).toBe("r:42");
    expect(catalogKey({ rawgId: undefined, catalogId: "abc" })).toBe("c:abc");
    expect(catalogKey({ rawgId: undefined, catalogId: undefined })).toBeNull();
  });

  it("never collides a rawg id with a catalog id of the same text", () => {
    expect(catalogKey({ rawgId: 7 })).not.toBe(catalogKey({ catalogId: "7" }));
  });
});

describe("clearedElsewhere", () => {
  it("finds a finished instance of the same catalog game for an unplayed copy", () => {
    const done = game({ id: "d", rawgId: 1, status: "finished", finishTag: "beaten" });
    const fresh = game({ id: "f", rawgId: 1, status: "backlog" });
    expect(clearedElsewhere([done, fresh], fresh)?.id).toBe("d");
  });

  it("matches community games on catalogId and bundle children too", () => {
    const child = game({
      id: "c",
      catalogId: "alwa",
      compilationId: "comp1",
      status: "finished",
      finishTag: "completed",
    });
    const solo = game({ id: "s", catalogId: "alwa", status: "wishlist" });
    expect(clearedElsewhere([child, solo], solo)?.id).toBe("c");
  });

  it("only marks unplayed copies (backlog/wishlist), never playing or finished ones", () => {
    const done = game({ id: "d", rawgId: 1, status: "finished", finishTag: "beaten" });
    const playing = game({ id: "p", rawgId: 1, status: "playing" });
    const alsoDone = game({ id: "a", rawgId: 1, status: "finished", finishTag: "beaten" });
    expect(clearedElsewhere([done, playing], playing)).toBeNull();
    expect(clearedElsewhere([done, alsoDone], alsoDone)).toBeNull();
  });

  it("a legacy finish with no tag counts as beaten; retired and endless do not", () => {
    const fresh = game({ id: "f", rawgId: 1, status: "backlog" });
    const legacy = game({ id: "l", rawgId: 1, status: "finished", finishTag: null });
    expect(clearedElsewhere([legacy, fresh], fresh)?.id).toBe("l");
    const retired = game({ id: "r", rawgId: 1, status: "finished", finishTag: "retired" });
    const endless = game({ id: "e", rawgId: 1, status: "finished", finishTag: "endless" });
    expect(clearedElsewhere([retired, endless, fresh], fresh)).toBeNull();
  });

  it("prefers a 100% completion over a plain beat, then the earliest finish", () => {
    const fresh = game({ id: "f", rawgId: 1, status: "backlog" });
    const beat = game({ id: "b", rawgId: 1, status: "finished", finishTag: "beaten", finishedAt: 1 });
    const perfect = game({
      id: "p",
      rawgId: 1,
      status: "finished",
      finishTag: "completed",
      finishedAt: 9,
    });
    expect(clearedElsewhere([beat, perfect, fresh], fresh)?.id).toBe("p");
    const earlier = game({ id: "e", rawgId: 1, status: "finished", finishTag: "beaten", finishedAt: 0 });
    expect(clearedElsewhere([beat, earlier, fresh], fresh)?.id).toBe("e");
  });

  it("returns null for a custom game with no shared identity or when nothing cleared", () => {
    const custom = game({ id: "x", status: "backlog" });
    const done = game({ id: "d", status: "finished", finishTag: "beaten" });
    expect(clearedElsewhere([done, custom], custom)).toBeNull();
    const fresh = game({ id: "f", rawgId: 1, status: "backlog" });
    expect(clearedElsewhere([fresh], fresh)).toBeNull();
  });
});
