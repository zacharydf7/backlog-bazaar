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
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText(/Welcome to Backlog Bazaar/i)).toBeTruthy();
    expect(screen.getByText(/earn coins/i)).toBeTruthy();
  });

  it("links the welcome to the How it works page", () => {
    const onHowItWorks = vi.fn();
    render(<OnboardingCoach onHowItWorks={onHowItWorks} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /how it works/i }));
    expect(onHowItWorks).toHaveBeenCalled();
  });

  it("follows along on the board each card describes", () => {
    const onNavigate = vi.fn();
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /show me around/i })); // → bazaar
    expect(onNavigate).toHaveBeenCalledWith("backlog");
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // → now playing
    expect(onNavigate).toHaveBeenCalledWith("playing");
  });

  it("walks through the Bazaar + core cards to the demo and a finish that grants vouchers", () => {
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    // welcome → bazaar → now-playing → finished → wishlist → caravan → ledger → demo
    fireEvent.click(screen.getByRole("button", { name: /show me around/i }));
    expect(screen.getByText(/backlog shelf/i)).toBeTruthy(); // Bazaar — no longer skipped
    for (const heading of [
      /Where your active games live/i, // now playing
      /Games you've beaten/i, // finished — no longer "trophy shelf"
      /don't own yet/i, // wishlist
      /Discover new games/i, // caravan
      /whole collection at a glance/i, // ledger
      /Start a game with a voucher/i, // demo
    ]) {
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
      expect(screen.getByText(heading)).toBeTruthy();
    }
    // Demo is interactive: Buy & Start → Use voucher; the copy then confirms done.
    fireEvent.click(screen.getByRole("button", { name: /buy & start/i }));
    fireEvent.click(screen.getByRole("button", { name: /use voucher/i }));
    // The card copy updates to confirm the demo's done.
    expect(screen.getByText(/whole move/i)).toBeTruthy();
    // Advance to the finale — it advertises the amount about to be granted (2).
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/Enjoy the Bazaar/i)).toBeTruthy();
    expect(screen.getByText(/2 free vouchers/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /finish/i }));
    expect(completeOnboarding).toHaveBeenCalled();
  });

  it("can step back", () => {
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /show me around/i }));
    expect(screen.getByText(/backlog shelf/i)).toBeTruthy(); // Bazaar
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText(/Welcome to Backlog Bazaar/i)).toBeTruthy();
  });

  it("can be skipped, which completes the tour", () => {
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
    expect(completeOnboarding).toHaveBeenCalled();
  });
});

describe("OnboardingCoach — existing account granted a voucher", () => {
  it("shows the short granted intro (no full tour)", () => {
    act(() =>
      useStore.setState({ onboardingVouchersPending: false, vouchers: 2, games: [game()] }),
    );
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText(/You were granted a voucher/i)).toBeTruthy();
    // It's a single intro, not the numbered fresh tour.
    expect(screen.queryByText(/Where your active games live/i)).toBeNull();
  });
});

describe("OnboardingCoach — gating", () => {
  it("shows nothing for an account with no pending grant and no vouchers", () => {
    act(() => useStore.setState({ onboardingVouchersPending: false, vouchers: 0 }));
    const { container } = render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows nothing once completed", () => {
    act(() => useStore.setState({ onboardingCompletedAt: Date.now() }));
    const { container } = render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("stays hidden until the session has loaded", () => {
    act(() => useStore.setState({ sessionLoaded: false }));
    const { container } = render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
