import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MarketSquare } from "./MarketSquare";
import { useStore } from "../store";
import type { ActivityEvent, Game } from "../types";

const NOW = Date.now();

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

function review(over: Partial<Record<string, unknown>> = {}) {
  return {
    userId: "u3",
    displayName: "Ben",
    avatarUrl: null,
    gameTitle: "Celeste",
    rawgId: 42,
    catalogId: null,
    review: "Tight controls, big heart.",
    score: 9,
    reviewedAt: "2026-07-10T12:00:00Z",
    ...over,
  } as never;
}

beforeEach(() => {
  act(() =>
    useStore.setState({
      userId: "me",
      games: [],
      // Never resolves: the directory stays in its quiet "Loading…" state so no
      // post-assertion setState fires an act() warning (the ProfileHub pattern).
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

describe("MarketSquare community sections", () => {
  it("renders a community clear with its headline and a cheer affordance", () => {
    const cheer = vi.fn(async () => {});
    act(() => useStore.setState({ squareFeed: [ev()], cheerActivity: cheer }));
    render(<MarketSquare />);
    expect(screen.getByText(/finished Hollow Knight/i)).toBeTruthy();
    const cheerBtn = screen.getByTitle("Cheer this");
    act(() => cheerBtn.click());
    expect(cheer).toHaveBeenCalledWith("e1");
  });

  it("uncheers an already-cheered clear", () => {
    const uncheer = vi.fn(async () => {});
    act(() =>
      useStore.setState({
        squareFeed: [ev({ cheeredByMe: true, cheerCount: 3 })],
        uncheerActivity: uncheer,
      }),
    );
    render(<MarketSquare />);
    const btn = screen.getByTitle("Remove your cheer");
    expect(btn.textContent).toContain("3");
    act(() => btn.click());
    expect(uncheer).toHaveBeenCalledWith("e1");
  });

  it("shows the Stall of the Week only when the server crowned someone", () => {
    const { rerender } = render(<MarketSquare />);
    expect(screen.queryByText(/Stall of the Week/i)).toBeNull();
    act(() =>
      useStore.setState({
        squareSpotlight: {
          cosmetics: { frame: null, stall: null },
          userId: "u2",
          displayName: "Ana",
          avatarUrl: null,
          title: null,
          clears: 4,
          lastTitle: "Hades",
          lastAt: NOW,
        },
      }),
    );
    rerender(<MarketSquare />);
    expect(screen.getByText(/Stall of the Week/i)).toBeTruthy();
    expect(screen.getByText(/4 games cleared this week — latest: Hades/i)).toBeTruthy();
  });

  it("renders a review row, linking the game title when the viewer owns it", () => {
    act(() =>
      useStore.setState({
        squareReviews: [review()],
        games: [{ id: "g9", title: "Celeste", rawgId: 42 } as Game],
      }),
    );
    render(<MarketSquare />);
    expect(screen.getByText("Tight controls, big heart.")).toBeTruthy();
    expect(screen.getByTitle("Open it in your library")).toBeTruthy();
  });

  it("shows Hot This Week tiles, linking owned titles into the library", () => {
    act(() =>
      useStore.setState({
        squareTrending: [
          {
            rawgId: 42,
            catalogId: null,
            title: "Hades",
            image: null,
            adds: 3,
            finishes: 2,
            likes: 0,
            reviews: 0,
          },
        ],
        games: [{ id: "g5", title: "Hades", rawgId: 42 } as Game],
      }),
    );
    render(<MarketSquare />);
    expect(screen.getByText(/Hot This Week/i)).toBeTruthy();
    expect(screen.getByText("3 added · 2 finished")).toBeTruthy();
    expect(screen.getByTitle("Open it in your library")).toBeTruthy();
  });

  it("shows Curated Stalls rows and hides the section when there are none", () => {
    const { rerender } = render(<MarketSquare />);
    expect(screen.queryByText(/Curated Stalls/i)).toBeNull();
    act(() =>
      useStore.setState({
        squareLists: [
          {
            id: "l1",
            title: "Cozy autumn picks",
            description: "Short and warm.",
            ownerId: "u3",
            ownerName: "Ben",
            ownerAvatar: null,
            updatedAt: NOW - 3_600_000,
            itemCount: 5,
            covers: [],
          },
        ],
      }),
    );
    rerender(<MarketSquare />);
    expect(screen.getByText(/Curated Stalls/i)).toBeTruthy();
    expect(screen.getByTitle("Open Cozy autumn picks")).toBeTruthy();
    expect(screen.getByText(/5 games · by/i)).toBeTruthy();
  });

  it("renders an unowned review title as plain text beside the empty feed state", () => {
    act(() => useStore.setState({ squareReviews: [review()] }));
    render(<MarketSquare />);
    expect(screen.queryByTitle("Open it in your library")).toBeNull();
    expect(screen.getByText("Celeste")).toBeTruthy();
    // The empty community feed shows its quiet state.
    expect(screen.getByText(/No clears yet/i)).toBeTruthy();
  });
});
