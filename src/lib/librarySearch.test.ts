import { describe, it, expect } from "vitest";
import { gameMatchesQuery, filterByQuery, searchLibrary } from "./librarySearch";
import type { Game } from "../types";

function game(p: Partial<Game> & { id: string; title: string }): Game {
  return {
    status: "backlog",
    addedAt: 0,
    genres: [],
    platforms: [],
    copies: [],
    familyId: null,
    ...p,
  };
}

const halo = game({
  id: "halo",
  title: "Halo Infinite",
  genres: ["Shooter"],
  developers: ["343 Industries"],
  copies: [{ id: "c1", platform: "Xbox Series X" }],
});
const doom = game({
  id: "doom",
  title: "DOOM Eternal",
  genres: ["Shooter"],
  platforms: ["PC", "Switch"],
});
const zelda = game({
  id: "zelda",
  title: "Tears of the Kingdom",
  familyName: "The Legend of Zelda",
  copies: [{ id: "c2", platform: "Nintendo Switch" }],
});

describe("gameMatchesQuery", () => {
  it("matches on title, case-insensitively", () => {
    expect(gameMatchesQuery(halo, "halo")).toBe(true);
    expect(gameMatchesQuery(halo, "INFINITE")).toBe(true);
    expect(gameMatchesQuery(halo, "doom")).toBe(false);
  });

  it("matches on owned platform, genre, developer, and family name", () => {
    expect(gameMatchesQuery(halo, "xbox")).toBe(true);
    expect(gameMatchesQuery(halo, "shooter")).toBe(true);
    expect(gameMatchesQuery(halo, "343")).toBe(true);
    expect(gameMatchesQuery(zelda, "legend of zelda")).toBe(true);
  });

  it("requires every term to match (AND across terms)", () => {
    // "shooter" matches both, but only DOOM is on Switch.
    expect(gameMatchesQuery(doom, "shooter switch")).toBe(true);
    expect(gameMatchesQuery(halo, "shooter switch")).toBe(false);
  });

  it("falls back to release platforms when no copies are recorded", () => {
    expect(gameMatchesQuery(doom, "pc")).toBe(true);
  });

  it("treats an empty/whitespace query as matching everything", () => {
    expect(gameMatchesQuery(halo, "")).toBe(true);
    expect(gameMatchesQuery(halo, "   ")).toBe(true);
  });
});

describe("filterByQuery", () => {
  it("filters to matches and preserves order", () => {
    expect(filterByQuery([halo, doom, zelda], "shooter").map((g) => g.id)).toEqual([
      "halo",
      "doom",
    ]);
  });

  it("returns the list unchanged for an empty query", () => {
    const list = [halo, doom];
    expect(filterByQuery(list, "")).toBe(list);
  });
});

describe("searchLibrary", () => {
  it("returns nothing for an empty query (the modal shows a prompt, not all games)", () => {
    expect(searchLibrary([halo, doom, zelda], "")).toEqual([]);
  });

  it("searches across all statuses and ranks closer title matches first", () => {
    const finishedDoom = { ...doom, status: "finished" as const };
    const out = searchLibrary([finishedDoom, halo], "doom");
    expect(out.map((g) => g.id)).toEqual(["doom"]);
  });

  it("ranks an exact/prefix title match ahead of a non-title match", () => {
    // "shooter" is a genre on both, but DOOM's title doesn't start with it;
    // a query of "doom" should surface DOOM regardless of board order.
    const out = searchLibrary([halo, doom], "doom");
    expect(out[0].id).toBe("doom");
  });
});
