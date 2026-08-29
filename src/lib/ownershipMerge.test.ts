import { describe, it, expect, afterEach } from "vitest";
import {
  catalogKey,
  clearedElsewhere,
  crosswalkedIds,
  resolveIdentityKey,
  setIdentityLinks,
} from "./ownershipMerge";
import type { Game } from "../types";

// The crosswalk is module-level catalog state — leave it empty for every other
// test in the suite.
afterEach(() => setIdentityLinks([]));

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
  it("prefers rawgId, then igdbId, then catalogId, else null", () => {
    expect(catalogKey({ rawgId: 42, igdbId: 9, catalogId: "abc" })).toBe("r:42");
    expect(catalogKey({ rawgId: undefined, igdbId: 9, catalogId: "abc" })).toBe("i:9");
    expect(catalogKey({ rawgId: undefined, igdbId: undefined, catalogId: "abc" })).toBe("c:abc");
    expect(catalogKey({ rawgId: undefined, igdbId: undefined, catalogId: undefined })).toBeNull();
  });

  it("never collides ids of the same numeric value across id spaces", () => {
    // RAWG and IGDB ids are both small ints — the same number must key
    // DIFFERENT games depending on which provider it came from.
    expect(catalogKey({ rawgId: 7 })).not.toBe(catalogKey({ igdbId: 7 }));
    expect(catalogKey({ rawgId: 7 })).not.toBe(catalogKey({ catalogId: "7" }));
    expect(catalogKey({ igdbId: 7 })).not.toBe(catalogKey({ catalogId: "7" }));
  });

  it("gives a crosswalked IGDB game the RAWG spelling, so both copies match", () => {
    // The bug this guards: Super Mario Sunshine added from IGDB (229177) never
    // matched the same game added from RAWG (52371), so no friend could be
    // invited to a co-op pact on it.
    setIdentityLinks([{ rawgId: 52371, igdbId: 229177 }]);
    expect(catalogKey({ igdbId: 229177 })).toBe("r:52371");
    expect(catalogKey({ igdbId: 229177 })).toBe(catalogKey({ rawgId: 52371 }));
  });

  it("leaves an unlinked IGDB game on its own spelling", () => {
    setIdentityLinks([{ rawgId: 52371, igdbId: 229177 }]);
    expect(catalogKey({ igdbId: 999 })).toBe("i:999");
  });

  it("still prefers a card's own rawgId over the crosswalk", () => {
    setIdentityLinks([{ rawgId: 52371, igdbId: 229177 }]);
    expect(catalogKey({ rawgId: 12, igdbId: 229177 })).toBe("r:12");
  });
});

describe("crosswalkedIds", () => {
  // The bug this guards (issue d2309794): an IGDB-added Octopath Traveler
  // (26765) never found the RAWG-keyed catalog row (46667) carrying the
  // community's cover art and screenshots.
  it("fills the linked RAWG id for an IGDB-only game, and vice versa", () => {
    setIdentityLinks([{ rawgId: 46667, igdbId: 26765 }]);
    expect(crosswalkedIds({ igdbId: 26765 })).toEqual({ rawgId: 46667, igdbId: 26765 });
    expect(crosswalkedIds({ rawgId: 46667 })).toEqual({ rawgId: 46667, igdbId: 26765 });
  });

  it("never overrides an id the game already carries", () => {
    setIdentityLinks([{ rawgId: 46667, igdbId: 26765 }]);
    expect(crosswalkedIds({ rawgId: 12, igdbId: 26765 })).toEqual({ rawgId: 12, igdbId: 26765 });
  });

  it("leaves unlinked and absent ids null", () => {
    setIdentityLinks([{ rawgId: 46667, igdbId: 26765 }]);
    expect(crosswalkedIds({ igdbId: 999 })).toEqual({ rawgId: null, igdbId: 999 });
    expect(crosswalkedIds({})).toEqual({ rawgId: null, igdbId: null });
  });
});

describe("resolveIdentityKey", () => {
  it("re-spells a stored IGDB key once the two providers are linked", () => {
    setIdentityLinks([{ rawgId: 52371, igdbId: 229177 }]);
    // A pact/dismissal written before the link still compares equal today.
    expect(resolveIdentityKey("i:229177")).toBe("r:52371");
  });

  it("passes through keys it can't re-spell", () => {
    expect(resolveIdentityKey("i:229177")).toBe("i:229177");
    expect(resolveIdentityKey("r:52371")).toBe("r:52371");
    expect(resolveIdentityKey("c:abc")).toBe("c:abc");
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
