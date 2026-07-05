import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { LikeButton } from "./LikeButton";
import { ViewingProvider } from "../lib/viewContext";
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
  act(() => useStore.setState({ cloud: false, viewing: null, games: [game()] }));
});

describe("LikeButton (your own game)", () => {
  it("toggles the like on click — offline mode persists it locally", () => {
    render(<LikeButton game={game()} />);
    const btn = screen.getByRole("button", { name: /Like Hollow Knight/ });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    act(() => {
      fireEvent.click(btn);
    });
    expect(useStore.getState().games[0].likedAt).not.toBeNull();
  });

  it("reads unliked vs liked from the game and offers the opposite action", () => {
    const { rerender } = render(<LikeButton game={game()} />);
    expect(screen.getByRole("button", { name: /^Like/ })).toBeTruthy();
    rerender(<LikeButton game={game({ likedAt: 5 })} />);
    const btn = screen.getByRole("button", { name: /^Unlike/ });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("unliking clears likedAt again", () => {
    act(() => useStore.setState({ games: [game({ likedAt: 5 })] }));
    render(<LikeButton game={game({ likedAt: 5 })} />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^Unlike/ }));
    });
    expect(useStore.getState().games[0].likedAt).toBeNull();
  });
});

describe("LikeButton (visiting)", () => {
  it("shows a static heart only when the owner liked the game", () => {
    const { container, rerender } = render(
      <ViewingProvider value={{ readOnly: true, hideSpend: false }}>
        <LikeButton game={game()} />
      </ViewingProvider>,
    );
    // Unliked → nothing at all (no button, no icon).
    expect(container.firstChild).toBeNull();
    rerender(
      <ViewingProvider value={{ readOnly: true, hideSpend: false }}>
        <LikeButton game={game({ likedAt: 5 })} />
      </ViewingProvider>,
    );
    expect(screen.getByTitle(/They like this game/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
