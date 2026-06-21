import { describe, it, expect } from "vitest";
import { timeAgo } from "./time";

describe("timeAgo", () => {
  const now = Date.parse("2026-06-20T12:00:00Z");
  const ago = (s: number) => timeAgo(now - s * 1000, now);

  it("shows 'just now' for very recent times", () => {
    expect(ago(0)).toBe("just now");
    expect(ago(30)).toBe("just now");
  });

  it("shows minutes, hours, and days", () => {
    expect(ago(5 * 60)).toBe("5m");
    expect(ago(3 * 3600)).toBe("3h");
    expect(ago(2 * 86400)).toBe("2d");
  });

  it("falls back to an absolute date past a week", () => {
    const out = ago(10 * 86400);
    expect(out).not.toMatch(/m|h|d|just now/);
    expect(out.length).toBeGreaterThan(0);
  });
});
