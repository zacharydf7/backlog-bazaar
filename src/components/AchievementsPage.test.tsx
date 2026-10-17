import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AchievementsPage } from "./AchievementsPage";
import { SealMedal } from "./SealMedal";
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
    hidden: false,
    reward: 10,
    rewardPaidAt: null,
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
  act(() =>
    useStore.setState({
      cloud: true,
      economyEnabled: true,
      achievements: CATALOG,
      fetchAchievements: vi.fn(async () => {}),
      claimAchievementRewards: vi.fn(async () => {}),
    }),
  );
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

describe("AchievementsPage — rewards", () => {
  it("offers Claim on an unclaimed earned medal and Claim all for the total", () => {
    render(<AchievementsPage />);
    expect(screen.getByText(/1 reward ready to claim — 10 coins/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Claim \+10/ }));
    expect(useStore.getState().claimAchievementRewards).toHaveBeenCalledWith("f1");
    fireEvent.click(screen.getByRole("button", { name: /Claim all/ }));
    expect(useStore.getState().claimAchievementRewards).toHaveBeenCalledWith();
  });

  it("marks a paid medal as claimed, with no Claim buttons left", () => {
    act(() =>
      useStore.setState({ achievements: [{ ...CATALOG[0], rewardPaidAt: 2 }, ...CATALOG.slice(1)] }),
    );
    render(<AchievementsPage />);
    expect(screen.getByText("+10 claimed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
  });

  it("keeps rewards waiting, with nothing to press, while the economy is off", () => {
    act(() => useStore.setState({ economyEnabled: false }));
    render(<AchievementsPage />);
    expect(screen.getByText(/waiting for when your coin economy is back on/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
  });

  it("scores earned medals and lists secret medals in their own card", () => {
    act(() =>
      useStore.setState({
        achievements: [
          ...CATALOG,
          ach({ id: "h1", slug: "hidden", family: "hidden:h1", name: "Hidden achievement", hidden: true, reward: 25, sort: 30 }),
        ],
      }),
    );
    render(<AchievementsPage />);
    expect(screen.getByText("Score 10")).toBeTruthy();
    expect(screen.getByTestId("achievement-secrets").textContent).toMatch(/Hidden achievement.*Secret/);
  });
});

describe("SealMedal", () => {
  it("pours an earned seal in its metal and leaves a locked one as an outline", () => {
    const { container, rerender } = render(<SealMedal achievement={ach()} />);
    expect(container.querySelector("path[stroke-dasharray]")).toBeTruthy();
    expect(container.querySelector("radialGradient")).toBeNull();
    rerender(<SealMedal achievement={ach({ earnedAt: 1 })} />);
    expect(container.querySelector("path[stroke-dasharray]")).toBeNull();
    expect(container.querySelector("radialGradient stop")?.getAttribute("stop-color")).toBe("#c0532f");
  });

  it("adds laurels from Silver and ribbon tails plus a glint on Gold", () => {
    const { container, rerender } = render(<SealMedal achievement={ach({ earnedAt: 1 })} />);
    expect(container.querySelectorAll("ellipse")).toHaveLength(0);
    rerender(<SealMedal achievement={ach({ earnedAt: 1, tier: 2 })} />);
    expect(container.querySelectorAll("ellipse")).toHaveLength(8);
    expect(container.querySelector(".animate-seal-shine")).toBeNull();
    rerender(<SealMedal achievement={ach({ earnedAt: 1, tier: 3 })} />);
    expect(container.querySelectorAll("ellipse")).toHaveLength(12);
    expect(container.querySelector(".animate-seal-shine")).toBeTruthy();
  });
});
