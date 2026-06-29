import { describe, it, expect } from "vitest";
import {
  canonicalTerm,
  isKnownTerm,
  canonicalizeTerms,
  sortTerms,
  copyPlatformOptions,
  renameTerm,
  missingFromVerified,
} from "./taxonomy";

const PLATFORMS = ["PC", "PlayStation 5", "Nintendo Switch"];

describe("canonicalTerm", () => {
  it("matches case-insensitively and returns the canonical spelling", () => {
    expect(canonicalTerm("pc", PLATFORMS)).toBe("PC");
    expect(canonicalTerm("  nintendo switch ", PLATFORMS)).toBe("Nintendo Switch");
  });

  it("returns null for unknown or blank terms", () => {
    expect(canonicalTerm("Steam Deck", PLATFORMS)).toBeNull();
    expect(canonicalTerm("   ", PLATFORMS)).toBeNull();
  });
});

describe("isKnownTerm", () => {
  it("reflects master-list membership", () => {
    expect(isKnownTerm("PlayStation 5", PLATFORMS)).toBe(true);
    expect(isKnownTerm("ps5", PLATFORMS)).toBe(false); // not a listed spelling
  });
});

describe("canonicalizeTerms", () => {
  it("keeps only known terms, canonicalizes spelling, and dedupes (order preserved)", () => {
    const input = ["pc", "Steam Deck", "PLAYSTATION 5", "PC"];
    expect(canonicalizeTerms(input, PLATFORMS)).toEqual(["PC", "PlayStation 5"]);
  });

  it("handles undefined / empty input", () => {
    expect(canonicalizeTerms(undefined, PLATFORMS)).toEqual([]);
    expect(canonicalizeTerms([], PLATFORMS)).toEqual([]);
  });
});

describe("sortTerms", () => {
  it("sorts case-insensitively without mutating the input", () => {
    const input = ["RPG", "action", "Indie"];
    expect(sortTerms(input)).toEqual(["action", "Indie", "RPG"]);
    expect(input).toEqual(["RPG", "action", "Indie"]); // unchanged
  });
});

describe("copyPlatformOptions", () => {
  const master = ["PC", "PlayStation 5", "Nintendo Switch", "Nintendo 3DS"];

  it("restricts to the game's release platforms when known", () => {
    expect(copyPlatformOptions(["Nintendo 3DS"], master)).toEqual(["Nintendo 3DS"]);
  });

  it("canonicalizes the game's platforms and drops off-list ones", () => {
    expect(copyPlatformOptions(["nintendo 3ds", "Sega Saturn"], master)).toEqual(["Nintendo 3DS"]);
  });

  it("falls back to the full master list when the game lists no platforms", () => {
    expect(copyPlatformOptions([], master)).toEqual(sortTerms(master));
    expect(copyPlatformOptions(undefined, master)).toEqual(sortTerms(master));
  });

  it("always keeps a platform already on a copy, even if off-list or not a release platform", () => {
    // A legacy copy on Wii survives even though the game's release list is 3DS-only.
    expect(copyPlatformOptions(["Nintendo 3DS"], master, ["Wii"])).toEqual([
      "Nintendo 3DS",
      "Wii",
    ]);
  });
});

describe("renameTerm", () => {
  it("replaces a term case-insensitively, preserving order", () => {
    expect(renameTerm(["PC", "PS5", "Switch"], "ps5", "PlayStation 5")).toEqual([
      "PC",
      "PlayStation 5",
      "Switch",
    ]);
  });

  it("de-duplicates when the replacement already exists in the list", () => {
    // Renaming PS5 → PlayStation 5 when PlayStation 5 is already present collapses
    // them into one (no duplicate term), keeping the first position.
    expect(renameTerm(["PlayStation 5", "PS5", "PC"], "PS5", "PlayStation 5")).toEqual([
      "PlayStation 5",
      "PC",
    ]);
  });

  it("leaves a list without the term untouched and passes undefined through", () => {
    expect(renameTerm(["PC", "Switch"], "PS5", "PlayStation 5")).toEqual(["PC", "Switch"]);
    expect(renameTerm(undefined, "PS5", "PlayStation 5")).toBeUndefined();
  });
});

describe("missingFromVerified", () => {
  const master = ["PC", "PlayStation 5", "Nintendo Switch", "Nintendo 3DS"];

  it("returns chosen platforms that aren't in the game's verified release list", () => {
    // Verified: PC only. The user also owns it on Switch → that's the suggestion.
    expect(missingFromVerified(["PC", "Nintendo Switch"], ["PC"], master)).toEqual([
      "Nintendo Switch",
    ]);
  });

  it("canonicalizes spelling and ignores off-master platforms", () => {
    // "switch" canonicalizes to "Nintendo Switch"; "Sega Saturn" isn't on the
    // master list, so it's never suggested (the catalog would reject it).
    expect(missingFromVerified(["nintendo switch", "Sega Saturn"], ["PC"], master)).toEqual([
      "Nintendo Switch",
    ]);
  });

  it("returns nothing when every chosen platform is already verified", () => {
    expect(missingFromVerified(["PC"], ["PC", "Nintendo Switch"], master)).toEqual([]);
  });

  it("treats an empty/unknown verified list as 'nothing verified yet'", () => {
    expect(missingFromVerified(["PC", "PC"], [], master)).toEqual(["PC"]); // also de-duped
    expect(missingFromVerified(["Nintendo 3DS"], undefined, master)).toEqual(["Nintendo 3DS"]);
  });
});
