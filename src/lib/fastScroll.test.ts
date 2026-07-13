import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import type { StackedBoardCard } from "./gameStacks";
import {
  railMode,
  stackedCardTitle,
  cardGames,
  letterOf,
  letterEntries,
  trackFraction,
  entryForFraction,
  indexForFraction,
  scrubLabel,
} from "./fastScroll";

function game(over: Partial<Game> = {}): Game {
  return {
    id: Math.random().toString(36),
    title: "Hollow Knight",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

const gameCard = (over: Partial<Game> = {}): StackedBoardCard => ({
  kind: "game",
  game: game(over),
});

describe("railMode", () => {
  it("is the letter index only for the A–Z sort", () => {
    expect(railMode("alpha")).toBe("alpha");
    expect(railMode("added-desc")).toBe("scrub");
    expect(railMode("cost-asc")).toBe("scrub");
    expect(railMode("playtime-asc")).toBe("scrub");
  });
});

describe("stackedCardTitle / cardGames", () => {
  it("reads through every card kind", () => {
    const a = game({ title: "Alpha" });
    const b = game({ title: "Beta" });
    const stack: StackedBoardCard = { kind: "stack", stackKey: "k", games: [a, b] };
    const fanned: StackedBoardCard = {
      kind: "fanned",
      stackKey: "k",
      game: a,
      first: true,
      count: 2,
    };
    expect(stackedCardTitle(stack)).toBe("Alpha");
    expect(stackedCardTitle(fanned)).toBe("Alpha");
    expect(stackedCardTitle(gameCard({ title: "Solo" }))).toBe("Solo");
    expect(cardGames(stack)).toEqual([a, b]);
    expect(cardGames(fanned)).toEqual([a]);
  });
});

describe("letterOf", () => {
  it("uppercases the first letter and buckets everything else under #", () => {
    expect(letterOf("hades")).toBe("H");
    expect(letterOf("  Zelda")).toBe("Z");
    expect(letterOf("1942")).toBe("#");
    expect(letterOf("¡Vamos!")).toBe("#");
    expect(letterOf("")).toBe("#");
  });
});

describe("letterEntries", () => {
  it("keeps the first index per letter, in board order", () => {
    const cards = [
      gameCard({ title: "Axiom Verge" }),
      gameCard({ title: "Astro Bot" }),
      gameCard({ title: "Bastion" }),
      gameCard({ title: "Celeste" }),
      gameCard({ title: "Chrono Trigger" }),
    ];
    expect(letterEntries(cards)).toEqual([
      { letter: "A", index: 0 },
      { letter: "B", index: 2 },
      { letter: "C", index: 3 },
    ]);
  });

  it("buckets leading digits under #", () => {
    const cards = [gameCard({ title: "1942" }), gameCard({ title: "Ape Out" })];
    expect(letterEntries(cards)).toEqual([
      { letter: "#", index: 0 },
      { letter: "A", index: 1 },
    ]);
  });
});

describe("trackFraction", () => {
  it("maps a pointer inside the track to 0..1 and clamps outside it", () => {
    const rect = { top: 100, height: 200 };
    expect(trackFraction(100, rect)).toBe(0);
    expect(trackFraction(200, rect)).toBe(0.5);
    expect(trackFraction(300, rect)).toBe(1);
    expect(trackFraction(0, rect)).toBe(0);
    expect(trackFraction(999, rect)).toBe(1);
  });

  it("survives a zero-height rect (jsdom) without dividing by zero", () => {
    expect(trackFraction(50, { top: 0, height: 0 })).toBe(0);
  });
});

describe("entryForFraction", () => {
  const entries = [
    { letter: "A", index: 0 },
    { letter: "B", index: 4 },
    { letter: "C", index: 9 },
  ];

  it("splits the track evenly across the rungs", () => {
    expect(entryForFraction(entries, 0)?.letter).toBe("A");
    expect(entryForFraction(entries, 0.34)?.letter).toBe("B");
    expect(entryForFraction(entries, 0.99)?.letter).toBe("C");
    expect(entryForFraction(entries, 1)?.letter).toBe("C"); // bottom edge stays in range
  });

  it("is null with no rungs", () => {
    expect(entryForFraction([], 0.5)).toBeNull();
  });
});

describe("indexForFraction", () => {
  it("maps the track ends to the first and last card", () => {
    expect(indexForFraction(0, 100)).toBe(0);
    expect(indexForFraction(1, 100)).toBe(99);
    expect(indexForFraction(0.5, 101)).toBe(50);
  });

  it("clamps degenerate inputs", () => {
    expect(indexForFraction(0.5, 0)).toBe(0);
    expect(indexForFraction(2, 10)).toBe(9);
    expect(indexForFraction(-1, 10)).toBe(0);
  });
});

describe("scrubLabel", () => {
  it("captions the date sorts as month + year of the card's addedAt", () => {
    const when = new Date(2026, 6, 4).getTime(); // July 2026, local time
    expect(scrubLabel(gameCard({ addedAt: when }), "added-desc")).toBe("Jul 2026");
    expect(scrubLabel(gameCard({ addedAt: when }), "added-asc")).toBe("Jul 2026");
  });

  it("captions playtime with the usual hours formatting", () => {
    expect(scrubLabel(gameCard({ hours: 50 }), "playtime-asc")).toBe("~50h");
  });

  it("captions the coin-value sorts in coins", () => {
    const label = scrubLabel(gameCard({ hours: 20 }), "cost-asc");
    expect(label).toMatch(/^\d+ coins$/);
  });

  it("falls back to the letter under the A–Z sort", () => {
    expect(scrubLabel(gameCard({ title: "Hades" }), "alpha")).toBe("H");
  });

  it("uses the best-placed member of a multi-game card — matching where boardOrder put it", () => {
    const older = new Date(2020, 0, 15).getTime();
    const newer = new Date(2026, 6, 4).getTime();
    const stack: StackedBoardCard = {
      kind: "stack",
      stackKey: "k",
      games: [game({ addedAt: older }), game({ addedAt: newer })],
    };
    // added-desc places by the NEWEST member; added-asc by the oldest.
    expect(scrubLabel(stack, "added-desc")).toBe("Jul 2026");
    expect(scrubLabel(stack, "added-asc")).toBe("Jan 2020");
  });

  it("shows a dash when there's nothing to measure", () => {
    expect(scrubLabel(gameCard({ addedAt: 0 }), "added-desc")).toBe("—");
  });
});
