import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GlobalSearchModal } from "./GlobalSearchModal";
import type { Compilation, Game } from "../types";
import type { LibrarySearchEntry } from "../lib/compilationGrouping";

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
    const entry: LibrarySearchEntry = { kind: "game", game: halo };
    render(<GlobalSearchModal {...base} results={[entry]} onPick={onPick} />);
    expect(screen.getByText("Halo Infinite")).toBeTruthy();
    expect(screen.getByText("Finished")).toBeTruthy(); // status badge label
    expect(screen.getByText("Xbox Series X")).toBeTruthy();
    fireEvent.click(screen.getByText("Halo Infinite"));
    expect(onPick).toHaveBeenCalledWith(entry);
  });

  it("shows a compilation as one result, naming the games that matched (86fc0b4b)", () => {
    const onPick = vi.fn();
    const sunshine = game({ id: "k", title: "Super Mario Sunshine", compilationId: "C" });
    const entry: LibrarySearchEntry = {
      kind: "compilation",
      compilation: { id: "C", title: "Super Mario 3D All-Stars", totalCost: 60, createdAt: 0, expanded: true } as Compilation,
      children: [sunshine, game({ id: "g", title: "Super Mario Galaxy", compilationId: "C" })],
      image: undefined,
      status: "backlog",
      includes: ["Super Mario Sunshine"],
    };
    render(<GlobalSearchModal {...base} query="sunshine" results={[entry]} onPick={onPick} />);
    expect(screen.getByText("Super Mario 3D All-Stars")).toBeTruthy();
    expect(screen.getByText("Includes Super Mario Sunshine")).toBeTruthy();
    expect(screen.getByText("Bazaar")).toBeTruthy();
    fireEvent.click(screen.getByText("Super Mario 3D All-Stars"));
    expect(onPick).toHaveBeenCalledWith(entry);
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

  it("clears typed text with the × first, then closes (86fc0b4b)", () => {
    const onQueryChange = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <GlobalSearchModal {...base} results={[]} onQueryChange={onQueryChange} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onQueryChange).toHaveBeenCalledWith("");
    expect(onClose).not.toHaveBeenCalled();

    rerender(<GlobalSearchModal {...base} query="" results={[]} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("marks a private game with a lock on your own results", () => {
    const secret = game({ id: "s", title: "Secret Game", private: true });
    render(<GlobalSearchModal {...base} results={[{ kind: "game", game: secret }]} />);
    expect(screen.getByLabelText("Private")).toBeTruthy();
  });
});
