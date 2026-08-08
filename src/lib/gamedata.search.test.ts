import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GameMeta } from "../types";

// A key IS configured here, so RAWG is the preferred provider and Wikidata is
// its standby — the arrangement the live app runs with.
const rawgSearch = vi.fn<(q: string) => Promise<GameMeta[]>>();
const wikidataSearch = vi.fn<(q: string) => Promise<GameMeta[]>>();

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

const RAWG_HIT: GameMeta[] = [{ title: "Majora's Mask", rawgId: 1, genres: [], hours: 24 }];
const WIKI_HIT: GameMeta[] = [{ title: "Majora's Mask", genres: [], released: "2000-04-27" }];

// The search cache is process-wide (an in-memory map backing localStorage), so
// each case searches a query of its own rather than sharing one.
beforeEach(() => {
  localStorage.clear();
  rawgSearch.mockReset();
  wikidataSearch.mockReset();
});

describe("searchGames provider chain", () => {
  it("prefers RAWG while it is healthy", async () => {
    rawgSearch.mockResolvedValue(RAWG_HIT);
    expect(providerName).toBe("RAWG");
    expect(await searchGames("healthy")).toEqual(RAWG_HIT);
    expect(wikidataSearch).not.toHaveBeenCalled();
  });

  // 832e9525: RAWG went down (every request 522'd) and search returned nothing
  // at all, because the keyless provider was only ever used when NO key existed.
  it("falls back to Wikidata when RAWG is unreachable", async () => {
    rawgSearch.mockRejectedValue(new Error("RAWG request failed (522)."));
    wikidataSearch.mockResolvedValue(WIKI_HIT);
    expect(await searchGames("outage")).toEqual(WIKI_HIT);
    expect(wikidataSearch).toHaveBeenCalledWith("outage");
  });

  it("throws when every provider fails, so callers can say so", async () => {
    rawgSearch.mockRejectedValue(new Error("RAWG request failed (522)."));
    wikidataSearch.mockRejectedValue(new Error("Wikidata search failed (503)."));
    await expect(searchGames("blackout")).rejects.toThrow(/Wikidata search failed/);
  });

  it("caches per provider, so a fallback result is not reused once RAWG recovers", async () => {
    rawgSearch.mockRejectedValueOnce(new Error("RAWG request failed (522)."));
    wikidataSearch.mockResolvedValue(WIKI_HIT);
    expect(await searchGames("recovery")).toEqual(WIKI_HIT);

    // RAWG is back: its own cache key was never written during the outage, so the
    // richer result is fetched fresh rather than the thin one lingering a week.
    rawgSearch.mockResolvedValue(RAWG_HIT);
    expect(await searchGames("recovery")).toEqual(RAWG_HIT);
  });

  it("serves a repeat query from cache without hitting the provider again", async () => {
    rawgSearch.mockResolvedValue(RAWG_HIT);
    await searchGames("cached");
    await searchGames("  CACHED  ");
    expect(rawgSearch).toHaveBeenCalledTimes(1);
  });

  it("returns nothing for an empty query without touching a provider", async () => {
    expect(await searchGames("   ")).toEqual([]);
    expect(rawgSearch).not.toHaveBeenCalled();
    expect(wikidataSearch).not.toHaveBeenCalled();
  });
});
