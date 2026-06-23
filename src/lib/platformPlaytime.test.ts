import { describe, it, expect } from "vitest";
import {
  summarizePlatformPlaytime,
  hasPlatformBreakdown,
  buildPlaytimeRows,
  UNSPECIFIED_ROW_KEY,
  type PlaySession,
  type PlaytimeBreakdown,
} from "./platformPlaytime";

const s = (platform: string | null, hours: number, createdAt: number): PlaySession => ({
  platform,
  hours,
  createdAt,
});

describe("summarizePlatformPlaytime", () => {
  it("sums hours per platform, largest first", () => {
    const b = summarizePlatformPlaytime([
      s("PS5", 2, 10),
      s("PC", 5, 20),
      s("PS5", 1, 30),
    ]);
    expect(b.byPlatform).toEqual([
      { platform: "PC", hours: 5 },
      { platform: "PS5", hours: 3 },
    ]);
  });

  it("buckets null/blank platforms as unattributed", () => {
    const b = summarizePlatformPlaytime([s(null, 4, 1), s("", 1, 2), s("Switch", 2, 3)]);
    expect(b.unattributed).toBe(5);
    expect(b.byPlatform).toEqual([{ platform: "Switch", hours: 2 }]);
  });

  it("reports the most recently played platform", () => {
    const b = summarizePlatformPlaytime([
      s("PC", 5, 100),
      s("PS5", 1, 300), // newest attributed session
      s("Switch", 2, 200),
    ]);
    expect(b.lastPlatform).toBe("PS5");
  });

  it("ignores unattributed sessions when picking the last platform", () => {
    const b = summarizePlatformPlaytime([s("PS5", 1, 100), s(null, 3, 999)]);
    expect(b.lastPlatform).toBe("PS5");
  });

  it("nets out negative corrections and drops platforms that cancel to zero", () => {
    const b = summarizePlatformPlaytime([s("PC", 5, 1), s("PC", -5, 2), s("PS5", 3, 3)]);
    expect(b.byPlatform).toEqual([{ platform: "PS5", hours: 3 }]);
  });

  it("returns an empty breakdown for no sessions", () => {
    const b = summarizePlatformPlaytime([]);
    expect(b.byPlatform).toEqual([]);
    expect(b.unattributed).toBe(0);
    expect(b.lastPlatform).toBeNull();
  });
});

describe("hasPlatformBreakdown", () => {
  it("is true with two or more platforms", () => {
    expect(
      hasPlatformBreakdown({
        byPlatform: [
          { platform: "PC", hours: 5 },
          { platform: "PS5", hours: 3 },
        ],
        unattributed: 0,
        lastPlatform: "PC",
      }),
    ).toBe(true);
  });

  it("is true with one attributed platform plus unattributed time", () => {
    expect(
      hasPlatformBreakdown({
        byPlatform: [{ platform: "PC", hours: 5 }],
        unattributed: 2,
        lastPlatform: "PC",
      }),
    ).toBe(true);
  });

  it("is false when a single platform holds all the time", () => {
    expect(
      hasPlatformBreakdown({
        byPlatform: [{ platform: "PC", hours: 5 }],
        unattributed: 0,
        lastPlatform: "PC",
      }),
    ).toBe(false);
  });
});

describe("buildPlaytimeRows", () => {
  const breakdown = (over: Partial<PlaytimeBreakdown> = {}): PlaytimeBreakdown => ({
    byPlatform: [],
    unattributed: 0,
    lastPlatform: null,
    ...over,
  });

  it("has a row per owned platform, pre-filled with its logged hours, biggest first", () => {
    const rows = buildPlaytimeRows(
      ["PS5", "PC"],
      breakdown({ byPlatform: [{ platform: "PC", hours: 5 }, { platform: "PS5", hours: 2 }] }),
    );
    expect(rows.map((r) => [r.platform, r.hours])).toEqual([
      ["PC", 5],
      ["PS5", 2],
    ]);
  });

  it("includes owned platforms with no logged time yet (zero hours)", () => {
    const rows = buildPlaytimeRows(["PC", "Switch"], breakdown({ byPlatform: [{ platform: "PC", hours: 3 }] }));
    const switchRow = rows.find((r) => r.platform === "Switch");
    expect(switchRow?.hours).toBe(0);
  });

  it("surfaces a platform you logged time on even if it's no longer an owned copy", () => {
    const rows = buildPlaytimeRows([], breakdown({ byPlatform: [{ platform: "PS3", hours: 4 }] }));
    expect(rows.map((r) => r.platform)).toEqual(["PS3"]);
  });

  it("appends a reassignable Unspecified row when some time is unattributed", () => {
    const rows = buildPlaytimeRows(["PC"], breakdown({ byPlatform: [{ platform: "PC", hours: 5 }], unattributed: 40 }));
    const last = rows[rows.length - 1];
    expect(last.key).toBe(UNSPECIFIED_ROW_KEY);
    expect(last.platform).toBeNull();
    expect(last.hours).toBe(40);
  });

  it("omits the Unspecified row when everything is attributed", () => {
    const rows = buildPlaytimeRows(["PC"], breakdown({ byPlatform: [{ platform: "PC", hours: 5 }] }));
    expect(rows.some((r) => r.key === UNSPECIFIED_ROW_KEY)).toBe(false);
  });

  it("collapses to a single generic Played row when there are no platforms and no time", () => {
    const rows = buildPlaytimeRows([], breakdown());
    expect(rows).toHaveLength(1);
    expect(rows[0].platform).toBeNull();
    expect(rows[0].label).toBe("Played");
  });
});
