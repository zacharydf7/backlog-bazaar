import { describe, it, expect } from "vitest";
import { chartSeries, economyTotals, sourcesAndSinks, toEconomyHealth } from "./economyHealth";

const health = toEconomyHealth({
  circulation: 20000,
  by_kind: [
    { kind: "opening", coins_in: 5000, coins_out: 0, events: 4, players: 4 },
    { kind: "bounty", coins_in: 2300, coins_out: 0, events: 8, players: 3 },
    { kind: "purchase", coins_in: 0, coins_out: 4361, events: 20, players: 4 },
    { kind: "shop_purchase", coins_in: 0, coins_out: 5450, events: 7, players: 1 },
    { kind: "length_refund", coins_in: "40", coins_out: 0, events: 1, players: 1 },
  ],
  daily: [{ day: "2026-10-15", coins_in: 2880, coins_out: 1303 }],
  players: [{ user_id: "u1", display_name: "Pat", balance: 900, earned: 2300, spent: 4361, top_source: "bounty", clears: 3 }],
});

describe("economy health", () => {
  it("maps the payload, tolerating numeric strings", () => {
    expect(health.circulation).toBe(20000);
    expect(health.byKind.find((k) => k.kind === "length_refund")?.coinsIn).toBe(40);
    expect(health.players[0]).toMatchObject({ displayName: "Pat", topSource: "bounty", clears: 3 });
    expect(toEconomyHealth(null)).toEqual({ circulation: 0, byKind: [], daily: [], players: [] });
  });

  it("totals coins in and out without opening balances", () => {
    expect(economyTotals(health)).toEqual({ coinsIn: 2340, coinsOut: 9811, net: -7471 });
  });

  it("ranks sources and sinks, biggest first", () => {
    const { sources, sinks } = sourcesAndSinks(health);
    expect(sources.map((k) => k.kind)).toEqual(["bounty", "length_refund"]);
    expect(sinks.map((k) => k.kind)).toEqual(["shop_purchase", "purchase"]);
  });

  it("folds a long series into weeks", () => {
    const daily = Array.from({ length: 60 }, (_, i) => ({
      day: new Date(Date.UTC(2026, 7, 3 + i)).toISOString().slice(0, 10), // from Mon 2026-08-03
      coinsIn: 10,
      coinsOut: 1,
    }));
    const weeks = chartSeries(daily);
    expect(weeks.length).toBeLessThan(daily.length);
    expect(weeks[0]).toEqual({ day: "2026-08-03", coinsIn: 70, coinsOut: 7 });
    expect(weeks.reduce((s, w) => s + w.coinsIn, 0)).toBe(600);
    expect(chartSeries(daily.slice(0, 10))).toHaveLength(10);
  });
});
