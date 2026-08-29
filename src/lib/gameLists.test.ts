import { describe, it, expect } from "vitest";
import {
  coerceListSummary,
  coerceListDetail,
  coerceListFolder,
  folderCounts,
  listsInFolder,
  listHasGame,
  listGamePage,
  listItemMeta,
  listItemPreviewGame,
  ownedListGame,
  nextRank,
  rerank,
  VISIBILITY_META,
  type GameListItem,
  type GameListSummary,
} from "./gameLists";
import type { CatalogOverride } from "./submissions";
import type { Game } from "../types";
import { setIdentityLinks } from "./ownershipMerge";

let seq = 0;
function item(over: Partial<GameListItem> = {}): GameListItem {
  seq++;
  return { id: "i" + seq, title: "Game " + seq, blurb: "", rank: seq, ...over };
}

function summary(over: Partial<GameListSummary> = {}): GameListSummary {
  seq++;
  return {
    id: "l" + seq,
    folderId: null,
    title: "List " + seq,
    description: "",
    visibility: "private",
    itemCount: 0,
    preview: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

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

describe("coerceListSummary", () => {
  it("maps an RPC row, filtering the preview to strings", () => {
    const s = coerceListSummary({
      id: "abc",
      folder_id: "f1",
      title: "Top 10 JRPGs",
      description: "Ranked",
      visibility: "public",
      item_count: 10,
      preview: ["u1", null, "u2", 3],
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-04T00:00:00Z",
    });
    expect(s.folderId).toBe("f1");
    expect(s.itemCount).toBe(10);
    expect(s.preview).toEqual(["u1", "u2"]);
    expect(s.updatedAt).toBe(Date.parse("2026-07-04T00:00:00Z"));
  });

  it("degrades bad shapes to safe defaults", () => {
    const s = coerceListSummary({ id: "x", visibility: "nope", item_count: "NaN" });
    expect(s.visibility).toBe("private"); // safest default for a bad value
    expect(s.itemCount).toBe(0);
    expect(s.folderId).toBeNull();
    expect(s.preview).toEqual([]);
  });
});

describe("coerceListDetail", () => {
  it("parses the aggregated items and sorts by rank", () => {
    const d = coerceListDetail({
      id: "l1",
      user_id: "u1",
      owner_name: "Zach",
      owner_avatar: null,
      title: "Zelda: Ranked",
      description: "",
      visibility: "unlisted",
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
      items: [
        { id: "b", rawg_id: 2, catalog_id: null, title: "BotW", image: "", blurb: "", rank: 2 },
        { id: "a", rawg_id: 1, catalog_id: null, title: "OoT", image: "x", blurb: "GOAT", rank: 1 },
      ],
    });
    expect(d.items.map((i) => i.title)).toEqual(["OoT", "BotW"]);
    expect(d.items[0].blurb).toBe("GOAT");
    expect(d.items[0].image).toBe("x");
    expect(d.items[1].image).toBeUndefined(); // empty string → undefined
    expect(d.ownerName).toBe("Zach");
    expect(d.visibility).toBe("unlisted");
  });

  it("tolerates a missing items payload", () => {
    const d = coerceListDetail({ id: "l1", user_id: "u1", title: "t" });
    expect(d.items).toEqual([]);
  });
});

describe("coerceListFolder", () => {
  it("maps a folder row", () => {
    const f = coerceListFolder({ id: "f", name: "Top 10s", sort: 2, created_at: "2026-07-01T00:00:00Z" });
    expect(f).toMatchObject({ id: "f", name: "Top 10s", sort: 2 });
  });
});

describe("folderCounts / listsInFolder", () => {
  const lists = [
    summary({ folderId: "a" }),
    summary({ folderId: "a" }),
    summary({ folderId: "b" }),
    summary({ folderId: null }),
  ];

  it("counts lists per folder, unfiled under null", () => {
    const counts = folderCounts(lists);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    expect(counts.get(null)).toBe(1);
  });

  it("null selection is the All Lists master view", () => {
    expect(listsInFolder(lists, null)).toHaveLength(4);
    expect(listsInFolder(lists, "a")).toHaveLength(2);
    expect(listsInFolder(lists, "b")).toHaveLength(1);
  });
});

describe("listHasGame", () => {
  it("matches by rawg id first, then catalog id", () => {
    const items = [item({ rawgId: 42 }), item({ catalogId: "c1" })];
    expect(listHasGame(items, { rawgId: 42, title: "Different Name" })).toBe(true);
    expect(listHasGame(items, { catalogId: "c1", title: "Different Name" })).toBe(true);
    expect(listHasGame(items, { rawgId: 7, title: "Nope" })).toBe(false);
  });

  it("falls back to a case-insensitive title match for snapshot-only entries", () => {
    const items = [item({ title: "My Custom Game" })];
    expect(listHasGame(items, { title: "  my custom game " })).toBe(true);
    expect(listHasGame(items, { title: "Other" })).toBe(false);
  });

  it("does not title-match when both sides carry a shared id", () => {
    // Same title, different rawg ids: two distinct catalog entries.
    const items = [item({ rawgId: 1, title: "Doom" })];
    expect(listHasGame(items, { rawgId: 2, title: "Doom" })).toBe(false);
  });

  // Issue 1e48546b: IGDB adds used to land identity-less, so nothing matched.
  it("matches by igdb id like any other shared identity", () => {
    const items = [item({ igdbId: 188946, title: "Spiritfall" })];
    expect(listHasGame(items, { igdbId: 188946, title: "Different Name" })).toBe(true);
    expect(listHasGame(items, { igdbId: 7, title: "Nope" })).toBe(false);
  });

  it("bridges providers through the crosswalk (an IGDB item vs a RAWG copy)", () => {
    setIdentityLinks([{ rawgId: 46667, igdbId: 26765 }]);
    const items = [item({ igdbId: 26765, title: "Octopath Traveler" })];
    expect(listHasGame(items, { rawgId: 46667, title: "Whatever" })).toBe(true);
    setIdentityLinks([]);
  });
});

describe("ownedListGame", () => {
  it("finds an owned instance by identity, ignoring wishlist wants", () => {
    const games = [
      game({ rawgId: 42, status: "wishlist" }),
      game({ rawgId: 42, status: "finished" }),
      game({ catalogId: "c1" }),
    ];
    expect(ownedListGame(games, item({ rawgId: 42 }))?.status).toBe("finished");
    expect(ownedListGame(games, item({ catalogId: "c1" }))).toBeTruthy();
    expect(ownedListGame(games, item({ rawgId: 999 }))).toBeUndefined();
  });

  it("falls back to the title for snapshot-only items", () => {
    const games = [game({ title: "Homebrew Quest" })];
    expect(ownedListGame(games, item({ title: "homebrew quest" }))).toBeTruthy();
  });

  it("finds an owned IGDB copy from an IGDB list item (issue 1e48546b)", () => {
    const games = [game({ igdbId: 188946, status: "backlog" })];
    expect(ownedListGame(games, item({ igdbId: 188946, title: "Spiritfall" }))).toBeTruthy();
    expect(ownedListGame(games, item({ igdbId: 999, title: "Other" }))).toBeUndefined();
  });
});

// Issue 86d274d1: tapping an entry opens its page, and a wishlisted game has a
// page too — gating that on ownedListGame left wishlist-built lists inert.
describe("listGamePage", () => {
  it("prefers the copy you own when you hold the game on both boards", () => {
    const games = [
      game({ rawgId: 42, status: "wishlist" }),
      game({ rawgId: 42, status: "playing" }),
    ];
    expect(listGamePage(games, item({ rawgId: 42 }))?.status).toBe("playing");
  });

  it("still resolves a wishlist-only want, where ownedListGame finds nothing", () => {
    const games = [game({ rawgId: 42, status: "wishlist" })];
    expect(ownedListGame(games, item({ rawgId: 42 }))).toBeUndefined();
    expect(listGamePage(games, item({ rawgId: 42 }))?.status).toBe("wishlist");
  });

  it("matches a wishlisted want by catalog id and by title, like the owned path", () => {
    const games = [
      game({ catalogId: "c1", status: "wishlist" }),
      game({ title: "Homebrew Quest", status: "wishlist" }),
    ];
    expect(listGamePage(games, item({ catalogId: "c1" }))).toBeTruthy();
    expect(listGamePage(games, item({ title: "homebrew quest" }))).toBeTruthy();
  });

  it("is undefined for a game you don't hold at all — nothing to open", () => {
    expect(listGamePage([game({ rawgId: 1 })], item({ rawgId: 999 }))).toBeUndefined();
  });
});

// The same issue, second round: an entry you don't hold is the common case (a
// grail list holds nothing else), and tapping one opens the look-only card.
describe("listItemMeta / listItemPreviewGame", () => {
  const catalog: CatalogOverride = {
    catalogId: "c1",
    title: "Tail Concerto",
    image: "catalog-cover.jpg",
    platforms: ["PlayStation"],
    genres: ["Adventure"],
    developers: ["CyberConnect"],
    released: "1998-07-23",
    hours: 9,
    screenshots: ["shot.jpg"],
    isLiveService: false,
  };

  it("carries the entry's own identity and cover when there's no catalog record", () => {
    const meta = listItemMeta(
      item({ rawgId: 42, catalogId: "c1", title: "Tail Concerto", image: "cover.jpg" }),
    );
    expect(meta).toEqual({
      rawgId: 42,
      catalogId: "c1",
      title: "Tail Concerto",
      image: "cover.jpg",
      genres: [],
    });
  });

  it("lets the approved catalog record win, so the card shows shared data", () => {
    const meta = listItemMeta(item({ rawgId: 42, title: "Tail Concerto (JP)" }), catalog);
    expect(meta.title).toBe("Tail Concerto");
    expect(meta.image).toBe("catalog-cover.jpg");
    expect(meta.hours).toBe(9);
    expect(meta.released).toBe("1998-07-23");
    expect(meta.platforms).toEqual(["PlayStation"]);
    expect(meta.rawgId).toBe(42); // identity is the entry's own
  });

  it("survives a snapshot-only entry with no identity or art", () => {
    const meta = listItemMeta(item({ title: "Homebrew Quest" }));
    expect(meta.title).toBe("Homebrew Quest");
    expect(meta.rawgId).toBeUndefined();
    expect(meta.catalogId).toBeUndefined();
    expect(meta.image).toBeUndefined();
    expect(meta.genres).toEqual([]);
  });

  it("builds a stand-in game nobody owns — no copies, no playtime, not real", () => {
    const g = listItemPreviewGame(item({ id: "i7", rawgId: 42, title: "Tail Concerto" }), catalog);
    expect(g.id).toBe("list-item:i7");
    expect(g.status).toBe("wishlist");
    expect(g.copies).toEqual([]);
    expect(g.playedHours).toBeUndefined();
    expect(g.hours).toBe(9); // catalog data still comes through
  });
});

describe("ordering", () => {
  it("nextRank appends after the highest rank", () => {
    expect(nextRank([])).toBe(1);
    expect(nextRank([item({ rank: 3 }), item({ rank: 7 })])).toBe(8);
  });

  it("rerank rewrites ranks 1..n in array order", () => {
    const items = [item({ rank: 9 }), item({ rank: 2 }), item({ rank: 5 })];
    expect(rerank(items).map((i) => i.rank)).toEqual([1, 2, 3]);
  });
});

describe("VISIBILITY_META", () => {
  it("covers every visibility with user-facing copy", () => {
    for (const v of ["private", "unlisted", "public"] as const) {
      expect(VISIBILITY_META[v].label.length).toBeGreaterThan(0);
      expect(VISIBILITY_META[v].blurb.length).toBeGreaterThan(0);
    }
  });
});
