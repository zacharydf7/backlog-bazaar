import { describe, it, expect, vi, afterEach } from "vitest";
import { searchGames } from "./wikidata";

function jsonResponse(obj: unknown): Response {
  return { ok: true, status: 200, json: async () => obj } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("wikidata searchGames", () => {
  it("parses release dates and filters out non-games", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("wbsearchentities")) {
          return jsonResponse({
            search: [
              { id: "Q1", label: "Cool Game", description: "2017 action video game" },
              { id: "Q2", label: "Some Person", description: "politician" },
            ],
          });
        }
        // wbgetentities
        return jsonResponse({
          entities: {
            Q1: {
              claims: {
                P31: [{ mainsnak: { datavalue: { value: { id: "Q7889" } } } }],
                P577: [
                  { mainsnak: { datavalue: { value: { time: "+2017-03-03T00:00:00Z" } } } },
                ],
              },
            },
            Q2: { claims: {} },
          },
        });
      }),
    );

    const results = await searchGames("cool");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Cool Game");
    expect(results[0].released).toBe("2017-03-03");
  });

  it("returns [] for a blank query without calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchGames("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
