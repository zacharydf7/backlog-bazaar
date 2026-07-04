import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import {
  coerceActivityRow,
  coerceActivity,
  sortActivity,
  localActivityFallback,
  activityTone,
  type ProfileActivity,
} from "./profileActivity";

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    milestone_id: "m1",
    kind: "started",
    occurred_on: "2026-07-01",
    created_at: "2026-07-01T10:00:00.000Z",
    game_id: "g1",
    game_title: "Hollow Knight",
    game_image: "https://x/cover.jpg",
    finish_tag: null,
    ...over,
  };
}

function act(over: Partial<ProfileActivity> = {}): ProfileActivity {
  return {
    id: "m",
    kind: "added",
    occurredOn: "2026-07-01",
    createdAt: 1,
    gameId: "g",
    gameTitle: "Game",
    gameImage: null,
    finishTag: null,
    ...over,
  };
}

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g",
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: Date.parse("2026-06-01T00:00:00Z"),
    ...over,
  } as Game;
}

describe("coerceActivityRow", () => {
  it("maps a well-formed row, trimming the date and typing the finish tag", () => {
    const a = coerceActivityRow(row({ occurred_on: "2026-07-01T00:00:00Z", finish_tag: "completed", kind: "completed" }));
    expect(a).toEqual({
      id: "m1",
      kind: "completed",
      occurredOn: "2026-07-01",
      createdAt: Date.parse("2026-07-01T10:00:00.000Z"),
      gameId: "g1",
      gameTitle: "Hollow Knight",
      gameImage: "https://x/cover.jpg",
      finishTag: "completed",
    });
  });

  it("returns null for an unknown kind or missing required fields", () => {
    expect(coerceActivityRow(row({ kind: "nonsense" }))).toBeNull();
    expect(coerceActivityRow(row({ milestone_id: null }))).toBeNull();
    expect(coerceActivityRow(row({ game_id: undefined }))).toBeNull();
    expect(coerceActivityRow(row({ occurred_on: 42 }))).toBeNull();
    expect(coerceActivityRow(row({ game_title: null }))).toBeNull();
  });

  it("nulls a stray finish tag and a missing cover rather than trusting them", () => {
    const a = coerceActivityRow(row({ finish_tag: "garbage", game_image: null }));
    expect(a?.finishTag).toBeNull();
    expect(a?.gameImage).toBeNull();
  });
});

describe("sortActivity", () => {
  it("orders newest date first, latest same-day step on top, then insertion time", () => {
    const older = act({ id: "older", occurredOn: "2026-06-01" });
    const added = act({ id: "added", kind: "added", occurredOn: "2026-07-01", createdAt: 1 });
    const started = act({ id: "started", kind: "started", occurredOn: "2026-07-01", createdAt: 2 });
    const completed = act({ id: "completed", kind: "completed", occurredOn: "2026-07-01", createdAt: 3 });
    const ordered = sortActivity([older, added, completed, started]).map((a) => a.id);
    // Same day: completed (rank 3) > started (1) > added (0); the June row last.
    expect(ordered).toEqual(["completed", "started", "added", "older"]);
  });

  it("does not mutate its input", () => {
    const list = [act({ id: "a", occurredOn: "2026-06-01" }), act({ id: "b", occurredOn: "2026-07-01" })];
    const copy = [...list];
    sortActivity(list);
    expect(list).toEqual(copy);
  });
});

describe("coerceActivity", () => {
  it("drops malformed rows and returns the rest sorted newest-first", () => {
    const out = coerceActivity([
      row({ milestone_id: "a", occurred_on: "2026-06-10", kind: "added" }),
      row({ milestone_id: "bad", kind: "??" }),
      row({ milestone_id: "b", occurred_on: "2026-07-10", kind: "started" }),
    ]);
    expect(out.map((a) => a.id)).toEqual(["b", "a"]);
  });
});

describe("localActivityFallback", () => {
  it("derives an Added row per game and a clear row for finished games", () => {
    const games = [
      game({ id: "a", title: "Alpha", addedAt: Date.parse("2026-06-01T00:00:00Z") }),
      game({
        id: "b",
        title: "Beta",
        status: "finished",
        finishTag: "completed",
        addedAt: Date.parse("2026-06-02T00:00:00Z"),
        finishedAt: Date.parse("2026-07-03T00:00:00Z"),
      }),
    ];
    const out = localActivityFallback(games);
    // Beta's completion is newest; then the two Added rows (Beta added after Alpha).
    expect(out.map((a) => `${a.gameId}:${a.kind}`)).toEqual([
      "b:completed",
      "b:added",
      "a:added",
    ]);
  });

  it("maps a salvaged drop to its own Retired step (not a clear)", () => {
    const out = localActivityFallback([
      game({
        id: "r",
        status: "finished",
        finishTag: "retired",
        addedAt: 1,
        finishedAt: 5,
      }),
    ]);
    const kinds = out.map((a) => `${a.gameId}:${a.kind}`);
    expect(kinds).toContain("r:retired");
    expect(kinds).not.toContain("r:beat");
    expect(kinds).not.toContain("r:completed");
  });

  it("treats a legacy untagged finish as Beat and omits endless conclusions", () => {
    const games = [
      game({ id: "u", status: "finished", finishedAt: 5, addedAt: 1 }), // untagged
      game({ id: "e", status: "finished", finishTag: "endless", finishedAt: 6, addedAt: 2 }),
    ];
    const kinds = localActivityFallback(games).map((a) => `${a.gameId}:${a.kind}`);
    expect(kinds).toContain("u:beat");
    expect(kinds).not.toContain("e:beat");
    // The endless game still contributes its Added row, just no clear.
    expect(kinds).toContain("e:added");
  });

  it("skips a game with no added date", () => {
    const out = localActivityFallback([game({ id: "x", addedAt: undefined as unknown as number })]);
    expect(out).toEqual([]);
  });
});

describe("activityTone", () => {
  it("gives Completed gold, Beat silver, and everything else a quiet panel", () => {
    expect(activityTone("completed")).toBe("gold");
    expect(activityTone("beat")).toBe("silver");
    expect(activityTone("added")).toBe("quiet");
    expect(activityTone("started")).toBe("quiet");
    expect(activityTone("retired")).toBe("quiet");
    expect(activityTone("unretired")).toBe("quiet");
  });
});
