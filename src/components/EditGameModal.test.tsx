import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { EditGameModal } from "./EditGameModal";
import { useStore } from "../store";
import type { Game } from "../types";

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
  act(() => useStore.setState({ viewing: null, games: [game()] }));
});

describe("EditGameModal family integration", () => {
  it("shows the family name in the header plus combined stats and a Manage Family entry", () => {
    const a = game({ id: "a", title: "Witcher 3 PC", familyId: "F", familyName: "The Witcher 3", status: "finished", playedHours: 10 });
    const b = game({ id: "b", title: "Witcher 3 Switch", familyId: "F", playedHours: 5 });
    act(() => useStore.setState({ viewing: null, games: [a, b] }));
    render(<EditGameModal game={a} onClose={() => {}} />);
    // #5: the family's name leads the modal header for a linked edition.
    expect(screen.getByRole("heading", { name: /The Witcher 3/i })).toBeTruthy();
    expect(screen.getByText(/Game Family · 2 editions/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Manage Family/i })).toBeTruthy();
  });

  it("shows no family stats or in-modal Link editions button for an unlinked game", () => {
    // #6: linking moved to the card's ⋮ menu, so the detail modal stays focused.
    const solo = game({ id: "solo", title: "Solo" });
    act(() => useStore.setState({ viewing: null, games: [solo] }));
    render(<EditGameModal game={solo} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /Link editions/i })).toBeNull();
    expect(screen.queryByText(/Game Family/i)).toBeNull();
  });

  it("opens the Manage Family hub from the detail modal", () => {
    const a = game({ id: "a", title: "A", familyId: "F" });
    const b = game({ id: "b", title: "B", familyId: "F" });
    act(() => useStore.setState({ viewing: null, games: [a, b] }));
    render(<EditGameModal game={a} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Manage Family/i }));
    expect(screen.getByRole("heading", { name: /Manage Game Family/i })).toBeTruthy();
  });
});

describe("EditGameModal close behavior", () => {
  it("does not close when the backdrop is clicked (only the ✕ closes it)", () => {
    const onClose = vi.fn();
    const { container } = render(<EditGameModal game={game()} onClose={onClose} />);
    // The outermost node is the backdrop; a stray tap on it must not discard edits.
    fireEvent.click(container.firstChild as Element);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the ✕ button is clicked", () => {
    const onClose = vi.fn();
    render(<EditGameModal game={game()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
