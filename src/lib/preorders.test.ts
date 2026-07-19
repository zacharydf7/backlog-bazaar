import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import type { StackedBoardCard } from "./gameStacks";
import {
  isPreordered,
  daysUntil,
  isPreorderOut,
  preorderCountdownLabel,
  upcomingPreorders,
  comingUpPreorders,
  canOfferPreorder,
  importNeedsPreorderPrompt,
  pinPreorderedCards,
} from "./preorders";

let seq = 0;
function game(over: Partial<Game> = {}): Game {
  seq += 1;
  return {
    id: `g${seq}`,
    title: `Game ${seq}`,
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: seq,
    ...over,
  } as Game;
}

const card = (g: Game): StackedBoardCard => ({ kind: "game", game: g });

describe("isPreordered", () => {
  it("needs both the Bazaar status and the marker (a pre-order is an owned, locked card)", () => {
    expect(isPreordered(game({ preorderedAt: 1 }))).toBe(true);
    expect(isPreordered(game())).toBe(false);
    // A stale marker on a non-Bazaar row (offline mode) never reads as live.
    expect(isPreordered(game({ status: "wishlist", preorderedAt: 1 }))).toBe(false);
    expect(isPreordered(game({ status: "playing", preorderedAt: 1 }))).toBe(false);
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
    const plain = game({ title: "Plain bazaar" });
    const stale = game({ title: "Stale", status: "wishlist", preorderedAt: 1 });
    const out = upcomingPreorders([far, dateless, plain, soon, stale]);
    expect(out.map((g) => g.title)).toEqual(["Soon", "Far", "Dateless"]);
  });
});

describe("comingUpPreorders", () => {
  const today = "2026-07-19";
  it("keeps only dated pre-orders within the horizon — dateless and far-off stay off the strip", () => {
    const near = game({ title: "Near", preorderedAt: 1, preorderExpectedOn: "2026-08-01" });
    const out = game({ title: "Out", preorderedAt: 1, preorderExpectedOn: "2026-07-10" });
    const far = game({ title: "Far", preorderedAt: 1, preorderExpectedOn: "2027-03-10" });
    const dateless = game({ title: "Dateless", preorderedAt: 1 });
    const picked = comingUpPreorders([far, dateless, near, out], 30, today);
    // Arrival order kept; the already-out one is the most urgent chip of all.
    expect(picked.map((g) => g.title)).toEqual(["Out", "Near"]);
  });

  it("a game exactly on the horizon still shows; one day past it does not", () => {
    const onEdge = game({ preorderedAt: 1, preorderExpectedOn: "2026-08-18" }); // 30 days
    const justPast = game({ preorderedAt: 1, preorderExpectedOn: "2026-08-19" }); // 31 days
    expect(comingUpPreorders([onEdge, justPast], 30, today)).toEqual([onEdge]);
  });

  it("a 0 horizon disables the strip entirely", () => {
    const due = game({ preorderedAt: 1, preorderExpectedOn: "2026-07-19" });
    expect(comingUpPreorders([due], 0, today)).toEqual([]);
  });
});

describe("canOfferPreorder (Add flow)", () => {
  const today = "2026-07-19";
  it("offers for unknown dates and dates today-or-later; hides once the release has passed", () => {
    expect(canOfferPreorder(undefined, today)).toBe(true);
    expect(canOfferPreorder(null, today)).toBe(true);
    expect(canOfferPreorder("2026-07-19", today)).toBe(true);
    expect(canOfferPreorder("2026-09-01", today)).toBe(true);
    expect(canOfferPreorder("2026-07-01", today)).toBe(false);
  });
});

describe("importNeedsPreorderPrompt", () => {
  const today = "2026-07-19";
  it("prompts only for wishlist entries whose catalog release is still ahead", () => {
    expect(
      importNeedsPreorderPrompt(game({ status: "wishlist", released: "2026-09-01" }), today),
    ).toBe(true);
    // Out today = it exists — a plain import, no ask.
    expect(
      importNeedsPreorderPrompt(game({ status: "wishlist", released: "2026-07-19" }), today),
    ).toBe(false);
    expect(
      importNeedsPreorderPrompt(game({ status: "wishlist", released: "2020-01-01" }), today),
    ).toBe(false);
    // No date on record → we can't claim it isn't out; import as usual.
    expect(importNeedsPreorderPrompt(game({ status: "wishlist" }), today)).toBe(false);
    expect(
      importNeedsPreorderPrompt(game({ status: "backlog", released: "2026-09-01" }), today),
    ).toBe(false);
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
