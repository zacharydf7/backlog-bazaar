import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { WeeklyRecapModal } from "./WeeklyRecapModal";
import { useStore } from "../store";
import type { WeeklyRecap } from "../lib/weeklyRecap";

const RECAP: WeeklyRecap = {
  id: "r1",
  weekStart: "2026-10-12",
  seenAt: null,
  play: {
    hours: 5.5,
    days: 2,
    sessions: 1,
    topGame: { id: "g", title: "Hades", hours: 3 },
    rotation: { hours: 0, games: 0, checkins: 0 },
  },
  clears: { finished: 1, verified: 1, titles: ["Celeste"], streak: 2, bestStreak: 5 },
  coins: { earned: 300, spent: 120, topSources: [{ kind: "bounty", coins: 300 }] },
  progress: {
    achievements: [{ name: "Sworn Record", tier: 3 }],
    goals: ["Two Clears"],
    quickDone: 4,
    close: [{ name: "Seasoned Finisher", description: "Finish 10 games", value: 8, threshold: 10 }],
    unclaimed: 25,
  },
};

const closeWeeklyRecap = vi.fn();

beforeEach(() => {
  closeWeeklyRecap.mockClear();
  act(() => useStore.setState({ weeklyRecap: RECAP, closeWeeklyRecap }));
});

describe("WeeklyRecapModal", () => {
  it("shows the week's play, clears, coins and progress", () => {
    render(<WeeklyRecapModal recap={RECAP} onNavigate={() => {}} />);
    const card = screen.getByRole("dialog", { name: "Your week" });
    expect(card.textContent).toContain("5.5h");
    expect(card.textContent).toContain("1 Verified");
    expect(card.textContent).toContain("Most played: Hades · 3h");
    expect(card.textContent).toContain("Clear Streak 2 · best 5");
    expect(card.textContent).toContain("Bounty Claimed");
    expect(card.textContent).toContain("Gold · Sworn Record");
    expect(card.textContent).toContain("Two Clears");
    expect(card.textContent).toContain("4 daily & weekly goals done");
    expect(card.textContent).toContain("Seasoned Finisher");
    expect(card.textContent).toContain("8 / 10");
    expect(card.textContent).toContain("25 coins in rewards are waiting");
  });

  it("leads a Rotation week with its live-service play instead of zero clears", () => {
    const rotationWeek: WeeklyRecap = {
      ...RECAP,
      play: { ...RECAP.play, rotation: { hours: 4.5, games: 2, checkins: 3 } },
      clears: { ...RECAP.clears, finished: 0, verified: 0, titles: [], streak: 0 },
    };
    render(<WeeklyRecapModal recap={rotationWeek} onNavigate={() => {}} />);
    const card = screen.getByRole("dialog", { name: "Your week" });
    expect(card.textContent).not.toContain("Finished0");
    expect(card.textContent).toContain("4.5h across 2 games · 3 check-ins");
  });

  it("hides coins when the recap has none (economy off)", () => {
    const recap = { ...RECAP, coins: null, progress: { ...RECAP.progress, unclaimed: 0 } };
    render(<WeeklyRecapModal recap={recap} onNavigate={() => {}} />);
    expect(screen.queryByText(/Coins earned/)).toBeNull();
    expect(screen.queryByText(/Where your coins came from/)).toBeNull();
  });

  it("closes (marking it seen) and can jump to Challenges", () => {
    const onNavigate = vi.fn();
    render(<WeeklyRecapModal recap={RECAP} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Challenges" }));
    expect(closeWeeklyRecap).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith("challenges");
    fireEvent.click(screen.getByRole("button", { name: "Nice week!" }));
    expect(closeWeeklyRecap).toHaveBeenCalledTimes(2);
  });
});
