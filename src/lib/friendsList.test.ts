import { describe, it, expect } from "vitest";
import { filterFriends, sortFriends, friendSubtitle, FRIEND_SORTS } from "./friendsList";
import { ONLINE_WINDOW_MS } from "./presence";
import type { Friend } from "../types";

const NOW = 1_800_000_000_000;

function friend(over: Partial<Friend> = {}): Friend {
  return {
    id: "u1",
    displayName: "Ana",
    avatarUrl: null,
    coins: null,
    lastSeenAt: null,
    activity: null,
    nowPlaying: null,
    playingTitle: null,
    playingSince: null,
    ...over,
  };
}

const online = (name: string, agoMs = 10_000) =>
  friend({ id: name, displayName: name, lastSeenAt: NOW - agoMs });
const offline = (name: string, agoMs = ONLINE_WINDOW_MS * 10) =>
  friend({ id: name, displayName: name, lastSeenAt: NOW - agoMs });
const hidden = (name: string) => friend({ id: name, displayName: name, lastSeenAt: null });

describe("FRIEND_SORTS", () => {
  it("offers online-first, name, and recent", () => {
    expect(FRIEND_SORTS.map((s) => s.value)).toEqual(["online", "name", "recent"]);
  });
});

describe("filterFriends", () => {
  const list = [friend({ displayName: "Ana" }), friend({ id: "u2", displayName: "Benji" })];

  it("matches case-insensitive substrings", () => {
    expect(filterFriends(list, "ben").map((f) => f.displayName)).toEqual(["Benji"]);
    expect(filterFriends(list, "AN").map((f) => f.displayName)).toEqual(["Ana"]);
  });

  it("returns everyone for a blank query", () => {
    expect(filterFriends(list, "")).toEqual(list);
    expect(filterFriends(list, "   ")).toEqual(list);
  });
});

describe("sortFriends", () => {
  it("'online' groups online friends first, A–Z within each group (stable under polls)", () => {
    const out = sortFriends([offline("Cleo"), online("Zed"), offline("Abe"), online("Ana")], "online", NOW);
    expect(out.map((f) => f.displayName)).toEqual(["Ana", "Zed", "Abe", "Cleo"]);
  });

  it("'name' sorts A–Z case-insensitively", () => {
    const out = sortFriends(
      [friend({ displayName: "zoe" }), friend({ id: "u2", displayName: "Abe" })],
      "name",
      NOW,
    );
    expect(out.map((f) => f.displayName)).toEqual(["Abe", "zoe"]);
  });

  it("'recent' is most-recently-seen first, never-seen last", () => {
    const out = sortFriends([hidden("Ghost"), offline("Old", 9_999_999), online("Fresh")], "recent", NOW);
    expect(out.map((f) => f.displayName)).toEqual(["Fresh", "Old", "Ghost"]);
  });

  it("does not mutate its input", () => {
    const list = [online("Zed"), online("Ana")];
    const before = list.map((f) => f.displayName);
    sortFriends(list, "name", NOW);
    expect(list.map((f) => f.displayName)).toEqual(before);
  });
});

describe("friendSubtitle", () => {
  it("shows an online friend's broadcast activity in the activity tint", () => {
    expect(friendSubtitle(online("Ana", 5_000, ), NOW)).toEqual({
      kind: "activity",
      text: "Online",
    });
    expect(
      friendSubtitle(friend({ lastSeenAt: NOW - 5_000, activity: "In the Bazaar" }), NOW),
    ).toEqual({ kind: "activity", text: "In the Bazaar" });
  });

  it("falls back to 'Online' when a private friend's activity arrives nulled or blank", () => {
    expect(friendSubtitle(friend({ lastSeenAt: NOW - 5_000, activity: "  " }), NOW).text).toBe(
      "Online",
    );
  });

  it("shows last-seen for an offline friend", () => {
    const sub = friendSubtitle(offline("Abe"), NOW);
    expect(sub.kind).toBe("idle");
    expect(sub.text).toMatch(/^active .+ ago$/);
  });

  it("stays empty for an appear-offline friend (no last-seen at all)", () => {
    expect(friendSubtitle(hidden("Ghost"), NOW)).toEqual({ kind: "none", text: "" });
  });
});

// A friend who starts a stopwatch and puts the phone down stops pinging within
// seconds, but they are emphatically still around — see live_play_presence.
describe("friends away at their game", () => {
  const away = (name: string, hoursIn = 2) =>
    friend({
      id: name,
      displayName: name,
      lastSeenAt: NOW - 3 * 60 * 60 * 1000, // heartbeat long dead
      playingTitle: "Hades",
      playingSince: NOW - hoursIn * 60 * 60 * 1000,
    });

  it("groups them with the online friends, not below the offline ones", () => {
    const sorted = sortFriends([offline("Zed"), away("Ana")], "online", NOW);
    expect(sorted.map((f) => f.displayName)).toEqual(["Ana", "Zed"]);
  });

  it("ranks them as active right now, ahead of a fresher dead heartbeat", () => {
    const recentlyGone = offline("Zed", 60_000);
    const sorted = sortFriends([recentlyGone, away("Ana")], "recent", NOW);
    expect(sorted.map((f) => f.displayName)).toEqual(["Ana", "Zed"]);
  });

  it("shows the game they're on rather than a stale last-seen", () => {
    const sub = friendSubtitle(away("Ana"), NOW);
    expect(sub.kind).toBe("activity");
    expect(sub.text).toContain("Hades");
  });

  it("drops back to last-seen once the stopwatch has run past the trusted window", () => {
    const forgotten = friend({
      displayName: "Ana",
      lastSeenAt: NOW - 20 * 60 * 60 * 1000,
      playingTitle: "Hades",
      playingSince: NOW - 20 * 60 * 60 * 1000,
    });
    expect(friendSubtitle(forgotten, NOW).kind).toBe("idle");
  });
});
