import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CommunityPage } from "./CommunityPage";
import { useStore } from "../../store";
import type { ActivityEvent, Friend, FriendRequest } from "../../types";

// jsdom has no scrollIntoView; the thread view keeps the newest message in view.
window.HTMLElement.prototype.scrollIntoView =
  window.HTMLElement.prototype.scrollIntoView ?? (() => {});

const NOW = Date.now();

function friend(over: Partial<Friend> = {}): Friend {
  return {
    id: "u2",
    displayName: "Ana",
    avatarUrl: null,
    coins: 120,
    lastSeenAt: null,
    activity: null,
    playingTitle: null,
    playingSince: null,
    nowPlaying: "Hades",
    ...over,
  };
}

function request(over: Partial<FriendRequest> = {}): FriendRequest {
  return {
    id: "r1",
    direction: "incoming",
    otherId: "u3",
    otherName: "Ben",
    otherAvatar: null,
    createdAt: NOW - 60_000,
    ...over,
  };
}

function ev(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "e1",
    actor: "u2",
    actorName: "Ana",
    actorAvatar: null,
    kind: "bounty_claimed",
    gameTitle: "Hollow Knight",
    detail: { coins: 40 },
    createdAt: NOW - 60_000,
    cheerCount: 0,
    cheeredByMe: false,
    ...over,
  };
}

function pageProps() {
  return {
    onNavigate: vi.fn(),
    dmTarget: null,
    onMessageUser: vi.fn(),
  };
}

beforeEach(() => {
  act(() =>
    useStore.setState({
      userId: "me",
      cloud: true,
      games: [],
      friends: [],
      friendRequests: [],
      friendRequestCount: 0,
      unreadMessageCount: 0,
      feed: [],
      feedHasMore: false,
      feedLoadingMore: false,
      conversations: [],
      conversationsLoading: false,
      fetchFriends: vi.fn(async () => {}),
      fetchFriendRequests: vi.fn(async () => {}),
      fetchFeed: vi.fn(async () => {}),
      fetchConversations: vi.fn(async () => {}),
      fetchUnreadMessageCount: vi.fn(async () => {}),
      // Never resolves: the Market Square directory stays in its quiet
      // "Loading…" state so no post-assertion setState fires an act() warning.
      fetchLeaderboard: vi.fn(() => new Promise<never>(() => {})),
      fetchSquare: vi.fn(async () => {}),
      squareFeed: [],
      squareFeedHasMore: false,
      squareFeedLoadingMore: false,
      squareReviews: [],
      squareSpotlight: null,
      squareTrending: null,
      squareLists: null,
    }),
  );
});

describe("CommunityPage shell", () => {
  it("opens on Friends by default, with the player search front and center", () => {
    render(<CommunityPage view="community" {...pageProps()} />);
    expect(screen.getByPlaceholderText(/Find players by name/i)).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Friends/i }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("navigates between sections via the tab bar (each its own route)", () => {
    const props = pageProps();
    render(<CommunityPage view="community" {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: /Activity/i }));
    fireEvent.click(screen.getByRole("tab", { name: /Messages/i }));
    fireEvent.click(screen.getByRole("tab", { name: /Market Square/i }));
    expect(props.onNavigate.mock.calls.map((c) => c[0])).toEqual([
      "community-activity",
      "community-messages",
      "community-discover",
    ]);
  });

  it("badges Friends with incoming requests and Messages with unread chats", () => {
    act(() => useStore.setState({ friendRequestCount: 2, unreadMessageCount: 11 }));
    render(<CommunityPage view="community" {...pageProps()} />);
    expect(screen.getByRole("tab", { name: /Friends/i }).textContent).toContain("2");
    // Counts cap at 9+ like the other badge chips.
    expect(screen.getByRole("tab", { name: /Messages/i }).textContent).toContain("9+");
    expect(screen.getByRole("tab", { name: /Market Square/i }).textContent).not.toMatch(/\d/);
  });
});

describe("Friends section", () => {
  it("lists incoming requests with inline Accept and Decline", () => {
    const respond = vi.fn(async () => true);
    act(() =>
      useStore.setState({ friendRequests: [request()], respondFriendRequest: respond }),
    );
    render(<CommunityPage view="community" {...pageProps()} />);
    expect(screen.getByText(/Friend requests/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Accept/i }));
    expect(respond).toHaveBeenCalledWith("r1", true);
    fireEvent.click(screen.getByRole("button", { name: /Decline/i }));
    expect(respond).toHaveBeenCalledWith("r1", false);
  });

  it("messages a friend via the row's mail action", () => {
    const props = pageProps();
    act(() => useStore.setState({ friends: [friend()] }));
    render(<CommunityPage view="community" {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Message Ana/i }));
    expect(props.onMessageUser).toHaveBeenCalledWith("u2", "Ana");
  });

  it("visits a friend's profile by selecting the row itself", () => {
    const visit = vi.fn(async () => {});
    act(() => useStore.setState({ friends: [friend()], openUserBazaar: visit }));
    render(<CommunityPage view="community" {...pageProps()} />);
    fireEvent.click(screen.getByTitle(/Visit Ana's profile/i));
    expect(visit).toHaveBeenCalledWith("u2");
  });

  it("keeps Remove behind the overflow menu, gated by a confirmation", () => {
    const remove = vi.fn(async () => true);
    act(() => useStore.setState({ friends: [friend()], removeFriend: remove }));
    render(<CommunityPage view="community" {...pageProps()} />);
    // No always-visible remove button on the row.
    expect(screen.queryByRole("button", { name: /^Remove Ana$/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /More actions for Ana/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Remove friend/i }));
    // Nothing removed yet — the confirm dialog gates the destructive action.
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Remove$/i }));
    expect(remove).toHaveBeenCalledWith("u2");
  });

  it("filters the directory by name and offers the three sorts", () => {
    act(() =>
      useStore.setState({
        friends: [friend(), friend({ id: "u9", displayName: "Benji" })],
      }),
    );
    render(<CommunityPage view="community" {...pageProps()} />);
    expect(screen.getByRole("radio", { name: /Online first/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Recently active/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Filter friends by name/i), {
      target: { value: "ben" },
    });
    expect(screen.queryByTitle(/Visit Ana's profile/i)).toBeNull();
    expect(screen.getByTitle(/Visit Benji's profile/i)).toBeTruthy();
  });

  it("tucks sent requests behind a collapsed disclosure", () => {
    act(() =>
      useStore.setState({
        friendRequests: [request({ id: "r2", direction: "outgoing", otherName: "Cleo" })],
      }),
    );
    render(<CommunityPage view="community" {...pageProps()} />);
    // Collapsed by default: the count is visible, the Cancel action is not.
    expect(screen.getByText(/Sent requests · 1/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cancel/i })).toBeNull();
    fireEvent.click(screen.getByText(/Sent requests · 1/i));
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeTruthy();
    expect(screen.getByText("Cleo")).toBeTruthy();
  });
});

describe("Activity section", () => {
  it("renders the feed with a cheer affordance", () => {
    const cheer = vi.fn(async () => {});
    act(() => useStore.setState({ feed: [ev()], cheerActivity: cheer }));
    render(<CommunityPage view="community-activity" {...pageProps()} />);
    expect(screen.getByText(/finished Hollow Knight/i)).toBeTruthy();
    fireEvent.click(screen.getByTitle("Cheer this"));
    expect(cheer).toHaveBeenCalledWith("e1");
  });

  it("loads older activity via the Show more fallback button", () => {
    const more = vi.fn(async () => {});
    act(() => useStore.setState({ feed: [ev()], feedHasMore: true, loadMoreFeed: more }));
    render(<CommunityPage view="community-activity" {...pageProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /Show more/i }));
    expect(more).toHaveBeenCalled();
  });

  it("offers Find friends from the empty state", () => {
    const props = pageProps();
    render(<CommunityPage view="community-activity" {...props} />);
    expect(screen.getByText(/No activity yet/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Find friends/i }));
    expect(props.onNavigate).toHaveBeenCalledWith("community");
  });
});

describe("Messages section", () => {
  it("mounts the chat inbox with its empty state", () => {
    render(<CommunityPage view="community-messages" {...pageProps()} />);
    expect(screen.getByText(/No conversations yet/i)).toBeTruthy();
  });

  it("opens straight into a thread for an explicit conversation target", () => {
    act(() =>
      useStore.setState({
        thread: [],
        threadLoading: false,
        fetchThread: vi.fn(async () => {}),
        markThreadRead: vi.fn(async () => {}),
      }),
    );
    render(
      <CommunityPage
        view="community-messages"
        {...pageProps()}
        dmTarget={{ id: "u2", name: "Ana" }}
      />,
    );
    expect(screen.getByText(/No messages yet — say hello to Ana/i)).toBeTruthy();
  });

  it("keeps the conversation list mounted beside an open thread (two-pane at md+)", () => {
    act(() =>
      useStore.setState({
        thread: [],
        threadLoading: false,
        fetchThread: vi.fn(async () => {}),
        markThreadRead: vi.fn(async () => {}),
      }),
    );
    render(
      <CommunityPage
        view="community-messages"
        {...pageProps()}
        dmTarget={{ id: "u2", name: "Ana" }}
      />,
    );
    // The list rail stays in the DOM (revealed at md+ by CSS)…
    expect(screen.getByRole("button", { name: /New/i })).toBeTruthy();
    // …and the thread's Back affordance is phone-only.
    expect(screen.getByRole("button", { name: /^Back$/i }).className).toMatch(/md:hidden/);
  });
});

describe("Market Square section", () => {
  it("renders the existing Market Square inside the Discover tab", () => {
    render(<CommunityPage view="community-discover" {...pageProps()} />);
    // The page keeps its own identity (tab + card heading) and its community
    // sections — here the Fresh Clears feed in its quiet empty state.
    expect(screen.getAllByText(/Market Square/i).length).toBeGreaterThan(1);
    expect(screen.getByText(/Fresh Clears/i)).toBeTruthy();
    expect(screen.getByText(/No clears yet/i)).toBeTruthy();
  });
});
