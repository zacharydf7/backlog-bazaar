import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { Sidebar, MobileNav, type ChromeProps } from "./Sidebar";
import { useStore, type ViewingSession } from "../store";

function chromeProps(): ChromeProps {
  return {
    view: "backlog",
    setView: () => {},
    seenReleaseId: null,
    searchQuery: "",
    onSearchChange: () => {},
    onOpenSearch: () => {},
    onAdd: () => {},
    onAddCompilation: () => {},
    onMasterLedger: () => {},
    onTransactionLedger: () => {},
    onLeaderboard: () => {},
    onRequests: () => {},
    onAdmin: () => {},
    onMySubmissions: () => {},
    onAccount: () => {},
    onReleaseNotes: () => {},
    onAbout: () => {},
    onPrivacy: () => {},
    onOpenInbox: () => {},
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
  badges: [],
  title: null,
  games: [],
};

afterEach(() => {
  act(() => useStore.setState({ viewing: null, cloud: false }));
});

describe("Sidebar visiting state", () => {
  it("shows your-account chrome on your own pages", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<Sidebar {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /Add games/i })).not.toBeNull();
    // The wallet chips (coins + charters) show on your own pages.
    expect(screen.queryByTitle(/transaction ledger/i)).not.toBeNull();
    expect(screen.queryByTitle(/Import Charters/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /The Caravan/i })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /How it works/i })).not.toBeNull();
    // The Privacy policy is reachable from the utility section.
    expect(screen.queryByRole("button", { name: /Privacy/i })).not.toBeNull();
    // The Master Ledger sits in the primary nav alongside the game boards.
    expect(screen.queryByRole("button", { name: /Master Ledger/i })).not.toBeNull();
  });

  it("hides Add games, The Caravan, the wallet, and utility pages while visiting", () => {
    act(() => useStore.setState({ viewing: visit }));
    render(<Sidebar {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /Add games/i })).toBeNull();
    // The wallet chips are hidden while visiting someone else's Bazaar.
    expect(screen.queryByTitle(/transaction ledger/i)).toBeNull();
    expect(screen.queryByTitle(/Import Charters/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /The Caravan/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /How it works/i })).toBeNull();
    // The game boards stay reachable so you can browse their library.
    expect(screen.queryByRole("button", { name: /Finished/i })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Wishlist/i })).not.toBeNull();
    // …as does the Master Ledger, so you can view their whole collection.
    expect(screen.queryByRole("button", { name: /Master Ledger/i })).not.toBeNull();
  });
});

describe("MobileNav header branding", () => {
  it("shows the full wordmark and the tagline", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<MobileNav {...chromeProps()} />);
    // The full name (regression: the charter chip used to crowd it into an
    // ellipsis) and the tagline that was previously desktop-only.
    expect(screen.getByText("Backlog Bazaar")).toBeTruthy();
    expect(screen.getByText(/Beat Games\. Earn Coins\. Play More\./i)).toBeTruthy();
  });

  it("keeps the brand but hides the wallet while visiting", () => {
    act(() => useStore.setState({ viewing: visit }));
    render(<MobileNav {...chromeProps()} />);
    expect(screen.getByText("Backlog Bazaar")).toBeTruthy();
    expect(screen.getByText(/Beat Games/i)).toBeTruthy();
    expect(screen.queryByTitle(/Import Charters/i)).toBeNull();
  });
});

describe("Unified inbox button", () => {
  it("renders a single inbox button (no separate friends/messages icons) when signed in", () => {
    act(() => useStore.setState({ viewing: null, cloud: true }));
    render(<MobileNav {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /^Inbox$/i })).not.toBeNull();
    // The three old top-bar icons are consolidated away.
    expect(screen.queryByRole("button", { name: /^Notifications$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Messages$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Friends and activity/i })).toBeNull();
  });

  it("invokes onOpenInbox when tapped", () => {
    act(() => useStore.setState({ viewing: null, cloud: true }));
    let opened = 0;
    render(<MobileNav {...chromeProps()} onOpenInbox={() => (opened += 1)} />);
    fireEvent.click(screen.getByRole("button", { name: /^Inbox$/i }));
    expect(opened).toBe(1);
  });

  it("hides the inbox button when signed out (offline)", () => {
    act(() => useStore.setState({ viewing: null, cloud: false }));
    render(<MobileNav {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /^Inbox$/i })).toBeNull();
  });
});

describe("MobileNav Add button context", () => {
  it("shows the consolidated Add button on a game board", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<MobileNav {...chromeProps()} view="wishlist" />);
    expect(
      screen.queryByRole("button", { name: /Add a game or compilation/i }),
    ).not.toBeNull();
  });

  it("hides the Add button on a utility page where adding a game makes no sense", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<MobileNav {...chromeProps()} view="requests" />);
    expect(
      screen.queryByRole("button", { name: /Add a game or compilation/i }),
    ).toBeNull();
  });

  it("opens the Add menu with both choices when tapped", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<MobileNav {...chromeProps()} view="wishlist" />);
    fireEvent.click(screen.getByRole("button", { name: /Add a game or compilation/i }));
    // Exact names so the toggle ("Add a game or compilation") isn't also matched.
    expect(screen.getByRole("button", { name: "Add a game" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a compilation" })).toBeTruthy();
  });
});
