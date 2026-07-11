import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { GameValueBadge } from "./ValueBadge";
import { useStore, type ViewingSession } from "../store";
import type { Game, GameCopy } from "../types";

const copy = (cost: number | undefined): GameCopy =>
  ({ id: Math.random().toString(36).slice(2), platform: "PC", cost }) as GameCopy;

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Hollow Knight",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    familyId: null,
    ...over,
  } as Game;
}

beforeEach(() => {
  act(() => useStore.setState({ viewing: null, targetCostPerHour: 2 }));
});

describe("GameValueBadge", () => {
  it("appears once playtime pays off the purchase at the target rate, with the math in the tooltip", () => {
    // $60 at $2/hr → 30h required; 32h logged.
    render(<GameValueBadge game={game({ copies: [copy(60)], playedHours: 32 })} />);
    const badge = screen.getByText("Well spent");
    expect(badge).toBeTruthy();
    expect(badge.closest("span")?.getAttribute("title")).toBe(
      "Goal met: $60.00 spent ÷ 32h played = $1.88/hr (target $2.00/hr)",
    );
  });

  it("stays hidden while the goal isn't met", () => {
    render(<GameValueBadge game={game({ copies: [copy(60)], playedHours: 10 })} />);
    expect(screen.queryByText("Well spent")).toBeNull();
  });

  it("stays hidden with no target set (feature off)", () => {
    act(() => useStore.setState({ targetCostPerHour: null }));
    render(<GameValueBadge game={game({ copies: [copy(60)], playedHours: 90 })} />);
    expect(screen.queryByText("Well spent")).toBeNull();
  });

  it("bypasses zero-cost games entirely", () => {
    render(<GameValueBadge game={game({ copies: [], playedHours: 500 })} />);
    expect(screen.queryByText("Well spent")).toBeNull();
  });

  it("never judges another player's library while visiting", () => {
    act(() =>
      useStore.setState({ viewing: { userId: "u2", games: [] } as unknown as ViewingSession }),
    );
    render(<GameValueBadge game={game({ copies: [copy(60)], playedHours: 90 })} />);
    expect(screen.queryByText("Well spent")).toBeNull();
    act(() => useStore.setState({ viewing: null }));
  });

  it("judges a family rollup on summed spend + hours, ignoring wishlist twins", () => {
    // $20 + $20 owned = $40 → 20h required at $2/hr; 12h + 9h = 21h. The
    // wishlist twin's $500 hunting note must not enter the math.
    const members = [
      game({ id: "a", copies: [copy(20)], playedHours: 12 }),
      game({ id: "b", copies: [copy(20)], playedHours: 9 }),
      game({ id: "w", status: "wishlist", copies: [copy(500)] }),
    ];
    render(<GameValueBadge game={members[0]} members={members} />);
    expect(screen.getByText("Well spent")).toBeTruthy();
  });
});
