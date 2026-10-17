import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ChallengesPage } from "./ChallengesPage";
import { useStore } from "../store";
import type { ChallengesState, QuickGoal } from "../lib/challenges";

const NOW = Date.now();
const DAY = 86_400_000;

function state(over: Partial<ChallengesState> = {}): ChallengesState {
  return {
    month: "2026-10-01",
    endsAt: NOW + 10 * DAY,
    goalReward: 25,
    setBonus: 50,
    countsFromPick: false,
    menu: [
      { key: "finish-two", name: "Two Clears", description: "Finish 2 games", icon: "trophy", target: 2, progress: 2 },
      { key: "log-twenty", name: "Twenty Hours", description: "Log 20 hours of play", icon: "clock", target: 20, progress: 6 },
      { key: "review-one", name: "Say a Few Words", description: "Review a game", icon: "star", target: 1, progress: 0 },
    ],
    picks: [
      { id: "p1", goalKey: "finish-two", name: "Two Clears", target: 2, progress: 2, reward: 25,
        completedAt: NOW, rewardPaidAt: null },
    ],
    bonus: null,
    unclaimedEarlier: [],
    seasonal: [],
    daily: null,
    weekly: [],
    dailySwapUsed: false,
    weeklySwapUsed: false,
    weeklyBonus: null,
    dayEndsAt: NOW + DAY / 2,
    weekEndsAt: NOW + 3 * DAY,
    weeklySweep: 25,
    ...over,
  };
}

beforeEach(() => {
  act(() =>
    useStore.setState({
      cloud: true,
      economyEnabled: true,
      challenges: state(),
      fetchChallenges: vi.fn(async () => true),
      evaluateChallenges: vi.fn(async () => {}),
      pickMonthlyGoal: vi.fn(async () => {}),
      swapQuickGoal: vi.fn(async () => {}),
      claimChallengeRewards: vi.fn(async () => {}),
    }),
  );
});

describe("ChallengesPage — monthly goals", () => {
  it("shows a completed pick with its Claim and the rest of the menu to pick from", () => {
    render(<ChallengesPage />);
    const goals = within(screen.getByTestId("monthly-goals"));
    expect(goals.getByText("Two Clears")).toBeTruthy();
    expect(goals.getByText(/Pick 2 more/)).toBeTruthy();
    expect(goals.getByText("Log 20 hours of play")).toBeTruthy();
    expect(goals.queryByText("Finish 2 games")).toBeNull(); // already picked
    fireEvent.click(goals.getByRole("button", { name: /Claim \+25/ }));
    expect(useStore.getState().claimChallengeRewards).toHaveBeenCalledWith("p1");
  });

  it("asks for a second tap before a pick, since picks are final", () => {
    render(<ChallengesPage />);
    const row = screen.getByText("Log 20 hours of play").closest("div")!.parentElement as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Pick" }));
    expect(useStore.getState().pickMonthlyGoal).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: "Confirm" }));
    expect(useStore.getState().pickMonthlyGoal).toHaveBeenCalledWith("log-twenty");
  });

  it("says a goal counts from the pick once the launch month is over", () => {
    act(() =>
      useStore.setState({
        challenges: state({
          countsFromPick: true,
          menu: [{ key: "log-twenty", name: "Twenty Hours", description: "Log 20 hours of play", icon: "clock", target: 20, progress: null }],
        }),
      }),
    );
    render(<ChallengesPage />);
    expect(screen.getByText(/a goal counts what you do after you pick it/)).toBeTruthy();
    expect(screen.getByText(/counts from when you pick it/)).toBeTruthy();
  });

  it("shows the all-three bonus once three goals are picked, and hides the menu", () => {
    act(() =>
      useStore.setState({
        challenges: state({
          picks: ["a", "b", "c"].map((id, i) => ({
            id, goalKey: `g${i}`, name: `Goal ${i}`, target: 1, progress: 1, reward: 25,
            completedAt: NOW, rewardPaidAt: NOW,
          })),
          bonus: { id: "b1", reward: 50, completedAt: NOW, rewardPaidAt: null },
        }),
      }),
    );
    render(<ChallengesPage />);
    expect(screen.queryByText(/Pick \d more/)).toBeNull();
    expect(screen.getAllByText("+25 claimed")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /Claim \+50/ }));
    expect(useStore.getState().claimChallengeRewards).toHaveBeenCalledWith("b1");
  });

  it("keeps rewards waiting, with nothing to press, while the economy is off", () => {
    act(() => useStore.setState({ economyEnabled: false }));
    render(<ChallengesPage />);
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
    expect(screen.getByText(/waiting for when your coin economy is back on/)).toBeTruthy();
  });
});

describe("ChallengesPage — daily & weekly", () => {
  const quick = (id: string, over: Partial<QuickGoal> = {}): QuickGoal => ({
    id, cadence: "weekly", goalKey: id, name: `Goal ${id}`, description: `Do ${id}`, icon: "clock",
    target: 5, progress: 2, reward: 25, completedAt: null, rewardPaidAt: null, ...over,
  });

  it("shows today's goal and the week's goals with progress, and swaps one", () => {
    act(() =>
      useStore.setState({
        challenges: state({
          daily: quick("d1", { cadence: "daily", name: "Half an Hour", description: "Log 30 minutes of play", target: 0.5, progress: 0.25, reward: 10 }),
          weekly: [quick("w1"), quick("w2"), quick("w3")],
        }),
      }),
    );
    render(<ChallengesPage />);
    const section = within(screen.getByTestId("quick-goals"));
    expect(section.getByText("Half an Hour")).toBeTruthy();
    expect(section.getByText("Log 30 minutes of play")).toBeTruthy();
    expect(section.getByText("0.2 / 0.5")).toBeTruthy();
    expect(section.getByText("All three weekly goals")).toBeTruthy();
    fireEvent.click(section.getAllByRole("button", { name: /Swap/ })[0]);
    expect(useStore.getState().swapQuickGoal).toHaveBeenCalledWith("d1");
  });

  it("hides Swap once it's used, and on finished goals", () => {
    act(() =>
      useStore.setState({
        challenges: state({
          daily: quick("d1", { cadence: "daily" }),
          dailySwapUsed: true,
          weekly: [quick("w1", { completedAt: NOW, progress: 5 }), quick("w2"), quick("w3")],
        }),
      }),
    );
    render(<ChallengesPage />);
    // Only the two unfinished weeklies can still swap.
    expect(within(screen.getByTestId("quick-goals")).getAllByRole("button", { name: /Swap/ })).toHaveLength(2);
  });

  it("offers the weekly sweep once all three are done", () => {
    act(() =>
      useStore.setState({
        challenges: state({
          weekly: [quick("w1", { completedAt: NOW, rewardPaidAt: NOW }), quick("w2", { completedAt: NOW, rewardPaidAt: NOW }), quick("w3", { completedAt: NOW, rewardPaidAt: NOW })],
          weeklyBonus: { id: "sweep", reward: 25, completedAt: NOW, rewardPaidAt: null },
        }),
      }),
    );
    render(<ChallengesPage />);
    fireEvent.click(within(screen.getByTestId("quick-goals")).getByRole("button", { name: /Claim \+25/ }));
    expect(useStore.getState().claimChallengeRewards).toHaveBeenCalledWith("sweep");
  });
});

describe("ChallengesPage — seasonal", () => {
  it("says when there's nothing running", () => {
    render(<ChallengesPage />);
    expect(screen.getByText(/No seasonal challenges right now/)).toBeTruthy();
  });

  it("shows a live event's goal, progress, badge and claim", () => {
    act(() =>
      useStore.setState({
        challenges: state({
          seasonal: [
            { id: "s1", name: "Autumn Push", description: "Log time this fall.", metric: "hours_logged",
              target: 10, startsAt: NOW - DAY, endsAt: NOW + 3 * DAY, reward: 40,
              badge: { name: "Autumn Champion", icon: "leaf" }, progress: 10, entryId: "u1",
              completedAt: NOW, rewardPaidAt: null },
          ],
        }),
      }),
    );
    render(<ChallengesPage />);
    const card = within(screen.getByTestId("seasonal-challenges"));
    expect(card.getByText("Autumn Push")).toBeTruthy();
    expect(card.getByText("Hours logged: 10")).toBeTruthy();
    expect(card.getByText(/3 days left/)).toBeTruthy();
    expect(card.getByText(/Autumn Champion badge/)).toBeTruthy();
    fireEvent.click(card.getByRole("button", { name: /Claim \+40/ }));
    expect(useStore.getState().claimChallengeRewards).toHaveBeenCalledWith("u1");
  });
});

describe("ChallengesPage — load failure", () => {
  it("offers Try again instead of loading forever", async () => {
    const fetchChallenges = vi.fn(async () => false);
    act(() => useStore.setState({ challenges: null, fetchChallenges }));
    render(<ChallengesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await vi.waitFor(() => expect(fetchChallenges).toHaveBeenCalledTimes(2));
  });
});

describe("ChallengesPage — offline", () => {
  it("explains that challenges need the cloud", () => {
    act(() => useStore.setState({ cloud: false }));
    render(<ChallengesPage />);
    expect(screen.getByText(/Challenges live in the cloud/)).toBeTruthy();
  });
});
