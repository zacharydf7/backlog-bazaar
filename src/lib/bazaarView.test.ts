import { describe, it, expect, beforeEach } from "vitest";
import {
  applyView,
  collectFacets,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  loadSortPref,
  saveSortPref,
  sortGames,
  toggleFilter,
  gameMatches,
  type Filters,
} from "./bazaarView";
import { DEFAULT_PRICE_FORMULA, DEFAULT_BOUNTY_FORMULA } from "./economy";
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

describe("collectFacets", () => {
  it("uses owned-copy platforms when copies exist, release platforms otherwise", () => {
    const f = collectFacets([
      // Released on PC + Switch, but only owned on Switch — PC must not appear.
      game({
        id: "a",
        title: "A",
        platforms: ["PC", "Switch"],
        genres: ["RPG", "Action"],
        copies: [{ id: "c1", platform: "Switch", format: "physical" }],
      }),
      // No copies recorded → fall back to the release platform.
      game({ id: "b", title: "B", platforms: ["PS5"], genres: ["RPG"] }),
    ]);
    expect(f.platforms).toEqual(["PS5", "Switch"]); // PC excluded — not owned
    expect(f.genres).toEqual(["Action", "RPG"]);
    expect(f.formats).toEqual(["physical"]);
  });

  it("omits formats nobody owns", () => {
    const f = collectFacets([game({ id: "a", title: "A" })]);
    expect(f.formats).toEqual([]);
  });
});

describe("gameMatches", () => {
  const g = game({
    id: "a",
    title: "Switch RPG",
    genres: ["RPG"],
    copies: [{ id: "c1", platform: "Switch", format: "physical" }],
  });

  it("passes when no filters are active", () => {
    expect(gameMatches(g, EMPTY_FILTERS)).toBe(true);
  });

  it("OR within a category", () => {
    expect(gameMatches(g, { ...EMPTY_FILTERS, platforms: ["PS5", "Switch"] })).toBe(true);
    expect(gameMatches(g, { ...EMPTY_FILTERS, platforms: ["PS5"] })).toBe(false);
  });

  it("AND across categories — Switch RPGs that are physical", () => {
    const f: Filters = { platforms: ["Switch"], genres: ["RPG"], formats: ["physical"] };
    expect(gameMatches(g, f)).toBe(true);
    expect(gameMatches(g, { ...f, formats: ["digital"] })).toBe(false);
    expect(gameMatches(g, { ...f, genres: ["Action"] })).toBe(false);
  });

  it("filters by owned platform, not release platform", () => {
    // Owned on Switch 2; the game also released on Switch, which I don't own.
    const owned = game({
      id: "x",
      title: "Cross-gen RPG",
      platforms: ["Switch", "Switch 2"],
      copies: [{ id: "c1", platform: "Switch 2", format: "digital" }],
    });
    expect(gameMatches(owned, { ...EMPTY_FILTERS, platforms: ["Switch 2"] })).toBe(true);
    expect(gameMatches(owned, { ...EMPTY_FILTERS, platforms: ["Switch"] })).toBe(false);

    // With no copies recorded, the release platforms still drive the filter.
    const untracked = game({ id: "y", title: "Untracked", platforms: ["Switch", "Switch 2"] });
    expect(gameMatches(untracked, { ...EMPTY_FILTERS, platforms: ["Switch"] })).toBe(true);
  });
});

describe("sortGames", () => {
  const recent = game({ id: "r", title: "Zelda", addedAt: 300, hours: 50, released: "2024-01-01" });
  const old = game({ id: "o", title: "Mario", addedAt: 100, hours: 5, released: "2005-01-01" });
  const mid = game({ id: "m", title: "Astro", addedAt: 200, hours: 20, released: "2015-01-01" });
  const list = [recent, old, mid];

  const ids = (key: Parameters<typeof sortGames>[1]) => sortGames(list, key).map((x) => x.id);

  it("added-desc is newest first (default)", () => {
    expect(ids("added-desc")).toEqual(["r", "m", "o"]);
  });

  it("added-asc is oldest first", () => {
    expect(ids("added-asc")).toEqual(["o", "m", "r"]);
  });

  it("alpha sorts by title", () => {
    expect(ids("alpha")).toEqual(["m", "o", "r"]); // Astro, Mario, Zelda
  });

  it("playtime-asc puts the shortest game first", () => {
    expect(ids("playtime-asc")).toEqual(["o", "m", "r"]); // 5h, 20h, 50h
  });

  it("cost-asc puts the cheapest unlock first", () => {
    // Cheapest = oldest + shortest (Mario), priciest = newest + longest (Zelda).
    expect(ids("cost-asc")[0]).toBe("o");
    expect(ids("cost-asc").at(-1)).toBe("r");
  });

  it("bounty-desc puts the most lucrative finish first (per the economy config)", () => {
    // With a length-weighted bounty, the 50h game leads and the 5h trails.
    const economy = {
      price: DEFAULT_PRICE_FORMULA,
      bounty: {
        base: 40,
        recencyDecayYears: 8,
        factors: {
          ...DEFAULT_BOUNTY_FORMULA.factors,
          length: { enabled: true, weight: 5 },
        },
      },
    };
    const ranked = sortGames(list, "bounty-desc", economy).map((x) => x.id);
    expect(ranked[0]).toBe("r");
    expect(ranked.at(-1)).toBe("o");
  });

  it("does not mutate its input", () => {
    const before = list.map((x) => x.id);
    sortGames(list, "alpha");
    expect(list.map((x) => x.id)).toEqual(before);
  });
});

describe("sort preference persistence", () => {
  beforeEach(() => localStorage.clear());

  it("defaults when nothing is stored", () => {
    expect(loadSortPref()).toBe(DEFAULT_SORT);
  });

  it("round-trips a saved choice so it survives a refresh", () => {
    saveSortPref("alpha");
    expect(loadSortPref()).toBe("alpha");
  });

  it("falls back to the default for an unrecognized stored value", () => {
    localStorage.setItem("bb:board-sort", "not-a-real-sort");
    expect(loadSortPref()).toBe(DEFAULT_SORT);
  });
});

describe("applyView", () => {
  it("filters then sorts", () => {
    const out = applyView(
      [
        game({ id: "a", title: "B-game", genres: ["RPG"], addedAt: 1 }),
        game({ id: "b", title: "A-game", genres: ["RPG"], addedAt: 2 }),
        game({ id: "c", title: "C-game", genres: ["Action"], addedAt: 3 }),
      ],
      "alpha",
      { ...EMPTY_FILTERS, genres: ["RPG"] },
    );
    expect(out.map((x) => x.id)).toEqual(["b", "a"]); // only RPGs, A–Z
  });

  it("keeps linked editions as separate entries (decentralized — no collapsing)", () => {
    // Two editions of one family on different boards both pass through as their
    // own games; the board layer filters by status, not here.
    const out = applyView(
      [
        game({ id: "switch", title: "Witcher 3", familyId: "fam1", status: "finished" }),
        game({ id: "pc", title: "Witcher 3", familyId: "fam1", status: "playing" }),
      ],
      "alpha",
      EMPTY_FILTERS,
    );
    expect(out.map((x) => x.id).sort()).toEqual(["pc", "switch"]);
  });
});

describe("toggleFilter", () => {
  it("adds then removes", () => {
    expect(toggleFilter(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFilter(["a", "b"], "a")).toEqual(["b"]);
  });
});
