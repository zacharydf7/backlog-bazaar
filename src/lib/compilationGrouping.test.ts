import { describe, it, expect } from "vitest";
import type { Compilation, Game } from "../types";
import type { ParentTemplate } from "./compilationTemplates";
import {
  compilationMatchesFilters,
  compilationMatchesQuery,
  compilationRollup,
  deriveCompilationBoard,
  findExpandTemplate,
  groupCollapsedCompilations,
} from "./compilationGrouping";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    addedAt: 1,
    ...over,
  } as Game;
}

function comp(over: Partial<Compilation> = {}): Compilation {
  return {
    id: "C",
    title: "Bundle",
    totalCost: 40,
    createdAt: 1,
    expanded: true,
    carryoverHours: 0,
    ...over,
  };
}

describe("deriveCompilationBoard", () => {
  it("keeps the card in the Bazaar while any child is unfinished", () => {
    expect(
      deriveCompilationBoard([
        game({ id: "a", status: "finished" }),
        game({ id: "b", status: "backlog" }),
      ]),
    ).toBe("backlog");
  });

  it("moves to Finished only when every child is finished", () => {
    expect(
      deriveCompilationBoard([
        game({ id: "a", status: "finished" }),
        game({ id: "b", status: "finished" }),
      ]),
    ).toBe("finished");
  });

  it("treats a playing child as not-finished (least-completed rules)", () => {
    expect(
      deriveCompilationBoard([
        game({ id: "a", status: "finished" }),
        game({ id: "b", status: "playing" }),
      ]),
    ).toBe("backlog");
  });

  it("defaults an empty bundle to the Bazaar", () => {
    expect(deriveCompilationBoard([])).toBe("backlog");
  });
});

describe("compilationRollup", () => {
  it("sums child hours plus the bundle's carryover", () => {
    const r = compilationRollup(comp({ carryoverHours: 3.5 }), [
      game({ id: "a", playedHours: 5 }),
      game({ id: "b", playedHours: 2, status: "finished" }),
    ]);
    expect(r.totalPlayedHours).toBeCloseTo(10.5);
    expect(r.finishedCount).toBe(1);
    expect(r.board).toBe("backlog");
  });

  it("prefers the parent card's cover, falling back to a child's", () => {
    const withParent = compilationRollup(comp({ parentImage: "parent.png" }), [
      game({ id: "a", image: "child.png" }),
    ]);
    expect(withParent.image).toBe("parent.png");
    const withoutParent = compilationRollup(comp(), [
      game({ id: "a" }),
      game({ id: "b", image: "child.png" }),
    ]);
    expect(withoutParent.image).toBe("child.png");
  });

  it("slots the moderator template cover between the owner's and the child fallback", () => {
    // Owner's own cover always wins over the moderator art…
    const ownerWins = compilationRollup(
      comp({ parentImage: "parent.png", templateImage: "mod.png" }),
      [game({ id: "a", image: "child.png" })],
    );
    expect(ownerWins.image).toBe("parent.png");
    // …the moderator art fills the gap when the owner set nothing…
    const modFills = compilationRollup(comp({ templateImage: "mod.png" }), [
      game({ id: "a", image: "child.png" }),
    ]);
    expect(modFills.image).toBe("mod.png");
    // …and child covers stay the last resort (and are never overwritten).
    const childLast = compilationRollup(comp(), [game({ id: "a", image: "child.png" })]);
    expect(childLast.image).toBe("child.png");
  });
});

describe("groupCollapsedCompilations", () => {
  const children = [
    game({ id: "a", compilationId: "C", playedHours: 1 }),
    game({ id: "b", compilationId: "C", status: "finished", playedHours: 2 }),
  ];
  const standalone = game({ id: "s" });

  it("passes everything through while the bundle is expanded", () => {
    const r = groupCollapsedCompilations([...children, standalone], [comp({ expanded: true })]);
    expect(r.boardGames).toHaveLength(3);
    expect(r.collapsed).toHaveLength(0);
  });

  it("folds children of a collapsed bundle into one rollup", () => {
    const r = groupCollapsedCompilations([...children, standalone], [comp({ expanded: false })]);
    expect(r.boardGames.map((g) => g.id)).toEqual(["s"]);
    expect(r.collapsed).toHaveLength(1);
    expect(r.collapsed[0].children.map((g) => g.id)).toEqual(["a", "b"]);
    expect(r.collapsed[0].totalPlayedHours).toBe(3);
  });

  it("never hides a Now Playing child — the bundle stays expanded (safety valve)", () => {
    const playing = [
      game({ id: "a", compilationId: "C", status: "playing" }),
      game({ id: "b", compilationId: "C" }),
    ];
    const r = groupCollapsedCompilations(playing, [comp({ expanded: false })]);
    expect(r.boardGames).toHaveLength(2);
    expect(r.collapsed).toHaveLength(0);
  });

  it("ignores other users' contexts with no compilations (visitor view)", () => {
    const r = groupCollapsedCompilations(children, []);
    expect(r.boardGames).toHaveLength(2);
    expect(r.collapsed).toHaveLength(0);
  });

  it("skips a collapsed bundle that has no children on the board", () => {
    const r = groupCollapsedCompilations([standalone], [comp({ expanded: false })]);
    expect(r.boardGames).toHaveLength(1);
    expect(r.collapsed).toHaveLength(0);
  });
});

describe("findExpandTemplate", () => {
  const templates: ParentTemplate[] = [
    { id: "t1", title: "Trilogy", games: [], parentCatalogId: "cat-1", parentRawgId: 111 },
    { id: "t2", title: "Duo", games: [], parentCatalogId: "cat-2", parentRawgId: null },
  ];

  it("matches by catalogId first", () => {
    expect(findExpandTemplate(game({ catalogId: "cat-2", rawgId: 111 }), templates)?.id).toBe("t2");
  });

  it("falls back to rawgId", () => {
    expect(findExpandTemplate(game({ rawgId: 111 }), templates)?.id).toBe("t1");
  });

  it("returns null for wishlist rows (not owned yet)", () => {
    expect(findExpandTemplate(game({ catalogId: "cat-1", status: "wishlist" }), templates)).toBeNull();
  });

  it("returns null for rows already inside a compilation", () => {
    expect(
      findExpandTemplate(game({ catalogId: "cat-1", compilationId: "C" }), templates),
    ).toBeNull();
  });

  it("returns null when nothing links the game", () => {
    expect(findExpandTemplate(game({ rawgId: 999 }), templates)).toBeNull();
  });
});

describe("compilationMatchesFilters / compilationMatchesQuery", () => {
  const collapsed = compilationRollup(comp({ title: "Pikmin 1+2 Bundle" }), [
    game({
      id: "p1",
      title: "Pikmin",
      copies: [{ id: "c1", platform: "Nintendo Switch", format: "physical" }],
    }),
    game({
      id: "p2",
      title: "Pikmin 2",
      copies: [{ id: "c2", platform: "Nintendo Wii", format: "digital" }],
    }),
  ]);

  it("passes the slicers when ANY child passes (same rule as family cards)", () => {
    expect(compilationMatchesFilters(collapsed, { platforms: [], formats: [], liked: false })).toBe(true);
    expect(
      compilationMatchesFilters(collapsed, { platforms: ["Nintendo Wii"], formats: [], liked: false }),
    ).toBe(true);
    expect(
      compilationMatchesFilters(collapsed, { platforms: [], formats: ["digital"], liked: false }),
    ).toBe(true);
    expect(compilationMatchesFilters(collapsed, { platforms: ["PC"], formats: [], liked: false })).toBe(false);
  });

  it("matches the search by the bundle's title or any child's", () => {
    expect(compilationMatchesQuery(collapsed, "")).toBe(true);
    expect(compilationMatchesQuery(collapsed, "bundle")).toBe(true); // own title
    expect(compilationMatchesQuery(collapsed, "pikmin 2")).toBe(true); // child title
    expect(compilationMatchesQuery(collapsed, "zelda")).toBe(false);
  });
});
