import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
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

describe("GameCard ⋮ menu — Link editions", () => {
  it("offers Link editions for an unlinked game and opens the Manage Family hub", () => {
    const g = game({ familyId: null });
    act(() => useStore.setState({ viewing: null, games: [g] }));
    render(<GameCard game={g} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    // Query by text: the cover area is itself role=button, so its accessible name
    // absorbs the menu's labels — getByRole("button", …) would be ambiguous.
    fireEvent.click(screen.getByText(/Link editions/i));
    expect(screen.getByRole("heading", { name: /Manage Game Family/i })).toBeTruthy();
  });

  it("does not offer Link editions for an already-linked game (managed from the detail)", () => {
    render(<GameCard game={game({ familyId: "F" })} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    expect(screen.queryByText(/Link editions/i)).toBeNull();
  });
});
