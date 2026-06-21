import { describe, it, expect } from "vitest";
import { rawgIdsFor } from "./platforms";
import { genreSlug } from "./gamedata";

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
