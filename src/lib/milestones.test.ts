import { describe, it, expect } from "vitest";
import {
  MILESTONE_KINDS,
  KIND_RANK,
  milestoneLabel,
  coerceMilestoneKind,
  coerceMilestoneRow,
  sortMilestones,
  isCurrentlyRetired,
  todayISO,
  isValidMilestoneDate,
  type GameMilestone,
  type MilestoneKind,
} from "./milestones";

const ms = (over: Partial<GameMilestone> = {}): GameMilestone => ({
  id: Math.random().toString(36),
  gameId: "g1",
  kind: "added",
  occurredOn: "2025-01-01",
  source: "manual",
  createdAt: 0,
  ...over,
});

describe("kind catalog", () => {
  it("covers all six kinds with strictly increasing ranks and token-only dots", () => {
    expect(MILESTONE_KINDS.map((k) => k.value)).toEqual([
      "added",
      "started",
      "beat",
      "completed",
      "retired",
      "unretired",
    ]);
    const ranks = MILESTONE_KINDS.map((k) => KIND_RANK[k.value]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    // Theme tokens only — no raw Tailwind palette colors (bg-red-500 etc.).
    for (const k of MILESTONE_KINDS) expect(k.dotClass).not.toMatch(/-\d{2,3}$/);
  });

  it("labels every kind", () => {
    expect(milestoneLabel("beat")).toBe("Beat");
    expect(milestoneLabel("unretired")).toBe("Unretired");
  });

  it("coerceMilestoneKind accepts exactly the six kinds", () => {
    for (const k of MILESTONE_KINDS) expect(coerceMilestoneKind(k.value)).toBe(k.value);
    expect(coerceMilestoneKind("finished")).toBeNull();
    expect(coerceMilestoneKind(42)).toBeNull();
    expect(coerceMilestoneKind(null)).toBeNull();
  });
});

describe("coerceMilestoneRow", () => {
  it("maps a valid row to camelCase", () => {
    const row = {
      id: "m1",
      game_id: "g1",
      kind: "beat",
      occurred_on: "2025-08-09",
      source: "auto",
      created_at: "2025-08-09T12:00:00Z",
    };
    expect(coerceMilestoneRow(row)).toEqual({
      id: "m1",
      gameId: "g1",
      kind: "beat",
      occurredOn: "2025-08-09",
      source: "auto",
      createdAt: Date.parse("2025-08-09T12:00:00Z"),
    });
  });

  it("trims a timestamp-shaped occurred_on to the date part", () => {
    const row = coerceMilestoneRow({
      id: "m1",
      game_id: "g1",
      kind: "added",
      occurred_on: "2025-08-09T00:00:00",
      source: "manual",
      created_at: null,
    });
    expect(row?.occurredOn).toBe("2025-08-09");
  });

  it("returns null for malformed rows and defaults odd sources to manual", () => {
    expect(coerceMilestoneRow({ id: "m", game_id: "g", kind: "nope", occurred_on: "2025-01-01" })).toBeNull();
    expect(coerceMilestoneRow({ id: "m", game_id: "g", kind: "beat" })).toBeNull();
    expect(coerceMilestoneRow({ id: 5, game_id: "g", kind: "beat", occurred_on: "2025-01-01" })).toBeNull();
    const odd = coerceMilestoneRow({ id: "m", game_id: "g", kind: "beat", occurred_on: "2025-01-01", source: "weird" });
    expect(odd?.source).toBe("manual");
  });
});

describe("sortMilestones", () => {
  it("orders by date, then the natural same-day kind order, then insertion", () => {
    const list = [
      ms({ id: "d", kind: "completed", occurredOn: "2025-09-28" }),
      ms({ id: "b", kind: "started", occurredOn: "2025-08-04" }),
      ms({ id: "c2", kind: "beat", occurredOn: "2025-08-04", createdAt: 2 }),
      ms({ id: "c1", kind: "beat", occurredOn: "2025-08-04", createdAt: 1 }),
      ms({ id: "a", kind: "added", occurredOn: "2025-07-18" }),
    ];
    expect(sortMilestones(list).map((m) => m.id)).toEqual(["a", "b", "c1", "c2", "d"]);
  });

  it("does not mutate the input", () => {
    const list = [ms({ occurredOn: "2025-02-01" }), ms({ occurredOn: "2025-01-01" })];
    const before = [...list];
    sortMilestones(list);
    expect(list).toEqual(before);
  });
});

describe("isCurrentlyRetired (client mirror of the trigger's pairing rule)", () => {
  it("balances retired against unretired rows", () => {
    expect(isCurrentlyRetired([])).toBe(false);
    expect(isCurrentlyRetired([ms({ kind: "retired" })])).toBe(true);
    expect(isCurrentlyRetired([ms({ kind: "retired" }), ms({ kind: "unretired" })])).toBe(false);
    expect(
      isCurrentlyRetired([
        ms({ kind: "retired" }),
        ms({ kind: "unretired" }),
        ms({ kind: "retired" }),
      ]),
    ).toBe(true);
    expect(isCurrentlyRetired([ms({ kind: "beat" }), ms({ kind: "added" })])).toBe(false);
  });
});

describe("todayISO", () => {
  it("zero-pads month and day (local time)", () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(todayISO(new Date(2026, 11, 25))).toBe("2026-12-25");
  });
});

describe("isValidMilestoneDate", () => {
  const today = "2026-07-03";
  it("accepts today and the past", () => {
    expect(isValidMilestoneDate("2026-07-03", today)).toBe(true);
    expect(isValidMilestoneDate("1998-11-21", today)).toBe(true);
  });
  it("rejects the future, impossible dates and garbage", () => {
    expect(isValidMilestoneDate("2026-07-04", today)).toBe(false);
    expect(isValidMilestoneDate("2025-13-40", today)).toBe(false);
    expect(isValidMilestoneDate("2025-02-30", today)).toBe(false);
    expect(isValidMilestoneDate("yesterday", today)).toBe(false);
    expect(isValidMilestoneDate("", today)).toBe(false);
  });
  it("kinds map used as MilestoneKind type-check anchor", () => {
    const k: MilestoneKind = "retired";
    expect(KIND_RANK[k]).toBe(4);
  });
});
