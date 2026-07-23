import { describe, expect, it } from "vitest";
import {
  SESSION_CAP_HOURS,
  clampTrim,
  elapsedHours,
  formatElapsed,
  isLongRunning,
  loggableHours,
  logsAnything,
} from "./playSessions";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const T0 = 1_700_000_000_000; // arbitrary fixed epoch

describe("elapsedHours", () => {
  it("converts ms to hours", () => {
    expect(elapsedHours(T0, T0 + 90 * MINUTE)).toBeCloseTo(1.5);
  });

  it("clamps a start in the future (clock skew) to zero", () => {
    expect(elapsedHours(T0, T0 - MINUTE)).toBe(0);
  });
});

describe("loggableHours", () => {
  it("snaps to the minute", () => {
    // 1h 30m 29s → 1h 30m
    expect(loggableHours(T0, T0 + 90 * MINUTE + 29_000)).toBeCloseTo(1.5);
  });

  it("caps a forgotten timer at the session cap", () => {
    expect(loggableHours(T0, T0 + 400 * HOUR)).toBe(SESSION_CAP_HOURS);
  });
});

describe("clampTrim", () => {
  const now = T0 + 2 * HOUR; // 2h elapsed

  it("keeps a trim below the elapsed time", () => {
    expect(clampTrim(1.5, T0, now)).toBeCloseTo(1.5);
  });

  it("refuses to inflate past the elapsed time", () => {
    expect(clampTrim(5, T0, now)).toBeCloseTo(2);
  });

  it("clamps a negative trim to zero", () => {
    expect(clampTrim(-1, T0, now)).toBe(0);
  });

  it("cannot exceed the cap even on a very long session", () => {
    expect(clampTrim(100, T0, T0 + 300 * HOUR)).toBe(SESSION_CAP_HOURS);
  });
});

describe("logsAnything", () => {
  it("a full minute logs", () => {
    expect(logsAnything(1 / 60)).toBe(true);
  });

  it("under a minute is a discard", () => {
    expect(logsAnything(0.5 / 60)).toBe(false);
    expect(logsAnything(0)).toBe(false);
  });
});

describe("isLongRunning", () => {
  it("flags a timer left overnight, not a normal evening", () => {
    expect(isLongRunning(T0, T0 + 3 * HOUR)).toBe(false);
    expect(isLongRunning(T0, T0 + 13 * HOUR)).toBe(true);
  });
});

describe("formatElapsed", () => {
  it("renders h:mm:ss", () => {
    expect(formatElapsed(T0, T0)).toBe("0:00:00");
    expect(formatElapsed(T0, T0 + 7_000)).toBe("0:00:07");
    expect(formatElapsed(T0, T0 + HOUR + 23 * MINUTE + 45_000)).toBe("1:23:45");
  });

  it("shows the true wall clock past 24h (the cap applies to logging, not display)", () => {
    expect(formatElapsed(T0, T0 + 26 * HOUR)).toBe("26:00:00");
  });
});
