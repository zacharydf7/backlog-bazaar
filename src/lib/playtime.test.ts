import { describe, it, expect } from "vitest";
import { parsePlaytime, formatPlaytime, formatLength, snapToMinute } from "./playtime";

describe("parsePlaytime", () => {
  it("parses hours and minutes together", () => {
    expect(parsePlaytime("1h 22m")).toBeCloseTo(1 + 22 / 60, 6);
    expect(parsePlaytime("1h22m")).toBeCloseTo(1 + 22 / 60, 6);
    expect(parsePlaytime("2 h 30 m")).toBeCloseTo(2.5, 6);
  });

  it("parses hours-only and minutes-only", () => {
    expect(parsePlaytime("3h")).toBe(3);
    expect(parsePlaytime("90m")).toBe(1.5);
    expect(parsePlaytime("45 min")).toBe(0.75);
  });

  it("parses decimal hours and the h:mm clock form", () => {
    expect(parsePlaytime("2.75")).toBe(2.75);
    expect(parsePlaytime("2.75h")).toBe(2.75);
    expect(parsePlaytime("1:30")).toBe(1.5);
    expect(parsePlaytime("0:45")).toBe(0.75);
  });

  it("snaps to the nearest minute", () => {
    // 100 seconds over an hour rounds to 1h 2m.
    expect(parsePlaytime("1.0277")).toBe(snapToMinute(1.0277));
    expect(formatPlaytime(parsePlaytime("1.0277")!)).toBe("1h 2m");
  });

  it("rejects empty, negative, and nonsense input", () => {
    expect(parsePlaytime("")).toBeNull();
    expect(parsePlaytime("   ")).toBeNull();
    expect(parsePlaytime("-5")).toBeNull();
    expect(parsePlaytime("abc")).toBeNull();
    expect(parsePlaytime("1:75")).toBeNull(); // minutes out of range
  });
});

describe("formatPlaytime", () => {
  it("formats hours and minutes, dropping zero parts", () => {
    expect(formatPlaytime(2.75)).toBe("2h 45m");
    expect(formatPlaytime(0.75)).toBe("45m");
    expect(formatPlaytime(3)).toBe("3h");
    expect(formatPlaytime(0)).toBe("0h");
  });

  it("rounds to the nearest minute and never shows negatives", () => {
    expect(formatPlaytime(1 + 22 / 60)).toBe("1h 22m");
    expect(formatPlaytime(-3)).toBe("0h");
  });
});

describe("formatLength", () => {
  it("blanks an unknown or zero length instead of showing 0h", () => {
    expect(formatLength(undefined)).toBe("");
    expect(formatLength(null)).toBe("");
    expect(formatLength(0)).toBe("");
  });

  it("formats a known length like formatPlaytime", () => {
    expect(formatLength(1.5)).toBe("1h 30m");
    expect(formatLength(12)).toBe("12h");
  });
});
