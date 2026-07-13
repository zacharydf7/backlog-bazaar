import { describe, it, expect } from "vitest";
import {
  ownedPlatformSummary,
  ownedPlatforms,
  ownedVersions,
  loggableVersions,
  versionKey,
  versionLabel,
  versionsConflict,
  ownershipLabel,
  formatLabel,
  isDlcOnly,
  copyCountSummary,
  totalCost,
  hasAnyCost,
  formatUsd,
  coerceAcquisition,
  acquisitionLabel,
  acquisitionIcon,
  isModifierAcquisition,
  primaryAcquisition,
  primaryProvider,
  orderedFormats,
  spendRowGroups,
  ACQUISITIONS,
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

  it("tolerates a copy with a null/undefined platform (compilation saved blank)", () => {
    // A cloud compilation saved with no platform stores a null platform; this
    // must not throw (it crashed the whole board render before the guard).
    const copies = [
      { id: "a", platform: null as unknown as string },
      copy({ platform: "Switch" }),
    ];
    expect(() => ownedVersions(copies)).not.toThrow();
    expect(ownedVersions(copies)).toEqual([{ platform: "Switch", format: undefined }]);
    expect(ownedPlatformSummary(copies)).toEqual([{ platform: "Switch", formats: [] }]);
  });

  it("skips blank platforms", () => {
    expect(ownedVersions([copy({ platform: "  " })])).toEqual([]);
  });
});

describe("loggableVersions", () => {
  const copies = [
    copy({ platform: "PlayStation 5", format: "physical" }),
    copy({ platform: "PlayStation 5", format: "digital" }),
    copy({ platform: "PC" }),
  ];

  it("aggregates by platform when edition tracking is off (the default)", () => {
    // The two PS5 formats collapse into one format-less platform entry, so the
    // picker only asks which platform you played on.
    expect(loggableVersions(copies, false)).toEqual([
      { platform: "PlayStation 5", format: undefined },
      { platform: "PC", format: undefined },
    ]);
  });

  it("lists every owned copy when edition tracking is on", () => {
    expect(loggableVersions(copies, true)).toEqual([
      { platform: "PlayStation 5", format: "physical" },
      { platform: "PlayStation 5", format: "digital" },
      { platform: "PC", format: undefined },
    ]);
  });

  it("returns nothing for no copies, either way", () => {
    expect(loggableVersions(undefined, false)).toEqual([]);
    expect(loggableVersions([], true)).toEqual([]);
  });
});

describe("versionsConflict", () => {
  it("collides equal formats and treats a missing format as ambiguous", () => {
    const ps4 = (format?: "physical" | "digital") => ({ platform: "PlayStation 4", format });
    expect(versionsConflict(ps4("digital"), ps4("digital"))).toBe(true);
    expect(versionsConflict(ps4("digital"), ps4())).toBe(true); // bare copy could be the digital one
    expect(versionsConflict(ps4(), ps4("physical"))).toBe(true);
    expect(versionsConflict(ps4(), ps4())).toBe(true);
    expect(versionsConflict(ps4("digital"), ps4("physical"))).toBe(false);
    expect(versionsConflict(ps4("digital"), { platform: "PC" })).toBe(false);
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
    expect(formatLabel("dlc")).toBe("DLC");
  });
});

describe("DLC copies (owned content, not owned versions)", () => {
  const withDlc = [
    copy({ platform: "Nintendo Switch", format: "physical", cost: 60 }),
    copy({ platform: "Nintendo Switch", format: "dlc", cost: 25 }),
    copy({ platform: "PC", format: "dlc", cost: 10 }),
  ];

  it("ownedVersions excludes DLC rows (no duplicate-check or picker presence)", () => {
    expect(ownedVersions(withDlc)).toEqual([
      { platform: "Nintendo Switch", format: "physical" },
    ]);
  });

  it("loggableVersions never offers a DLC copy, in either tracking mode", () => {
    // Aggregated: PC is owned ONLY as DLC, so it is not a playable platform.
    expect(loggableVersions(withDlc, false)).toEqual([
      { platform: "Nintendo Switch", format: undefined },
    ]);
    expect(loggableVersions(withDlc, true)).toEqual([
      { platform: "Nintendo Switch", format: "physical" },
    ]);
  });

  it("stays visible in the ownership summary with a DLC label", () => {
    expect(ownedPlatformSummary(withDlc)).toEqual([
      { platform: "Nintendo Switch", formats: ["physical", "dlc"] },
      { platform: "PC", formats: ["dlc"] },
    ]);
    expect(
      ownershipLabel({ platform: "Nintendo Switch", formats: ["physical", "dlc"] }),
    ).toBe("Nintendo Switch (Physical, DLC)");
  });

  it("isDlcOnly flags a platform owned solely as DLC", () => {
    expect(isDlcOnly({ platform: "PC", formats: ["dlc"] })).toBe(true);
    expect(isDlcOnly({ platform: "Switch", formats: ["physical", "dlc"] })).toBe(false);
    expect(isDlcOnly({ platform: "PC", formats: [] })).toBe(false);
  });

  it("orders format glyphs physical → digital → DLC regardless of input order", () => {
    // All three present, entered in a jumbled order.
    expect(orderedFormats(["dlc", "digital", "physical"])).toEqual([
      "physical",
      "digital",
      "dlc",
    ]);
    // Only what's owned appears, still in canonical order.
    expect(orderedFormats(["dlc", "physical"])).toEqual(["physical", "dlc"]);
    expect(orderedFormats([])).toEqual([]);
  });

  it("still rolls DLC cost into spend totals", () => {
    expect(totalCost(withDlc)).toBe(95);
  });

  it("copyCountSummary tallies DLC separately", () => {
    expect(copyCountSummary(withDlc)).toBe("1 copy · 2 DLC");
    expect(
      copyCountSummary([
        copy({ format: "physical" }),
        copy({ format: "digital" }),
      ]),
    ).toBe("2 copies");
    expect(copyCountSummary([copy({ format: "dlc" })])).toBe("1 DLC");
    expect(copyCountSummary([])).toBe("0 copies");
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

  it("groups thousands with commas (6c60c213 follow-up)", () => {
    expect(formatUsd(1234.56)).toBe("$1,234.56");
    expect(formatUsd(12000)).toBe("$12,000");
  });
});

describe("acquisition types", () => {
  it("catalog is well-formed, with owned first (no icon)", () => {
    expect(ACQUISITIONS.map((a) => a.value)).toEqual([
      "owned",
      "subscription",
      "borrowed",
      "player2",
    ]);
    expect(ACQUISITIONS[0].icon).toBe(""); // owned is the unremarkable default
    expect(ACQUISITIONS.find((a) => a.value === "subscription")?.icon).toBe("Cloud");
    expect(ACQUISITIONS.find((a) => a.value === "player2")?.icon).toBe("Users");
  });

  it("coerces valid values and rejects anything else", () => {
    expect(coerceAcquisition("subscription")).toBe("subscription");
    expect(coerceAcquisition("borrowed")).toBe("borrowed");
    expect(coerceAcquisition("player2")).toBe("player2");
    expect(coerceAcquisition("owned")).toBe("owned");
    expect(coerceAcquisition("rented")).toBeNull();
    expect(coerceAcquisition(null)).toBeNull();
  });

  it("labels and icons, defaulting to Owned/none", () => {
    expect(acquisitionLabel("subscription")).toBe("Subscription");
    expect(acquisitionLabel("player2")).toBe("Player 2");
    expect(acquisitionLabel(null)).toBe("Owned");
    expect(acquisitionIcon("borrowed")).toBe("Handshake");
    expect(acquisitionIcon("owned")).toBe("");
  });

  it("flags subscription/borrowed/player2 as modifier acquisitions", () => {
    expect(isModifierAcquisition("subscription")).toBe(true);
    expect(isModifierAcquisition("borrowed")).toBe(true);
    expect(isModifierAcquisition("player2")).toBe(true);
    expect(isModifierAcquisition("owned")).toBe(false);
    expect(isModifierAcquisition(undefined)).toBe(false);
  });

  it("picks the card's primary acquisition (player2 > subscription > borrowed, else null)", () => {
    expect(primaryAcquisition([copy({}), copy({})])).toBeNull();
    expect(primaryAcquisition([copy({ acquisition: "borrowed" })])).toBe("borrowed");
    expect(
      primaryAcquisition([copy({ acquisition: "borrowed" }), copy({ acquisition: "subscription" })]),
    ).toBe("subscription");
    // Player 2 is the strongest not-yours state — it wins outright (3eb956ff).
    expect(
      primaryAcquisition([copy({ acquisition: "subscription" }), copy({ acquisition: "player2" })]),
    ).toBe("player2");
  });

  it("surfaces the provider recorded for the primary acquisition, if any", () => {
    expect(
      primaryProvider([copy({ acquisition: "subscription", provider: "Game Pass Ultimate" })]),
    ).toBe("Game Pass Ultimate");
    // A borrowed copy's provider is ignored when subscription is primary…
    expect(
      primaryProvider([
        copy({ acquisition: "borrowed", provider: "From Sam" }),
        copy({ acquisition: "subscription" }),
      ]),
    ).toBeNull();
    // …and an all-owned game has none.
    expect(primaryProvider([copy({})])).toBeNull();
  });
});

describe("spendRowGroups", () => {
  function member(over: Record<string, unknown>) {
    return {
      id: Math.random().toString(36),
      title: "Game",
      status: "backlog",
      copies: [],
      ...over,
    } as unknown as import("../types").Game;
  }

  it("keeps a hub with only standalone copies in a single unlabeled group", () => {
    const a = copy({ platform: "Switch", cost: 20 });
    const groups = spendRowGroups([member({ id: "m1", copies: [a] })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].compilation).toBeNull();
    expect(groups[0].rows.map((r) => r.copy)).toEqual([a]);
  });

  it("puts standalone copies first, then each compilation under its name", () => {
    const solo = copy({ platform: "Switch", cost: 53.69 });
    const bundled = copy({ platform: "Switch", cost: 13.43 });
    const groups = spendRowGroups([
      member({ id: "m1", compilationId: "C1", compilationName: "MH Collection", copies: [bundled] }),
      member({ id: "m2", copies: [solo] }),
    ]);
    expect(groups.map((g) => g.compilation?.name ?? null)).toEqual([null, "MH Collection"]);
    expect(groups[0].rows[0].copy).toBe(solo);
    expect(groups[1].rows[0].copy).toBe(bundled);
  });

  it("merges instances of the SAME compilation and lists different ones separately", () => {
    const groups = spendRowGroups([
      member({ id: "m1", compilationId: "C1", compilationName: "Bundle A", copies: [copy({})] }),
      member({ id: "m2", compilationId: "C2", compilationName: "Bundle B", copies: [copy({})] }),
      member({ id: "m3", compilationId: "C1", compilationName: "Bundle A", copies: [copy({})] }),
    ]);
    expect(groups.map((g) => g.compilation?.name)).toEqual(["Bundle A", "Bundle B"]);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[1].rows).toHaveLength(1);
  });

  it("skips wishlist instances and falls back when the bundle name is missing", () => {
    const groups = spendRowGroups([
      member({ id: "m1", status: "wishlist", copies: [copy({ cost: 99 })] }),
      member({ id: "m2", compilationId: "C1", copies: [copy({})] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].compilation).toEqual({ id: "C1", name: "a compilation" });
  });

  it("keys rows by instance so same-id copies on different instances stay apart", () => {
    const shared = { id: "same", platform: "PC" } as GameCopy;
    const groups = spendRowGroups([
      member({ id: "m1", copies: [shared] }),
      member({ id: "m2", copies: [shared] }),
    ]);
    const keys = groups[0].rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(2);
  });
});
