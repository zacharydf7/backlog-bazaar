import { describe, it, expect } from "vitest";
import { bazaarExpansions, expansionMatchesFilters, expansionMatchesQuery, expansionSortValue } from "./bazaarExpansions";
import { EMPTY_FILTERS } from "./bazaarView";
import type { GameDlc } from "./dlc";
import type { Game } from "../types";

const game = (over: Partial<Game> = {}) =>
  ({ id: "g1", title: "Ghost of Yotei", status: "finished", genres: [], copies: [], addedAt: 1, ...over }) as Game;

const dlc = (over: Partial<GameDlc> = {}): GameDlc => ({
  id: "d1",
  gameId: "g1",
  kind: "expansion",
  name: "Legends",
  acquiredOn: "2026-10-01",
  cost: 20,
  hours: 8,
  note: null,
  runStatus: "owned",
  runStartedAt: null,
  runHoursStart: null,
  runPrice: null,
  runPaying: false,
  runQuote: null,
  runClearedAt: null,
  runReward: null,
  createdAt: 0,
  ...over,
});

const QUOTE = { price: 184, bounty: 250, gateHours: 4, paying: true };
const quoteOf = () => QUOTE;

describe("bazaarExpansions", () => {
  it("lists each owned story expansion on a game in the library, ready on a finished game", () => {
    const list = bazaarExpansions(
      [game()],
      [
        dlc(),
        dlc({ id: "d2", name: "Started", runStatus: "playing" }),
        dlc({ id: "d3", name: "Cleared", runStatus: "cleared" }),
        dlc({ id: "d4", name: "Season Pass", kind: "item" }),
        dlc({ id: "d5", name: "Orphan", gameId: null }),
        dlc({ id: "d6", name: "Elsewhere", gameId: "gone" }),
      ],
      quoteOf,
    );
    expect(list.map((x) => [x.dlc.name, x.lockedReason])).toEqual([["Legends", null]]);
    expect(list[0].quote).toBe(QUOTE);
  });

  it("locks one whose game isn't finished, until it is", () => {
    for (const g of [game({ status: "backlog" }), game({ status: "playing", resumed: true })]) {
      expect(bazaarExpansions([g], [dlc()], quoteOf)[0].lockedReason).toBe(
        "Finish Ghost of Yotei first. It unlocks by itself.",
      );
    }
  });

  it("locks one whose game was retired, saying the game has to come back first", () => {
    expect(bazaarExpansions([game({ finishTag: "retired" })], [dlc()], quoteOf)[0].lockedReason).toBe(
      "Return Ghost of Yotei to your Bazaar and finish it first.",
    );
  });

  it("locks the rest while another of the game's expansions is running", () => {
    const list = bazaarExpansions(
      [game({ status: "playing", resumed: true, expansionRun: true })],
      [dlc(), dlc({ id: "d2", name: "Echoes", runStatus: "playing" })],
      quoteOf,
    );
    expect(list.map((x) => x.lockedReason)).toEqual(["Clear Echoes first."]);
  });
});

describe("expansionMatchesQuery", () => {
  const [x] = bazaarExpansions([game()], [dlc()], quoteOf);
  it("finds an expansion by its own name or its game's", () => {
    expect(expansionMatchesQuery(x, "legends")).toBe(true);
    expect(expansionMatchesQuery(x, "yotei legends")).toBe(true);
    expect(expansionMatchesQuery(x, "sekiro")).toBe(false);
  });
});

describe("expansionMatchesFilters", () => {
  const [x] = bazaarExpansions([game({ priority: "high", likedAt: 5 })], [dlc()], quoteOf);
  it("goes where its game would on the slicers", () => {
    expect(expansionMatchesFilters(x, { ...EMPTY_FILTERS, liked: true })).toBe(true);
    const [unliked] = bazaarExpansions([game()], [dlc()], quoteOf);
    expect(expansionMatchesFilters(unliked, { ...EMPTY_FILTERS, liked: true })).toBe(false);
  });

  it("counts as unprioritized whatever its game's tier, as the priority sorts treat it", () => {
    expect(expansionMatchesFilters(x, { ...EMPTY_FILTERS, priorities: ["none"] })).toBe(true);
    expect(expansionMatchesFilters(x, { ...EMPTY_FILTERS, priorities: ["high"] })).toBe(false);
  });
});

describe("expansionSortValue", () => {
  const [x] = bazaarExpansions([game()], [dlc()], quoteOf);
  it("places an expansion by its own price, bounty, length and acquired date", () => {
    expect(expansionSortValue(x, "cost-asc")).toBe(184);
    expect(expansionSortValue(x, "bounty-desc")).toBe(250);
    expect(expansionSortValue(x, "playtime-asc")).toBe(8);
    expect(expansionSortValue(x, "added-desc")).toBe(Date.parse("2026-10-01T00:00:00Z"));
  });

  it("has no value under A–Z or the priority sorts", () => {
    expect(expansionSortValue(x, "alpha")).toBeUndefined();
    expect(expansionSortValue(x, "priority-desc")).toBeUndefined();
    expect(expansionSortValue(x, "priority-asc")).toBeUndefined();
  });
});
