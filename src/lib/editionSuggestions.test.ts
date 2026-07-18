import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import { titleTokens, titleSimilarity, suggestedEditionCandidates } from "./editionSuggestions";

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

describe("titleTokens", () => {
  it("keeps distinctive words (numerals included) and drops punctuation + noise", () => {
    expect(titleTokens("Shin Megami Tensei V: Vengeance")).toEqual([
      "shin", "megami", "tensei", "v", "vengeance",
    ]);
    expect(titleTokens("The Witcher 3: Wild Hunt — Complete Edition")).toEqual([
      "witcher", "3", "wild", "hunt",
    ]);
  });

  it("falls back to all words when everything was noise", () => {
    expect(titleTokens("The Collection")).toEqual(["the", "collection"]);
  });
});

describe("titleSimilarity", () => {
  it("scores kindred titles high and unrelated titles zero", () => {
    const base = "Shin Megami Tensei V: Vengeance";
    const sequel = titleSimilarity(base, "Shin Megami Tensei V");
    const cousin = titleSimilarity(base, "Shin Megami Tensei III: Nocturne HD Remaster");
    const stranger = titleSimilarity(base, "Hollow Knight");
    expect(sequel).toBeGreaterThan(cousin);
    expect(cousin).toBeGreaterThan(0);
    expect(stranger).toBe(0);
  });

  it("ignores edition-noise so a remaster still reads as kin", () => {
    expect(
      titleSimilarity("Dark Souls", "Dark Souls Remastered"),
    ).toBe(1);
  });
});

describe("suggestedEditionCandidates (9f420872)", () => {
  it("ranks kindred titles first instead of collection order", () => {
    const smt5v = game({ title: "Shin Megami Tensei V: Vengeance" });
    const games = [
      game({ title: "Hollow Knight" }),
      game({ title: "Celeste" }),
      smt5v,
      game({ title: "Shin Megami Tensei III: Nocturne HD Remaster" }),
      game({ title: "Hades" }),
      game({ title: "Shin Megami Tensei V" }),
    ];
    const out = suggestedEditionCandidates(games, smt5v, 3);
    expect(out.map((g) => g.title)).toEqual([
      "Shin Megami Tensei V",
      "Shin Megami Tensei III: Nocturne HD Remaster",
      // No third kindred title — the rest fill in collection order.
      "Hollow Knight",
    ]);
  });

  it("excludes the game itself and its current family members", () => {
    const a = game({ title: "Dark Souls", familyId: "F" });
    const b = game({ title: "Dark Souls Remastered", familyId: "F" });
    const c = game({ title: "Dark Souls II" });
    const out = suggestedEditionCandidates([a, b, c], a);
    expect(out.map((g) => g.id)).toEqual([c.id]);
  });

  it("keeps collection order among equally-unrelated titles", () => {
    const base = game({ title: "Outer Wilds" });
    const g1 = game({ title: "Celeste" });
    const g2 = game({ title: "Hades" });
    const out = suggestedEditionCandidates([base, g1, g2], base);
    expect(out.map((g) => g.id)).toEqual([g1.id, g2.id]);
  });
});
