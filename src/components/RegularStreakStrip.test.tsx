import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { RegularStreakStrip } from "./RegularStreakStrip";
import { useStore } from "../store";
import type { Game } from "../types";
import type { BonusEvent } from "../lib/bonusEvents";

const ROTATION = { id: "r", title: "Hearthstone", status: "playing", inRotation: true, ongoing: true } as Game;
const BASE = { streak: 2, best: 4, weekHours: 0.25, minHours: 1, done: false, nextBonus: 20, weekEnds: Date.now() + 3 * 86_400_000 };

beforeEach(() => {
  act(() => useStore.setState({ viewing: null, economyEnabled: true, games: [ROTATION], regularStreak: BASE, bonusEvents: [] }));
});

describe("RegularStreakStrip", () => {
  it("shows the streak, this week's progress and what it pays", () => {
    render(<RegularStreakStrip />);
    expect(screen.getByText("Regular streak: 2 weeks")).toBeTruthy();
    expect(screen.getByText("Best: 4 weeks")).toBeTruthy();
    expect(screen.getByText(/Play 45m more on Rotation games this week for/).textContent).toMatch(/20/);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25");
  });

  it("says when this week already counts", () => {
    act(() => useStore.setState({ regularStreak: { ...BASE, streak: 3, done: true, nextBonus: 25 } }));
    render(<RegularStreakStrip />);
    expect(screen.getByText(/This week counts\. Play again next week for/).textContent).toMatch(/25/);
  });

  it("adds a live play boost aimed at every game, but not one aimed at some games", () => {
    const now = Date.now();
    const event = (over: Partial<BonusEvent>) =>
      ({
        name: "Double Play",
        startsAt: now - 3_600_000,
        endsAt: now + 86_400_000,
        bountyMult: 1,
        sessionMult: 2,
        rewardsMult: 1,
        startDiscountPct: 0,
        genres: [],
        platforms: [],
        offMainPlatform: false,
        minHours: null,
        maxHours: null,
        playerCap: null,
        capUsed: 0,
        ...over,
      }) as BonusEvent;
    act(() => useStore.setState({ bonusEvents: [event({ name: "RPG Week", sessionMult: 3, genres: ["RPG"] })] }));
    const { rerender } = render(<RegularStreakStrip />);
    expect(screen.getByText(/Play 45m more/).textContent).toMatch(/for\s+20 ·/);
    act(() => useStore.setState({ bonusEvents: [event({})] }));
    rerender(<RegularStreakStrip />);
    expect(screen.getByText(/Play 45m more/).textContent).toMatch(/for\s+40 \(Double Play\)/);
  });

  it("stays away without a Rotation game, or while visiting", () => {
    act(() => useStore.setState({ games: [] }));
    expect(render(<RegularStreakStrip />).container.firstChild).toBeNull();
  });
});
