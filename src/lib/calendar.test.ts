import { describe, expect, it } from "vitest";
import {
  agenda,
  coerceCalendarFeed,
  itemWhenLabel,
  monthGrid,
  personalItems,
  resetItems,
  weekBars,
  type CalendarItem,
} from "./calendar";
import type { Subscription } from "./subscriptions";

const H = 3_600_000;
const D = 24 * H;
const ET = { resetDow: 1, resetHour: 0, resetTz: "America/New_York" };

function item(over: Partial<CalendarItem>): CalendarItem {
  return {
    key: "k",
    kind: "event",
    title: "T",
    start: 0,
    end: null,
    detail: [],
    prep: "",
    personal: false,
    forYou: true,
    ...over,
  };
}

describe("coerceCalendarFeed", () => {
  it("turns events into boosted events or holiday notes, and reads challenges", () => {
    const items = coerceCalendarFeed([
      {
        kind: "event",
        id: "a",
        name: "Bounty Weekend",
        description: "",
        prep_tip: "Get a game close to done.",
        starts_at: "2026-11-21T05:00:00Z",
        ends_at: "2026-11-23T05:00:00Z",
        bounty_mult: "1.5",
        genres: ["RPG"],
        for_you: false,
      },
      { kind: "event", id: "b", name: "Halloween Week", description: "Spooky.", starts_at: "2026-10-26T04:00:00Z", ends_at: "2026-11-01T04:00:00Z" },
      { kind: "challenge", id: "c", name: "Winter Push", description: "", starts_at: "2026-12-01T05:00:00Z", ends_at: "2026-12-31T05:00:00Z", reward: 100 },
      { kind: "event", id: "", starts_at: "x" },
    ]);
    expect(items.map((i) => [i.kind, i.title, i.detail, i.prep, i.forYou])).toEqual([
      ["event", "Bounty Weekend", ["Bounties ×1.5", "For RPG"], "Get a game close to done.", false],
      ["holiday", "Halloween Week", ["Spooky."], "", true],
      ["challenge", "Winter Push", ["Reward: 100 coins"], "", true],
    ]);
    expect(coerceCalendarFeed(null)).toEqual([]);
  });
});

describe("resetItems", () => {
  it("adds new weekly goals each Monday and monthly goals on the 1st, at midnight Eastern", () => {
    const items = resetItems(Date.UTC(2026, 10, 25), Date.UTC(2026, 11, 10), ET);
    expect(items.map((i) => [i.title, new Date(i.start).toISOString()])).toEqual([
      ["New weekly goals", "2026-11-30T05:00:00.000Z"],
      ["New monthly goals", "2026-12-01T05:00:00.000Z"],
      ["New weekly goals", "2026-12-07T05:00:00.000Z"],
    ]);
  });

  it("keeps goals on Monday midnight when the Rotation reset moves, with its own entry", () => {
    const items = resetItems(Date.UTC(2026, 11, 7), Date.UTC(2026, 11, 10), { ...ET, resetDow: 2, resetHour: 10 });
    expect(items.map((i) => [i.title, new Date(i.start).toISOString(), i.detail[0]])).toEqual([
      ["New weekly goals", "2026-12-07T05:00:00.000Z", "Three fresh weekly goals."],
      ["Rotation check-ins reset", "2026-12-08T15:00:00.000Z", "Check in on your Rotation games again."],
    ]);
  });

  it("keeps midnight Eastern across the clock change", () => {
    const items = resetItems(Date.UTC(2026, 9, 28), Date.UTC(2026, 10, 3), ET);
    expect(items.map((i) => new Date(i.start).toISOString())).toEqual([
      "2026-11-01T04:00:00.000Z",
      "2026-11-02T05:00:00.000Z",
    ]);
  });
});

describe("personalItems", () => {
  const sub: Subscription = {
    id: "s",
    provider: "Game Pass",
    price: 19.99,
    cadence: "monthly",
    startedOn: "2026-01-15",
    endedOn: null,
  } as Subscription;

  it("lists pre-order arrivals and subscription renewals in the window", () => {
    const from = new Date(2026, 10, 1).getTime();
    const to = new Date(2026, 11, 1).getTime();
    const items = personalItems(
      [
        { id: "g1", title: "Metroid Prime 4", status: "backlog", preorderedAt: 1, preorderExpectedOn: "2026-11-20" },
        { id: "g2", title: "Not ordered", status: "backlog", preorderedAt: undefined, preorderExpectedOn: "2026-11-20" },
      ],
      [sub],
      from,
      to,
    );
    expect(items.map((i) => [i.kind, i.title, new Date(i.start).getDate(), i.personal])).toEqual([
      ["preorder", "Metroid Prime 4 arrives", 20, true],
      ["renewal", "Game Pass renews", 15, true],
    ]);
  });

  it("stops renewals once a plan has ended", () => {
    const items = personalItems([], [{ ...sub, endedOn: "2026-11-01" }], new Date(2026, 10, 1).getTime(), new Date(2027, 0, 1).getTime());
    expect(items).toEqual([]);
  });
});

describe("agenda", () => {
  it("groups what's on now, the next 7 days and later, dropping what's over", () => {
    const now = 100 * D;
    const sections = agenda(
      [
        item({ key: "over", title: "Over", start: now - 3 * D, end: now - D }),
        item({ key: "live", title: "Live", start: now - D, end: now + D }),
        item({ key: "soon", title: "Soon", start: now + 2 * D, end: null }),
        item({ key: "later", title: "Later", start: now + 10 * D, end: now + 12 * D }),
      ],
      now,
    );
    expect(sections.map((s) => [s.label, s.items.map((i) => i.title)])).toEqual([
      ["Happening now", ["Live"]],
      ["Next 7 days", ["Soon"]],
      ["Later", ["Later"]],
    ]);
  });
});

describe("monthGrid", () => {
  it("lays out Sunday-first weeks with an event on every day it covers", () => {
    const weekend = item({
      key: "w",
      title: "Bounty Weekend",
      start: new Date(2026, 10, 21).getTime(),
      end: new Date(2026, 10, 23).getTime(),
    });
    const weeks = monthGrid(2026, 10, [weekend]);
    // November 2026 starts on a Sunday and needs five weeks.
    expect(weeks).toHaveLength(5);
    expect(new Date(weeks[0][0].date).getDate()).toBe(1);
    const days = weeks.flat().filter((d) => d.items.length > 0).map((d) => new Date(d.date).getDate());
    expect(days).toEqual([21, 22]);
  });

  it("marks days outside the month", () => {
    const weeks = monthGrid(2026, 9, []);
    // October 2026 starts on a Thursday: the grid opens on Sunday Sep 27.
    expect(weeks[0][0].inMonth).toBe(false);
    expect(new Date(weeks[0][4].date).getDate()).toBe(1);
  });
});

describe("itemWhenLabel", () => {
  it("shows a span's last day inclusively, and a moment as one day", () => {
    const weekend = { start: new Date(2026, 10, 21).getTime(), end: new Date(2026, 10, 23).getTime() };
    expect(itemWhenLabel(weekend, "en-US")).toBe("Sat, Nov 21 to Sun, Nov 22");
    expect(itemWhenLabel({ start: weekend.start, end: null }, "en-US")).toBe("Sat, Nov 21");
  });
});

describe("weekBars", () => {
  const nov = (d: number) => new Date(2026, 10, d).getTime();

  it("draws a multi-day item as one bar, stacking overlaps into lanes, longest first", () => {
    const weeks = monthGrid(2026, 10, [
      item({ key: "long", title: "Fresh Start Week", start: nov(1), end: nov(8) }),
      item({ key: "short", title: "Weekend", start: nov(7), end: nov(9) }),
      item({ key: "reset", kind: "reset", title: "New weekly goals", start: nov(2), end: null }),
    ]);
    const { bars } = weekBars(weeks[0]);
    expect(bars.map((b) => [b.item.key, b.startCol, b.endCol, b.lane, b.continuesBefore, b.continuesAfter])).toEqual([
      ["long", 0, 6, 0, false, false],
      ["reset", 1, 1, 1, false, false],
      ["short", 6, 6, 1, false, true],
    ]);
  });

  it("marks an item carried over from the week before", () => {
    const weeks = monthGrid(2026, 10, [item({ key: "w", start: nov(7), end: nov(9) })]);
    const second = weekBars(weeks[1]).bars[0];
    expect([second.startCol, second.endCol, second.continuesBefore, second.continuesAfter]).toEqual([0, 0, true, false]);
  });

  it("counts what doesn't fit per day", () => {
    const many = [1, 2, 3, 4].map((n) => item({ key: `m${n}`, title: `M${n}`, start: nov(3), end: null }));
    const { bars, hidden } = weekBars(monthGrid(2026, 10, many)[0], 3);
    expect(bars).toHaveLength(3);
    expect(hidden).toEqual([0, 0, 1, 0, 0, 0, 0]);
  });
});
