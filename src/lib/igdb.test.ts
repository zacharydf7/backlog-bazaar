import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mapIgdbGame, searchGames } from "./igdb";

// A realistic raw record as the proxy passes it through (see api/igdb.ts).
const OCARINA = {
  id: 1029,
  name: "The Legend of Zelda: Ocarina of Time",
  first_release_date: 911001600, // 1998-11-14 UTC
  rating: 92.3,
  aggregated_rating: 98.4,
  cover: { url: "//images.igdb.com/igdb/image/upload/t_thumb/co3nnx.jpg" },
  genres: [{ name: "Adventure" }, { name: "Puzzle" }],
  platforms: [{ name: "Nintendo 64" }, { name: "PC (Microsoft Windows)" }],
  involved_companies: [
    { developer: true, company: { name: "Nintendo EAD" } },
    { developer: false, company: { name: "Nintendo" } }, // publisher-only
  ],
  age_ratings: [
    { organization: { name: "PEGI" }, rating_category: { rating: "Twelve" } },
    { organization: { name: "ESRB" }, rating_category: { rating: "E10" } },
  ],
};

describe("mapIgdbGame", () => {
  it("maps a full record onto GameMeta", () => {
    expect(mapIgdbGame(OCARINA)).toEqual({
      igdbId: 1029,
      title: "The Legend of Zelda: Ocarina of Time",
      released: "1998-11-14",
      image: "https://images.igdb.com/igdb/image/upload/t_cover_big/co3nnx.jpg",
      rating: 4.62, // 92.3 / 20, rounded to 2dp
      hours: undefined, // no length on IGDB — HowLongToBeat fills it on pick
      metacritic: 98,
      genres: ["Adventure", "Puzzle"],
      platforms: ["Nintendo 64", "PC"], // IGDB's Windows label normalized
      developers: ["Nintendo EAD"], // publisher-only companies dropped
      esrb: "Everyone 10+", // ESRB org picked out, short code expanded
    });
  });

  it("normalizes IGDB's Xbox Series naming to the app's label", () => {
    const meta = mapIgdbGame({ id: 1, name: "Halo Infinite", platforms: [{ name: "Xbox Series X|S" }] });
    expect(meta.platforms).toEqual(["Xbox Series X/S"]);
  });

  it("tolerates a minimal record (every optional field absent)", () => {
    expect(mapIgdbGame({ id: 7, name: "Obscuria" })).toEqual({
      igdbId: 7,
      title: "Obscuria",
      released: undefined,
      image: undefined,
      rating: undefined,
      hours: undefined,
      metacritic: null,
      genres: [],
      platforms: [],
      developers: [],
      esrb: undefined,
    });
  });

  it("passes an unknown ESRB code through rather than dropping it", () => {
    const meta = mapIgdbGame({
      id: 8,
      name: "Futuria",
      age_ratings: [{ organization: { name: "ESRB" }, rating_category: { rating: "E10+" } }],
    });
    expect(meta.esrb).toBe("E10+");
  });

  it("leaves esrb unset when only other ratings boards are present", () => {
    const meta = mapIgdbGame({
      id: 9,
      name: "Eurogame",
      age_ratings: [{ organization: { name: "PEGI" }, rating_category: { rating: "Eighteen" } }],
    });
    expect(meta.esrb).toBeUndefined();
  });
});

describe("searchGames (via the proxy)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps the proxy's array response", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([OCARINA]), { status: 200 }));
    const results = await searchGames("ocarina");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("The Legend of Zelda: Ocarina of Time");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe("/api/igdb?op=search&q=ocarina");
  });

  it("throws on a non-OK response (unconfigured or unreachable proxy)", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "IGDB is not configured." }), { status: 503 }),
    );
    await expect(searchGames("zelda")).rejects.toThrow(/503/);
  });

  it("throws when a 200 body is not IGDB's array (dev-server fallback page)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ hello: "spa" }), { status: 200 }));
    await expect(searchGames("zelda")).rejects.toThrow(/unexpected response/);
  });

  it("returns nothing for a blank query without a request", async () => {
    expect(await searchGames("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
