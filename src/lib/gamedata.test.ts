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
});
