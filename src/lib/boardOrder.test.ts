import { describe, it, expect } from "vitest";
import type { Compilation, Game } from "../types";
import { compilationRollup, type CollapsedCompilation } from "./compilationGrouping";
import type { UnifiedFamily } from "./familyGrouping";
import { orderBoardCards, cardTitle, type BoardCard } from "./boardOrder";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g",
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

function bundle(title: string, children: Game[]): CollapsedCompilation {
  const comp: Compilation = {
    id: `comp-${title}`,
    title,
    totalCost: 0,
    createdAt: 1,
    expanded: false,
    carryoverHours: 0,
  };
  return compilationRollup(comp, children);
}

function expandedComp(id: string, childOrder?: string[]): Compilation {
  return {
    id,
    title: id,
    totalCost: 0,
    createdAt: 1,
    expanded: true,
    carryoverHours: 0,
    childOrder,
  };
}

function family(name: string, members: Game[]): UnifiedFamily {
  return {
    familyId: `fam-${name}`,
    members,
    primary: members[0],
    board: members[0].status,
    name,
  };
}

const titles = (cards: BoardCard[]) => cards.map(cardTitle);

describe("orderBoardCards", () => {
  it("interleaves a bundle alphabetically by its displayed title (the reported bug)", () => {
    const cards = orderBoardCards(
      [game({ id: "a", title: "Animal Crossing" }), game({ id: "z", title: "Zelda" })],
      [bundle("Pikmin 1+2 Bundle", [game({ id: "p1", title: "Pikmin" })])],
      [],
      "alpha",
    );
    // Not pinned first — sorted under P, between A and Z.
    expect(titles(cards)).toEqual(["Animal Crossing", "Pikmin 1+2 Bundle", "Zelda"]);
  });

  it("sorts a bundle by its newest child under Date added (newest)", () => {
    const cards = orderBoardCards(
      [game({ id: "mid", title: "Mid", addedAt: 50 })],
      [
        bundle("Old Bundle", [game({ id: "o", addedAt: 10 }), game({ id: "o2", addedAt: 20 })]),
        bundle("New Bundle", [game({ id: "n", addedAt: 90 }), game({ id: "n2", addedAt: 30 })]),
      ],
      [],
      "added-desc",
    );
    // New Bundle's best (newest) child is 90 > 50 > Old Bundle's best 20.
    expect(titles(cards)).toEqual(["New Bundle", "Mid", "Old Bundle"]);
  });

  it("flips to the oldest member under Date added (oldest)", () => {
    const cards = orderBoardCards(
      [game({ id: "mid", title: "Mid", addedAt: 15 })],
      [bundle("Bundle", [game({ id: "b1", addedAt: 10 }), game({ id: "b2", addedAt: 90 })])],
      [],
      "added-asc",
    );
    // The bundle's best-placed child ascending is 10 < 15.
    expect(titles(cards)).toEqual(["Bundle", "Mid"]);
  });

  it("sorts a bundle by its shortest child under Shortest playtime", () => {
    const cards = orderBoardCards(
      [game({ id: "solo", title: "Solo", hours: 12 })],
      [bundle("Bundle", [game({ id: "long", hours: 80 }), game({ id: "short", hours: 4 })])],
      [],
      "playtime-asc",
    );
    expect(titles(cards)).toEqual(["Bundle", "Solo"]);
  });

  it("applies the same best-member rule to family cards", () => {
    const cards = orderBoardCards(
      [game({ id: "solo", title: "Solo", addedAt: 50 })],
      [],
      [
        family("Saga", [
          game({ id: "f1", addedAt: 5 }),
          game({ id: "f2", addedAt: 99 }),
        ]),
      ],
      "added-desc",
    );
    expect(titles(cards)).toEqual(["Saga", "Solo"]);
  });

  it("breaks ties by displayed title for a stable order", () => {
    const cards = orderBoardCards(
      [game({ id: "b", title: "Beta", addedAt: 7 })],
      [bundle("Alpha Bundle", [game({ id: "a1", addedAt: 7 })])],
      [],
      "added-desc",
    );
    expect(titles(cards)).toEqual(["Alpha Bundle", "Beta"]);
  });

  it("does not mutate its inputs", () => {
    const games = [game({ id: "z", title: "Z" }), game({ id: "a", title: "A" })];
    orderBoardCards(games, [], [], "alpha");
    expect(games.map((g) => g.title)).toEqual(["Z", "A"]);
  });

  describe("split-bundle order (140ac868)", () => {
    const bioshock = () => [
      game({ id: "rem", title: "BioShock Remastered", compilationId: "C" }),
      game({ id: "two", title: "BioShock 2 Remastered", compilationId: "C" }),
      game({ id: "inf", title: "BioShock Infinite", compilationId: "C" }),
    ];

    it("keeps a split bundle's cards together in the owner's order under A–Z", () => {
      const games = [game({ id: "alpha", title: "Alpha" }), ...bioshock(), game({ id: "z", title: "Zelda" })];
      const cards = orderBoardCards(games, [], [], "alpha", undefined, undefined, [
        expandedComp("C", ["rem", "two", "inf"]),
      ]);
      // The block slots among the B's (by its first-alphabetically member) but
      // DISPLAYS in the dragged order, contiguously — not scattered A–Z.
      expect(titles(cards)).toEqual([
        "Alpha",
        "BioShock Remastered",
        "BioShock 2 Remastered",
        "BioShock Infinite",
        "Zelda",
      ]);
    });

    it("leaves the cards to sort individually when no order has been set", () => {
      // No compilations passed → no saved order → today's scattered behavior.
      const cards = orderBoardCards(bioshock(), [], [], "alpha");
      expect(titles(cards)).toEqual([
        "BioShock 2 Remastered",
        "BioShock Infinite",
        "BioShock Remastered",
      ]);
    });

    it("positions the block by its best-placed member yet displays it in order", () => {
      const games = [
        game({ id: "mid", title: "Mid", addedAt: 50 }),
        game({ id: "rem", title: "BioShock Remastered", compilationId: "C", addedAt: 10 }),
        game({ id: "two", title: "BioShock 2 Remastered", compilationId: "C", addedAt: 90 }),
        game({ id: "inf", title: "BioShock Infinite", compilationId: "C", addedAt: 20 }),
      ];
      const cards = orderBoardCards(games, [], [], "added-desc", undefined, undefined, [
        expandedComp("C", ["rem", "two", "inf"]),
      ]);
      // Newest child (90) beats Mid (50) → the block leads, in the owner's order.
      expect(titles(cards)).toEqual([
        "BioShock Remastered",
        "BioShock 2 Remastered",
        "BioShock Infinite",
        "Mid",
      ]);
    });

    it("appends children not in the saved order after the listed ones", () => {
      const games = [...bioshock(), game({ id: "new", title: "BioShock 4", compilationId: "C" })];
      const cards = orderBoardCards(games, [], [], "alpha", undefined, undefined, [
        expandedComp("C", ["rem", "two", "inf"]),
      ]);
      // rem, two, inf as ordered; the unlisted newcomer trails in incoming order.
      expect(titles(cards)).toEqual([
        "BioShock Remastered",
        "BioShock 2 Remastered",
        "BioShock Infinite",
        "BioShock 4",
      ]);
    });
  });
});
