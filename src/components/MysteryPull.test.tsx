import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MysteryPull } from "./MysteryPull";
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

const logMysteryPull = vi.fn(async () => {});

beforeEach(() => {
  logMysteryPull.mockClear();
  act(() =>
    useStore.setState({
      cloud: false,
      games: [game()],
      coins: 1000,
      vouchers: 0,
      generalSlots: 2,
      rotationSlots: 3,
      replaySlots: 2,
      completionistSlots: 0,
      myTargetedSlots: [],
      economy: { price: DEFAULT_PRICE_FORMULA, bounty: DEFAULT_BOUNTY_FORMULA },
      buyGame: vi.fn(async () => {}),
      redeemVoucher: vi.fn(async () => {}),
      logMysteryPull,
    }),
  );
});

describe("MysteryPull", () => {
  it("disables the button with a reason when nothing can be pulled", () => {
    act(() => useStore.setState({ games: [] }));
    render(<MysteryPull />);
    const btn = screen.getByRole("button", { name: /Mystery Pull/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/No games in your Bazaar/);
  });

  it("opens the pull with a drawn game, its price, and a disabled re-roll for a pool of one", () => {
    render(<MysteryPull />);
    fireEvent.click(screen.getByRole("button", { name: /Mystery Pull/i }));
    expect(screen.getByRole("heading", { name: "Hollow Knight" })).toBeTruthy();
    expect(screen.getByText(/to start/)).toBeTruthy();
    const reroll = screen.getByRole("button", { name: /Re-roll/i }) as HTMLButtonElement;
    expect(reroll.disabled).toBe(true);
  });

  it("re-rolls to a different game", () => {
    act(() =>
      useStore.setState({
        games: [game({ id: "a", title: "Alpha" }), game({ id: "b", title: "Beta" })],
      }),
    );
    render(<MysteryPull />);
    fireEvent.click(screen.getByRole("button", { name: /Mystery Pull/i }));
    const before = screen.getByRole("heading", { level: 2 }).textContent;
    fireEvent.click(screen.getByRole("button", { name: /Re-roll/i }));
    const after = screen.getByRole("heading", { level: 2 }).textContent;
    expect(after).not.toBe(before);
    expect(["Alpha", "Beta"]).toContain(after);
  });

  it("hands the accepted pull to the standard activation flow and records it once the game starts", async () => {
    // buyGame flips the game to playing, exactly like the real store action.
    const buyGame = vi.fn(async (id: string) => {
      useStore.setState({
        games: useStore
          .getState()
          .games.map((g) => (g.id === id ? { ...g, status: "playing" as const } : g)),
      });
    });
    act(() => useStore.setState({ buyGame }));

    render(<MysteryPull />);
    fireEvent.click(screen.getByRole("button", { name: /Mystery Pull/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add to Now Playing/i }));
    // The standard ActivationModal takes over; pay the normal coin fee.
    fireEvent.click(await screen.findByRole("button", { name: /Pay with coins/i }));

    await waitFor(() => expect(buyGame).toHaveBeenCalledWith("g1", { kind: "general" }));
    // The confirmed pull is recorded (no re-rolls) and the pull closes.
    await waitFor(() => expect(logMysteryPull).toHaveBeenCalledWith("g1", 0, "play"));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Add to Now Playing/i })).toBeNull(),
    );
  });

  it("cancel closes without buying or recording anything", () => {
    render(<MysteryPull />);
    fireEvent.click(screen.getByRole("button", { name: /Mystery Pull/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.queryByRole("button", { name: /Add to Now Playing/i })).toBeNull();
    expect(logMysteryPull).not.toHaveBeenCalled();
  });
});

describe("MysteryPull (completion kind)", () => {
  it("disables the button with a reason when nothing beaten is left to 100%", () => {
    act(() =>
      useStore.setState({
        games: [game({ status: "finished", finishTag: "completed" })],
      }),
    );
    render(<MysteryPull kind="complete" />);
    const btn = screen.getByRole("button", { name: /Mystery Pull/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/Nothing on your Finished shelf/);
  });

  it("draws a beaten game as a FREE 100% run and records the confirmed pull", async () => {
    // enterCompletionist flips the game to a playing completionist run, exactly
    // like the real store action.
    const enterCompletionist = vi.fn(async (id: string) => {
      useStore.setState({
        games: useStore
          .getState()
          .games.map((g) =>
            g.id === id ? { ...g, status: "playing" as const, completionist: true } : g,
          ),
      });
    });
    act(() =>
      useStore.setState({
        games: [game({ status: "finished", finishTag: "beaten" })],
        completionistSlots: 2,
        coins: 0, // completion pulls have no coin gate
        enterCompletionist,
      }),
    );

    render(<MysteryPull kind="complete" />);
    fireEvent.click(screen.getByRole("button", { name: /Mystery Pull/i }));
    expect(screen.getByText(/Free — pays the Completion Bonus/)).toBeTruthy();
    // No buy flow for a completion pull — the accept is direct.
    expect(screen.queryByRole("button", { name: /Add to Now Playing/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Go for 100%/i }));
    await waitFor(() => expect(enterCompletionist).toHaveBeenCalledWith("g1"));
    await waitFor(() => expect(logMysteryPull).toHaveBeenCalledWith("g1", 0, "complete"));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Go for 100%/i })).toBeNull());
  });
});
