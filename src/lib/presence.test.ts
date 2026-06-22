import { describe, it, expect } from "vitest";
import {
  isOnline,
  activityLabel,
  lastSeenLabel,
  resolveActivity,
  ONLINE_WINDOW_MS,
} from "./presence";

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
    // "playing" reads as browsing the site, not actively playing a game.
    expect(activityLabel("playing")).toBe("Browsing Now Playing");
  });

  it("falls back for unknown views", () => {
    expect(activityLabel("something-else")).toBe("Online");
  });
});

describe("resolveActivity", () => {
  it("uses the auto label when there's no override", () => {
    expect(resolveActivity(null, "In the Bazaar")).toBe("In the Bazaar");
    expect(resolveActivity(undefined, "In the Bazaar")).toBe("In the Bazaar");
  });

  it("uses a non-empty override over the auto label", () => {
    expect(resolveActivity("Hosting a tournament", "In the Bazaar")).toBe("Hosting a tournament");
  });

  it("treats a whitespace-only override as unset and trims a real one", () => {
    expect(resolveActivity("   ", "In the Bazaar")).toBe("In the Bazaar");
    expect(resolveActivity("  Away  ", "In the Bazaar")).toBe("Away");
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
