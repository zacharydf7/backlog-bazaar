import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddCompilationModal } from "./AddCompilationModal";
import { useStore } from "../store";
import type { Compilation, Game } from "../types";

// Drive a real pick: the search box returns one suggestion, and HowLongToBeat
// returns the three completion-level times that power the length chips.
vi.mock("../lib/gameSearch", async (orig) => ({
  ...(await orig()),
  searchGameSuggestions: vi.fn(async () => [
    { title: "Halo Infinite", rawgId: 1, genres: [], hours: 9 },
  ]),
}));
vi.mock("../lib/gamedata", async (orig) => ({
  ...(await orig()),
  fetchHltbTimes: vi.fn(async () => ({ main: 9, mainExtra: 15, completionist: 30 })),
}));

beforeEach(() => {
  act(() => useStore.setState({ cloud: false, viewing: null, games: [], compilations: [] }));
});

describe("AddCompilationModal completion-level length picker", () => {
  it("offers Main/+Extras/100% chips after picking a game and applies the chosen one", async () => {
    render(<AddCompilationModal onClose={() => {}} />);

    // Type into the first child's name field and pick the suggestion.
    fireEvent.change(screen.getAllByLabelText("Game name")[0], { target: { value: "Halo" } });
    fireEvent.mouseDown(await screen.findByText("Halo Infinite"));

    // HLTB times load → the length defaults to Main (9h) and chips appear.
    const length = screen.getAllByLabelText("Length")[0] as HTMLInputElement;
    await waitFor(() => expect(length.value).toBe("9h"));
    expect(screen.getByRole("button", { name: /\+Extras/i })).toBeTruthy();

    // Choosing Completionist updates the length to the 100% estimate.
    fireEvent.click(screen.getByRole("button", { name: /100%/i }));
    await waitFor(() => expect(length.value).toBe("30h"));
  });

  it("shows the length chips right away when editing an existing compilation (no re-search)", async () => {
    const comp: Compilation = { id: "C", title: "Bundle", totalCost: 40, format: "physical", createdAt: 1, expanded: true, carryoverHours: 0 };
    const childGame: Game = {
      id: "g1",
      title: "Halo Infinite",
      status: "backlog",
      genres: [],
      platforms: [],
      copies: [{ id: "c", platform: "Switch", cost: 40 }],
      addedAt: 1,
      familyId: null,
      compilationId: "C",
      compilationName: "Bundle",
      hours: 9,
    } as Game;
    act(() => useStore.setState({ cloud: true, viewing: null, compilations: [comp], games: [childGame] }));

    render(<AddCompilationModal compilation={comp} onClose={() => {}} />);
    // The pre-filled game's chips appear without the user re-searching it.
    await waitFor(() => expect(screen.getByRole("button", { name: /100%/i })).toBeTruthy());
    expect(screen.getByRole("button", { name: /\+Extras/i })).toBeTruthy();

    // The existing length is preserved (chips don't overwrite it on their own).
    const length = screen.getByLabelText("Length") as HTMLInputElement;
    expect(length.value).toBe("9h");
  });

  it("shows the chips immediately after picking a shared compilation template", async () => {
    act(() =>
      useStore.setState({
        cloud: true,
        viewing: null,
        games: [],
        compilations: [],
        searchCompilationTemplates: async () => [
          { id: "T", title: "My Bundle", games: [{ name: "Halo Infinite", hours: 9 }], createdAt: 1 },
        ],
      }),
    );
    render(<AddCompilationModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Super Mario 3D All-Stars/i), {
      target: { value: "My Bundle" },
    });
    // The template dropdown appears after the debounce; pick it (its games subtitle).
    fireEvent.mouseDown(await screen.findByText("Halo Infinite"));
    // The chips appear right away, without re-searching the game.
    await waitFor(() => expect(screen.getByRole("button", { name: /100%/i })).toBeTruthy());
    expect(screen.getByRole("button", { name: /\+Extras/i })).toBeTruthy();
  });
});
