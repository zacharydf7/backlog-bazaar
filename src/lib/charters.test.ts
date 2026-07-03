import { describe, it, expect } from "vitest";
import {
  charterResale,
  canBuyCharter,
  canSellCharter,
  canImport,
  cheapestBazaarPrice,
  activeIncomeGameCount,
  wouldSoftLock,
} from "./charters";
import { DEFAULT_PRICE_FORMULA } from "./economy";
import type { Game, GameStatus } from "../types";

const game = (status: GameStatus, over: Partial<Game> = {}): Game => ({
  id: Math.random().toString(36).slice(2),
  title: "G",
  genres: [],
  status,
  // Aged past the fresh-pickup decay window, so prices below are base + length.
  addedAt: Date.now() - 9 * 365.25 * 24 * 60 * 60 * 1000,
  ...over,
});

describe("charterResale", () => {
  it("returns the depreciated value (cost 100 @ 75% = 75)", () => {
    expect(charterResale(100, 75)).toBe(75);
  });

  it("floors fractional results", () => {
    expect(charterResale(100, 33)).toBe(33); // 33.0
    expect(charterResale(50, 75)).toBe(37); // 37.5 -> 37
  });

  it("clamps the percentage to 0–100 and never goes negative", () => {
    expect(charterResale(100, 150)).toBe(100);
    expect(charterResale(100, -10)).toBe(0);
    expect(charterResale(-5, 75)).toBe(0);
  });
});

describe("canBuyCharter", () => {
  it("requires enough coins (inclusive)", () => {
    expect(canBuyCharter(100, 100)).toBe(true);
    expect(canBuyCharter(99, 100)).toBe(false);
    expect(canBuyCharter(0, 0)).toBe(true);
  });
});

describe("canSellCharter / canImport", () => {
  it("needs at least one charter", () => {
    expect(canSellCharter(1)).toBe(true);
    expect(canSellCharter(0)).toBe(false);
    expect(canImport(2)).toBe(true);
    expect(canImport(0)).toBe(false);
  });
});

// DEFAULT_PRICE_FORMULA: base 40 + 3/hour (freshness 0 for these long-held
// fixtures), so price(hours=h) = 40 + 3h. hours=0 -> 40, hours=10 -> 70,
// hours=20 -> 100.
describe("cheapestBazaarPrice", () => {
  it("returns the cheapest backlog game's price, ignoring other statuses", () => {
    const games = [
      game("backlog", { hours: 20 }), // 100
      game("backlog", { hours: 0 }), // 40 (cheapest)
      game("playing", { hours: 0 }), // not in the Bazaar — ignored
      game("wishlist", { hours: 0 }), // ignored
    ];
    expect(cheapestBazaarPrice(games, DEFAULT_PRICE_FORMULA)).toBe(40);
  });

  it("is null when the Bazaar is empty", () => {
    expect(cheapestBazaarPrice([], DEFAULT_PRICE_FORMULA)).toBeNull();
    expect(
      cheapestBazaarPrice([game("playing"), game("finished")], DEFAULT_PRICE_FORMULA),
    ).toBeNull();
  });
});

describe("activeIncomeGameCount", () => {
  it("counts playing games that are not live-service/ongoing", () => {
    const games = [
      game("playing"), // counts
      game("playing", { completionist: true }), // still a one-shot finish — counts
      game("playing", { ongoing: true }), // live-service — excluded
      game("playing", { ongoing: true, inRotation: true }), // rotation — excluded
      game("backlog"), // not playing — excluded
      game("finished"), // excluded
    ];
    expect(activeIncomeGameCount(games)).toBe(2);
  });
});

describe("wouldSoftLock", () => {
  it("never locks when an income game is already in play", () => {
    expect(wouldSoftLock(0, 100, 40, 1)).toBe(false);
  });

  it("never locks when the Bazaar is empty (no floor)", () => {
    expect(wouldSoftLock(0, 100, null, 0)).toBe(false);
  });

  it("locks only when the spend drops you below the cheapest game with no income", () => {
    // floor 40, cost 100. balance 150 -> 50 left (>=40) ok; 139 -> 39 left (<40) lock.
    expect(wouldSoftLock(150, 100, 40, 0)).toBe(false);
    expect(wouldSoftLock(140, 100, 40, 0)).toBe(false); // exactly 40 left — still affordable
    expect(wouldSoftLock(139, 100, 40, 0)).toBe(true);
  });
});
