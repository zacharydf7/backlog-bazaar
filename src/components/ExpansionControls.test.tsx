import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { ExpansionBazaarCard, ExpansionRunActions } from "./ExpansionControls";
import { useStore } from "../store";
import { DEFAULT_ECONOMY } from "../lib/economy";
import type { GameDlc } from "../lib/dlc";
import type { BazaarExpansion } from "../lib/bazaarExpansions";
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

function setup(list: GameDlc[], extra: Record<string, unknown> = {}) {
  act(() =>
    useStore.setState({
      isAdmin: false,
      coins: 1000,
      economyEnabled: true,
      bonusPerks: {},
      ...extra,
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

describe("ExpansionBazaarCard", () => {
  // Default formulas: 40 + 3 x 8 + 120 fresh to start; a flat 40 bounty after 4h.
  const card = (over: Partial<BazaarExpansion> = {}): BazaarExpansion => ({
    dlc: LEGENDS,
    game: GAME,
    quote: { price: 184, bounty: 40, gateHours: 4, paying: true },
    lockedReason: null,
    ...over,
  });

  it("leads with the expansion, then buys and starts it after confirming its price and bounty", () => {
    setup([LEGENDS]);
    render(<ExpansionBazaarCard expansion={card()} />);
    expect(screen.getByRole("heading", { name: "Legends" })).toBeTruthy();
    expect(screen.getByText("Ghost of Yotei expansion")).toBeTruthy();
    expect(screen.getByText(/Clear bounty/).textContent).toMatch(/40/);
    fireEvent.click(screen.getByRole("button", { name: /Buy & Start/ }));
    expect(screen.getByText(/Starting costs/).textContent).toMatch(/Starting costs\s+184\. Clearing it pays\s+40 once you've logged 4h/);
  });

  it("confirms the same price and bounty the card shows", () => {
    setup([LEGENDS]);
    render(<ExpansionBazaarCard expansion={card({ quote: { price: 99, bounty: 300, gateHours: 2, paying: true } })} />);
    fireEvent.click(screen.getByRole("button", { name: /Buy & Start/ }));
    expect(screen.getByText(/Starting costs/).textContent).toMatch(/Starting costs\s+99\. Clearing it pays\s+300 once you've logged 2h/);
    fireEvent.click(screen.getByText("Play expansion"));
    expect(startExpansion).toHaveBeenCalledWith("d1");
  });

  it("stays locked, with why, until its game can take it", () => {
    setup([LEGENDS]);
    render(<ExpansionBazaarCard expansion={card({ lockedReason: "Finish Ghost of Yotei first" })} />);
    const locked = screen.getByRole("button", { name: /Story-locked/ }) as HTMLButtonElement;
    expect(locked.disabled).toBe(true);
    expect(screen.getByText(/Finish Ghost of Yotei first/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Buy & Start/ })).toBeNull();
  });

  it("says how many coins are missing instead of starting", () => {
    setup([LEGENDS], { coins: 100 });
    render(<ExpansionBazaarCard expansion={card()} />);
    const short = screen.getByRole("button", { name: /Need/ }) as HTMLButtonElement;
    expect(short.disabled).toBe(true);
    expect(short.textContent).toMatch(/84 more/);
  });

  it("takes a running coin event's start discount off the price it shows and confirms", () => {
    setup([LEGENDS], { bonusPerks: { g1: { discount: { event: "Half Off", pct: 50, capLeft: null } } } });
    render(<ExpansionBazaarCard expansion={card()} />);
    const buy = screen.getByRole("button", { name: /Buy & Start/ });
    expect(buy.querySelector("s")?.textContent).toBe("184");
    expect(buy.textContent).toMatch(/92$/);
    fireEvent.click(buy);
    expect(screen.getByText(/Starting costs/).textContent).toMatch(/Starting costs\s+92\./);
  });

  it("names a running coin event's bounty boost", () => {
    setup([LEGENDS], { bonusPerks: { g1: { bounty: { event: "Double Coins", factor: 2, capLeft: null } } } });
    render(<ExpansionBazaarCard expansion={card()} />);
    expect(screen.getByText(/Double Coins: bounty/).textContent).toMatch(/×2 if you clear it while it runs/);
  });

  it("starts for free with the economy off", () => {
    setup([LEGENDS], { economyEnabled: false });
    render(<ExpansionBazaarCard expansion={card()} />);
    expect(screen.getByRole("button", { name: /Start playing/ })).toBeTruthy();
    expect(screen.queryByText(/Clear bounty/)).toBeNull();
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

  it("adds a running coin event's boost to a full clear, and says so before the gate", () => {
    const perks = { g1: { bounty: { event: "Double Coins", factor: 2, capLeft: null } } };
    setup([running], { bonusPerks: perks });
    const { unmount } = render(
      <ExpansionRunActions game={GAME} dlc={running} showEconomy withSessionStopped={(fn) => fn()} />,
    );
    // 1h of 4h: the boost waits on a full clear, and is on the full 40 bounty.
    expect(screen.getByText(/Double Coins:/).textContent).toMatch(/\+\s*40 on a full clear/);
    unmount();
    render(
      <ExpansionRunActions game={{ ...GAME, playedHours: 44 }} dlc={running} showEconomy withSessionStopped={(fn) => fn()} />,
    );
    expect(screen.getByText(/Double Coins:/).textContent).toMatch(/\+\s*40 on clear$/);
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
