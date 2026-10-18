import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { ExpansionRunActions, ExpansionStartActions } from "./ExpansionControls";
import { useStore } from "../store";
import { DEFAULT_ECONOMY } from "../lib/economy";
import type { GameDlc } from "../lib/dlc";
import type { Game } from "../types";

const GAME = { id: "g1", title: "Ghost of Yotei", status: "finished", genres: [], copies: [], addedAt: 1, playedHours: 41 } as Game;

const LEGENDS: GameDlc = {
  id: "d1",
  gameId: "g1",
  kind: "expansion",
  name: "Legends",
  acquiredOn: null,
  cost: null,
  hours: 8,
  note: null,
  runStatus: "owned",
  runStartedAt: null,
  runHoursStart: null,
  runPrice: null,
  runPaying: false,
  runQuote: null,
  runClearedAt: null,
  runReward: null,
  createdAt: Date.now(),
};

const startExpansion = vi.fn(async () => {});
const finishExpansion = vi.fn(async () => {});
const cancelExpansion = vi.fn(async () => {});

function setup(list: GameDlc[], permitted = true) {
  act(() =>
    useStore.setState({
      isAdmin: false,
      permissions: permitted ? ["dlc.preview"] : [],
      gameDlc: list,
      economy: DEFAULT_ECONOMY,
      bountyGatePct: 50,
      startExpansion,
      finishExpansion,
      cancelExpansion,
    }),
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ExpansionStartActions", () => {
  it("offers each unplayed story expansion and confirms its price and bounty", () => {
    setup([LEGENDS, { ...LEGENDS, id: "d2", name: "Played", runStatus: "cleared" }]);
    render(<ExpansionStartActions game={GAME} showEconomy replayHasRoom />);
    expect(screen.queryByText(/Play Played/)).toBeNull();
    fireEvent.click(screen.getByText("Play Legends"));
    // Default formulas: 40 + 3 x 8 + 120 fresh; a flat 40 bounty after 4h.
    expect(screen.getByText(/Starting costs/).textContent).toMatch(/Starting costs\s+184\. Clearing it pays\s+40 once you've logged 4h/);
    fireEvent.click(screen.getByText("Play expansion"));
    expect(startExpansion).toHaveBeenCalledWith("d1");
  });

  it("shows nothing without the preview permission", () => {
    setup([LEGENDS], false);
    render(<ExpansionStartActions game={GAME} showEconomy replayHasRoom />);
    expect(screen.queryByText("Play Legends")).toBeNull();
  });
});

describe("ExpansionRunActions", () => {
  // Started at the default formulas: 40 + 3 x 8 + 120 fresh to start; a flat 40 bounty after 4h.
  const running: GameDlc = {
    ...LEGENDS,
    runStatus: "playing",
    runHoursStart: 40,
    runPrice: 184,
    runPaying: true,
    runQuote: { price: 184, bounty: 40, gateHours: 4, paying: true },
  };

  it("pays from the quote frozen when the run started, not today's settings", () => {
    const frozen: GameDlc = { ...running, runQuote: { price: 184, bounty: 300, gateHours: 2, paying: true } };
    setup([frozen]);
    render(<ExpansionRunActions game={GAME} dlc={frozen} showEconomy withSessionStopped={(fn) => fn()} />);
    // 1h of the frozen 2h gate: the start price back (184), not today's 40 bounty.
    expect(screen.getByText(/1h of 2h logged/)).toBeTruthy();
    expect(screen.getByText(/Clear expansion/).textContent).toMatch(/184/);
  });

  it("previews no payout for a run started while the economy was off", () => {
    const free: GameDlc = { ...running, runPaying: false, runPrice: 0 };
    setup([free]);
    render(<ExpansionRunActions game={GAME} dlc={free} showEconomy withSessionStopped={(fn) => fn()} />);
    expect(screen.getByText(/Clear expansion/).textContent).not.toMatch(/\d/);
  });

  it("shows progress toward the gate, today's payout and the refund on a stop", () => {
    setup([running]);
    render(<ExpansionRunActions game={GAME} dlc={running} showEconomy withSessionStopped={(fn) => fn()} />);
    expect(screen.getByText(/1h of 4h logged/)).toBeTruthy();
    // Under the gate it pays the start price back (184 is more than the 40 bounty, so capped at 40).
    expect(screen.getByText(/Clear expansion/).textContent).toMatch(/40/);
    expect(screen.getByText(/Stop expansion/).textContent).toMatch(/184/);
    fireEvent.click(screen.getByText(/Clear expansion/));
    expect(finishExpansion).toHaveBeenCalledWith("d1");
    fireEvent.click(screen.getByText(/Stop expansion/));
    expect(cancelExpansion).toHaveBeenCalledWith("d1");
  });
});
