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

function setup(list: GameDlc[], permitted = true) {
  act(() =>
    useStore.setState({
      isAdmin: false,
      permissions: permitted ? ["dlc.preview"] : [],
      games: [GAME],
      gameDlc: list,
      economy: DEFAULT_ECONOMY,
      economyEnabled: true,
      saveGameDlc,
    }),
  );
  render(<DlcBlock hub={[GAME]} />);
}

beforeEach(() => saveGameDlc.mockClear());

describe("DlcBlock", () => {
  it("stays hidden without the preview permission", () => {
    setup([dlc()], false);
    expect(screen.queryByText("Add DLC")).toBeNull();
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
