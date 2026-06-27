import { describe, it, expect } from "vitest";
import {
  rotationPeriodStart,
  rotationNextReset,
  canRotationCheckin,
  resetDayLabel,
  rotationResetSummary,
  formatResetCountdown,
  type RotationResetConfig,
} from "./rotation";

// 2026-06-23 is a Tuesday (UTC). dow 2 = Tuesday in Postgres' convention.
const TUE_UTC: RotationResetConfig = { resetDow: 2, resetHour: 0, resetTz: "UTC" };

describe("rotationPeriodStart", () => {
  it("returns this week's Tuesday 00:00 for a mid-week instant", () => {
    const now = new Date("2026-06-24T15:00:00Z"); // Wednesday
    expect(rotationPeriodStart(now, TUE_UTC).toISOString()).toBe("2026-06-23T00:00:00.000Z");
  });

  it("treats the boundary instant itself as the start of the new period", () => {
    const now = new Date("2026-06-23T00:00:00Z"); // exactly the reset
    expect(rotationPeriodStart(now, TUE_UTC).toISOString()).toBe("2026-06-23T00:00:00.000Z");
  });

  it("uses last week's reset when the reset hour hasn't arrived yet today", () => {
    const cfg: RotationResetConfig = { resetDow: 2, resetHour: 10, resetTz: "UTC" };
    const now = new Date("2026-06-23T09:00:00Z"); // Tuesday, before 10:00
    expect(rotationPeriodStart(now, cfg).toISOString()).toBe("2026-06-16T10:00:00.000Z");
  });

  it("rolls to the prior week from just before the reset on a Sunday config", () => {
    const cfg: RotationResetConfig = { resetDow: 0, resetHour: 0, resetTz: "UTC" };
    const now = new Date("2026-06-27T12:00:00Z"); // Saturday
    expect(rotationPeriodStart(now, cfg).toISOString()).toBe("2026-06-21T00:00:00.000Z");
  });
});

describe("rotationNextReset", () => {
  it("is exactly one week after the current period start", () => {
    const now = new Date("2026-06-24T15:00:00Z");
    expect(rotationNextReset(now, TUE_UTC).toISOString()).toBe("2026-06-30T00:00:00.000Z");
  });
});

describe("canRotationCheckin", () => {
  const now = new Date("2026-06-24T15:00:00Z"); // period started 2026-06-23T00:00Z

  it("allows a check-in when there is no prior one", () => {
    expect(canRotationCheckin(null, now, TUE_UTC)).toBe(true);
    expect(canRotationCheckin(undefined, now, TUE_UTC)).toBe(true);
  });

  it("blocks a check-in already made within the current period", () => {
    const last = new Date("2026-06-23T08:00:00Z").getTime();
    expect(canRotationCheckin(last, now, TUE_UTC)).toBe(false);
  });

  it("allows a check-in whose last one predates the current period start", () => {
    const last = new Date("2026-06-22T23:59:00Z"); // before the boundary
    expect(canRotationCheckin(last, now, TUE_UTC)).toBe(true);
  });
});

describe("labels", () => {
  it("names the reset weekday", () => {
    expect(resetDayLabel(2)).toBe("Tuesday");
    expect(resetDayLabel(0)).toBe("Sunday");
    expect(resetDayLabel(6)).toBe("Saturday");
  });

  it("summarizes the schedule", () => {
    expect(rotationResetSummary(TUE_UTC)).toBe("Resets Tuesdays · 00:00 UTC");
    expect(rotationResetSummary({ resetDow: 4, resetHour: 9, resetTz: "UTC" })).toBe(
      "Resets Thursdays · 09:00 UTC",
    );
  });

  it("formats the countdown to the next reset", () => {
    // 5h before the Tuesday boundary → "5h 0m"
    expect(formatResetCountdown(new Date("2026-06-22T19:00:00Z"), TUE_UTC)).toBe("5h 0m");
    // 2 days 3 hours before
    expect(formatResetCountdown(new Date("2026-06-20T21:00:00Z"), TUE_UTC)).toBe("2d 3h");
  });
});
