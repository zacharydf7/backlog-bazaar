import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { GameCard } from "./GameCard";
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
    familyId: null,
    ...over,
  } as Game;
}

beforeEach(() => {
  act(() => useStore.setState({ viewing: null }));
});

describe("GameCard family badge", () => {
  it("shows a subtle Family tag for a linked edition", () => {
    render(<GameCard game={game({ familyId: "F" })} />);
    expect(screen.getByText("Family")).toBeTruthy();
    // The old bulky inline family panel ("· N editions") is gone — stats live in
    // the detail modal now.
    expect(screen.queryByText(/editions/i)).toBeNull();
  });

  it("shows no Family tag for an unlinked game", () => {
    render(<GameCard game={game({ familyId: null })} />);
    expect(screen.queryByText("Family")).toBeNull();
  });
});
