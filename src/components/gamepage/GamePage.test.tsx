import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { GamePage } from "./GamePage";
import { useStore, type ViewingSession } from "../../store";
import type { Game } from "../../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Chrono Trigger",
    status: "backlog",
    genres: ["RPG"],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

function visitingSession(games: Game[]): ViewingSession {
  return {
    userId: "friend-1",
    displayName: "Rey",
    avatarUrl: null,
    coins: 0,
    theme: null,
    gamesFinished: 0,
    hoursFinished: 0,
    hideSpend: true,
    lastSeenAt: null,
    activity: null,
    badges: [],
    title: null,
    aboutMe: null,
    bannerUrl: null,
    accent: null,
    bg: null,
    games,
  };
}

beforeEach(() => {
  // jsdom doesn't implement scrolling; the page scrolls to top on mount.
  window.scrollTo = vi.fn();
  act(() => useStore.setState({ cloud: true, games: [game()], viewing: null }));
});

describe("GamePage", () => {
  it("renders the hero and section tabs for an own-library game", () => {
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Chrono Trigger" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Overview/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Journey/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Library/ })).toBeTruthy();
  });

  it("keeps the hero status-agnostic — no inline buy/log/finish controls", () => {
    // A backlog game never shows a "Buy & Start" button on its page…
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Buy .* Start/i })).toBeNull();

    // …and a Now Playing game shows neither the play-time logger nor a
    // Mark Finished button in the hero. Those actions live on the board card;
    // the page looks the same regardless of status.
    act(() => useStore.setState({ games: [game({ status: "playing", playedHours: 3 })] }));
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    expect(screen.queryByLabelText(/Log play time/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark Finished/i })).toBeNull();
  });

  it("switches the active tab on click", () => {
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    const journey = screen.getByRole("tab", { name: /Journey/ });
    expect(journey.getAttribute("aria-selected")).toBe("false");
    fireEvent.click(journey);
    expect(journey.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /Overview/ }).getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  it("shows a not-found panel (with a working Back) for an unknown id", () => {
    const onBack = vi.fn();
    render(<GamePage gameId="nope" onBack={onBack} />);
    expect(screen.getByText(/isn’t in the library/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows a loading panel instead of not-found while a visit deep link loads", () => {
    render(<GamePage gameId="nope" visitPending onBack={vi.fn()} />);
    expect(screen.getByText(/Loading their Bazaar/)).toBeTruthy();
    expect(screen.queryByText(/isn’t in the library/)).toBeNull();
  });

  it("resolves from the visited library and offers visitors Overview + Community only", () => {
    act(() =>
      useStore.setState({
        viewing: visitingSession([game({ id: "vg1", title: "Their Game" })]),
      }),
    );
    render(<GamePage gameId="vg1" onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Their Game" })).toBeTruthy();
    // Community content is visitor-visible; the owner-only panes are not, and
    // an unreviewed game offers no Review tab.
    expect(screen.getByRole("tab", { name: /Overview/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Community/ })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Review/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Journey/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Library/ })).toBeNull();
  });

  it("offers visitors the Review tab when the owner left one", () => {
    act(() =>
      useStore.setState({
        viewing: visitingSession([
          game({ id: "vg1", title: "Their Game", review: "Superb.", reviewScore: 9 }),
        ]),
      }),
    );
    render(<GamePage gameId="vg1" onBack={vi.fn()} />);
    const reviewTab = screen.getByRole("tab", { name: /Review/ });
    fireEvent.click(reviewTab);
    expect(screen.getByText("Superb.")).toBeTruthy();
    // Owner-only panes stay hidden from visitors.
    expect(screen.queryByRole("tab", { name: /Journey/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Library/ })).toBeNull();
  });

  it("shows the score chip in the hero and the Review tab for the owner", () => {
    act(() => useStore.setState({ games: [game({ reviewScore: 7 })] }));
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /Review/ })).toBeTruthy();
    expect(screen.getByTitle("3.5 out of 5 stars")).toBeTruthy();
  });

  it("leaves the page (onBack) when a resolved game disappears", () => {
    const onBack = vi.fn();
    render(<GamePage gameId="g1" onBack={onBack} />);
    expect(onBack).not.toHaveBeenCalled();
    act(() => useStore.setState({ games: [] }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("GamePage family integration (ported from the old detail modal)", () => {
  it("shows combined family stats and a Manage Family entry for a linked edition", () => {
    const a = game({
      id: "a",
      title: "Witcher 3 PC",
      familyId: "F",
      familyName: "The Witcher 3",
      status: "finished",
      playedHours: 10,
    });
    const b = game({ id: "b", title: "Witcher 3 Switch", familyId: "F", playedHours: 5 });
    act(() => useStore.setState({ games: [a, b] }));
    render(<GamePage gameId="a" onBack={vi.fn()} />);
    expect(screen.getByText(/Game Family · 2 editions/i)).toBeTruthy();
    expect(screen.getByText(/15h played/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Manage Family/i })).toBeTruthy();
  });

  it("shows no family block for an unlinked game", () => {
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    expect(screen.queryByText(/Game Family/i)).toBeNull();
  });

  it("jumps to a sibling edition via the hub — a navigation to its page", () => {
    window.history.replaceState(null, "", "/");
    const a = game({ id: "a", title: "Witcher 3 PC", familyId: "F" });
    const b = game({ id: "b", title: "Witcher 3 Switch", familyId: "F" });
    act(() => useStore.setState({ games: [a, b] }));
    render(<GamePage gameId="a" onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Manage Family/i }));
    fireEvent.click(screen.getByRole("button", { name: /Open Witcher 3 Switch/i }));

    expect(screen.queryByRole("heading", { name: /Manage Game Family/i })).toBeNull();
    expect(window.location.hash).toBe("#g/b");
  });
});
