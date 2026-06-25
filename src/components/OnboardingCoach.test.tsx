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

beforeEach(() => {
  localStorage.clear();
  act(() => useStore.setState({ userId: "u1", vouchers: 2, games: [] }));
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

  it("advances to the voucher step once a Bazaar game exists", () => {
    act(() => useStore.setState({ games: [game()] }));
    render(<OnboardingCoach onAddGame={() => {}} />);
    expect(screen.getByText(/Use a voucher to start it/i)).toBeTruthy();
    expect(screen.getByText(/Step 2 of 2/i)).toBeTruthy();
  });

  it("celebrates and finishes once a game is playing", () => {
    act(() => useStore.setState({ games: [game({ status: "playing" })], vouchers: 1 }));
    render(<OnboardingCoach onAddGame={() => {}} />);
    expect(screen.getByText(/You're all set/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Finish/i }));
    // Completed → the coach disappears.
    expect(screen.queryByText(/You're all set/i)).toBeNull();
  });

  it("can be skipped, and stays gone", () => {
    render(<OnboardingCoach onAddGame={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Skip tour/i }));
    expect(screen.queryByText(/Add a game you're playing/i)).toBeNull();
  });

  it("never shows for an established account with no vouchers", () => {
    act(() => useStore.setState({ vouchers: 0, games: [game()] }));
    const { container } = render(<OnboardingCoach onAddGame={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
