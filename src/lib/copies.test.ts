import { describe, it, expect } from "vitest";
import {
  ownedPlatformSummary,
  ownedPlatforms,
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
