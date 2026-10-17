import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { CalendarPage } from "./CalendarPage";
import { useStore } from "../store";
import type { CalendarItem } from "../lib/calendar";

const D = 86_400_000;

function item(over: Partial<CalendarItem>): CalendarItem {
  return {
    key: "k",
    kind: "event",
    title: "T",
    start: Date.now() - D,
    end: Date.now() + D,
    detail: [],
    prep: "",
    personal: false,
    forYou: true,
    ...over,
  };
}

const FEED = [
  item({ key: "a", title: "Bounty Weekend", detail: ["Bounties ×1.5"] }),
  item({ key: "b", kind: "holiday", title: "Halloween Week", start: Date.now() + 2 * D, end: Date.now() + 4 * D, prep: "Dress up your stall." }),
];

beforeEach(() => {
  act(() =>
    useStore.setState({
      cloud: true,
      economyEnabled: true,
      games: [],
      subscriptions: [],
      fetchCalendar: vi.fn(async () => FEED),
    }),
  );
});

describe("CalendarPage", () => {
  it("lists what's on now and what's coming, with how to get ready", async () => {
    render(<CalendarPage />);
    fireEvent.click(screen.getByRole("button", { name: /List/ }));
    const now = await screen.findByRole("heading", { name: "Happening now" });
    expect(within(now.parentElement!).getByText("Bounty Weekend")).toBeTruthy();
    const soon = screen.getByRole("heading", { name: "Next 7 days" });
    expect(within(soon.parentElement!).getByText("Halloween Week")).toBeTruthy();
    expect(within(soon.parentElement!).getByText(/Get ready: Dress up your stall\./)).toBeTruthy();
  });

  it("adds goal resets, and leaves coin boosts out with the economy off", async () => {
    act(() => useStore.setState({ economyEnabled: false }));
    render(<CalendarPage />);
    fireEvent.click(screen.getByRole("button", { name: /List/ }));
    await screen.findAllByText("Halloween Week");
    expect(screen.queryByText("Bounty Weekend")).toBeNull();
    expect(screen.getAllByText("New weekly goals").length).toBeGreaterThan(0);
  });

  it("shows a picked day's events in the month view", async () => {
    render(<CalendarPage />);
    await screen.findAllByText("Bounty Weekend");
    const today = new Date();
    fireEvent.click(
      screen.getByRole("gridcell", {
        name: today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
      }),
    );
    const heading = screen.getByRole("heading", {
      name: today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
    });
    expect(within(heading.parentElement!).getByText("Bounty Weekend")).toBeTruthy();
  });

  it("opens on a month grid with each event drawn as a bar", async () => {
    const { container } = render(<CalendarPage />);
    await screen.findAllByText("Bounty Weekend");
    expect(screen.getByRole("button", { name: /Month/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    ]);
    // A two-day event is one bar spanning both days (or two halves if it
    // crosses a week boundary), never one chip per day.
    const bars = [...container.querySelectorAll('[aria-hidden="true"] > div')].filter(
      (b) => b.textContent === "Halloween Week",
    );
    expect(bars.length).toBeGreaterThanOrEqual(1);
    expect(bars.length).toBeLessThanOrEqual(2);
  });

  it("says so when the calendar can't load", async () => {
    act(() => useStore.setState({ fetchCalendar: vi.fn(async () => null) }));
    render(<CalendarPage />);
    expect(await screen.findByText(/couldn't load/)).toBeTruthy();
  });
});
