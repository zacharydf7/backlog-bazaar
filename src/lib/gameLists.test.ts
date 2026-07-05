import { describe, it, expect } from "vitest";
import {
  coerceListSummary,
  coerceListDetail,
  coerceListFolder,
  folderCounts,
  listsInFolder,
  listHasGame,
  ownedListGame,
  nextRank,
  rerank,
  VISIBILITY_META,
  type GameListItem,
  type GameListSummary,
} from "./gameLists";
import type { Game } from "../types";

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
