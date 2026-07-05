import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { GameStackCard } from "./GameStackCard";
import { useStore } from "../store";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "FF VII Remake",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    familyId: null,
    ...over,
  } as Game;
}

const deck = () => [
  game({
    id: "ps5",
    rawgId: 7,
    copies: [{ id: "c1", platform: "PlayStation 5", format: "physical" as const }],
  }),
  game({
    id: "pc",
    rawgId: 7,
    copies: [{ id: "c2", platform: "PC", format: "digital" as const }],
  }),
];

beforeEach(() => {
  act(() => useStore.setState({ viewing: null }));
});

describe("GameStackCard", () => {
  it("wears a platform tag for EVERY member of the deck, top card first", () => {
    const games = deck();
    act(() => useStore.setState({ games, coins: 500 }));
    render(<GameStackCard games={games} onFanOut={() => {}} />);

    // The top card shows its own tag AND the folded sibling's.
    expect(screen.getByText("PlayStation 5")).toBeTruthy();
    expect(screen.getByText("PC")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Fan out 2 stacked copies/i })).toBeTruthy();
  });

  it("deep-links a deck's platform tag to that version's own page", () => {
    window.history.replaceState(null, "", "/");
    const games = deck();
    act(() => useStore.setState({ games, coins: 500 }));
    render(<GameStackCard games={games} onFanOut={() => {}} />);

    // The folded PC sibling's tag is a button that opens ITS page.
    fireEvent.click(screen.getByTitle("Open the PC version"));
    expect(window.location.hash).toBe("#g/pc");

    // …and the top card's own tag targets the top record.
    fireEvent.click(screen.getByTitle("Open the PlayStation 5 version"));
    expect(window.location.hash).toBe("#g/ps5");
  });

  it("Buy & Start on a collapsed deck first asks which version", () => {
    const games = deck();
    act(() => useStore.setState({ games, coins: 500 }));
    render(<GameStackCard games={games} onFanOut={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Buy & Start/i }));
    expect(screen.getByRole("heading", { name: /Which version/i })).toBeTruthy();
    // One row per folded version.
    expect(screen.getAllByText("FF VII Remake").length).toBeGreaterThanOrEqual(2);
  });

  it("Import with Charter on a wishlist deck routes the pick to the chosen version", () => {
    const importWithCharter = vi.fn();
    const games = deck().map((g) => ({ ...g, status: "wishlist" as const }));
    act(() => useStore.setState({ games, charters: 2, importWithCharter }));
    render(<GameStackCard games={games} onFanOut={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Consume 1 Charter to Import/i }));
    expect(importWithCharter).not.toHaveBeenCalled(); // picker first
    // Pick the second (PC) version's row.
    const rows = screen
      .getAllByRole("button")
      .filter((b) => b.textContent?.includes("PC") && b.textContent.includes("FF VII Remake"));
    fireEvent.click(rows[0]);
    expect(importWithCharter).toHaveBeenCalledWith("pc");
  });

  it("Retire it on a backlog deck asks which version, then retires the chosen one", () => {
    const retireGame = vi.fn().mockResolvedValue(undefined);
    const games = deck();
    act(() => useStore.setState({ games, coins: 500, shelveRefundPct: 20, retireGame }));
    render(<GameStackCard games={games} onFanOut={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /^Retire it$/i }));
    expect(retireGame).not.toHaveBeenCalled(); // picker first
    expect(screen.getByRole("heading", { name: /Which version/i })).toBeTruthy();

    // Pick the PC version's row from the picker.
    const rows = screen
      .getAllByRole("button")
      .filter((b) => b.textContent?.includes("PC") && b.textContent.includes("FF VII Remake"));
    fireEvent.click(rows[0]);

    // The Retire confirm opens for that version; confirming retires it.
    expect(screen.getByText(/It moves to your\s+Finished shelf/i)).toBeTruthy();
    const confirmButtons = screen.getAllByRole("button", { name: /^Retire it$/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    expect(retireGame).toHaveBeenCalledWith("pc", "");
  });
});
