import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MasterLedger } from "./MasterLedger";
import { useStore, type ViewingSession } from "../store";
import type { Game } from "../types";

let seq = 0;
function game(over: Partial<Game> = {}): Game {
  seq += 1;
  return {
    id: `g${seq}`,
    title: `Game ${seq}`,
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: seq,
    ...over,
  } as Game;
}

function visit(over: Partial<ViewingSession> = {}): ViewingSession {
  return {
    userId: "u2",
    displayName: "Pat",
    avatarUrl: null,
    coins: 0,
    theme: null,
    gamesFinished: 0,
    hoursFinished: 0,
    hideSpend: false,
    lastSeenAt: null,
    activity: null,
    badges: [],
    title: null,
    games: [],
    ...over,
  };
}

beforeEach(() => {
  act(() => useStore.setState({ viewing: null, games: [] }));
});

describe("MasterLedger", () => {
  it("aggregates owned games and excludes wishlist", () => {
    act(() =>
      useStore.setState({
        games: [
          game({ title: "Owned Finished", status: "finished" }),
          game({ title: "Owned Backlog", status: "backlog" }),
          game({ title: "Wished For", status: "wishlist" }),
        ],
      }),
    );
    render(<MasterLedger />);

    expect(screen.getByText("Owned Finished")).not.toBeNull();
    expect(screen.getByText("Owned Backlog")).not.toBeNull();
    // Wishlist items represent unowned assets — never shown in the Ledger.
    expect(screen.queryByText("Wished For")).toBeNull();
  });

  it("shows library-health metrics (owned total + completion %)", () => {
    act(() =>
      useStore.setState({
        games: [
          game({ status: "finished" }),
          game({ status: "backlog" }),
          game({ status: "wishlist" }), // excluded from both count and %
        ],
      }),
    );
    render(<MasterLedger />);

    expect(screen.getByText("Games owned")).not.toBeNull();
    expect(screen.getByText("Completed")).not.toBeNull();
    // 1 finished of 2 owned = 50%.
    expect(screen.getByText("50%")).not.toBeNull();
  });

  it("invites the player to start a collection when nothing is owned", () => {
    act(() => useStore.setState({ games: [game({ status: "wishlist" })] }));
    render(<MasterLedger />);
    expect(screen.getByText(/Nothing in your collection yet/i)).not.toBeNull();
  });

  it("shows the visited player's collection (not your own) while visiting", () => {
    act(() =>
      useStore.setState({
        games: [game({ title: "My Own Game", status: "finished" })],
        viewing: visit({
          displayName: "Pat",
          games: [game({ title: "Pat's Game", status: "backlog" })],
        }),
      }),
    );
    render(<MasterLedger />);

    expect(screen.getByText(/Pat's Master Ledger/)).not.toBeNull();
    expect(screen.getByText("Pat's Game")).not.toBeNull();
    // Your own library must not bleed into a visited ledger.
    expect(screen.queryByText("My Own Game")).toBeNull();
  });
});
