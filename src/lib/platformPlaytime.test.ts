import { describe, it, expect } from "vitest";
import {
  summarizePlatformPlaytime,
  hasPlatformBreakdown,
  type PlaySession,
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
