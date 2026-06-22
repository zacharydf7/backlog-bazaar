import { describe, it, expect } from "vitest";
import {
  applyView,
  collectFacets,
  EMPTY_FILTERS,
  sortUnits,
  toggleFilter,
  unitMatches,
  type Filters,
} from "./bazaarView";
import { buildUnits } from "./families";
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

/** Wrap loose games into board units (every game on its own unless familyId). */
function units(games: Game[]) {
  return buildUnits(games);
}

describe("collectFacets", () => {
  it("uses owned-copy platforms when copies exist, release platforms otherwise", () => {
    const u = units([
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
    const f = collectFacets(u);
    expect(f.platforms).toEqual(["PS5", "Switch"]); // PC excluded — not owned
    expect(f.genres).toEqual(["Action", "RPG"]);
    expect(f.formats).toEqual(["physical"]);
  });

  it("omits formats nobody owns", () => {
    const f = collectFacets(units([game({ id: "a", title: "A" })]));
    expect(f.formats).toEqual([]);
  });
});

describe("unitMatches", () => {
  const u = units([
    game({
      id: "a",
      title: "Switch RPG",
      genres: ["RPG"],
      copies: [{ id: "c1", platform: "Switch", format: "physical" }],
    }),
  ])[0];

  it("passes when no filters are active", () => {
    expect(unitMatches(u, EMPTY_FILTERS)).toBe(true);
  });

  it("OR within a category", () => {
    expect(unitMatches(u, { ...EMPTY_FILTERS, platforms: ["PS5", "Switch"] })).toBe(true);
    expect(unitMatches(u, { ...EMPTY_FILTERS, platforms: ["PS5"] })).toBe(false);
  });

  it("AND across categories — Switch RPGs that are physical", () => {
    const f: Filters = { platforms: ["Switch"], genres: ["RPG"], formats: ["physical"] };
    expect(unitMatches(u, f)).toBe(true);
    expect(unitMatches(u, { ...f, formats: ["digital"] })).toBe(false);
    expect(unitMatches(u, { ...f, genres: ["Action"] })).toBe(false);
  });

  it("filters by owned platform, not release platform", () => {
    // Owned on Switch 2; the game also released on Switch, which I don't own.
    const owned = units([
      game({
        id: "x",
        title: "Cross-gen RPG",
        platforms: ["Switch", "Switch 2"],
        copies: [{ id: "c1", platform: "Switch 2", format: "digital" }],
      }),
    ])[0];
    expect(unitMatches(owned, { ...EMPTY_FILTERS, platforms: ["Switch 2"] })).toBe(true);
    expect(unitMatches(owned, { ...EMPTY_FILTERS, platforms: ["Switch"] })).toBe(false);

    // With no copies recorded, the release platforms still drive the filter.
    const untracked = units([
      game({ id: "y", title: "Untracked", platforms: ["Switch", "Switch 2"] }),
    ])[0];
    expect(unitMatches(untracked, { ...EMPTY_FILTERS, platforms: ["Switch"] })).toBe(true);
  });
});

describe("sortUnits", () => {
  const recent = game({ id: "r", title: "Zelda", addedAt: 300, hours: 50, released: "2024-01-01" });
  const old = game({ id: "o", title: "Mario", addedAt: 100, hours: 5, released: "2005-01-01" });
  const mid = game({ id: "m", title: "Astro", addedAt: 200, hours: 20, released: "2015-01-01" });
  const u = units([recent, old, mid]);

  const ids = (key: Parameters<typeof sortUnits>[1]) =>
    sortUnits(u, key).map((x) => x.rep.id);

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

  it("bounty-desc puts the most lucrative finish first", () => {
    // Bounty grows with length, so the 50h game leads, the 5h trails.
    expect(ids("bounty-desc")[0]).toBe("r");
    expect(ids("bounty-desc").at(-1)).toBe("o");
  });

  it("does not mutate its input", () => {
    const before = u.map((x) => x.rep.id);
    sortUnits(u, "alpha");
    expect(u.map((x) => x.rep.id)).toEqual(before);
  });
});

describe("families", () => {
  it("a family unit matches if any edition matches, and uses the rep for sorting", () => {
    const u = units([
      game({
        id: "switch",
        title: "Witcher 3",
        familyId: "fam1",
        status: "backlog",
        addedAt: 10,
        copies: [{ id: "c1", platform: "Switch", format: "physical" }],
      }),
      game({
        id: "pc",
        title: "Witcher 3",
        familyId: "fam1",
        status: "playing",
        addedAt: 20,
        genres: ["RPG"],
      }),
    ]);
    expect(u).toHaveLength(1);
    expect(unitMatches(u[0], { ...EMPTY_FILTERS, platforms: ["Switch"] })).toBe(true);
    expect(unitMatches(u[0], { ...EMPTY_FILTERS, genres: ["RPG"] })).toBe(true);
  });
});

describe("applyView", () => {
  it("filters then sorts", () => {
    const u = units([
      game({ id: "a", title: "B-game", genres: ["RPG"], addedAt: 1 }),
      game({ id: "b", title: "A-game", genres: ["RPG"], addedAt: 2 }),
      game({ id: "c", title: "C-game", genres: ["Action"], addedAt: 3 }),
    ]);
    const out = applyView(u, "alpha", { ...EMPTY_FILTERS, genres: ["RPG"] });
    expect(out.map((x) => x.rep.id)).toEqual(["b", "a"]); // only RPGs, A–Z
  });
});

describe("toggleFilter", () => {
  it("adds then removes", () => {
    expect(toggleFilter(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFilter(["a", "b"], "a")).toEqual(["b"]);
  });
});
