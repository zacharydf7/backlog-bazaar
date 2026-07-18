import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import type { StackedBoardCard } from "./gameStacks";
import {
  isPreordered,
  daysUntil,
  isPreorderOut,
  preorderCountdownLabel,
  upcomingPreorders,
  pinPreorderedCards,
} from "./preorders";

let seq = 0;
function game(over: Partial<Game> = {}): Game {
  seq += 1;
  return {
    id: `g${seq}`,
    title: `Game ${seq}`,
    status: "wishlist",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: seq,
    ...over,
  } as Game;
}

const card = (g: Game): StackedBoardCard => ({ kind: "game", game: g });

describe("isPreordered", () => {
  it("needs both the wishlist status and the marker", () => {
    expect(isPreordered(game({ preorderedAt: 1 }))).toBe(true);
    expect(isPreordered(game())).toBe(false);
    // A stale marker on an owned game (offline mode) never reads as live.
    expect(isPreordered(game({ status: "backlog", preorderedAt: 1 }))).toBe(false);
  });
});

describe("daysUntil", () => {
  it("counts whole calendar days, 0 on the day itself, negative after", () => {
    expect(daysUntil("2026-07-30", "2026-07-18")).toBe(12);
    expect(daysUntil("2026-07-19", "2026-07-18")).toBe(1);
    expect(daysUntil("2026-07-18", "2026-07-18")).toBe(0);
    expect(daysUntil("2026-07-10", "2026-07-18")).toBe(-8);
  });

  it("crosses month and year boundaries cleanly", () => {
    expect(daysUntil("2026-08-01", "2026-07-31")).toBe(1);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("preorderCountdownLabel", () => {
  const today = "2026-07-18";
  it("reads naturally at every distance", () => {
    expect(preorderCountdownLabel("2026-07-30", today)).toBe("Arrives in 12 days");
    expect(preorderCountdownLabel("2026-07-19", today)).toBe("Arrives tomorrow");
    expect(preorderCountdownLabel("2026-07-18", today)).toBe("Out today!");
    expect(preorderCountdownLabel("2026-07-01", today)).toBe("Out now!");
    expect(preorderCountdownLabel(null, today)).toBe("Pre-ordered");
  });
});

describe("isPreorderOut", () => {
  const today = "2026-07-18";
  it("is out on and after the expected date — never for dateless pre-orders", () => {
    expect(isPreorderOut(game({ preorderedAt: 1, preorderExpectedOn: "2026-07-18" }), today)).toBe(true);
    expect(isPreorderOut(game({ preorderedAt: 1, preorderExpectedOn: "2026-07-01" }), today)).toBe(true);
    expect(isPreorderOut(game({ preorderedAt: 1, preorderExpectedOn: "2026-08-01" }), today)).toBe(false);
    expect(isPreorderOut(game({ preorderedAt: 1 }), today)).toBe(false);
    expect(isPreorderOut(game({ preorderExpectedOn: "2026-07-01" }), today)).toBe(false);
  });
});

describe("upcomingPreorders", () => {
  it("orders by arrival, dateless last, ties alphabetical", () => {
    const far = game({ title: "Far", preorderedAt: 1, preorderExpectedOn: "2026-12-01" });
    const soon = game({ title: "Soon", preorderedAt: 1, preorderExpectedOn: "2026-08-01" });
    const dateless = game({ title: "Dateless", preorderedAt: 1 });
    const plain = game({ title: "Plain wishlist" });
    const owned = game({ title: "Owned", status: "backlog", preorderedAt: 1 });
    const out = upcomingPreorders([far, dateless, plain, soon, owned]);
    expect(out.map((g) => g.title)).toEqual(["Soon", "Far", "Dateless"]);
  });
});

describe("pinPreorderedCards", () => {
  it("pins pre-ordered cards first by arrival and keeps the rest in board order", () => {
    const a = card(game({ title: "A plain" }));
    const b = card(game({ title: "B soon", preorderedAt: 1, preorderExpectedOn: "2026-08-01" }));
    const c = card(game({ title: "C plain" }));
    const d = card(game({ title: "D far", preorderedAt: 1, preorderExpectedOn: "2026-12-01" }));
    const e = card(game({ title: "E dateless", preorderedAt: 1 }));
    const out = pinPreorderedCards([a, b, c, d, e]);
    expect(out.map((x) => (x.kind === "game" ? x.game.title : ""))).toEqual([
      "B soon",
      "D far",
      "E dateless",
      "A plain",
      "C plain",
    ]);
  });

  it("pins a multi-game card when ANY member is a live pre-order", () => {
    const member = game({ title: "Bundle kid", preorderedAt: 1, preorderExpectedOn: "2026-09-01" });
    const stack: StackedBoardCard = {
      kind: "stack",
      stackKey: "k",
      games: [game({ title: "Sibling" }), member],
    };
    const plain = card(game({ title: "Plain" }));
    const out = pinPreorderedCards([plain, stack]);
    expect(out[0]).toBe(stack);
  });

  it("no pre-orders → the order is untouched", () => {
    const cards = [card(game()), card(game())];
    expect(pinPreorderedCards(cards)).toEqual(cards);
  });
});
