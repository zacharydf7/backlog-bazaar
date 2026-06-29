import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GameMeta } from "../types";
import type { CatalogOverride } from "./submissions";

// Keep the RAWG/Wikidata layer deterministic and offline.
const searchGamesMock = vi.fn<(q: string) => Promise<GameMeta[]>>();
vi.mock("./gamedata", () => ({
  searchGames: (q: string) => searchGamesMock(q),
}));

// Imported after the mock so it picks up the stubbed searchGames.
import { sortByRelevance, searchGameSuggestions } from "./gameSearch";

function override(over: Partial<CatalogOverride> = {}): CatalogOverride {
  return {
    catalogId: "c1",
    title: "",
    image: "",
    platforms: [],
    genres: [],
    developers: [],
    released: "",
    hours: null,
    screenshots: [],
    isLiveService: false,
    ...over,
  };
}

describe("sortByRelevance", () => {
  it("floats an exact match to the top even if it was last (regression)", () => {
    const list = [
      { title: "RollerCoaster Tycoon 3: Complete Edition" },
      { title: "Lies of P: Complete Edition" },
    ];
    expect(sortByRelevance(list, "Lies of P: Complete Edition")[0].title).toBe(
      "Lies of P: Complete Edition",
    );
  });

  it("leaves the list untouched for an empty query", () => {
    const list = [{ title: "B" }, { title: "A" }];
    expect(sortByRelevance(list, "  ").map((x) => x.title)).toEqual(["B", "A"]);
  });

  it("orders two identically-named games by release date, oldest first", () => {
    // A reboot listed before the original still ends up after it (chronological).
    const list = [
      { title: "Tomb Raider", released: "2013-03-05" },
      { title: "Tomb Raider", released: "1996-10-25" },
    ];
    expect(sortByRelevance(list, "tomb raider").map((x) => x.released)).toEqual([
      "1996-10-25",
      "2013-03-05",
    ]);
  });

  it("keeps provider order for differently-titled same-rank results", () => {
    // Only identical titles get the date tiebreak; these keep their input order.
    const list = [
      { title: "Doom Eternal", released: "2020-03-20" },
      { title: "Doom 64", released: "1997-03-31" },
    ];
    expect(sortByRelevance(list, "doom").map((x) => x.title)).toEqual([
      "Doom Eternal",
      "Doom 64",
    ]);
  });
});

describe("searchGameSuggestions", () => {
  beforeEach(() => {
    searchGamesMock.mockReset();
  });

  const noCommunity = vi.fn(async () => [] as GameMeta[]);
  const noOverrides = vi.fn(async () => ({}) as Record<number, CatalogOverride>);

  it("returns nothing for a too-short query without hitting the providers", async () => {
    const out = await searchGameSuggestions("a", {
      searchCatalogGames: noCommunity,
      fetchCatalogOverrides: noOverrides,
    });
    expect(out).toEqual([]);
    expect(searchGamesMock).not.toHaveBeenCalled();
  });

  it("enriches a RAWG result with the approved catalog edit (the compilation bug)", async () => {
    // RAWG returns stale data; the catalog override carries the approved title,
    // cover and length that the Add-game box already showed.
    searchGamesMock.mockResolvedValue([
      { title: "Old Name", rawgId: 7, image: "old.jpg", hours: undefined, genres: [] },
    ]);
    const fetchCatalogOverrides = vi.fn(async () => ({
      7: override({ title: "New Name", image: "new.jpg", hours: 19 }),
    }));
    const out = await searchGameSuggestions("name", {
      searchCatalogGames: noCommunity,
      fetchCatalogOverrides,
    });
    expect(fetchCatalogOverrides).toHaveBeenCalledWith([7]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: "New Name",
      image: "new.jpg",
      hours: 19,
      catalogId: "c1",
    });
  });

  it("folds in community games and dedupes by rawgId and title", async () => {
    searchGamesMock.mockResolvedValue([
      { title: "Halo", rawgId: 1, genres: [] },
      { title: "Doom", rawgId: 2, genres: [] },
    ]);
    const community: GameMeta[] = [
      { title: "Halo", rawgId: 1, genres: [], catalogId: "dup-rawg" }, // dropped (same rawgId)
      { title: "doom", genres: [], catalogId: "dup-title" }, // dropped (same title)
      { title: "Banjo", genres: [], catalogId: "keep" }, // kept (community-only)
    ];
    const out = await searchGameSuggestions("oo", {
      searchCatalogGames: vi.fn(async () => community),
      fetchCatalogOverrides: noOverrides,
    });
    // The two duplicates are dropped; only the community-only "Banjo" is kept
    // alongside the two RAWG results (order is by relevance, not asserted here).
    expect(out.map((g) => g.title).sort()).toEqual(["Banjo", "Doom", "Halo"]);
    expect(out.find((g) => g.title === "Banjo")?.catalogId).toBe("keep");
  });

  it("keeps a community game that shares a name but not the release year (the dup-name bug)", async () => {
    // RAWG has the modern Prey (2017); the community catalog has the original
    // Prey (2006). Same title, different years → both must show, oldest first.
    searchGamesMock.mockResolvedValue([
      { title: "Prey", rawgId: 5, released: "2017-05-05", genres: [] },
    ]);
    const community: GameMeta[] = [
      { title: "Prey", released: "2006-07-11", genres: [], catalogId: "classic" },
    ];
    const out = await searchGameSuggestions("prey", {
      searchCatalogGames: vi.fn(async () => community),
      fetchCatalogOverrides: noOverrides,
    });
    expect(out).toHaveLength(2);
    expect(out.map((g) => g.released)).toEqual(["2006-07-11", "2017-05-05"]);
    expect(out.find((g) => g.catalogId === "classic")).toBeTruthy();
  });

  it("still drops a community duplicate that shares the title AND release year", async () => {
    searchGamesMock.mockResolvedValue([
      { title: "Celeste", rawgId: 8, released: "2018-01-25", genres: [] },
    ]);
    const community: GameMeta[] = [
      { title: "Celeste", released: "2018-01-25", genres: [], catalogId: "dup" },
    ];
    const out = await searchGameSuggestions("celeste", {
      searchCatalogGames: vi.fn(async () => community),
      fetchCatalogOverrides: noOverrides,
    });
    expect(out).toHaveLength(1);
    expect(out[0].rawgId).toBe(8);
  });

  it("still returns RAWG results when the community search fails", async () => {
    searchGamesMock.mockResolvedValue([{ title: "Tetris", rawgId: 9, genres: [] }]);
    const out = await searchGameSuggestions("tetris", {
      searchCatalogGames: vi.fn(async () => {
        throw new Error("offline");
      }),
      fetchCatalogOverrides: noOverrides,
    });
    expect(out.map((g) => g.title)).toEqual(["Tetris"]);
  });
});
