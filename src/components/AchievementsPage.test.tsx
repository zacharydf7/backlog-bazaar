import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AchievementsPage, AchievementMedallion } from "./AchievementsPage";
import { useStore } from "../store";
import type { Achievement } from "../types";

function ach(over: Partial<Achievement> = {}): Achievement {
  return {
    id: "a1",
    slug: "first-clear",
    family: "finisher",
    tier: 1,
    name: "First Clear",
    description: "Finish your first game",
    icon: "trophy",
    metric: "games_finished",
    threshold: 1,
    sort: 1,
    earnedAt: null,
    metricValue: 0,
    holders: 3,
    players: 20,
    ...over,
  };
}

// A finisher family: Bronze earned, Silver is the next target, Gold far off.
const CATALOG: Achievement[] = [
  ach({ id: "f1", earnedAt: Date.parse("2026-07-01T12:00:00Z"), metricValue: 4 }),
  ach({
    id: "f2",
    slug: "seasoned-finisher",
    tier: 2,
    name: "Seasoned Finisher",
    description: "Finish 10 games",
    threshold: 10,
    metricValue: 4,
    holders: 1,
    players: 500,
  }),
  ach({
    id: "f3",
    slug: "backlog-slayer",
    tier: 3,
    name: "Backlog Slayer",
    description: "Finish 50 games",
    threshold: 50,
    metricValue: 4,
    holders: 0,
  }),
];

beforeEach(() => {
  act(() => useStore.setState({ cloud: true, achievements: CATALOG }));
});

describe("AchievementsPage", () => {
  it("renders every tier with its requirement, tier chip, and the earned count", () => {
    render(<AchievementsPage />);
    expect(screen.getByRole("heading", { name: /Achievements/ })).toBeTruthy();
    expect(screen.getByText("1 of 3 earned")).toBeTruthy();
    expect(screen.getByText("First Clear")).toBeTruthy();
    expect(screen.getByText("Seasoned Finisher")).toBeTruthy();
    expect(screen.getByText("Backlog Slayer")).toBeTruthy();
    expect(screen.getByText("Bronze")).toBeTruthy();
    expect(screen.getByText("Silver")).toBeTruthy();
    expect(screen.getByText("Gold")).toBeTruthy();
    expect(screen.getByText("Finish 10 games")).toBeTruthy();
  });

  it("shows the earn date + rarity on an earned tier", () => {
    render(<AchievementsPage />);
    expect(screen.getByText(/Earned .*2026/)).toBeTruthy();
    expect(screen.getByText(/Earned .*2026/).textContent).toMatch(/15% of players/);
  });

  it("shows a progress bar + counts on the next locked target only", () => {
    render(<AchievementsPage />);
    // Silver (the next target) carries the numeric progress line…
    expect(screen.getByText(/4 \/ 10/)).toBeTruthy();
    expect(screen.getByText(/4 \/ 10/).textContent).toMatch(/<1% of players/);
    // …while Gold (further off) shows no counter, just its rarity fallback.
    expect(screen.queryByText(/4 \/ 50/)).toBeNull();
    expect(screen.getByText(/Not yet earned by anyone/)).toBeTruthy();
  });

  it("explains that achievements need the cloud when offline", () => {
    act(() => useStore.setState({ cloud: false }));
    render(<AchievementsPage />);
    expect(screen.getByText(/Achievements live in the cloud/)).toBeTruthy();
    expect(screen.queryByText("First Clear")).toBeNull();
  });
});

describe("AchievementMedallion", () => {
  it("greys out a locked medal and colours an earned one", () => {
    const { container, rerender } = render(<AchievementMedallion achievement={ach()} />);
    expect(container.querySelector(".grayscale")).toBeTruthy();
    rerender(<AchievementMedallion achievement={ach({ earnedAt: 1 })} />);
    expect(container.querySelector(".grayscale")).toBeNull();
  });
});
