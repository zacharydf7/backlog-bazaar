import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Sidebar, MobileNav, type ChromeProps } from "./Sidebar";
import { useStore, type ViewingSession } from "../store";

function chromeProps(): ChromeProps {
  return {
    view: "backlog",
    setView: () => {},
    seenReleaseId: null,
    onAdd: () => {},
    onLedger: () => {},
    onLeaderboard: () => {},
    onRequests: () => {},
    onUsers: () => {},
    onEconomy: () => {},
    onAccount: () => {},
    onReleaseNotes: () => {},
    onAbout: () => {},
    onNotificationNavigate: () => {},
  };
}

const visit: ViewingSession = {
  userId: "u2",
  displayName: "Other Player",
  avatarUrl: null,
  coins: 999,
  theme: null,
  gamesFinished: 0,
  hoursFinished: 0,
  hideSpend: false,
  lastSeenAt: null,
  activity: null,
  games: [],
};

afterEach(() => {
  act(() => useStore.setState({ viewing: null }));
});

describe("Sidebar visiting state", () => {
  it("shows your-account chrome on your own pages", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<Sidebar {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /Add games/i })).not.toBeNull();
    expect(screen.queryByText(/^Wallet$/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /The Caravan/i })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /How it works/i })).not.toBeNull();
  });

  it("hides Add games, The Caravan, the wallet, and utility pages while visiting", () => {
    act(() => useStore.setState({ viewing: visit }));
    render(<Sidebar {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /Add games/i })).toBeNull();
    expect(screen.queryByText(/^Wallet$/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /The Caravan/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /How it works/i })).toBeNull();
    // The game boards stay reachable so you can browse their library.
    expect(screen.queryByRole("button", { name: /Finished/i })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Wishlist/i })).not.toBeNull();
  });
});

describe("MobileNav Add button context", () => {
  it("shows the Add button on a game board", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<MobileNav {...chromeProps()} view="wishlist" />);
    expect(screen.queryByRole("button", { name: /Add games/i })).not.toBeNull();
  });

  it("hides the Add button on a utility page where adding a game makes no sense", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<MobileNav {...chromeProps()} view="requests" />);
    expect(screen.queryByRole("button", { name: /Add games/i })).toBeNull();
  });
});
