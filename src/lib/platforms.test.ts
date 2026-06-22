import { describe, it, expect } from "vitest";
import {
  ownedPlatformLabels,
  isBuiltInPlatformLabel,
  rawgIdsFor,
  mergePlatforms,
} from "./platforms";

describe("isBuiltInPlatformLabel", () => {
  it("matches built-in labels case-insensitively", () => {
    expect(isBuiltInPlatformLabel("PlayStation 5")).toBe(true);
    expect(isBuiltInPlatformLabel("playstation 5")).toBe(true);
    expect(isBuiltInPlatformLabel("  Nintendo Switch  ")).toBe(true);
    expect(isBuiltInPlatformLabel("Nintendo Switch 2")).toBe(false);
  });
});

describe("ownedPlatformLabels", () => {
  it("returns selected built-in labels (in PLATFORMS order) then customs", () => {
    expect(ownedPlatformLabels(["switch", "pc"], ["Nintendo Switch 2"])).toEqual([
      "PC",
      "Nintendo Switch",
      "Nintendo Switch 2",
    ]);
  });

  it("dedupes a custom that matches a built-in or another custom", () => {
    expect(ownedPlatformLabels(["switch"], ["Nintendo Switch", "Steam Deck", "steam deck"])).toEqual(
      ["Nintendo Switch", "Steam Deck"],
    );
  });

  it("is empty when nothing is owned", () => {
    expect(ownedPlatformLabels([], [])).toEqual([]);
  });
});

describe("rawgIdsFor", () => {
  it("maps owned ids to their RAWG platform ids", () => {
    expect(rawgIdsFor(["pc"])).toEqual([4]);
    expect(rawgIdsFor(["unknown"])).toEqual([]);
  });
});

describe("mergePlatforms", () => {
  it("merges lists, trims, drops blanks, and dedupes case-insensitively", () => {
    expect(
      mergePlatforms(["Nintendo Switch", "  PC  "], ["nintendo switch", "Nintendo Switch 2", ""]),
    ).toEqual(["Nintendo Switch", "PC", "Nintendo Switch 2"]);
  });

  it("keeps the first spelling seen and preserves order", () => {
    expect(mergePlatforms(["PS5"], ["ps5", "PC"])).toEqual(["PS5", "PC"]);
  });

  it("handles undefined lists", () => {
    expect(mergePlatforms(undefined, ["PC"], undefined)).toEqual(["PC"]);
  });
});
