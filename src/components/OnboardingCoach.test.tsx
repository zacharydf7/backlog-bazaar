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

/** Fresh signup: vouchers pending, not completed, loaded. */
function freshSignup() {
  act(() =>
    useStore.setState({
      sessionLoaded: true,
      onboardingCompletedAt: null,
      onboardingVouchersPending: true,
      onboardingVouchers: 2,
      vouchers: 0,
      games: [],
      completeOnboarding,
    }),
  );
}

beforeEach(() => {
  completeOnboarding.mockClear();
  freshSignup();
});

describe("OnboardingCoach — fresh signup tour", () => {
  it("opens with a welcome that explains the loop, before any vouchers are granted", () => {
    render(<OnboardingCoach onHowItWorks={() => {}} />);
    expect(screen.getByText(/Welcome to Backlog Bazaar/i)).toBeTruthy();
    expect(screen.getByText(/earn coins/i)).toBeTruthy();
  });

  it("links the welcome to the How it works page", () => {
    const onHowItWorks = vi.fn();
    render(<OnboardingCoach onHowItWorks={onHowItWorks} />);
    fireEvent.click(screen.getByRole("button", { name: /how it works/i }));
    expect(onHowItWorks).toHaveBeenCalled();
  });

  it("walks through the core-feature cards to the demo and a finish that grants vouchers", () => {
    render(<OnboardingCoach onHowItWorks={() => {}} />);
    // welcome → now-playing → finished → wishlist → caravan → ledger → demo
    fireEvent.click(screen.getByRole("button", { name: /show me around/i }));
    expect(screen.getByText(/Where your active games live/i)).toBeTruthy();
    for (const heading of [
      /trophy shelf/i,
      /don't own yet/i, // wishlist
      /Discover new games/i, // caravan
      /whole collection at a glance/i, // ledger
      /Start a game with a voucher/i, // demo
    ]) {
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
      expect(screen.getByText(heading)).toBeTruthy();
    }
    // Demo is interactive: Buy & Start → Use voucher.
    fireEvent.click(screen.getByRole("button", { name: /buy & start/i }));
    fireEvent.click(screen.getByRole("button", { name: /use voucher/i }));
    expect(screen.getByText(/Now Playing — that's it/i)).toBeTruthy();
    // Advance to the finale and finish.
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/Enjoy the Bazaar/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /finish/i }));
    expect(completeOnboarding).toHaveBeenCalled();
  });

  it("can step back", () => {
    render(<OnboardingCoach onHowItWorks={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /show me around/i }));
    expect(screen.getByText(/Where your active games live/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText(/Welcome to Backlog Bazaar/i)).toBeTruthy();
  });

  it("can be skipped, which completes the tour", () => {
    render(<OnboardingCoach onHowItWorks={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
    expect(completeOnboarding).toHaveBeenCalled();
  });
});

describe("OnboardingCoach — existing account granted a voucher", () => {
  it("shows the short granted intro (no full tour)", () => {
    act(() =>
      useStore.setState({ onboardingVouchersPending: false, vouchers: 2, games: [game()] }),
    );
    render(<OnboardingCoach onHowItWorks={() => {}} />);
    expect(screen.getByText(/You were granted a voucher/i)).toBeTruthy();
    // It's a single intro, not the numbered fresh tour.
    expect(screen.queryByText(/Where your active games live/i)).toBeNull();
  });
});

describe("OnboardingCoach — gating", () => {
  it("shows nothing for an account with no pending grant and no vouchers", () => {
    act(() => useStore.setState({ onboardingVouchersPending: false, vouchers: 0 }));
    const { container } = render(<OnboardingCoach onHowItWorks={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows nothing once completed", () => {
    act(() => useStore.setState({ onboardingCompletedAt: Date.now() }));
    const { container } = render(<OnboardingCoach onHowItWorks={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("stays hidden until the session has loaded", () => {
    act(() => useStore.setState({ sessionLoaded: false }));
    const { container } = render(<OnboardingCoach onHowItWorks={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
