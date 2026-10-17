import { describe, it, expect } from "vitest";
import type { Compilation, Game } from "../types";
import type { ParentTemplate } from "./compilationTemplates";
import { EMPTY_FILTERS } from "./bazaarView";
import {
  compilationMatchesFilters,
  compilationMatchesQuery,
  compilationRollup,
  compilationSummary,
  compilationTray,
  findExpandTemplate,
  groupCollapsedCompilations,
  ownershipUnits,
  orderCompilationChildren,
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

describe("orderCompilationChildren (140ac868)", () => {
  it("orders children by the saved childOrder, unlisted ones after in input order", () => {
    const games = [
      game({ id: "a", title: "Alpha" }),
      game({ id: "b", title: "Beta" }),
      game({ id: "c", title: "Gamma" }),
    ];
    // Saved order flips b before a; c is not listed (e.g. added later).
    const out = orderCompilationChildren(games, ["b", "a"]);
    expect(out.map((g) => g.id)).toEqual(["b", "a", "c"]);
  });

  it("preserves input order when there's no saved order", () => {
    const games = [game({ id: "x" }), game({ id: "y" })];
    expect(orderCompilationChildren(games, undefined).map((g) => g.id)).toEqual(["x", "y"]);
    expect(orderCompilationChildren(games, []).map((g) => g.id)).toEqual(["x", "y"]);
  });

  it("ignores stale ids in the saved order and does not mutate its input", () => {
    const games = [game({ id: "a" }), game({ id: "b" })];
    const frozen = [...games];
    // "z" was removed from the bundle but lingers in childOrder — harmless.
    const out = orderCompilationChildren(games, ["z", "b", "a"]);
    expect(out.map((g) => g.id)).toEqual(["b", "a"]);
    expect(games).toEqual(frozen);
  });
});

describe("compilationRollup", () => {
  it("sums child hours plus the bundle's carryover, keeping the board's own children", () => {
    const r = compilationRollup(
      comp({ carryoverHours: 3.5 }),
      [
        game({ id: "a", playedHours: 5 }),
        game({ id: "b", playedHours: 2, status: "finished" }),
        game({ id: "c", playedHours: 1, status: "playing" }),
      ],
      "backlog",
    );
    expect(r.totalPlayedHours).toBeCloseTo(11.5);
    expect(r.finishedCount).toBe(1);
    expect(r.playingCount).toBe(1);
    expect(r.board).toBe("backlog");
    expect(r.boardChildren.map((g) => g.id)).toEqual(["a"]);
  });

  it("orders the rollup children by the bundle's childOrder — cover follows it too (140ac868)", () => {
    const r = compilationRollup(
      comp({ childOrder: ["b", "a"] }),
      [game({ id: "a", image: "a.png" }), game({ id: "b", image: "b.png" })],
      "backlog",
    );
    expect(r.children.map((g) => g.id)).toEqual(["b", "a"]);
    // The child-cover fallback is the FIRST child in the chosen order.
    expect(r.image).toBe("b.png");
  });

  it("prefers the parent card's cover, falling back to a child's", () => {
    const withParent = compilationRollup(
      comp({ parentImage: "parent.png" }),
      [game({ id: "a", image: "child.png" })],
      "backlog",
    );
    expect(withParent.image).toBe("parent.png");
    const withoutParent = compilationRollup(
      comp(),
      [game({ id: "a" }), game({ id: "b", image: "child.png" })],
      "backlog",
    );
    expect(withoutParent.image).toBe("child.png");
  });

  it("slots the moderator template cover between the owner's and the child fallback", () => {
    // Owner's own cover always wins over the moderator art…
    const ownerWins = compilationRollup(
      comp({ parentImage: "parent.png", templateImage: "mod.png" }),
      [game({ id: "a", image: "child.png" })],
      "backlog",
    );
    expect(ownerWins.image).toBe("parent.png");
    // …the moderator art fills the gap when the owner set nothing…
    const modFills = compilationRollup(
      comp({ templateImage: "mod.png" }),
      [game({ id: "a", image: "child.png" })],
      "backlog",
    );
    expect(modFills.image).toBe("mod.png");
    // …and child covers stay the last resort (and are never overwritten).
    const childLast = compilationRollup(comp(), [game({ id: "a", image: "child.png" })], "backlog");
    expect(childLast.image).toBe("child.png");
  });
});

describe("groupCollapsedCompilations (86fc0b4b)", () => {
  const standalone = game({ id: "s" });

  it("puts one bundle card on every board the bundle has a child on", () => {
    const children = [
      game({ id: "a", compilationId: "C", playedHours: 1 }),
      game({ id: "b", compilationId: "C", status: "finished", playedHours: 2 }),
    ];
    const r = groupCollapsedCompilations([...children, standalone], [comp()]);
    expect(r.boardGames.map((g) => g.id)).toEqual(["s"]);
    expect(r.collapsed.map((c) => c.board)).toEqual(["backlog", "finished"]);
    for (const card of r.collapsed) {
      expect(card.children.map((g) => g.id)).toEqual(["a", "b"]);
      expect(card.totalPlayedHours).toBe(3);
    }
    expect(r.collapsed[0].boardChildren.map((g) => g.id)).toEqual(["a"]);
    expect(r.collapsed[1].boardChildren.map((g) => g.id)).toEqual(["b"]);
  });

  it("folds a bundle whatever its retired expanded flag says", () => {
    const children = [game({ id: "a", compilationId: "C" }), game({ id: "b", compilationId: "C" })];
    for (const expanded of [true, false]) {
      const r = groupCollapsedCompilations(children, [comp({ expanded })]);
      expect(r.boardGames).toHaveLength(0);
      expect(r.collapsed).toHaveLength(1);
    }
  });

  it("keeps playing children as their own cards for Now Playing", () => {
    const children = [
      game({ id: "a", compilationId: "C", status: "playing" }),
      game({ id: "b", compilationId: "C" }),
    ];
    const r = groupCollapsedCompilations(children, [comp()]);
    expect(r.boardGames.map((g) => g.id)).toEqual(["a"]);
    expect(r.collapsed.map((c) => c.board)).toEqual(["backlog"]);
    expect(r.collapsed[0].playingCount).toBe(1);
  });

  it("gives an all-playing bundle no grid card", () => {
    const r = groupCollapsedCompilations(
      [game({ id: "a", compilationId: "C", status: "playing" })],
      [comp()],
    );
    expect(r.boardGames.map((g) => g.id)).toEqual(["a"]);
    expect(r.collapsed).toHaveLength(0);
  });

  it("puts a wishlisted child on a Wishlist bundle card", () => {
    const r = groupCollapsedCompilations(
      [game({ id: "a", compilationId: "C", status: "wishlist" })],
      [comp()],
    );
    expect(r.collapsed.map((c) => c.board)).toEqual(["wishlist"]);
  });

  it("passes children through when their compilation isn't loaded (visitor view)", () => {
    const children = [game({ id: "a", compilationId: "C" }), game({ id: "b", compilationId: "C" })];
    const r = groupCollapsedCompilations(children, []);
    expect(r.boardGames).toHaveLength(2);
    expect(r.collapsed).toHaveLength(0);
  });

  it("skips a bundle that has no children", () => {
    const r = groupCollapsedCompilations([standalone], [comp()]);
    expect(r.boardGames).toHaveLength(1);
    expect(r.collapsed).toHaveLength(0);
  });
});

describe("compilationTray / compilationSummary (86fc0b4b)", () => {
  const children = [
    game({ id: "a", title: "A", compilationId: "C" }),
    game({ id: "b", title: "B", compilationId: "C", priority: "high" }),
    game({ id: "c", title: "C", compilationId: "C", priority: "essential" }),
    game({ id: "d", title: "D", compilationId: "C", priority: "high" }),
    game({ id: "e", title: "E", compilationId: "C", status: "finished" }),
    game({ id: "f", title: "F", compilationId: "C", status: "playing" }),
  ];

  it("lists the Bazaar's highest-priority games first, ties in bundle order", () => {
    const tray = compilationTray(compilationRollup(comp(), children, "backlog"));
    expect(tray.shown.map((g) => g.id)).toEqual(["c", "b", "d"]);
    expect(tray.more).toBe(1);
  });

  it("lists only the card's own board on the other boards", () => {
    const tray = compilationTray(compilationRollup(comp(), children, "finished"));
    expect(tray.shown.map((g) => g.id)).toEqual(["e"]);
    expect(tray.more).toBe(0);
  });

  it("phrases the pill for each board", () => {
    expect(compilationSummary(compilationRollup(comp(), children, "backlog"))).toBe(
      "Compilation · 6 games · 4 in Bazaar",
    );
    expect(compilationSummary(compilationRollup(comp(), children, "finished"))).toBe(
      "Compilation · 1 of 6 finished",
    );
    expect(
      compilationSummary(
        compilationRollup(comp(), [game({ id: "w", status: "wishlist" })], "wishlist"),
      ),
    ).toBe("Compilation · 1 game · 1 on Wishlist");
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
  const collapsed = compilationRollup(
    comp({ title: "Pikmin 1+2 Bundle" }),
    [
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
      // Finished, so it sits on the Finished card — the Bazaar card ignores it.
      game({
        id: "p3",
        title: "Pikmin 3",
        status: "finished",
        copies: [{ id: "c3", platform: "PC", format: "digital" }],
      }),
    ],
    "backlog",
  );

  it("passes the slicers when ANY child passes (same rule as family cards)", () => {
    expect(compilationMatchesFilters(collapsed, EMPTY_FILTERS)).toBe(true);
    expect(
      compilationMatchesFilters(collapsed, { ...EMPTY_FILTERS, platforms: ["Nintendo Wii"] }),
    ).toBe(true);
    expect(
      compilationMatchesFilters(collapsed, { ...EMPTY_FILTERS, formats: ["digital"] }),
    ).toBe(true);
  });

  it("asks only the children on the card's board (86fc0b4b)", () => {
    // Pikmin 3 is on PC but finished — the Bazaar card doesn't answer for it.
    expect(compilationMatchesFilters(collapsed, { ...EMPTY_FILTERS, platforms: ["PC"] })).toBe(false);
    expect(compilationMatchesQuery(collapsed, "pikmin 3")).toBe(false);
  });

  it("matches the search by the bundle's title or any child's", () => {
    expect(compilationMatchesQuery(collapsed, "")).toBe(true);
    expect(compilationMatchesQuery(collapsed, "bundle")).toBe(true); // own title
    expect(compilationMatchesQuery(collapsed, "pikmin 2")).toBe(true); // child title
    expect(compilationMatchesQuery(collapsed, "zelda")).toBe(false);
  });
});

describe("ownershipUnits (86fc0b4b)", () => {
  const kh = (id: string, over: Partial<Game> = {}) =>
    game({ id, compilationId: "KH", copies: [{ id: `c-${id}`, platform: "PlayStation 4" }], ...over });

  it("folds a compilation's games into one entry, standalone games untouched, library order kept", () => {
    const solo = game({ id: "s", title: "Solo" });
    const units = ownershipUnits([kh("1"), solo, kh("2"), kh("3")]);
    expect(units.map((u) => u.id)).toEqual(["bundle:KH", "s"]);
    expect(units[1]).toBe(solo);
  });

  it("derives the entry's status: playing, else Bazaar, else finished, else wishlist", () => {
    const status = (...ss: Game["status"][]) =>
      ownershipUnits(ss.map((st, i) => kh(String(i), { status: st })))[0].status;
    expect(status("finished", "playing", "backlog")).toBe("playing");
    expect(status("finished", "backlog")).toBe("backlog");
    expect(status("finished", "wishlist")).toBe("finished");
    expect(status("wishlist")).toBe("wishlist");
  });

  it("derives a finished entry's tag from its clears", () => {
    const tag = (...tags: Game["finishTag"][]) =>
      ownershipUnits(tags.map((t, i) => kh(String(i), { status: "finished", finishTag: t })))[0]
        .finishTag;
    expect(tag("completed", "completed")).toBe("completed");
    expect(tag("completed", "beaten")).toBe("beaten");
    expect(tag("endless", "endless", "retired")).toBe("endless");
    expect(tag("retired", "retired")).toBe("retired");
  });

  it("carries every game's copies so the entry lands on each platform", () => {
    const [unit] = ownershipUnits([kh("1"), kh("2", { copies: [{ id: "x", platform: "PC" }] })]);
    expect(unit.copies?.map((c) => c.platform)).toEqual(["PlayStation 4", "PC"]);
  });

  it("returns the input untouched when nothing is bundled", () => {
    const games = [game({ id: "a" }), game({ id: "b" })];
    expect(ownershipUnits(games)).toBe(games);
  });
});
