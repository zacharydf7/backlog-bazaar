import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GlobalSearchModal } from "./GlobalSearchModal";
import type { Game } from "../types";

function game(p: Partial<Game> & { id: string; title: string }): Game {
  return {
    status: "backlog",
    addedAt: 0,
    genres: [],
    platforms: [],
    copies: [],
    familyId: null,
    ...p,
  };
}

const base = {
  query: "halo",
  onQueryChange: () => {},
  onPick: () => {},
  onClose: () => {},
};

describe("GlobalSearchModal", () => {
  it("prompts to start typing when the query is empty", () => {
    render(<GlobalSearchModal {...base} query="" results={[]} />);
    expect(screen.getByText(/start typing to search/i)).toBeTruthy();
  });

  it("renders results with a status badge and platforms, and picks on click", () => {
    const onPick = vi.fn();
    const halo = game({
      id: "halo",
      title: "Halo Infinite",
      status: "finished",
      copies: [{ id: "c1", platform: "Xbox Series X" }],
    });
    render(<GlobalSearchModal {...base} results={[halo]} onPick={onPick} />);
    expect(screen.getByText("Halo Infinite")).toBeTruthy();
    expect(screen.getByText("Finished")).toBeTruthy(); // status badge label
    expect(screen.getByText("Xbox Series X")).toBeTruthy();
    fireEvent.click(screen.getByText("Halo Infinite"));
    expect(onPick).toHaveBeenCalledWith(halo);
  });

  it("offers an Add shortcut on your own empty results", () => {
    const onAddGame = vi.fn();
    render(<GlobalSearchModal {...base} results={[]} onAddGame={onAddGame} />);
    const add = screen.getByRole("button", { name: /add “halo”/i });
    fireEvent.click(add);
    expect(onAddGame).toHaveBeenCalledWith("halo");
  });

  it("shows an informational empty state (no Add) when visiting a friend", () => {
    render(<GlobalSearchModal {...base} results={[]} visitingName="Sam" />);
    expect(screen.getByText(/Sam has no games matching/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
  });

  it("marks a private game with a lock on your own results", () => {
    const secret = game({ id: "s", title: "Secret Game", private: true });
    render(<GlobalSearchModal {...base} results={[secret]} />);
    expect(screen.getByLabelText("Private")).toBeTruthy();
  });
});
