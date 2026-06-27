import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddCompilationModal } from "./AddCompilationModal";
import { useStore } from "../store";

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
});
