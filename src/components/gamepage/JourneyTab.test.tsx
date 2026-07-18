import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JourneyTab } from "./JourneyTab";
import { useStore } from "../../store";
import type { Game } from "../../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Hollow Knight",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

beforeEach(() => {
  act(() => useStore.setState({ viewing: null, cloud: false, games: [game()] }));
});

describe("JourneyTab (offline)", () => {
  it("commits the single Played field on blur through editGame", async () => {
    const editGame = vi.fn(async (_id: string, _patch: { playedHours?: number }) => {});
    const g = game({ playedHours: 2 });
    act(() => useStore.setState({ games: [g], editGame }));
    render(<JourneyTab game={g} />);

    const field = screen.getByLabelText(/Played/i) as HTMLInputElement;
    expect(field.value).toBe("2h");
    fireEvent.change(field, { target: { value: "5h" } });
    fireEvent.blur(field);

    await waitFor(() => expect(editGame).toHaveBeenCalledTimes(1));
    expect(editGame.mock.calls[0][1].playedHours).toBe(5);
  });

  it("does not write when the blur leaves the value unchanged or unparseable", () => {
    const editGame = vi.fn(async () => {});
    const g = game({ playedHours: 2 });
    act(() => useStore.setState({ games: [g], editGame }));
    render(<JourneyTab game={g} />);

    const field = screen.getByLabelText(/Played/i);
    fireEvent.blur(field); // unchanged
    fireEvent.change(field, { target: { value: "banana" } });
    fireEvent.blur(field); // unparseable
    expect(editGame).not.toHaveBeenCalled();
  });

  it("skips the time editor for a wishlist game and hides cloud-only sections offline", () => {
    render(<JourneyTab game={game({ status: "wishlist" })} />);
    expect(screen.queryByLabelText(/Played/i)).toBeNull();
    expect(screen.queryByText(/Milestones/)).toBeNull();
    // The prerequisite picker still applies (story order matters pre-purchase).
    expect(screen.getByText(/Requires prior completion of/i)).toBeTruthy();
  });
});

describe("JourneyTab family scoping (9f420872)", () => {
  const family = () => [
    game({ id: "a", title: "Original", familyId: "F", familyPrimaryGameId: "a" }),
    game({ id: "b", title: "Remaster", familyId: "F", familyPrimaryGameId: "a" }),
  ];

  it("interleaves the whole family's milestones by default (fetches every member)", async () => {
    const fetchGameMilestones = vi.fn(async () => []);
    act(() => useStore.setState({ cloud: true, games: family(), fetchGameMilestones }));
    render(<JourneyTab game={family()[0]} />);
    await waitFor(() => expect(fetchGameMilestones).toHaveBeenCalledTimes(2));
    expect(fetchGameMilestones).toHaveBeenCalledWith("a");
    expect(fetchGameMilestones).toHaveBeenCalledWith("b");
  });

  it("scoped: keeps the timeline to the one edition's own story", async () => {
    const fetchGameMilestones = vi.fn(async () => []);
    act(() => useStore.setState({ cloud: true, games: family(), fetchGameMilestones }));
    render(<JourneyTab game={family()[1]} scoped />);
    await waitFor(() => expect(fetchGameMilestones).toHaveBeenCalled());
    expect(fetchGameMilestones).toHaveBeenCalledTimes(1);
    expect(fetchGameMilestones).toHaveBeenCalledWith("b");
  });
});
