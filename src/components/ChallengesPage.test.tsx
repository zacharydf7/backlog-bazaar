import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ChallengesPage } from "./ChallengesPage";
import { useStore } from "../store";
import type { ChallengesState } from "../lib/challenges";

const NOW = Date.now();
const DAY = 86_400_000;

function state(over: Partial<ChallengesState> = {}): ChallengesState {
  return {
    month: "2026-10-01",
    endsAt: NOW + 10 * DAY,
    goalReward: 25,
    setBonus: 50,
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
    ...over,
  };
}

beforeEach(() => {
  act(() =>
    useStore.setState({
      cloud: true,
      economyEnabled: true,
      challenges: state(),
      fetchChallenges: vi.fn(async () => {}),
      evaluateChallenges: vi.fn(async () => {}),
      pickMonthlyGoal: vi.fn(async () => {}),
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

describe("ChallengesPage — offline", () => {
  it("explains that challenges need the cloud", () => {
    act(() => useStore.setState({ cloud: false }));
    render(<ChallengesPage />);
    expect(screen.getByText(/Challenges live in the cloud/)).toBeTruthy();
  });
});
