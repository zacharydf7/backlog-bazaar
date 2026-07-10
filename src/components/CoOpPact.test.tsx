import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CoOpPactBanner, CoOpBadge } from "./CoOpPact";
import { useStore } from "../store";
import type { CoOpPact, Game } from "../types";

function pact(over: Partial<CoOpPact> = {}): CoOpPact {
  return {
    id: "p1",
    status: "active",
    gameKey: "r:7",
    title: "Hollow Knight",
    partnerId: "u2",
    partnerName: "Sam",
    partnerAvatar: null,
    myGameId: "g1",
    partnerGameId: "g9",
    iAmInviter: true,
    myFinishedAt: null,
    partnerFinishedAt: null,
    bonusPct: 25,
    createdAt: 100,
    endedAt: null,
    endedById: null,
    ...over,
  };
}

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Hollow Knight",
    status: "playing",
    rawgId: 7,
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

beforeEach(() => {
  act(() => useStore.setState({ coOpPacts: [], games: [], coins: 500, viewing: null }));
});

describe("CoOpPactBanner", () => {
  it("renders nothing when no pact touches the game", () => {
    render(<CoOpPactBanner game={game()} />);
    expect(screen.queryByTestId("coop-pact-banner")).toBeNull();
  });

  it("shows an incoming invite with Accept (priced for a Bazaar copy) and Decline", () => {
    const g = game({ status: "backlog" });
    act(() =>
      useStore.setState({
        games: [g],
        coOpPacts: [pact({ status: "pending", iAmInviter: false, myGameId: null })],
      }),
    );
    render(<CoOpPactBanner game={g} />);
    expect(screen.getByText(/Sam wants to finish this together/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Accept & start/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Decline/ })).toBeTruthy();
  });

  it("accepts through the store action with this card bound", async () => {
    const accept = vi.fn(async () => true);
    const g = game({ status: "playing" });
    act(() =>
      useStore.setState({
        games: [g],
        acceptCoOpPact: accept,
        coOpPacts: [pact({ status: "pending", iAmInviter: false, myGameId: null })],
      }),
    );
    render(<CoOpPactBanner game={g} />);
    // A copy already in Now Playing accepts without a fee.
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith("p1", "g1"));
  });

  it("dissolves an active pact behind a confirm that spells out the shelve", async () => {
    const dissolve = vi.fn(async () => true);
    const g = game();
    act(() =>
      useStore.setState({ games: [g], dissolveCoOpPact: dissolve, coOpPacts: [pact()] }),
    );
    render(<CoOpPactBanner game={g} />);
    fireEvent.click(screen.getByRole("button", { name: /Dissolve/ }));
    expect(screen.getByText(/shelves your copy back to the Bazaar/)).toBeTruthy();
    // The confirm dialog's button shares the label — it's the last one mounted.
    const buttons = screen.getAllByRole("button", { name: "Dissolve" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(dissolve).toHaveBeenCalledWith("p1"));
  });

  it("offers Withdraw (not Dissolve) on a pending outgoing invite", () => {
    const g = game({ status: "backlog" });
    act(() =>
      useStore.setState({
        games: [g],
        coOpPacts: [pact({ status: "pending", iAmInviter: true })],
      }),
    );
    render(<CoOpPactBanner game={g} />);
    expect(screen.getByText(/Waiting for Sam/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Withdraw/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull();
  });
});

describe("CoOpBadge", () => {
  it("names the partner on the chip", () => {
    render(<CoOpBadge pact={pact()} />);
    expect(screen.getByTitle(/Co-op Pact with Sam/)).toBeTruthy();
    expect(screen.getByText("Co-op")).toBeTruthy();
  });
});
