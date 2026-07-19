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
      replaySlots: 2,
      completionistSlots: 0,
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

  it("never offers the Rotation lane in the buy flow (Rotation is ongoing-only)", () => {
    render(<ActivationModal game={game()} onClose={() => {}} />);
    // Only one focus option (a general slot) → no picker, and no Rotation anywhere.
    expect(screen.queryByText(/Start in/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Rotation/i })).toBeNull();
  });

  it("lets the player buy straight into the Completionist lane", () => {
    act(() => useStore.setState({ completionistSlots: 2 }));
    render(<ActivationModal game={game()} onClose={() => {}} />);
    // The picker now offers Focus + Completionist (default is Focus).
    expect(screen.getByText(/Start in/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Completionist/i }));
    fireEvent.click(screen.getByRole("button", { name: /Pay with coins/i }));
    expect(buyGame).toHaveBeenCalledWith("g1", { kind: "completionist" });
  });

  it("disables both paths and warns when there's no open slot", () => {
    // Fill the Focus lane AND leave Rotation/Completionist with no capacity.
    act(() =>
      useStore.setState({
        generalSlots: 1,
        rotationSlots: 0,
        completionistSlots: 0,
        games: [game(), game({ id: "p1", status: "playing", slotId: null })],
      }),
    );
    render(<ActivationModal game={game()} onClose={() => {}} />);
    expect(screen.getByText(/No open Now Playing slot/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Use a voucher/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Pay with coins/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ActivationModal · economy off", () => {
  beforeEach(() => {
    act(() => useStore.setState({ economyEnabled: false }));
  });

  it("collapses to a plain free Start playing confirm (no fee, voucher or bounty)", () => {
    render(<ActivationModal game={game()} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /Use a voucher/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pay with coins/i })).toBeNull();
    expect(screen.queryByText(/Finish it later to earn a bounty/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Start playing/i }));
    expect(buyGame).toHaveBeenCalledWith("g1", { kind: "general" });
  });

  it("lets a coinless player start for free", () => {
    act(() => useStore.setState({ coins: 0 }));
    render(<ActivationModal game={game()} onClose={() => {}} />);
    const btn = screen.getByRole("button", { name: /Start playing/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(screen.queryByText(/more coins/i)).toBeNull();
  });
});
