import { describe, it, expect } from "vitest";
import { canonicalTerm, isKnownTerm, canonicalizeTerms, sortTerms } from "./taxonomy";

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
