import { describe, it, expect } from "vitest";
import {
  isOnline,
  activityLabel,
  effectiveSeenAt,
  hasLiveSession,
  isPresent,
  lastSeenLabel,
  presenceActivity,
  resolveActivity,
  sessionActivityLabel,
  ONLINE_WINDOW_MS,
  SESSION_PRESENCE_MS,
} from "./presence";

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

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

describe("sessionActivityLabel", () => {
  it("always names the game", () => {
    expect(sessionActivityLabel("Hades", 0.1)).toContain("Hades");
    expect(sessionActivityLabel("Hades", 5)).toContain("Hades");
  });

  it("escalates the phrasing as the session runs (same game)", () => {
    const early = sessionActivityLabel("Hades", 0.1);
    const mid = sessionActivityLabel("Hades", 3);
    const marathon = sessionActivityLabel("Hades", 20);
    // Different length buckets read differently for the same title.
    expect(early).not.toBe(mid);
    expect(mid).not.toBe(marathon);
  });

  it("is deterministic for a given game + length (no jitter between pings)", () => {
    expect(sessionActivityLabel("Celeste", 1)).toBe(sessionActivityLabel("Celeste", 1));
  });

  it("varies phrasing across a library within the same bucket", () => {
    const titles = ["Hades", "Celeste", "Hollow Knight", "Stardew Valley", "Tunic", "Braid"];
    const labels = new Set(titles.map((t) => sessionActivityLabel(t, 1)));
    // Not all six identical — the game title picks the verb.
    expect(labels.size).toBeGreaterThan(1);
  });

  it("falls back to a generic noun for a blank title", () => {
    expect(sessionActivityLabel("   ", 1)).toContain("a game");
  });

  it("handles the boundary between buckets (2h is no longer the early bucket)", () => {
    expect(sessionActivityLabel("Hades", 1.99)).not.toBe(sessionActivityLabel("Hades", 2));
  });
});

describe("lastSeenLabel", () => {
  it("is empty when never seen", () => {
    expect(lastSeenLabel({ lastSeenAt: null }, NOW)).toBe("");
  });

  it("says active now when online", () => {
    expect(lastSeenLabel({ lastSeenAt: NOW - 1000 }, NOW)).toBe("active now");
  });

  it("gives a relative label when offline", () => {
    expect(lastSeenLabel({ lastSeenAt: NOW - 10 * 60 * 1000 }, NOW)).toBe("active 10m ago");
  });

  it("says active now for a stale heartbeat behind a running stopwatch", () => {
    // The phone-in-pocket case: the browser stopped pinging hours ago, but the
    // session is live — describing them by that dead heartbeat would be wrong.
    expect(
      lastSeenLabel({ lastSeenAt: NOW - 3 * HOUR, playingSince: NOW - 3 * HOUR }, NOW),
    ).toBe("active now");
  });
});

// The heartbeat can't survive a phone being put down, so a live play session is
// presence in its own right. See live_play_presence in supabase/schema.sql.
describe("stopwatch presence", () => {
  it("counts a running session as present with no heartbeat at all", () => {
    const away = { lastSeenAt: null, playingTitle: "Hades", playingSince: NOW - 2 * HOUR };
    expect(isOnline(away.lastSeenAt, NOW)).toBe(false);
    expect(hasLiveSession(away, NOW)).toBe(true);
    expect(isPresent(away, NOW)).toBe(true);
  });

  it("stops trusting a stopwatch nobody stopped", () => {
    const inside = { lastSeenAt: null, playingSince: NOW - (SESSION_PRESENCE_MS - 1) };
    const past = { lastSeenAt: null, playingSince: NOW - SESSION_PRESENCE_MS };
    expect(isPresent(inside, NOW)).toBe(true);
    expect(isPresent(past, NOW)).toBe(false);
  });

  it("is still present from the heartbeat alone when no session is running", () => {
    expect(isPresent({ lastSeenAt: NOW - 1000, playingSince: null }, NOW)).toBe(true);
  });

  it("builds the activity label fresh, so it escalates while they're away", () => {
    // Same session, read three hours apart: the phrase moves up a bucket even
    // though nothing was broadcast in between.
    const row = { lastSeenAt: null, playingTitle: "Hades", playingSince: NOW - 3 * HOUR };
    expect(presenceActivity(row, NOW)).toBe(sessionActivityLabel("Hades", 3));
    expect(presenceActivity(row, NOW - 2.5 * HOUR)).toBe(sessionActivityLabel("Hades", 0.5));
  });

  it("falls back to the broadcast activity when the game is withheld", () => {
    // A private game yields presence with no title — they're around, but what
    // they're playing stays theirs.
    const row = {
      lastSeenAt: NOW - 1000,
      activity: "In the Bazaar",
      playingTitle: null,
      playingSince: NOW - HOUR,
    };
    expect(isPresent(row, NOW)).toBe(true);
    expect(presenceActivity(row, NOW)).toBe("In the Bazaar");
  });

  it("ranks a live session as right now for recency sorts", () => {
    expect(effectiveSeenAt({ lastSeenAt: NOW - 5 * HOUR, playingSince: NOW - HOUR }, NOW)).toBe(NOW);
    expect(effectiveSeenAt({ lastSeenAt: NOW - 5 * HOUR, playingSince: null }, NOW)).toBe(
      NOW - 5 * HOUR,
    );
  });
});
