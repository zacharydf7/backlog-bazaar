import { describe, it, expect } from "vitest";
import {
  ownedPlatformSummary,
  ownedPlatforms,
  ownedVersions,
  versionKey,
  versionLabel,
  ownershipLabel,
  formatLabel,
  totalCost,
  hasAnyCost,
  formatUsd,
} from "./copies";
import type { GameCopy } from "../types";

function copy(over: Partial<GameCopy>): GameCopy {
  return { id: Math.random().toString(36), platform: "PC", ...over };
}

describe("ownedVersions", () => {
  it("treats same-platform different-format copies as distinct versions", () => {
    const copies = [
      copy({ platform: "PlayStation 4", format: "physical" }),
      copy({ platform: "PlayStation 4", format: "digital" }),
      copy({ platform: "PC" }),
    ];
    expect(ownedVersions(copies)).toEqual([
      { platform: "PlayStation 4", format: "physical" },
      { platform: "PlayStation 4", format: "digital" },
      { platform: "PC", format: undefined },
    ]);
  });

  it("dedupes identical (platform, format) copies", () => {
    const copies = [
      copy({ platform: "PC", format: "digital" }),
      copy({ platform: "PC", format: "digital" }),
    ];
    expect(ownedVersions(copies)).toEqual([{ platform: "PC", format: "digital" }]);
  });

  it("skips blank platforms", () => {
    expect(ownedVersions([copy({ platform: "  " })])).toEqual([]);
  });
});

describe("versionKey / versionLabel", () => {
  it("gives same-platform formats distinct keys but a missing format its own", () => {
    expect(versionKey("PS4", "physical")).not.toBe(versionKey("PS4", "digital"));
    expect(versionKey("PS4", null)).not.toBe(versionKey("PS4", "physical"));
    expect(versionKey("PS4", undefined)).toBe(versionKey("PS4", null));
  });

  it("labels a version with its format, or just the platform when none", () => {
    expect(versionLabel("PlayStation 4", "physical")).toBe("PlayStation 4 (Physical)");
    expect(versionLabel("PC")).toBe("PC");
  });
});

describe("ownedPlatforms", () => {
  it("returns distinct platform names in first-seen order", () => {
    const copies = [
      copy({ platform: "Nintendo Switch", format: "physical" }),
      copy({ platform: "Nintendo Switch", format: "digital" }),
      copy({ platform: "PC" }),
    ];
    expect(ownedPlatforms(copies)).toEqual(["Nintendo Switch", "PC"]);
  });

  it("trims, drops blanks, and handles undefined", () => {
    expect(ownedPlatforms([copy({ platform: " Switch " }), copy({ platform: "  " })])).toEqual([
      "Switch",
    ]);
    expect(ownedPlatforms(undefined)).toEqual([]);
  });
});

describe("ownedPlatformSummary", () => {
  it("groups by platform in first-seen order and collects distinct formats", () => {
    const copies = [
      copy({ platform: "Nintendo Switch", format: "physical" }),
      copy({ platform: "Nintendo Switch", format: "digital" }),
      copy({ platform: "PC" }),
    ];
    expect(ownedPlatformSummary(copies)).toEqual([
      { platform: "Nintendo Switch", formats: ["physical", "digital"] },
      { platform: "PC", formats: [] },
    ]);
  });

  it("trims/drops blank platforms and handles undefined", () => {
    expect(ownedPlatformSummary([copy({ platform: " Switch " }), copy({ platform: "  " })])).toEqual(
      [{ platform: "Switch", formats: [] }],
    );
    expect(ownedPlatformSummary(undefined)).toEqual([]);
  });

  it("labels a platform with its formats, or bare when none", () => {
    expect(
      ownershipLabel({ platform: "Nintendo Switch", formats: ["physical", "digital"] }),
    ).toBe("Nintendo Switch (Physical, Digital)");
    expect(ownershipLabel({ platform: "PC", formats: [] })).toBe("PC");
  });

  it("formatLabel capitalises the format", () => {
    expect(formatLabel("physical")).toBe("Physical");
    expect(formatLabel("digital")).toBe("Digital");
  });
});

describe("totalCost", () => {
  it("sums recorded costs, treating missing as 0", () => {
    expect(
      totalCost([copy({ cost: 70 }), copy({ cost: 39.99 }), copy({})]),
    ).toBeCloseTo(109.99);
  });

  it("is 0 for no copies", () => {
    expect(totalCost(undefined)).toBe(0);
  });
});

describe("hasAnyCost", () => {
  it("is true only when a copy has a positive cost", () => {
    expect(hasAnyCost([copy({}), copy({ cost: 0 })])).toBe(false);
    expect(hasAnyCost([copy({}), copy({ cost: 20 })])).toBe(true);
  });
});

describe("formatUsd", () => {
  it("drops trailing .00 but keeps cents otherwise", () => {
    expect(formatUsd(70)).toBe("$70");
    expect(formatUsd(59.99)).toBe("$59.99");
    expect(formatUsd(0)).toBe("$0");
  });
});
