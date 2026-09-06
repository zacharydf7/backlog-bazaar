import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchHltbTimes } from "./gamedata";

function jsonResponse(obj: unknown): Response {
  return { ok: true, status: 200, json: async () => obj } as Response;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("fetchHltbTimes", () => {
  it("parses the three times and caches the result", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ main: 12, mainExtra: 27, completionist: 75 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const t = await fetchHltbTimes("Super Mario Odyssey");
    expect(t).toEqual({ main: 12, mainExtra: 27, completionist: 75 });

    // Second call is served from cache — no extra network request.
    await fetchHltbTimes("Super Mario Odyssey");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when HLTB has no times", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ main: null, mainExtra: null, completionist: null })),
    );
    expect(await fetchHltbTimes("nonexistent game")).toBeUndefined();
  });

  it("caches a miss only briefly, so an HLTB outage cannot pin a blank for a month", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ main: null, mainExtra: null, completionist: null }))
        .mockResolvedValueOnce(jsonResponse({ main: 9, mainExtra: 14, completionist: 31 }));
      vi.stubGlobal("fetch", fetchMock);

      expect(await fetchHltbTimes("Sniper Elite: Resistance")).toBeUndefined();
      // Within the hour the miss is served from cache.
      vi.setSystemTime(new Date("2026-09-05T12:30:00Z"));
      expect(await fetchHltbTimes("Sniper Elite: Resistance")).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // After it, the title is looked up again and the real times land.
      vi.setSystemTime(new Date("2026-09-05T13:30:00Z"));
      expect(await fetchHltbTimes("Sniper Elite: Resistance")).toEqual({
        main: 9,
        mainExtra: 14,
        completionist: 31,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("requests a versioned URL and ignores blanks cached under the old namespace", async () => {
    // A 30-day blank left over from the outage, under the pre-bump key.
    localStorage.setItem(
      "bb-cache:hltb:hollow knight",
      JSON.stringify({ v: null, exp: Date.now() + 1000 * 60 * 60 * 24 * 29 }),
    );
    const fetchMock = vi.fn(async () => jsonResponse({ main: 27, mainExtra: 40, completionist: 60 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchHltbTimes("Hollow Knight")).toEqual({ main: 27, mainExtra: 40, completionist: 60 });
    expect(fetchMock).toHaveBeenCalledWith("/api/hltb?title=Hollow%20Knight&v=2");
  });
});
