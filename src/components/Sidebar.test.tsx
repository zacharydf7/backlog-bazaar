import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { Sidebar, MobileNav, TopBar, type ChromeProps } from "./Sidebar";
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
    onProfile: () => {},
    onLeave: () => {},
    onMessageUser: () => {},
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
  aboutMe: null,
  bannerUrl: null,
  accent: null,
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

  it("adds Profile to the nav and a bottom-anchored Leave while visiting", () => {
    act(() => useStore.setState({ viewing: visit }));
    const views: string[] = [];
    let left = 0;
    render(
      <Sidebar
        {...chromeProps()}
        view="profile"
        setView={(v) => views.push(v)}
        onLeave={() => left++}
      />,
    );
    // Profile sits in the primary nav, highlighted on the visit landing.
    const profile = screen.getByRole("button", { name: /^Profile$/i });
    expect(profile.getAttribute("aria-current")).toBe("page");
    fireEvent.click(profile);
    expect(views).toEqual(["profile"]);
    // Leave is bottom-anchored where Sign out normally sits.
    const leave = screen.getByRole("button", { name: /^Leave$/i });
    expect(leave.closest(".mt-auto")).not.toBeNull();
    fireEvent.click(leave);
    expect(left).toBe(1);
  });

  it("names the visited player in the rail header (whose pages these are)", () => {
    act(() => useStore.setState({ viewing: visit }));
    const views: string[] = [];
    render(<Sidebar {...chromeProps()} setView={(v) => views.push(v)} />);
    expect(screen.getByText(/You're visiting/i)).toBeTruthy();
    const chip = screen.getByRole("button", { name: /You're visiting Other Player/i });
    fireEvent.click(chip);
    expect(views).toEqual(["profile"]);
  });

  it("shows neither Profile-in-nav nor Leave on your own pages", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<Sidebar {...chromeProps()} />);
    // Your own rail has "My Profile" in the utility section instead, and no Leave.
    expect(screen.queryByRole("button", { name: /^Profile$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Leave$/i })).toBeNull();
  });

  it("carries the retired banner's social actions: Add friend and Report (signed in)", () => {
    act(() =>
      useStore.setState({
        viewing: visit,
        cloud: true,
        userId: "u1",
        friends: [],
        friendRequests: [],
        fetchFriends: async () => {},
        fetchFriendRequests: async () => {},
      }),
    );
    render(<Sidebar {...chromeProps()} />);
    expect(screen.getByRole("button", { name: /Add friend/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Report$/i }));
    expect(screen.getByText(/Report player/i)).toBeTruthy();
  });

  it("offers Message instead once you're friends", () => {
    act(() =>
      useStore.setState({
        viewing: visit,
        cloud: true,
        userId: "u1",
        friends: [
          {
            id: "u2",
            displayName: "Other Player",
            avatarUrl: null,
            coins: null,
            lastSeenAt: null,
            activity: null,
            nowPlaying: null,
          },
        ],
        friendRequests: [],
        fetchFriends: async () => {},
        fetchFriendRequests: async () => {},
      }),
    );
    const messaged: string[] = [];
    render(<Sidebar {...chromeProps()} onMessageUser={(id) => messaged.push(id)} />);
    fireEvent.click(screen.getByRole("button", { name: /^Message$/i }));
    expect(messaged).toEqual(["u2"]);
    expect(screen.queryByRole("button", { name: /Add friend/i })).toBeNull();
  });

  it("hides the social actions while signed out, keeping Profile and Leave", () => {
    act(() => useStore.setState({ viewing: visit, cloud: false, userId: null }));
    render(<Sidebar {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /Add friend/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Report$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^Profile$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Leave$/i })).toBeTruthy();
  });
});

describe("MobileNav visiting tabs", () => {
  it("adds a Profile tab to the bottom bar while visiting", () => {
    act(() => useStore.setState({ viewing: visit }));
    const views: string[] = [];
    render(<MobileNav {...chromeProps()} setView={(v) => views.push(v)} />);
    fireEvent.click(screen.getByRole("button", { name: /^Profile$/i }));
    expect(views).toEqual(["profile"]);
  });

  it("has no Profile tab on your own bottom bar", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<MobileNav {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /^Profile$/i })).toBeNull();
  });

  it("puts a Leave icon in the mobile header while visiting (the banner is gone)", () => {
    act(() => useStore.setState({ viewing: visit }));
    let left = 0;
    render(<MobileNav {...chromeProps()} onLeave={() => left++} />);
    fireEvent.click(screen.getByRole("button", { name: /^Leave$/i }));
    expect(left).toBe(1);
  });
});

describe("Sidebar overflow layout", () => {
  it("pins the primary nav and confines scrolling to the utility section", () => {
    act(() => useStore.setState({ viewing: null }));
    const { container } = render(<Sidebar {...chromeProps()} />);
    // The primary nav (game boards + Master Ledger) must never spawn a
    // scrollbar — on short viewports the overflow belongs to the utility
    // section below it.
    const nav = container.querySelector("aside nav");
    expect(nav).not.toBeNull();
    expect(nav!.className).not.toMatch(/overflow-y-auto/);
    const scroller = screen
      .getByRole("button", { name: /Transaction Ledger/i })
      .closest(".overflow-y-auto");
    expect(scroller).not.toBeNull();
    // The scroll region holds only the utility rows, not the primary boards.
    expect(scroller!.contains(screen.getByRole("button", { name: "Bazaar" }))).toBe(false);
    // The utility section never collapses to nothing — past its floor the whole
    // rail scrolls (the aside fallback), so the menu stays reachable on even
    // the shortest windows.
    expect(scroller!.className).toMatch(/min-h-36/);
    const aside = container.querySelector("aside");
    expect(aside!.className).toMatch(/overflow-y-auto/);
  });

  it("keeps the tagline phrases atomic so a wrap never splits one mid-phrase", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<Sidebar {...chromeProps()} />);
    for (const phrase of ["Beat games", "Earn coins", "Play more"]) {
      const el = screen.getByText(phrase);
      expect(el.className).toMatch(/whitespace-nowrap/);
    }
  });
});

describe("MobileNav header branding", () => {
  it("shows the full wordmark and the tagline", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<MobileNav {...chromeProps()} />);
    // The full name (regression: the charter chip used to crowd it into an
    // ellipsis) and the tagline that was previously desktop-only.
    expect(screen.getByText("Backlog Bazaar")).toBeTruthy();
    expect(screen.getByText(/Beat · Earn · Play/i)).toBeTruthy();
  });

  it("keeps the brand but hides the wallet while visiting", () => {
    act(() => useStore.setState({ viewing: visit }));
    render(<MobileNav {...chromeProps()} />);
    expect(screen.getByText("Backlog Bazaar")).toBeTruthy();
    expect(screen.getByText(/Beat · Earn · Play/i)).toBeTruthy();
    expect(screen.queryByTitle(/Import Charters/i)).toBeNull();
    // The wallet's slot instead names whose pages these are.
    expect(screen.getByText(/You're visiting/i)).toBeTruthy();
    expect(screen.getByText("Other Player")).toBeTruthy();
  });
});

describe("Inbox entry points", () => {
  it("mobile shows a single consolidated inbox button when signed in", () => {
    act(() => useStore.setState({ viewing: null, cloud: true }));
    render(<MobileNav {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /^Inbox$/i })).not.toBeNull();
    // On the cramped phone header the three icons are consolidated into one.
    expect(screen.queryByRole("button", { name: /^Notifications$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Messages$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Friends and activity/i })).toBeNull();
  });

  it("mobile inbox button opens the default inbox tab", () => {
    act(() => useStore.setState({ viewing: null, cloud: true }));
    const tabs: (string | undefined)[] = [];
    render(<MobileNav {...chromeProps()} onOpenInbox={(t) => tabs.push(t)} />);
    fireEvent.click(screen.getByRole("button", { name: /^Inbox$/i }));
    expect(tabs).toEqual([undefined]);
  });

  it("mobile hides the inbox button when signed out (offline)", () => {
    act(() => useStore.setState({ viewing: null, cloud: false }));
    render(<MobileNav {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /^Inbox$/i })).toBeNull();
  });

  it("desktop keeps three separate buttons, each opening its own tab", () => {
    act(() => useStore.setState({ viewing: null, cloud: true }));
    const tabs: (string | undefined)[] = [];
    render(<TopBar {...chromeProps()} onOpenInbox={(t) => tabs.push(t)} />);
    // No single consolidated button on the roomy desktop top bar.
    expect(screen.queryByRole("button", { name: /^Inbox$/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Friends and activity/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Messages$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Notifications$/i }));
    expect(tabs).toEqual(["friends", "messages", "alerts"]);
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
