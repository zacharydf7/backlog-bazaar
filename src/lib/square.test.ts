import { describe, expect, it } from "vitest";
import { ONLINE_WINDOW_MS } from "./presence";
import {
  applyCheerToggle,
  coercePublicGameList,
  coerceSquareReview,
  coerceTrendingGame,
  findOwnedGameId,
  formatHalfStars,
  reviewSnippet,
  sortStalls,
  splitOpenStalls,
  stallSubtitle,
  STALL_SORTS,
  trendingBits,
  type StallRow,
} from "./square";

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

describe("coerceSquareReview", () => {
  const row = {
    user_id: "u1",
    display_name: "Ana",
    avatar_url: null,
    game_title: "Hollow Knight",
    rawg_id: 42,
    catalog_id: null,
    review: "  A haunting masterpiece.  ",
    score: 9,
    reviewed_at: "2026-07-10T12:00:00Z",
  };

  it("coerces a full row, trimming the review body", () => {
    expect(coerceSquareReview(row)).toEqual({
      userId: "u1",
      displayName: "Ana",
      avatarUrl: null,
      gameTitle: "Hollow Knight",
      rawgId: 42,
      catalogId: null,
      review: "A haunting masterpiece.",
      score: 9,
      reviewedAt: "2026-07-10T12:00:00Z",
    });
  });

  it("drops rows without an id, title, or body", () => {
    expect(coerceSquareReview({ ...row, user_id: 7 })).toBeNull();
    expect(coerceSquareReview({ ...row, game_title: "  " })).toBeNull();
    expect(coerceSquareReview({ ...row, review: "" })).toBeNull();
  });

  it("nulls an out-of-range score and defaults a blank name", () => {
    const r = coerceSquareReview({ ...row, score: 99, display_name: " " });
    expect(r?.score).toBeNull();
    expect(r?.displayName).toBe("Someone");
  });
});

describe("reviewSnippet", () => {
  it("passes short bodies through untouched", () => {
    expect(reviewSnippet("Great game.")).toBe("Great game.");
  });

  it("cuts long bodies at a word boundary with an ellipsis", () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const snip = reviewSnippet(long, 100);
    expect(snip.length).toBeLessThanOrEqual(101);
    expect(snip.endsWith("…")).toBe(true);
    expect(snip).not.toMatch(/\s…$/);
  });

  it("hard-cuts a single unbroken word rather than keeping almost nothing", () => {
    const snip = reviewSnippet("a".repeat(300), 100);
    expect(snip).toBe("a".repeat(100) + "…");
  });
});

describe("formatHalfStars", () => {
  it("renders half-star units as star numbers", () => {
    expect(formatHalfStars(7)).toBe("3.5");
    expect(formatHalfStars(8)).toBe("4");
  });
});

describe("applyCheerToggle", () => {
  const events = [
    { id: "a", cheeredByMe: false, cheerCount: 2 },
    { id: "b", cheeredByMe: true, cheerCount: 1 },
  ];

  it("cheers on: bumps the count and marks mine", () => {
    const out = applyCheerToggle(events, "a", true);
    expect(out[0]).toEqual({ id: "a", cheeredByMe: true, cheerCount: 3 });
    expect(out[1]).toBe(events[1]); // untouched row keeps identity
  });

  it("cheers off: drops the count, flooring at zero", () => {
    expect(applyCheerToggle(events, "b", false)[1]).toEqual({
      id: "b",
      cheeredByMe: false,
      cheerCount: 0,
    });
  });

  it("is a no-op when the row already matches the desired state", () => {
    expect(applyCheerToggle(events, "b", true)[1]).toEqual(events[1]);
    expect(applyCheerToggle(events, "a", false)[0]).toEqual(events[0]);
  });
});

describe("coerceTrendingGame + trendingBits", () => {
  const row = {
    rawg_id: 42,
    catalog_id: null,
    title: "Hades",
    image: "https://cdn.example/hades.jpg",
    adds: "3", // bigints arrive as strings from PostgREST
    finishes: 2,
    likes: 0,
    reviews: 1,
  };

  it("coerces counts (including bigint strings) and keeps the catalog image", () => {
    expect(coerceTrendingGame(row)).toEqual({
      rawgId: 42,
      catalogId: null,
      title: "Hades",
      image: "https://cdn.example/hades.jpg",
      adds: 3,
      finishes: 2,
      likes: 0,
      reviews: 1,
    });
  });

  it("drops untitled or all-zero rows", () => {
    expect(coerceTrendingGame({ ...row, title: " " })).toBeNull();
    expect(coerceTrendingGame({ ...row, adds: 0, finishes: 0, likes: 0, reviews: 0 })).toBeNull();
  });

  it("builds the activity line, skipping zero counts", () => {
    const t = coerceTrendingGame(row)!;
    expect(trendingBits(t)).toBe("3 added · 2 finished · 1 reviewed");
  });
});

describe("coercePublicGameList", () => {
  const row = {
    id: "l1",
    title: "Cozy autumn picks",
    description: "Short and warm.",
    owner_id: "u1",
    owner_name: "Ana",
    owner_avatar: null,
    updated_at: "2026-07-15T12:00:00Z",
    item_count: "5",
    covers: ["a.jpg", null, "b.jpg"],
  };

  it("coerces a full row, cleaning the covers array", () => {
    const l = coercePublicGameList(row);
    expect(l).toMatchObject({
      id: "l1",
      title: "Cozy autumn picks",
      ownerId: "u1",
      ownerName: "Ana",
      itemCount: 5,
      covers: ["a.jpg", "b.jpg"],
    });
    expect(l?.updatedAt).toBe(Date.parse("2026-07-15T12:00:00Z"));
  });

  it("drops rows missing an id or title and defaults a blank owner name", () => {
    expect(coercePublicGameList({ ...row, id: 7 })).toBeNull();
    expect(coercePublicGameList({ ...row, title: "" })).toBeNull();
    expect(coercePublicGameList({ ...row, owner_name: "" })?.ownerName).toBe("Someone");
  });
});

describe("findOwnedGameId", () => {
  const games = [
    { id: "g1", rawgId: 42, catalogId: null },
    { id: "g2", rawgId: null, catalogId: "cat-1" },
  ];

  it("matches by rawg id first, then catalog id", () => {
    expect(findOwnedGameId(games, 42, "cat-1")).toBe("g1");
    expect(findOwnedGameId(games, null, "cat-1")).toBe("g2");
  });

  it("returns null when nothing matches or identities are absent", () => {
    expect(findOwnedGameId(games, 7, "cat-9")).toBeNull();
    expect(findOwnedGameId(games, null, null)).toBeNull();
  });
});
