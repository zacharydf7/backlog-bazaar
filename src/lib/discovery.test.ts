import { describe, it, expect } from "vitest";
import { rawgIdsFor } from "./platforms";
import { genreSlug, curate } from "./gamedata";
import type { GameMeta } from "../types";

const g = (title: string): GameMeta => ({ title, genres: [] });

describe("curate", () => {
  it("drops editions and collapses franchise DLCs to the base game", () => {
    const out = curate([
      g("The Witcher 3: Wild Hunt – Blood and Wine"),
      g("The Witcher 3 Wild Hunt - Complete Edition"),
      g("The Witcher 3: Wild Hunt"),
      g("Portal 2"),
    ]);
    const titles = out.map((x) => x.title);
    expect(titles).toEqual(["The Witcher 3: Wild Hunt", "Portal 2"]);
  });
});

describe("rawgIdsFor", () => {
  it("maps owned platform ids to RAWG platform ids", () => {
    expect(rawgIdsFor(["pc", "switch"]).sort((a, b) => a - b)).toEqual([4, 7]);
  });

  it("ignores unknown platform ids", () => {
    expect(rawgIdsFor(["nope"])).toEqual([]);
  });
});

describe("genreSlug", () => {
  it("slugifies a genre name", () => {
    expect(genreSlug("Action")).toBe("action");
    expect(genreSlug("Massively Multiplayer")).toBe("massively-multiplayer");
  });

  it("applies the RPG override", () => {
    expect(genreSlug("RPG")).toBe("role-playing-games-rpg");
  });
});
