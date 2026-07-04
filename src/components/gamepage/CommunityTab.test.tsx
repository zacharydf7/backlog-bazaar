import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CommunityTab } from "./CommunityTab";
import { useStore } from "../../store";
import type { CommunityReview } from "../../lib/communityReviews";
import type { Game } from "../../types";

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

  it("passes the game's catalog identity to the fetch", async () => {
    const fetchGameReviews = vi.fn(async () => [] as CommunityReview[]);
    act(() => useStore.setState({ fetchGameReviews }));
    render(<CommunityTab game={game({ rawgId: 42, catalogId: "cat-9" })} />);
    await screen.findByText("No reviews yet");
    expect(fetchGameReviews).toHaveBeenCalledWith({ rawgId: 42, catalogId: "cat-9" });
  });
});
