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
      rotationSlots: 3,
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
    // Only a general slot is open → the smart default is the general slot.
    expect(redeemVoucher).toHaveBeenCalledWith("g1", { kind: "general" });
    expect(buyGame).not.toHaveBeenCalled();
  });

  it("pays with coins when that option is chosen", () => {
    render(<ActivationModal game={game()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Pay with coins/i }));
    expect(buyGame).toHaveBeenCalledWith("g1", { kind: "general" });
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

  it("routes a free start into the Rotation lane when the player picks it", () => {
    render(<ActivationModal game={game()} onClose={() => {}} />);
    // The picker offers General + Rotation; choose Rotation (free), then confirm.
    fireEvent.click(screen.getByRole("button", { name: /ongoing · free/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add to Rotation/i }));
    expect(buyGame).toHaveBeenCalledWith("g1", { kind: "rotation" });
  });

  it("falls back to the Rotation lane when it's the only open lane", () => {
    act(() =>
      useStore.setState({
        generalSlots: 1,
        games: [game(), game({ id: "p1", status: "playing", slotId: null })],
      }),
    );
    render(<ActivationModal game={game()} onClose={() => {}} />);
    // General is full, so the Rotation lane is the default — confirm it routes free.
    expect(screen.getByText(/Start in/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add to Rotation/i }));
    expect(buyGame).toHaveBeenCalledWith("g1", { kind: "rotation" });
  });

  it("lets the player pick a matching targeted slot over the general slot", () => {
    act(() =>
      useStore.setState({
        myTargetedSlots: [
          {
            id: "slot-quick",
            definition: { id: "def-q", name: "Quick Play", kind: "standard", minHours: null, maxHours: 30, minYear: null, maxYear: null, minMetacritic: null, maxMetacritic: null, genres: [], platforms: [], defaultGrantCount: 0, active: true },
          },
        ],
      }),
    );
    render(<ActivationModal game={game()} onClose={() => {}} />); // 20h game fits Quick Play
    // Default preselects Quick Play; explicitly choose General instead.
    fireEvent.click(screen.getByRole("button", { name: /General slot/i }));
    fireEvent.click(screen.getByRole("button", { name: /Pay with coins/i }));
    expect(buyGame).toHaveBeenCalledWith("g1", { kind: "general" });
  });

  it("disables both paths and warns when there's no open slot", () => {
    // Fill the general slot AND give the Rotation lane no capacity, so nothing's open.
    act(() =>
      useStore.setState({
        generalSlots: 1,
        rotationSlots: 0,
        games: [game(), game({ id: "p1", status: "playing", slotId: null })],
      }),
    );
    render(<ActivationModal game={game()} onClose={() => {}} />);
    expect(screen.getByText(/No open Now Playing slot/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Use a voucher/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Pay with coins/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
