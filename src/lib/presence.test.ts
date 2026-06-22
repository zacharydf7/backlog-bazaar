import { describe, it, expect } from "vitest";
import { isOnline, activityLabel, lastSeenLabel, ONLINE_WINDOW_MS } from "./presence";

const NOW = 1_700_000_000_000;

describe("isOnline", () => {
  it("is false for null/undefined", () => {
    expect(isOnline(null, NOW)).toBe(false);
    expect(isOnline(undefined, NOW)).toBe(false);
  });

  it("is true within the window and false outside it", () => {
    expect(isOnline(NOW - 1000, NOW)).toBe(true);
    expect(isOnline(NOW - (ONLINE_WINDOW_MS - 1), NOW)).toBe(true);
    expect(isOnline(NOW - ONLINE_WINDOW_MS, NOW)).toBe(false);
    expect(isOnline(NOW - 10 * 60 * 1000, NOW)).toBe(false);
  });
});

describe("activityLabel", () => {
  it("maps known views", () => {
    expect(activityLabel("market")).toBe("Browsing the Caravan");
    expect(activityLabel("requests")).toBe("Reading Requests & bugs");
    expect(activityLabel("visiting")).toBe("Visiting a Bazaar");
  });

  it("falls back for unknown views", () => {
    expect(activityLabel("something-else")).toBe("Online");
  });
});

describe("lastSeenLabel", () => {
  it("is empty when never seen", () => {
    expect(lastSeenLabel(null, NOW)).toBe("");
  });

  it("says active now when online", () => {
    expect(lastSeenLabel(NOW - 1000, NOW)).toBe("active now");
  });

  it("gives a relative label when offline", () => {
    expect(lastSeenLabel(NOW - 10 * 60 * 1000, NOW)).toBe("active 10m ago");
  });
});
