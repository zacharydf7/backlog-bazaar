import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { ActivationModal } from "./ActivationModal";
import { useStore } from "../store";
import { DEFAULT_PRICE_FORMULA, DEFAULT_BOUNTY_FORMULA } from "../lib/economy";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Hollow Knight",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    hours: 20,
    addedAt: 1,
    ...over,
  } as Game;
}

const buyGame = vi.fn(async () => {});
const redeemVoucher = vi.fn(async () => {});

beforeEach(() => {
  buyGame.mockClear();
  redeemVoucher.mockClear();
  act(() =>
    useStore.setState({
      cloud: false,
      games: [game()],
      coins: 1000,
      vouchers: 2,
      generalSlots: 2,
      myTargetedSlots: [],
      economy: { price: DEFAULT_PRICE_FORMULA, bounty: DEFAULT_BOUNTY_FORMULA },
      buyGame,
      redeemVoucher,
    }),
  );
});

describe("ActivationModal", () => {
  it("offers both a voucher and a coin path; the voucher redeems for free", () => {
    render(<ActivationModal game={game()} onClose={() => {}} />);
    const voucherBtn = screen.getByRole("button", { name: /Use a voucher/i });
    expect(voucherBtn.textContent).toMatch(/Free/i);

    fireEvent.click(voucherBtn);
    // No targeted slot chosen → auto-placement (undefined slot).
    expect(redeemVoucher).toHaveBeenCalledWith("g1", undefined);
    expect(buyGame).not.toHaveBeenCalled();
  });

  it("pays with coins when that option is chosen", () => {
    render(<ActivationModal game={game()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Pay with coins/i }));
    expect(buyGame).toHaveBeenCalledWith("g1", undefined);
    expect(redeemVoucher).not.toHaveBeenCalled();
  });

  it("hides the voucher option when the balance is zero", () => {
    act(() => useStore.setState({ vouchers: 0 }));
    render(<ActivationModal game={game()} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /Use a voucher/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Pay with coins/i })).toBeTruthy();
  });

  it("lets a broke player still use a voucher (coin path disabled)", () => {
    act(() => useStore.setState({ coins: 0 }));
    render(<ActivationModal game={game()} onClose={() => {}} />);
    const voucherBtn = screen.getByRole("button", { name: /Use a voucher/i }) as HTMLButtonElement;
    const coinBtn = screen.getByRole("button", { name: /Pay with coins/i }) as HTMLButtonElement;
    expect(voucherBtn.disabled).toBe(false);
    expect(coinBtn.disabled).toBe(true);
  });

  it("routes the purchase into an Endless slot when the player opts in", () => {
    act(() =>
      useStore.setState({
        myTargetedSlots: [
          {
            id: "slot-endless",
            definition: { id: "def-e", name: "Ongoing", kind: "endless", minHours: null, maxHours: null, active: true },
          },
        ],
      }),
    );
    render(<ActivationModal game={game()} onClose={() => {}} />);
    // Opt in to the Endless slot, then pay with coins.
    fireEvent.click(screen.getByRole("checkbox", { name: /Park in/i }));
    fireEvent.click(screen.getByRole("button", { name: /Pay with coins/i }));
    expect(buyGame).toHaveBeenCalledWith("g1", "slot-endless");
  });

  it("forces the Endless slot when general slots are full but one is open", () => {
    act(() =>
      useStore.setState({
        generalSlots: 1,
        games: [game(), game({ id: "p1", status: "playing", slotId: null })],
        myTargetedSlots: [
          {
            id: "slot-endless",
            definition: { id: "def-e", name: "Ongoing", kind: "endless", minHours: null, maxHours: null, active: true },
          },
        ],
      }),
    );
    render(<ActivationModal game={game()} onClose={() => {}} />);
    // The only opening is the endless slot, so the box is checked and locked on.
    const box = screen.getByRole("checkbox", { name: /Park in/i }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Pay with coins/i }));
    expect(buyGame).toHaveBeenCalledWith("g1", "slot-endless");
  });

  it("disables both paths and warns when there's no open slot", () => {
    // Fill both general slots with playing games so none are open.
    act(() =>
      useStore.setState({
        generalSlots: 1,
        games: [game(), game({ id: "p1", status: "playing", slotId: null })],
      }),
    );
    render(<ActivationModal game={game()} onClose={() => {}} />);
    expect(screen.getByText(/No open Now Playing slot/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Use a voucher/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Pay with coins/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
