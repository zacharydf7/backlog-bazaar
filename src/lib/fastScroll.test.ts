import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import type { StackedBoardCard } from "./gameStacks";
import {
  stackedCardTitle,
  cardGames,
  letterOf,
  trackFraction,
  thumbFraction,
  trackScroll,
  isHuntingScroll,
  SCROLL_GAP_MS,
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

describe("thumbFraction", () => {
  it("maps the finger to the thumb centre's travel, inset by half the thumb at each end", () => {
    const rect = { top: 0, height: 456 }; // 400px of travel for a 56px thumb
    expect(thumbFraction(28, rect, 56)).toBe(0);
    expect(thumbFraction(228, rect, 56)).toBe(0.5);
    expect(thumbFraction(428, rect, 56)).toBe(1);
    expect(thumbFraction(0, rect, 56)).toBe(0);
  });
});

describe("trackScroll / isHuntingScroll", () => {
  const vh = 800;

  it("ignores an ordinary flick but reveals after two screens of continuous scrolling", () => {
    let run = trackScroll(null, 0, 0);
    run = trackScroll(run, 600, 200);
    expect(isHuntingScroll(run, vh)).toBe(false);
    run = trackScroll(run, 1700, 500);
    expect(run.travelled).toBe(1700);
    expect(isHuntingScroll(run, vh)).toBe(true);
  });

  it("counts scrolling in either direction", () => {
    let run = trackScroll(null, 2000, 0);
    run = trackScroll(run, 1000, 100);
    run = trackScroll(run, 1500, 200);
    expect(run.travelled).toBe(1500);
  });

  it("starts a fresh run after a pause", () => {
    let run = trackScroll(null, 0, 0);
    run = trackScroll(run, 1500, 300);
    run = trackScroll(run, 1600, 300 + SCROLL_GAP_MS + 1);
    expect(run.travelled).toBe(0);
    expect(isHuntingScroll(run, vh)).toBe(false);
  });

  it("never reveals without a viewport height", () => {
    expect(isHuntingScroll({ lastY: 0, lastT: 0, travelled: 99999 }, 0)).toBe(false);
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
