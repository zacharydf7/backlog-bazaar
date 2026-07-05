import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within, fireEvent } from "@testing-library/react";
import { CommunityTab } from "./CommunityTab";
import { useStore } from "../../store";
import type { CommunityReview } from "../../lib/communityReviews";
import type { CommunityStats } from "../../lib/communityStats";
import type { Game } from "../../types";

const stats: CommunityStats = {
  owners: 50,
  playing: 2,
  backlog: 31,
  finished: 17,
  wishlist: 9,
  reviewCount: 8,
  ratingCount: 14,
  avgHalfStars: 7.6, // → 3.8 / 5
  hoursTotal: 420,
  hoursAvg: 12.3,
  dist: { 7: 3, 8: 5, 10: 6 },
  likes: 5,
};

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Chrono Trigger",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    rawgId: 123,
    ...over,
  } as Game;
}

const reviews: CommunityReview[] = [
  {
    userId: "me",
    displayName: "Zach",
    avatarUrl: null,
    review: "A timeless classic.",
    score: 10,
    status: "finished",
    finishTag: "completed",
    platforms: ["SNES"],
    reviewedAt: "2026-06-27T12:00:00.000Z",
  },
  {
    userId: "u2",
    displayName: "Sky",
    avatarUrl: null,
    review: "Wonderful story, though the gameplay tends to be a slog.",
    score: 7,
    status: "playing",
    finishTag: null,
    platforms: [],
    reviewedAt: "2026-06-14T12:00:00.000Z",
  },
];

beforeEach(() => {
  act(() =>
    useStore.setState({
      cloud: true,
      userId: "me",
      fetchGameReviews: vi.fn(async () => reviews),
      // Default: no community aggregates (the panel stays hidden) unless a test
      // opts in with its own stats.
      fetchCommunityStats: vi.fn(async () => null),
    }),
  );
});

describe("CommunityTab", () => {
  it("renders every player's review with name, stars, status, platform and text", async () => {
    render(<CommunityTab game={game()} />);
    expect(await screen.findByText("Sky")).toBeTruthy();
    expect(screen.getByText("A timeless classic.")).toBeTruthy();
    expect(screen.getByText(/gameplay tends to be a slog/)).toBeTruthy();
    // Finished-with-completed reads by HOW it concluded; playing reads Now Playing.
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("Now Playing")).toBeTruthy();
    expect(screen.getByText("SNES")).toBeTruthy();
    expect(screen.getByTitle("5 out of 5 stars")).toBeTruthy();
    expect(screen.getByText("2 reviews from the community, newest first.")).toBeTruthy();
  });

  it("badges the caller's own review with You", async () => {
    render(<CommunityTab game={game()} />);
    expect(await screen.findByText("You")).toBeTruthy();
    // The badge sits on Zach's (the caller's) row.
    expect(screen.getByText("Zach")).toBeTruthy();
  });

  it("shows the empty state when nobody has reviewed the game", async () => {
    act(() => useStore.setState({ fetchGameReviews: vi.fn(async () => []) }));
    render(<CommunityTab game={game()} />);
    expect(await screen.findByText("No reviews yet")).toBeTruthy();
  });

  it("passes the game's catalog identity to both fetches", async () => {
    const fetchGameReviews = vi.fn(async () => [] as CommunityReview[]);
    const fetchCommunityStats = vi.fn(async () => null);
    act(() => useStore.setState({ fetchGameReviews, fetchCommunityStats }));
    render(<CommunityTab game={game({ rawgId: 42, catalogId: "cat-9" })} />);
    await screen.findByText("No reviews yet");
    expect(fetchGameReviews).toHaveBeenCalledWith({ rawgId: 42, catalogId: "cat-9" });
    expect(fetchCommunityStats).toHaveBeenCalledWith({ rawgId: 42, catalogId: "cat-9" });
  });
});

describe("CommunityTab — community stats panel", () => {
  it("shows the aggregate score, owner breakdown, and hours when there's data", async () => {
    act(() => useStore.setState({ fetchCommunityStats: vi.fn(async () => stats) }));
    render(<CommunityTab game={game()} />);
    const panel = within(await screen.findByTestId("community-stats"));
    // Headline average (7.6 half-stars → 3.8 / 5).
    expect(panel.getByText("3.8")).toBeTruthy();
    // At-a-glance counts + the status breakdown.
    expect(panel.getByText("Owners")).toBeTruthy();
    expect(panel.getByText("In the Bazaar")).toBeTruthy();
    expect(panel.getByText("31")).toBeTruthy();
    expect(panel.getByText("Finished")).toBeTruthy();
    // Hours logged across the community.
    expect(panel.getByText(/420h logged/)).toBeTruthy();
    expect(panel.getByText(/12\.3h average/)).toBeTruthy();
  });

  it("shows the panel even with no written reviews (owners but nobody reviewed)", async () => {
    act(() =>
      useStore.setState({
        fetchGameReviews: vi.fn(async () => []),
        fetchCommunityStats: vi.fn(async () => ({ ...stats, reviewCount: 0, ratingCount: 0, avgHalfStars: null, dist: {} })),
      }),
    );
    render(<CommunityTab game={game()} />);
    expect(await screen.findByTestId("community-stats")).toBeTruthy();
    // The reviews section still shows its empty note beneath the stats.
    expect(screen.getByText("No reviews yet")).toBeTruthy();
    expect(screen.getByText(/Share yours from the Review tab/)).toBeTruthy();
  });

  it("hides the panel entirely when nobody owns, wishlists, or rates the game", async () => {
    act(() => useStore.setState({ fetchCommunityStats: vi.fn(async () => null) }));
    render(<CommunityTab game={game()} />);
    // Reviews still render (from the default fixture)…
    expect(await screen.findByText("Sky")).toBeTruthy();
    // …but no stats panel.
    expect(screen.queryByTestId("community-stats")).toBeNull();
  });

  it("opens the who-liked-this list from the Likes chip", async () => {
    act(() =>
      useStore.setState({
        fetchCommunityStats: vi.fn(async () => stats),
        fetchGameLikers: vi.fn(async () => [
          {
            userId: "u9",
            displayName: "Rey",
            avatarUrl: null,
            likedAt: Date.parse("2026-07-04T00:00:00Z"),
          },
        ]),
      }),
    );
    render(<CommunityTab game={game()} />);
    const panel = within(await screen.findByTestId("community-stats"));
    // The Likes chip carries the count and opens the likers list.
    fireEvent.click(panel.getByRole("button", { name: /5 likes/i }));
    expect(await screen.findByText(/5 players like Chrono Trigger/)).toBeTruthy();
    expect(await screen.findByText("Rey")).toBeTruthy();
    // A short first page means no Load more.
    expect(screen.queryByRole("button", { name: /Load more/i })).toBeNull();
  });

  it("keeps the Likes chip inert at zero likes", async () => {
    act(() =>
      useStore.setState({
        fetchCommunityStats: vi.fn(async () => ({ ...stats, likes: 0 })),
      }),
    );
    render(<CommunityTab game={game()} />);
    const panel = within(await screen.findByTestId("community-stats"));
    expect(panel.getByText("Likes")).toBeTruthy();
    expect(panel.queryByRole("button", { name: /likes/i })).toBeNull();
  });
});
