import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DlcBlock } from "./DlcBlock";
import { useStore } from "../../store";
import { DEFAULT_ECONOMY } from "../../lib/economy";
import type { GameDlc } from "../../lib/dlc";
import type { Game } from "../../types";

vi.mock("../../lib/gamedata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/gamedata")>();
  return { ...actual, fetchHltbTimes: vi.fn(async () => ({ main: 9 })) };
});

const GAME = { id: "g1", title: "Ghost of Yotei", status: "finished", genres: [], copies: [], addedAt: 1 } as Game;

function dlc(over: Partial<GameDlc> = {}): GameDlc {
  return {
    id: "d1",
    gameId: "g1",
    kind: "update",
    name: "Into the Emerald Dream",
    acquiredOn: "2026-03-25",
    cost: 50,
    hours: null,
    note: null,
    runStatus: "owned",
    runStartedAt: null,
    runHoursStart: null,
    runPrice: null,
    runPaying: false,
    runQuote: null,
    runClearedAt: null,
    runReward: null,
    createdAt: 1,
    ...over,
  };
}

const saveGameDlc = vi.fn(async () => true);
const convertDlcCopy = vi.fn(async () => true);

function setup(list: GameDlc[], game: Game = GAME) {
  act(() =>
    useStore.setState({
      isAdmin: false,
      games: [game],
      gameDlc: list,
      economy: DEFAULT_ECONOMY,
      economyEnabled: true,
      saveGameDlc,
      convertDlcCopy,
    }),
  );
  render(<DlcBlock hub={[game]} />);
}

beforeEach(() => {
  saveGameDlc.mockClear();
  convertDlcCopy.mockClear();
});

describe("DlcBlock", () => {
  it("converts on the copy's own game, without offering another, and dates an undated copy from the game", async () => {
    const owner = {
      ...GAME,
      addedAt: Date.parse("2025-03-04T12:00:00Z"),
      copies: [{ id: "old", platform: "PlayStation 5", format: "dlc", cost: 9.99, note: "Season Pass" }],
    } as Game;
    const other = { ...GAME, id: "g2", copies: [] } as Game;
    act(() => useStore.setState({ games: [owner, other], gameDlc: [], economy: DEFAULT_ECONOMY, convertDlcCopy, saveGameDlc }));
    render(<DlcBlock hub={[owner, other]} />);
    fireEvent.click(screen.getByRole("button", { name: "Make it a DLC record" }));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByDisplayValue("2025-03-04")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save as DLC" }));
    await waitFor(() => expect(convertDlcCopy).toHaveBeenCalledWith("old", expect.objectContaining({ gameId: "g1" })));
  });

  it("explains why a subscription or discounted DLC copy stays a copy", () => {
    setup([], {
      ...GAME,
      copies: [{ id: "old", platform: "PS5", format: "dlc", acquisition: "subscription", provider: "PS Plus" }],
    } as Game);
    expect(screen.queryByRole("button", { name: "Make it a DLC record" })).toBeNull();
    expect(screen.getByText(/stays a copy for now/)).toBeTruthy();
  });

  it("is open to every player", () => {
    setup([]);
    expect(screen.getByText("Add DLC")).toBeTruthy();
  });

  it("turns an old DLC copy into a DLC record, starting from its details", async () => {
    const withCopy = {
      ...GAME,
      copies: [
        { id: "base", platform: "PlayStation 5", format: "digital" },
        { id: "old", platform: "PlayStation 5", format: "dlc", cost: 19.99, note: "Legends" },
      ],
    } as Game;
    setup([], withCopy);
    fireEvent.click(screen.getByRole("button", { name: "Make it a DLC record" }));
    expect((screen.getByDisplayValue("Legends") as HTMLInputElement).value).toBe("Legends");
    expect(screen.getByDisplayValue("19.99")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save as DLC" }));
    await waitFor(() =>
      expect(convertDlcCopy).toHaveBeenCalledWith("old", expect.objectContaining({ gameId: "g1", name: "Legends", cost: 19.99 })),
    );
    expect(saveGameDlc).not.toHaveBeenCalled();
  });

  it("lists the game's DLC with what was spent and a cleared expansion's payout", () => {
    setup([dlc(), dlc({ id: "d2", kind: "expansion", name: "Legends", cost: 20, hours: 8, runStatus: "cleared", runReward: 250 })]);
    expect(screen.getByText("2 recorded · $70 spent")).toBeTruthy();
    expect(screen.getByText("Cleared · +250")).toBeTruthy();
  });

  it("starts a finished game's form on a story expansion, previews its coins, and saves it", async () => {
    setup([]);
    fireEvent.click(screen.getByText("Add DLC"));
    expect((screen.getByLabelText(/Story expansion/) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("e.g. Legends"), { target: { value: "Legends" } });
    fireEvent.click(screen.getByText("Look up"));
    await waitFor(() => expect(screen.getByDisplayValue("9")).toBeTruthy());
    // Default formulas: 40 + 3 x 9 + 120 fresh to start; a flat 40 bounty.
    expect(screen.getByText(/to start/).textContent).toMatch(/187 to start · pays\s+40 after/);
    fireEvent.click(screen.getAllByText("Add DLC").at(-1)!);
    await waitFor(() =>
      expect(saveGameDlc).toHaveBeenCalledWith(expect.objectContaining({ gameId: "g1", kind: "expansion", name: "Legends", hours: 9 })),
    );
  });

  it("keeps a started expansion's kind and length", () => {
    setup([dlc({ kind: "expansion", name: "Legends", hours: 8, runStatus: "playing" })]);
    fireEvent.click(screen.getByLabelText("Edit Legends"));
    expect(screen.getByText(/kind and length stay/)).toBeTruthy();
    expect(screen.queryByLabelText("Remove Legends")).toBeNull();
  });
});
