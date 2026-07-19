import { describe, expect, it } from "vitest";
import { ONLINE_WINDOW_MS } from "./presence";
import { sortStalls, splitOpenStalls, stallSubtitle, STALL_SORTS, type StallRow } from "./square";

const NOW = 1_800_000_000_000;

function stall(over: Partial<StallRow> = {}): StallRow {
  return {
    displayName: "Player",
    gamesFinished: 0,
    hoursFinished: 0,
    lastSeenAt: null,
    activity: null,
    ...over,
  };
}

const online = (over: Partial<StallRow> = {}) => stall({ lastSeenAt: NOW - 10_000, ...over });
const offline = (over: Partial<StallRow> = {}) =>
  stall({ lastSeenAt: NOW - ONLINE_WINDOW_MS - 60_000, ...over });

describe("splitOpenStalls", () => {
  it("pins online players into the open group, everyone else into rest", () => {
    const a = online({ displayName: "Ana" });
    const b = offline({ displayName: "Ben" });
    const c = stall({ displayName: "Cid" }); // never seen
    const { open, rest } = splitOpenStalls([b, a, c], NOW);
    expect(open).toEqual([a]);
    expect(rest).toEqual([b, c]);
  });

  it("orders the open group A–Z (not by heartbeat) so polls don't reshuffle it", () => {
    const zoe = online({ displayName: "Zoe", lastSeenAt: NOW - 1_000 });
    const ana = online({ displayName: "ana", lastSeenAt: NOW - 90_000 });
    const { open } = splitOpenStalls([zoe, ana], NOW);
    expect(open.map((r) => r.displayName)).toEqual(["ana", "Zoe"]);
  });

  it("keeps the rest in input order for the caller to sort", () => {
    const b = offline({ displayName: "Ben" });
    const a = offline({ displayName: "Ana" });
    const { rest } = splitOpenStalls([b, a], NOW);
    expect(rest).toEqual([b, a]);
  });
});

describe("sortStalls", () => {
  it("active: most recent heartbeat first, never-seen last, name breaks ties", () => {
    const never = stall({ displayName: "Never" });
    const oldA = stall({ displayName: "Ana", lastSeenAt: NOW - 5_000_000 });
    const oldB = stall({ displayName: "ben", lastSeenAt: NOW - 5_000_000 });
    const fresh = stall({ displayName: "Fresh", lastSeenAt: NOW - 1_000 });
    expect(sortStalls([never, oldB, oldA, fresh], "active").map((r) => r.displayName)).toEqual([
      "Fresh",
      "Ana",
      "ben",
      "Never",
    ]);
  });

  it("clears: finishes desc, then hours desc, then name", () => {
    const two = stall({ displayName: "Two", gamesFinished: 2 });
    const fiveShort = stall({ displayName: "Short", gamesFinished: 5, hoursFinished: 10 });
    const fiveLongA = stall({ displayName: "ana", gamesFinished: 5, hoursFinished: 40 });
    const fiveLongB = stall({ displayName: "Ben", gamesFinished: 5, hoursFinished: 40 });
    expect(
      sortStalls([two, fiveShort, fiveLongB, fiveLongA], "clears").map((r) => r.displayName),
    ).toEqual(["ana", "Ben", "Short", "Two"]);
  });

  it("name: case-insensitive A–Z", () => {
    const rows = [stall({ displayName: "zoe" }), stall({ displayName: "Ana" })];
    expect(sortStalls(rows, "name").map((r) => r.displayName)).toEqual(["Ana", "zoe"]);
  });

  it("returns a copy and leaves the input untouched", () => {
    const rows = [stall({ displayName: "B" }), stall({ displayName: "A" })];
    const sorted = sortStalls(rows, "name");
    expect(sorted).not.toBe(rows);
    expect(rows.map((r) => r.displayName)).toEqual(["B", "A"]);
  });
});

describe("stallSubtitle", () => {
  it("shows the live activity line while online", () => {
    const r = online({ activity: "In the Bazaar" });
    expect(stallSubtitle(r, NOW)).toEqual({ kind: "activity", text: "In the Bazaar" });
  });

  it("falls back to the last-seen label when online without an activity", () => {
    const r = online();
    expect(stallSubtitle(r, NOW)).toEqual({ kind: "seen", text: "active now" });
  });

  it("shows how recently an offline player was around", () => {
    const r = offline();
    const sub = stallSubtitle(r, NOW);
    expect(sub.kind).toBe("seen");
    expect(sub.text).toMatch(/^active .+ ago$/);
  });

  it("shows all-time stats for players with no heartbeat at all", () => {
    const r = stall({ gamesFinished: 3, hoursFinished: 42 });
    expect(stallSubtitle(r, NOW)).toEqual({ kind: "stats", text: "3 finished · 42h played" });
  });
});

describe("STALL_SORTS", () => {
  it("lists each sort exactly once", () => {
    const keys = STALL_SORTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["active", "clears", "name"]);
  });
});
