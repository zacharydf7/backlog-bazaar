import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CoOpPactBanner, CoOpBadge, PactJoinModal, PactInviteStrip } from "./CoOpPact";
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
    partnerHours: null,
    coversFee: false,
    giftedFee: null,
    partnerGameImage: null,
    partnerGameHours: null,
    partnerGamePlatform: null,
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

  it("names the both-finished bonus on an active pact (economy phase)", () => {
    const g = game();
    act(() => useStore.setState({ games: [g], coOpPacts: [pact({ bonusPct: 30 })] }));
    render(<CoOpPactBanner game={g} />);
    expect(screen.getByText(/\+30% bounty each when you both finish/)).toBeTruthy();
  });

  it("shows the partner's logged hours on an active pact (relative progress)", () => {
    const g = game();
    act(() =>
      useStore.setState({ games: [g], coOpPacts: [pact({ partnerHours: 12.5 })] }),
    );
    render(<CoOpPactBanner game={g} />);
    expect(screen.getByText(/12h 30m in/)).toBeTruthy();
  });

  it("lifts the coin gate and names the payer when the inviter covers the fee", () => {
    const g = game({ status: "backlog" });
    act(() =>
      useStore.setState({
        games: [g],
        coins: 0, // broke — but the fee is on Sam
        coOpPacts: [
          pact({ status: "pending", iAmInviter: false, myGameId: null, coversFee: true }),
        ],
      }),
    );
    render(<CoOpPactBanner game={g} />);
    const accept = screen.getByRole("button", { name: /fee on Sam/ });
    expect((accept as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/Not enough coins/)).toBeNull();
  });

  it("routes a wishlist-only entry's invite through the Player 2 join flow", () => {
    const g = game({ status: "wishlist" });
    act(() =>
      useStore.setState({
        games: [g],
        coOpPacts: [pact({ status: "pending", iAmInviter: false, myGameId: null })],
      }),
    );
    render(<CoOpPactBanner game={g} />);
    fireEvent.click(screen.getByRole("button", { name: /Review invite/ }));
    expect(screen.getByText(/Player 2/)).toBeTruthy();
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

  it("reads as waiting while the invite is pending", () => {
    render(<CoOpBadge pact={pact({ status: "pending" })} />);
    expect(screen.getByTitle(/Waiting for Sam to accept/)).toBeTruthy();
    expect(screen.getByText(/Co-op · invited/)).toBeTruthy();
  });
});

describe("PactJoinModal (Player 2 join)", () => {
  const invite = () =>
    pact({
      status: "pending",
      iAmInviter: false,
      myGameId: null,
      partnerGameHours: 30,
      partnerGamePlatform: "PlayStation 5",
    });

  it("pitches the Player 2 copy with the inviter's platform and an activation fee", () => {
    render(<PactJoinModal pact={invite()} onClose={() => {}} />);
    expect(screen.getByText(/Player 2/)).toBeTruthy();
    expect(screen.getByText(/PlayStation 5/)).toBeTruthy();
    expect(screen.getByText(/Activation fee:/)).toBeTruthy();
  });

  it("accepts through joinCoOpPact", async () => {
    const join = vi.fn(async () => true);
    act(() => useStore.setState({ joinCoOpPact: join }));
    render(<PactJoinModal pact={invite()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Accept & start/ }));
    await waitFor(() => expect(join).toHaveBeenCalledWith("p1"));
  });

  it("shows the fee as covered (and accepts while broke) when the inviter offered", () => {
    act(() => useStore.setState({ coins: 0 }));
    render(<PactJoinModal pact={{ ...invite(), coversFee: true }} onClose={() => {}} />);
    expect(screen.getByText(/covered by Sam/)).toBeTruthy();
    const accept = screen.getByRole("button", { name: /Accept & start/ });
    expect((accept as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("PactInviteStrip", () => {
  it("lists pending invites for games not in the library and opens the join modal", () => {
    act(() =>
      useStore.setState({
        coOpPacts: [pact({ status: "pending", iAmInviter: false, myGameId: null })],
        games: [], // nothing owned — a Player 2 invite
      }),
    );
    render(<PactInviteStrip />);
    expect(screen.getByText("Pact invites")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Hollow Knight/ }));
    expect(screen.getByText(/Player 2/)).toBeTruthy();
  });

  it("renders nothing when the invite's game is already owned (the card banner hosts it)", () => {
    act(() =>
      useStore.setState({
        coOpPacts: [pact({ status: "pending", iAmInviter: false, myGameId: null })],
        games: [game({ status: "backlog" })],
      }),
    );
    const { container } = render(<PactInviteStrip />);
    expect(container.firstChild).toBeNull();
  });
});
