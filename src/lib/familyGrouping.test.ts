import { describe, it, expect } from "vitest";
import {
  groupCollapsedFamilies,
  familyMatchesQuery,
  familyMatchesFilters,
} from "./familyGrouping";
import { EMPTY_FILTERS } from "./bazaarView";
import type { Game, GameStatus } from "../types";

const game = (id: string, over: Partial<Game> = {}): Game => ({
  id,
  title: id,
  genres: [],
  status: "backlog" as GameStatus,
  addedAt: 1,
  ...over,
});

describe("groupCollapsedFamilies", () => {
  it("folds a ≥2-member family into one card and hides its members", () => {
    const a = game("a", { familyId: "F", status: "finished", playedHours: 10 });
    const b = game("b", { familyId: "F", status: "playing", playedHours: 5 });
    const solo = game("s");
    const { boardGames, families } = groupCollapsedFamilies([a, b, solo]);
    expect(boardGames.map((g) => g.id)).toEqual(["s"]);
    expect(families).toHaveLength(1);
    expect(families[0].members.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("puts the card on the designated primary's board — whatever its status", () => {
    const fam = (id: string, statuses: GameStatus[], primaryIdx: number) =>
      statuses.map((s, i) =>
        game(`${id}${i}`, {
          familyId: id,
          status: s,
          addedAt: i,
          familyPrimaryGameId: `${id}${primaryIdx}`,
        }),
      );
    const boardOf = (members: Game[]) => groupCollapsedFamilies(members).families[0]?.board;
    // The stored designation wins, even over a "more active" sibling.
    expect(boardOf(fam("A", ["finished", "playing"], 0))).toBe("finished");
    expect(boardOf(fam("B", ["backlog", "wishlist"], 1))).toBe("wishlist");
  });

  it("falls back to the representative for a legacy family with no designation", () => {
    const fam = (id: string, statuses: GameStatus[]) =>
      statuses.map((s, i) => game(`${id}${i}`, { familyId: id, status: s, addedAt: i }));
    const boardOf = (members: Game[]) => groupCollapsedFamilies(members).families[0]?.board;
    expect(boardOf(fam("A", ["finished", "playing"]))).toBe("playing");
    expect(boardOf(fam("B", ["finished", "backlog"]))).toBe("backlog");
    expect(boardOf(fam("C", ["finished", "wishlist"]))).toBe("wishlist");
    expect(boardOf(fam("D", ["finished", "finished"]))).toBe("finished");
  });

  it("folds even a family carrying the retired split flag (the unified card is indivisible)", () => {
    const a = game("a", { familyId: "F" });
    const b = game("b", { familyId: "F", familySplit: true });
    const { boardGames, families } = groupCollapsedFamilies([a, b]);
    expect(families).toHaveLength(1);
    expect(boardGames).toHaveLength(0);
  });

  it("passes unlinked games and 1-visible-member families through (compilation fold upstream)", () => {
    // b's sibling was folded away by the compilation layer — a family of one
    // visible member renders as its plain card, no family card.
    const b = game("b", { familyId: "F" });
    const solo = game("s");
    const { boardGames, families } = groupCollapsedFamilies([b, solo]);
    expect(families).toHaveLength(0);
    expect(boardGames.map((g) => g.id)).toEqual(["b", "s"]);
  });

  it("the card IS the primary member's record, named by the family resolver", () => {
    const a = game("a", {
      familyId: "F",
      title: "Old Port",
      status: "finished",
      image: "old.jpg",
      familyPrimaryGameId: "a",
    });
    const b = game("b", {
      familyId: "F",
      title: "Shiny Remaster",
      status: "playing",
      image: "new.jpg",
      familyName: "The Saga",
      familyPrimaryGameId: "a",
    });
    const fam = groupCollapsedFamilies([a, b]).families[0];
    expect(fam.name).toBe("The Saga");
    expect(fam.primary.id).toBe("a"); // the designation wins over the playing member
    expect(fam.primary.image).toBe("old.jpg"); // the card wears the primary's own art
  });
});

describe("familyMatchesQuery / familyMatchesFilters", () => {
  const a = game("a", {
    familyId: "F",
    title: "Xenoblade Chronicles",
    status: "finished",
    copies: [{ id: "c1", platform: "Nintendo Wii", format: "physical" }],
  });
  const b = game("b", {
    familyId: "F",
    title: "Xenoblade Chronicles: Definitive Edition",
    status: "playing",
    copies: [{ id: "c2", platform: "Nintendo Switch", format: "digital" }],
    familyName: "Xenoblade",
  });
  const fam = groupCollapsedFamilies([a, b]).families[0];

  it("matches when ANY member (or the family name) matches the query", () => {
    expect(familyMatchesQuery(fam, "")).toBe(true);
    expect(familyMatchesQuery(fam, "definitive")).toBe(true); // non-rep member
    expect(familyMatchesQuery(fam, "xenoblade")).toBe(true); // family name
    expect(familyMatchesQuery(fam, "zelda")).toBe(false);
  });

  it("passes the slicers when ANY member passes", () => {
    expect(familyMatchesFilters(fam, EMPTY_FILTERS)).toBe(true);
    expect(familyMatchesFilters(fam, { ...EMPTY_FILTERS, platforms: ["Nintendo Wii"] })).toBe(true);
    expect(familyMatchesFilters(fam, { ...EMPTY_FILTERS, formats: ["digital"] })).toBe(true);
    expect(familyMatchesFilters(fam, { ...EMPTY_FILTERS, platforms: ["PC"] })).toBe(false);
  });
});
