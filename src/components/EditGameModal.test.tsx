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
