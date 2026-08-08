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
    onImportCsv: () => {},
    onMasterLedger: () => {},
    onTransactionLedger: () => {},
    onCommunity: () => {},
    onCommunityMessages: () => {},
    onShop: () => {},
    onAchievements: () => {},
    onLists: () => {},
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
    onOpenAlerts: () => {},
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
  cosmetics: { frame: null, stall: null, coin: null },
  economyEnabled: true,
  lastSeenAt: null,
  activity: null,
  playingTitle: null,
  playingSince: null,
  badges: [],
  title: null,
  aboutMe: null,
  bannerUrl: null,
  accent: null,
  bg: null,
  games: [],
};

afterEach(() => {
  act(() =>
    useStore.setState({
      viewing: null,
      cloud: false,
      notifications: [],
      friendRequestCount: 0,
      unreadMessageCount: 0,
    }),
  );
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
            playingTitle: null,
            playingSince: null,
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

describe("MobileNav chrome height", () => {
  it("publishes its live height to --mobile-chrome-h for sticky sub-bars (7df3dd85)", () => {
    // jsdom has no layout (offsetHeight is always 0), so stub a real height to
    // prove the header measures itself and republishes the var; the actual
    // height tracking is browser-only and covered by the MasterLedger consumer.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 140,
    });
    try {
      act(() => useStore.setState({ viewing: null }));
      render(<MobileNav {...chromeProps()} />);
      expect(document.documentElement.style.getPropertyValue("--mobile-chrome-h")).toBe("140px");
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
      document.documentElement.style.removeProperty("--mobile-chrome-h");
    }
  });
});

describe("Community & alerts entry points", () => {
  it("mobile header keeps a bell (alerts only) when signed in", () => {
    act(() => useStore.setState({ viewing: null, cloud: true }));
    render(<MobileNav {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /^Notifications$/i })).not.toBeNull();
    // The old consolidated Inbox toggle is gone — social lives on the
    // Community page, not behind the bell.
    expect(screen.queryByRole("button", { name: /^Inbox$/i })).toBeNull();
  });

  it("mobile bell opens the notifications drawer", () => {
    act(() => useStore.setState({ viewing: null, cloud: true }));
    let opened = 0;
    render(<MobileNav {...chromeProps()} onOpenAlerts={() => opened++} />);
    fireEvent.click(screen.getByRole("button", { name: /^Notifications$/i }));
    expect(opened).toBe(1);
  });

  it("mobile bell badges unread alerts ONLY (messages/requests don't count)", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        notifications: [],
        unreadMessageCount: 4,
        friendRequestCount: 2,
      }),
    );
    render(<MobileNav {...chromeProps()} />);
    const bell = screen.getByRole("button", { name: /^Notifications$/i });
    // No unread notifications → no badge, whatever the social counts say.
    expect(bell.textContent).toBe("");
  });

  it("mobile hides the bell when signed out (offline)", () => {
    act(() => useStore.setState({ viewing: null, cloud: false }));
    render(<MobileNav {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /^Notifications$/i })).toBeNull();
  });

  it("pins Community in the desktop primary nav, badging requests + unread chats", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        friendRequestCount: 2,
        unreadMessageCount: 1,
      }),
    );
    let opened = 0;
    const { container } = render(<Sidebar {...chromeProps()} onCommunity={() => opened++} />);
    const row = screen.getByRole("button", { name: /Community/i });
    // It sits in the pinned primary nav (with the boards), not the scrolling
    // utility section — one click from anywhere.
    expect(container.querySelector("aside nav")!.contains(row)).toBe(true);
    expect(row.textContent).toContain("3");
    fireEvent.click(row);
    expect(opened).toBe(1);
  });

  it("hides the Community row while visiting (it's YOUR social home)", () => {
    act(() => useStore.setState({ viewing: visit, cloud: true }));
    render(<Sidebar {...chromeProps()} />);
    expect(screen.queryByRole("button", { name: /^Community$/i })).toBeNull();
  });

  it("mobile bottom bar: Community replaces Ledger on your own pages", () => {
    act(() =>
      useStore.setState({ viewing: null, cloud: true, friendRequestCount: 1, unreadMessageCount: 0 }),
    );
    let opened = 0;
    render(<MobileNav {...chromeProps()} onCommunity={() => opened++} />);
    const tab = screen.getByRole("button", { name: /Community/i });
    expect(tab.textContent).toContain("1");
    fireEvent.click(tab);
    expect(opened).toBe(1);
    // The Ledger tab yielded its slot; the Master Ledger moved into the sheet.
    expect(screen.queryByRole("button", { name: /^Ledger$/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    expect(screen.getByRole("button", { name: /Master Ledger/i })).toBeTruthy();
  });

  it("mobile bottom bar keeps THEIR Ledger while visiting (no Community tab)", () => {
    act(() => useStore.setState({ viewing: visit, cloud: true }));
    render(<MobileNav {...chromeProps()} />);
    expect(screen.getByRole("button", { name: /^Ledger$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Community/i })).toBeNull();
  });

  it("doesn't highlight YOUR account button while viewing a visited profile", () => {
    act(() => useStore.setState({ viewing: visit, cloud: true, displayName: "Me" }));
    render(<TopBar {...chromeProps()} view="profile" />);
    const account = screen.getByText("Me").closest("button") as HTMLElement;
    expect(account.className).not.toContain("border-accent");
  });

  it("highlights your account button on your own profile", () => {
    act(() => useStore.setState({ viewing: null, cloud: true, displayName: "Me" }));
    render(<TopBar {...chromeProps()} view="profile" />);
    const account = screen.getByText("Me").closest("button") as HTMLElement;
    expect(account.className).toContain("border-accent");
  });

  it("desktop top bar keeps the Messages shortcut and the bell — Community lives in the rail", () => {
    act(() => useStore.setState({ viewing: null, cloud: true }));
    const hits: string[] = [];
    render(
      <TopBar
        {...chromeProps()}
        onCommunityMessages={() => hits.push("messages")}
        onOpenAlerts={() => hits.push("alerts")}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Community$/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Messages$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Notifications$/i }));
    expect(hits).toEqual(["messages", "alerts"]);
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

  it("opens the Add menu with all three choices when tapped", () => {
    act(() => useStore.setState({ viewing: null }));
    render(<MobileNav {...chromeProps()} view="wishlist" />);
    fireEvent.click(screen.getByRole("button", { name: /Add a game or compilation/i }));
    // Exact names so the toggle ("Add a game or compilation") isn't also matched.
    expect(screen.getByRole("button", { name: "Add a game" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a compilation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import from CSV" })).toBeTruthy();
  });
});

describe("Sidebar economy-off mode", () => {
  it("hides the wallet chips and the Transaction Ledger row", () => {
    act(() => useStore.setState({ viewing: null, economyEnabled: false }));
    render(<Sidebar {...chromeProps()} />);
    expect(screen.queryByTitle(/transaction ledger/i)).toBeNull();
    expect(screen.queryByTitle(/Import Charters/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Transaction Ledger/i })).toBeNull();
    // The rest of the chrome is untouched.
    expect(screen.queryByRole("button", { name: /Add games/i })).not.toBeNull();
    act(() => useStore.setState({ economyEnabled: true }));
  });
});
