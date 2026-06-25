import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { OnboardingCoach } from "./OnboardingCoach";
import { useStore } from "../store";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Hollow Knight",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

const completeOnboarding = vi.fn(async () => {});

beforeEach(() => {
  completeOnboarding.mockClear();
  act(() =>
    useStore.setState({
      userId: "u1",
      sessionLoaded: true,
      vouchers: 2,
      games: [],
      onboardingCompletedAt: null,
      accountCreatedAt: Date.now(), // fresh signup by default
      completeOnboarding,
    }),
  );
});

describe("OnboardingCoach", () => {
  it("prompts a fresh player to add a game, and the CTA opens the add flow", () => {
    const onAddGame = vi.fn();
    render(<OnboardingCoach onAddGame={onAddGame} />);
    expect(screen.getByText(/Add a game you're playing/i)).toBeTruthy();
    expect(screen.getByText(/Step 1 of 2/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add a game/i }));
    expect(onAddGame).toHaveBeenCalled();
  });

  it("advances a fresh signup to the voucher step once a Bazaar game exists", () => {
    act(() => useStore.setState({ games: [game()] }));
    render(<OnboardingCoach onAddGame={() => {}} />);
    expect(screen.getByText(/Use a voucher to start it/i)).toBeTruthy();
    expect(screen.getByText(/Step 2 of 2/i)).toBeTruthy();
  });

  it("greets an EXISTING account granted a voucher with the contextual intro", () => {
    // Old account (created long ago) that already has games + a fresh voucher.
    act(() =>
      useStore.setState({
        accountCreatedAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
        games: [game()],
      }),
    );
    render(<OnboardingCoach onAddGame={() => {}} />);
    expect(screen.getByText(/You were granted a voucher/i)).toBeTruthy();
    // Not framed as a numbered step of the fresh sequence.
    expect(screen.queryByText(/Step 2 of 2/i)).toBeNull();
  });

  it("celebrates and finishes once a game is playing", () => {
    act(() => useStore.setState({ games: [game({ status: "playing" })], vouchers: 1 }));
    render(<OnboardingCoach onAddGame={() => {}} />);
    expect(screen.getByText(/You're all set/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Finish/i }));
    expect(completeOnboarding).toHaveBeenCalled();
  });

  it("can be skipped, marking it complete", () => {
    render(<OnboardingCoach onAddGame={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Skip tour/i }));
    expect(completeOnboarding).toHaveBeenCalled();
  });

  it("does not show once already completed", () => {
    act(() => useStore.setState({ onboardingCompletedAt: Date.now() }));
    const { container } = render(<OnboardingCoach onAddGame={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("never shows for an account with no vouchers", () => {
    act(() => useStore.setState({ vouchers: 0, games: [game()] }));
    const { container } = render(<OnboardingCoach onAddGame={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("stays hidden until the session has loaded (no mid auth-switch flash)", () => {
    // userId switched to a new account but its data hasn't landed yet, while the
    // previous account's vouchers linger — must not flash the tour.
    act(() => useStore.setState({ sessionLoaded: false, vouchers: 2, games: [] }));
    const { container } = render(<OnboardingCoach onAddGame={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
