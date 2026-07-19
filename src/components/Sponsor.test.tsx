import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { SponsorChip, BackGameButton } from "./Sponsor";
import { useStore, type ViewingSession } from "../store";
import type { Game } from "../types";
import type { Sponsorship } from "../lib/sponsorships";

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Outer Wilds",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

function stakeRow(over: Partial<Sponsorship> = {}): Sponsorship {
  return {
    id: "s1",
    sponsor: "u2",
    recipient: "me",
    sponsorName: "Ben",
    recipientName: "Me",
    gameId: "g1",
    gameTitle: "Outer Wilds",
    amount: 30,
    status: "active",
    createdAt: NOW - DAY,
    expiresAt: NOW + 10 * DAY,
    resolvedAt: null,
    ...over,
  };
}

const friendVisit = {
  userId: "u2",
  displayName: "Ben",
  games: [],
} as unknown as ViewingSession;

beforeEach(() => {
  act(() =>
    useStore.setState({
      cloud: true,
      userId: "me",
      coins: 100,
      viewing: null,
      friends: [{ id: "u2", displayName: "Ben", avatarUrl: null } as never],
      sponsorships: [],
      sponsorMaxStake: 50,
      sponsorMonthlyPairCap: 100,
      sponsorExpiryDays: 60,
    }),
  );
});

describe("SponsorChip (owner side)", () => {
  it("shows the summed active backings with the soonest expiry", () => {
    act(() =>
      useStore.setState({
        sponsorships: [stakeRow(), stakeRow({ id: "s2", amount: 10, expiresAt: NOW + 3 * DAY })],
      }),
    );
    render(<SponsorChip game={game()} />);
    expect(screen.getByText(/Backed \+40 · 3d left/)).toBeTruthy();
  });

  it("renders nothing when the game has no active backing", () => {
    act(() => useStore.setState({ sponsorships: [stakeRow({ status: "paid" })] }));
    const { container } = render(<SponsorChip game={game()} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("BackGameButton (visitor side)", () => {
  it("renders nothing when the visited player isn't a friend", () => {
    act(() =>
      useStore.setState({
        viewing: { ...friendVisit, userId: "stranger" } as ViewingSession,
      }),
    );
    const { container } = render(<BackGameButton game={game()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for non-backlog games and locked pre-orders", () => {
    act(() => useStore.setState({ viewing: friendVisit }));
    const { container: playing } = render(<BackGameButton game={game({ status: "playing" })} />);
    expect(playing.firstChild).toBeNull();
    const { container: preorder } = render(
      <BackGameButton game={game({ preorderedAt: NOW } as Partial<Game>)} />,
    );
    expect(preorder.firstChild).toBeNull();
  });

  it("shows my existing stake instead of the button", () => {
    act(() =>
      useStore.setState({
        viewing: friendVisit,
        sponsorships: [stakeRow({ sponsor: "me", recipient: "u2" })],
      }),
    );
    render(<BackGameButton game={game()} />);
    expect(screen.getByText(/You backed \+30/)).toBeTruthy();
  });

  it("opens the staking modal and submits a valid stake", async () => {
    const sponsorGame = vi.fn(async () => true);
    act(() => useStore.setState({ viewing: friendVisit, sponsorGame }));
    render(<BackGameButton game={game()} />);
    fireEvent.click(screen.getByText("Back it"));
    expect(screen.getByText(/Stake coins on this game/)).toBeTruthy();

    // An over-max amount blocks the submit; a valid one goes through.
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "500" } });
    const submit = screen.getByRole("button", { name: /Stake it/ });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "25" } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(sponsorGame).toHaveBeenCalledWith("g1", 25);
  });
});
