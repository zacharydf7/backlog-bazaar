import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GameMeta } from "../types";

// A RAWG key IS configured here, so the chain runs at full depth — IGDB
// preferred, RAWG as first standby, Wikidata as the keyless floor. This is the
// arrangement the live app runs with.
const igdbSearch = vi.fn<(q: string) => Promise<GameMeta[]>>();
const rawgSearch = vi.fn<(q: string) => Promise<GameMeta[]>>();
const wikidataSearch = vi.fn<(q: string) => Promise<GameMeta[]>>();

vi.mock("./igdb", () => ({ searchGames: (q: string) => igdbSearch(q) }));
vi.mock("./rawg", () => ({
  hasRawgKey: true,
  searchGames: (q: string) => rawgSearch(q),
  fetchGameDetails: vi.fn(),
  fetchGameCover: vi.fn(),
  fetchGameList: vi.fn(),
}));
vi.mock("./wikidata", () => ({ searchGames: (q: string) => wikidataSearch(q) }));

// Imported after the mocks so the provider list is built from them.
import { searchGames, providerName } from "./gamedata";

const IGDB_HIT: GameMeta[] = [
  { title: "Majora's Mask", genres: ["Adventure"], image: "https://img/co.jpg", rating: 4.5 },
];
const RAWG_HIT: GameMeta[] = [{ title: "Majora's Mask", rawgId: 1, genres: [], hours: 24 }];
const WIKI_HIT: GameMeta[] = [{ title: "Majora's Mask", genres: [], released: "2000-04-27" }];

// The search cache is process-wide (an in-memory map backing localStorage), so
// each case searches a query of its own rather than sharing one.
beforeEach(() => {
  localStorage.clear();
  igdbSearch.mockReset();
  rawgSearch.mockReset();
  wikidataSearch.mockReset();
});

describe("searchGames provider chain", () => {
  it("prefers IGDB while it is healthy", async () => {
    igdbSearch.mockResolvedValue(IGDB_HIT);
    expect(providerName).toBe("IGDB");
    expect(await searchGames("healthy")).toEqual(IGDB_HIT);
    expect(rawgSearch).not.toHaveBeenCalled();
    expect(wikidataSearch).not.toHaveBeenCalled();
  });

  it("falls back to RAWG when IGDB is unreachable", async () => {
    igdbSearch.mockRejectedValue(new Error("IGDB request failed (503)."));
    rawgSearch.mockResolvedValue(RAWG_HIT);
    expect(await searchGames("igdb-down")).toEqual(RAWG_HIT);
    expect(rawgSearch).toHaveBeenCalledWith("igdb-down");
    expect(wikidataSearch).not.toHaveBeenCalled();
  });

  // 832e9525: RAWG went down (every request 522'd) and search returned nothing
  // at all, because the keyless provider was only ever used when NO key existed.
  it("falls all the way to Wikidata when IGDB and RAWG both fail", async () => {
    igdbSearch.mockRejectedValue(new Error("IGDB request failed (502)."));
    rawgSearch.mockRejectedValue(new Error("RAWG request failed (522)."));
    wikidataSearch.mockResolvedValue(WIKI_HIT);
    expect(await searchGames("outage")).toEqual(WIKI_HIT);
    expect(wikidataSearch).toHaveBeenCalledWith("outage");
  });

  it("throws when every provider fails, so callers can say so", async () => {
    igdbSearch.mockRejectedValue(new Error("IGDB request failed (502)."));
    rawgSearch.mockRejectedValue(new Error("RAWG request failed (522)."));
    wikidataSearch.mockRejectedValue(new Error("Wikidata search failed (503)."));
    await expect(searchGames("blackout")).rejects.toThrow(/Wikidata search failed/);
  });

  it("caches per provider, so a fallback result is not reused once IGDB recovers", async () => {
    igdbSearch.mockRejectedValueOnce(new Error("IGDB request failed (502)."));
    rawgSearch.mockResolvedValue(RAWG_HIT);
    expect(await searchGames("recovery")).toEqual(RAWG_HIT);

    // IGDB is back: its own cache key was never written during the outage, so
    // the preferred result is fetched fresh rather than the standby's lingering.
    igdbSearch.mockResolvedValue(IGDB_HIT);
    expect(await searchGames("recovery")).toEqual(IGDB_HIT);
  });

  it("serves a repeat query from cache without hitting the provider again", async () => {
    igdbSearch.mockResolvedValue(IGDB_HIT);
    await searchGames("cached");
    await searchGames("  CACHED  ");
    expect(igdbSearch).toHaveBeenCalledTimes(1);
  });

  it("returns nothing for an empty query without touching a provider", async () => {
    expect(await searchGames("   ")).toEqual([]);
    expect(igdbSearch).not.toHaveBeenCalled();
    expect(rawgSearch).not.toHaveBeenCalled();
    expect(wikidataSearch).not.toHaveBeenCalled();
  });
});
