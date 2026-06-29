import { describe, it, expect } from "vitest";
import {
  summarizePlatformPlaytime,
  hasPlatformBreakdown,
  buildPlaytimeRows,
  UNSPECIFIED_ROW_KEY,
  type PlaySession,
  type PlaytimeBreakdown,
} from "./platformPlaytime";
import type { CopyFormat } from "../types";
import { versionKey, type OwnedVersion } from "./copies";

const s = (
  platform: string | null,
  hours: number,
  createdAt: number,
  format: CopyFormat | null = null,
): PlaySession => ({ platform, format, hours, createdAt });

const v = (platform: string, format?: CopyFormat): OwnedVersion => ({ platform, format });

describe("summarizePlatformPlaytime", () => {
  it("sums hours per version, largest first", () => {
    const b = summarizePlatformPlaytime([
      s("PS5", 2, 10),
      s("PC", 5, 20),
      s("PS5", 1, 30),
    ]);
    expect(b.byVersion).toEqual([
      { platform: "PC", format: null, hours: 5 },
      { platform: "PS5", format: null, hours: 3 },
    ]);
  });

  it("keeps the same platform's formats apart (physical vs digital)", () => {
    const b = summarizePlatformPlaytime([
      s("PlayStation 4", 5, 10, "physical"),
      s("PlayStation 4", 2, 20, "digital"),
    ]);
    expect(b.byVersion).toEqual([
      { platform: "PlayStation 4", format: "physical", hours: 5 },
      { platform: "PlayStation 4", format: "digital", hours: 2 },
    ]);
  });

  it("buckets null/blank platforms as unattributed", () => {
    const b = summarizePlatformPlaytime([s(null, 4, 1), s("", 1, 2), s("Switch", 2, 3)]);
    expect(b.unattributed).toBe(5);
    expect(b.byVersion).toEqual([{ platform: "Switch", format: null, hours: 2 }]);
  });

  it("reports the most recently played version (platform + format)", () => {
    const b = summarizePlatformPlaytime([
      s("PC", 5, 100),
      s("PlayStation 4", 1, 300, "digital"), // newest attributed session
      s("Switch", 2, 200),
    ]);
    expect(b.lastVersion).toEqual({ platform: "PlayStation 4", format: "digital" });
  });

  it("ignores unattributed sessions when picking the last version", () => {
    const b = summarizePlatformPlaytime([s("PS5", 1, 100), s(null, 3, 999)]);
    expect(b.lastVersion).toEqual({ platform: "PS5", format: null });
  });

  it("nets out negative corrections and drops versions that cancel to zero", () => {
    const b = summarizePlatformPlaytime([s("PC", 5, 1), s("PC", -5, 2), s("PS5", 3, 3)]);
    expect(b.byVersion).toEqual([{ platform: "PS5", format: null, hours: 3 }]);
  });

  it("returns an empty breakdown for no sessions", () => {
    const b = summarizePlatformPlaytime([]);
    expect(b.byVersion).toEqual([]);
    expect(b.unattributed).toBe(0);
    expect(b.lastVersion).toBeNull();
  });
});

describe("hasPlatformBreakdown", () => {
  const base = (over: Partial<PlaytimeBreakdown> = {}): PlaytimeBreakdown => ({
    byVersion: [],
    unattributed: 0,
    lastVersion: null,
    ...over,
  });

  it("is true with two or more versions", () => {
    expect(
      hasPlatformBreakdown(
        base({
          byVersion: [
            { platform: "PlayStation 4", format: "physical", hours: 5 },
            { platform: "PlayStation 4", format: "digital", hours: 3 },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("is true with one version plus unattributed time", () => {
    expect(
      hasPlatformBreakdown(
        base({ byVersion: [{ platform: "PC", format: null, hours: 5 }], unattributed: 2 }),
      ),
    ).toBe(true);
  });

  it("is false when a single version holds all the time", () => {
    expect(
      hasPlatformBreakdown(base({ byVersion: [{ platform: "PC", format: null, hours: 5 }] })),
    ).toBe(false);
  });
});

describe("buildPlaytimeRows", () => {
  const breakdown = (over: Partial<PlaytimeBreakdown> = {}): PlaytimeBreakdown => ({
    byVersion: [],
    unattributed: 0,
    lastVersion: null,
    ...over,
  });

  it("has a row per owned version, pre-filled with its logged hours, biggest first", () => {
    const rows = buildPlaytimeRows(
      [v("PS5"), v("PC")],
      breakdown({
        byVersion: [
          { platform: "PC", format: null, hours: 5 },
          { platform: "PS5", format: null, hours: 2 },
        ],
      }),
    );
    expect(rows.map((r) => [r.platform, r.hours])).toEqual([
      ["PC", 5],
      ["PS5", 2],
    ]);
  });

  it("gives a physical and a digital copy of one platform their own rows", () => {
    const rows = buildPlaytimeRows(
      [v("PlayStation 4", "physical"), v("PlayStation 4", "digital")],
      breakdown({ byVersion: [{ platform: "PlayStation 4", format: "physical", hours: 5 }] }),
    );
    expect(rows.map((r) => [r.label, r.format, r.hours])).toEqual([
      ["PlayStation 4 (Physical)", "physical", 5],
      ["PlayStation 4 (Digital)", "digital", 0],
    ]);
  });

  it("pools time on a version you no longer own into the reassignable Unspecified row", () => {
    const rows = buildPlaytimeRows(
      [v("PlayStation 4", "digital")],
      breakdown({
        byVersion: [
          { platform: "PlayStation 4", format: "digital", hours: 30 },
          { platform: "PlayStation 5", format: "digital", hours: 25 }, // no longer owned
        ],
      }),
    );
    // Only the owned PS4 row plus an Unspecified row holding the orphaned PS5 time.
    expect(rows.map((r) => [r.platform, r.format, r.hours])).toEqual([
      ["PlayStation 4", "digital", 30],
      [null, null, 25],
    ]);
    const other = rows.find((r) => r.key === UNSPECIFIED_ROW_KEY)!;
    expect(other.absorbs).toEqual([{ platform: "PlayStation 5", format: "digital" }]);
  });

  it("pools all logged time into Unspecified when you own no copies", () => {
    const rows = buildPlaytimeRows([], breakdown({ byVersion: [{ platform: "PS3", format: null, hours: 4 }] }));
    expect(rows).toHaveLength(1);
    expect(rows[0].platform).toBeNull();
    expect(rows[0].hours).toBe(4);
    expect(rows[0].absorbs).toEqual([{ platform: "PS3", format: null }]);
  });

  it("appends a reassignable Unspecified row when some time is unattributed", () => {
    const rows = buildPlaytimeRows(
      [v("PC")],
      breakdown({ byVersion: [{ platform: "PC", format: null, hours: 5 }], unattributed: 40 }),
    );
    const last = rows[rows.length - 1];
    expect(last.key).toBe(UNSPECIFIED_ROW_KEY);
    expect(last.platform).toBeNull();
    expect(last.hours).toBe(40);
  });

  it("omits the Unspecified row when everything is attributed", () => {
    const rows = buildPlaytimeRows([v("PC")], breakdown({ byVersion: [{ platform: "PC", format: null, hours: 5 }] }));
    expect(rows.some((r) => r.key === UNSPECIFIED_ROW_KEY)).toBe(false);
  });

  it("collapses to a single generic Played row when there are no versions and no time", () => {
    const rows = buildPlaytimeRows([], breakdown());
    expect(rows).toHaveLength(1);
    expect(rows[0].platform).toBeNull();
    expect(rows[0].label).toBe("Played");
  });

  it("folds legacy format-less time onto the sole formatted copy of that platform", () => {
    const rows = buildPlaytimeRows(
      [v("PlayStation 4", "digital")],
      breakdown({ byVersion: [{ platform: "PlayStation 4", format: null, hours: 40 }] }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("PlayStation 4 (Digital)");
    expect(rows[0].hours).toBe(40);
    // It remembers the format-less bucket so an edit can clear it.
    expect(rows[0].absorbs).toEqual([{ platform: "PlayStation 4", format: null }]);
  });

  it("adds folded format-less time on top of real formatted time", () => {
    const rows = buildPlaytimeRows(
      [v("PlayStation 4", "digital")],
      breakdown({
        byVersion: [
          { platform: "PlayStation 4", format: "digital", hours: 5 },
          { platform: "PlayStation 4", format: null, hours: 40 },
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].format).toBe("digital");
    expect(rows[0].hours).toBe(45);
  });

  it("pools format-less time into Unspecified when the platform is owned in two formats (ambiguous)", () => {
    const rows = buildPlaytimeRows(
      [v("PlayStation 4", "physical"), v("PlayStation 4", "digital")],
      breakdown({ byVersion: [{ platform: "PlayStation 4", format: null, hours: 40 }] }),
    );
    // Can't tell which format → it doesn't fold; it pools into Unspecified.
    expect(rows.some((r) => r.platform === "PlayStation 4" && r.format === null)).toBe(false);
    const other = rows.find((r) => r.key === UNSPECIFIED_ROW_KEY)!;
    expect(other.hours).toBe(40);
    expect(other.absorbs).toEqual([{ platform: "PlayStation 4", format: null }]);
  });
});

describe("buildPlaytimeRows (byPlatform — edition tracking off)", () => {
  const breakdown = (over: Partial<PlaytimeBreakdown> = {}): PlaytimeBreakdown => ({
    byVersion: [],
    unattributed: 0,
    lastVersion: null,
    ...over,
  });

  it("collapses a platform's formats into one row summing their hours", () => {
    // Same platform owned in two formats with time logged on each → a single
    // format-less platform row holding the combined total.
    const rows = buildPlaytimeRows(
      [v("PlayStation 5", "physical"), v("PlayStation 5", "digital")],
      breakdown({
        byVersion: [
          { platform: "PlayStation 5", format: "physical", hours: 5 },
          { platform: "PlayStation 5", format: "digital", hours: 2 },
        ],
      }),
      { byPlatform: true },
    );
    expect(rows).toHaveLength(1);
    expect([rows[0].label, rows[0].format, rows[0].hours]).toEqual(["PlayStation 5", null, 7]);
    // The formatted buckets are absorbed so an edit consolidates onto (platform, null).
    expect(rows[0].key).toBe(versionKey("PlayStation 5", null));
    expect(rows[0].absorbs).toEqual([
      { platform: "PlayStation 5", format: "physical" },
      { platform: "PlayStation 5", format: "digital" },
    ]);
  });

  it("does not absorb the canonical format-less bucket", () => {
    const rows = buildPlaytimeRows(
      [v("PC")],
      breakdown({ byVersion: [{ platform: "PC", format: null, hours: 9 }] }),
      { byPlatform: true },
    );
    expect(rows).toHaveLength(1);
    expect([rows[0].platform, rows[0].format, rows[0].hours]).toEqual(["PC", null, 9]);
    expect(rows[0].absorbs).toEqual([]); // its own (PC, null) bucket isn't absorbed
  });

  it("gives one row per owned platform, biggest first", () => {
    const rows = buildPlaytimeRows(
      [v("Nintendo Switch", "physical"), v("PC")],
      breakdown({
        byVersion: [
          { platform: "Nintendo Switch", format: "physical", hours: 2 },
          { platform: "PC", format: null, hours: 8 },
        ],
      }),
      { byPlatform: true },
    );
    expect(rows.map((r) => [r.platform, r.hours])).toEqual([
      ["PC", 8],
      ["Nintendo Switch", 2],
    ]);
  });

  it("pools time on an unowned platform into the reassignable Unspecified row", () => {
    const rows = buildPlaytimeRows(
      [v("PC")],
      breakdown({
        byVersion: [
          { platform: "PC", format: null, hours: 4 },
          { platform: "PlayStation 5", format: "digital", hours: 6 }, // no longer owned
        ],
      }),
      { byPlatform: true },
    );
    expect(rows.map((r) => [r.platform, r.hours])).toEqual([
      ["PC", 4],
      [null, 6],
    ]);
    const other = rows.find((r) => r.key === UNSPECIFIED_ROW_KEY)!;
    expect(other.absorbs).toEqual([{ platform: "PlayStation 5", format: "digital" }]);
  });
});
