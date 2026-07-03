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
const claimOnboardingVouchers = vi.fn(async () => {});

/** Fresh signup: tutorial phase pending, vouchers unclaimed, empty library. */
function freshSignup() {
  act(() =>
    useStore.setState({
      sessionLoaded: true,
      onboardingCompletedAt: null,
      onboardingVouchersPending: true,
      onboardingVouchersGrantedAt: null,
      onboardingVouchers: 2,
      vouchers: 0,
      coins: 120,
      isAdmin: false,
      games: [],
      completeOnboarding,
      claimOnboardingVouchers,
    }),
  );
}

/** Simulate the claim landing (optimistic mirror of claimOnboardingVouchers). */
function claimed(extra: Partial<Parameters<typeof useStore.setState>[0]> = {}) {
  act(() =>
    useStore.setState({ onboardingVouchersGrantedAt: Date.now(), vouchers: 2, ...extra }),
  );
}

beforeEach(() => {
  completeOnboarding.mockClear();
  claimOnboardingVouchers.mockClear();
  freshSignup();
});

describe("OnboardingCoach — fresh signup, passive cards", () => {
  it("opens with a welcome that explains the loop, before any vouchers are claimed", () => {
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText(/Welcome to Backlog Bazaar/i)).toBeTruthy();
    expect(screen.getByText(/earn coins/i)).toBeTruthy();
    expect(screen.queryByText(/Getting started/i)).toBeNull();
  });

  it("links the welcome to the How it works page", () => {
    const onHowItWorks = vi.fn();
    render(<OnboardingCoach onHowItWorks={onHowItWorks} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /how it works/i }));
    expect(onHowItWorks).toHaveBeenCalled();
  });

  it("advances to the primer (advertising the grant) and claims from its CTA", () => {
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /show me around/i }));
    expect(screen.getByText(/Five stops on your route/i)).toBeTruthy();
    expect(screen.getByText(/2 free vouchers/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /claim my vouchers/i }));
    expect(claimOnboardingVouchers).toHaveBeenCalled();
  });

  it("skipping on the welcome completes without claiming (compat grant path)", () => {
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
    expect(completeOnboarding).toHaveBeenCalled();
    expect(claimOnboardingVouchers).not.toHaveBeenCalled();
  });
});

describe("OnboardingCoach — the Getting Started checklist", () => {
  it("flips to the checklist when the claim lands, and resumes there on a fresh mount", () => {
    claimed();
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    // Straight to the checklist — no welcome replay after a reload.
    expect(screen.queryByText(/Welcome to Backlog Bazaar/i)).toBeNull();
    expect(screen.getByText(/Getting started · 0\/4/i)).toBeTruthy();
    expect(screen.getByText(/Add your first game/i)).toBeTruthy();
  });

  it("checks quests off live store state and advances the active quest", () => {
    claimed();
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);

    act(() => useStore.setState({ games: [game({ status: "backlog" })] }));
    expect(screen.getByText(/Getting started · 1\/4/i)).toBeTruthy();
    expect(screen.getByText(/Start it with a free voucher/i)).toBeTruthy();

    act(() => useStore.setState({ games: [game({ status: "playing" })] }));
    expect(screen.getByText(/Getting started · 2\/4/i)).toBeTruthy();
    expect(screen.getByText(/Log your first play session/i)).toBeTruthy();

    act(() => useStore.setState({ games: [game({ status: "playing", playedHours: 1.5 })] }));
    expect(screen.getByText(/Getting started · 3\/4/i)).toBeTruthy();
    expect(screen.getByText(/Finish your first game/i)).toBeTruthy();
  });

  it("talks coins on quest 2 when there are no vouchers to spend", () => {
    claimed({ vouchers: 0 });
    act(() => useStore.setState({ games: [game({ status: "backlog" })] }));
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText(/Start your first game/i)).toBeTruthy();
    expect(screen.queryByText(/free voucher/i)).toBeNull();
  });

  it("follows along: navigates to the active quest's board on entry and on completion", () => {
    const onNavigate = vi.fn();
    claimed();
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={onNavigate} />);
    expect(onNavigate).toHaveBeenCalledWith("backlog"); // quest 1
    act(() => useStore.setState({ games: [game({ status: "playing" })] }));
    expect(onNavigate).toHaveBeenCalledWith("playing"); // quest 3 became active
  });

  it("'Show me' navigates and docks to the progress pill, which re-expands on tap", () => {
    const onNavigate = vi.fn();
    claimed();
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: /show me/i }));
    expect(onNavigate).toHaveBeenCalledWith("backlog");
    // Docked: the rows are gone, the pill shows progress.
    expect(screen.queryByText(/Add your first game/i)).toBeNull();
    const pill = screen.getByRole("button", { name: /Getting started · 0\/4/i });
    fireEvent.click(pill);
    expect(screen.getByText(/Add your first game/i)).toBeTruthy();
  });

  it("pops back open when a quest completes while docked", () => {
    claimed();
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /show me/i })); // dock
    act(() => useStore.setState({ games: [game({ status: "backlog" })] }));
    // Quest 1 completed → the card re-expands showing the tick + next quest.
    expect(screen.getByText(/Getting started · 1\/4/i)).toBeTruthy();
    expect(screen.getByText(/Start it with a free voucher/i)).toBeTruthy();
  });

  it("skipping mid-checklist completes the tutorial", () => {
    claimed();
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
    expect(completeOnboarding).toHaveBeenCalled();
  });

  it("shows the finale once every quest is done, and Finish completes", () => {
    claimed();
    act(() =>
      useStore.setState({ games: [game({ status: "finished", playedHours: 12 })] }),
    );
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText(/That's the whole loop/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /finish/i }));
    expect(completeOnboarding).toHaveBeenCalled();
  });
});

describe("OnboardingCoach — existing account granted a voucher", () => {
  it("shows the short granted intro (no tutorial, no false celebration)", () => {
    // Even with a game already playing, it shows the intro — never an immediate
    // "you moved a game into Now Playing" celebration.
    act(() =>
      useStore.setState({
        onboardingVouchersPending: false,
        vouchers: 2,
        isAdmin: false,
        games: [game({ status: "playing" })],
      }),
    );
    render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText(/You were granted a voucher/i)).toBeTruthy();
    expect(screen.queryByText(/Getting started/i)).toBeNull();
    expect(screen.queryByText(/Welcome to Backlog Bazaar/i)).toBeNull();
  });

  it("does NOT pop up for an admin who holds/self-grants a voucher", () => {
    act(() =>
      useStore.setState({ onboardingVouchersPending: false, vouchers: 1, isAdmin: true }),
    );
    const { container } = render(<OnboardingCoach onHowItWorks={() => {}} onNavigate={() => {}} />);
    expect(container.firstChild).toBeNull();
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
