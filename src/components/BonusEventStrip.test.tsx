import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { BonusEventStrip } from "./BonusEventStrip";
import { useStore } from "../store";
import type { BonusEvent } from "../lib/bonusEvents";

const H = 3_600_000;

function ev(over: Partial<BonusEvent> = {}): BonusEvent {
  return {
    id: "e1",
    name: "Double Bounty Weekend",
    description: "Finish something!",
    startsAt: Date.now() - H,
    endsAt: Date.now() + 30 * H,
    repeat: null,
    bountyMult: 2,
    sessionMult: 1,
    rewardsMult: 1,
    startDiscountPct: 0,
    genres: ["RPG"],
    platforms: [],
    offMainPlatform: false,
    minHours: null,
    maxHours: null,
    playerCap: null,
    capUsed: 0,
    ...over,
  };
}

beforeEach(() => {
  act(() => useStore.setState({ viewing: null, economyEnabled: true, bonusEvents: [] }));
});

describe("BonusEventStrip", () => {
  it("renders nothing without events", () => {
    const { container } = render(<BonusEventStrip />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a running event's boosts, targets and countdown", () => {
    act(() => useStore.setState({ bonusEvents: [ev({ playerCap: 200, capUsed: 50 })] }));
    render(<BonusEventStrip />);
    expect(screen.getByText(/Coin event: Double Bounty Weekend/)).toBeTruthy();
    expect(screen.getByText("Bounties ×2")).toBeTruthy();
    expect(screen.getByText("For RPG")).toBeTruthy();
    expect(screen.getByText("Up to 150 bonus coins left")).toBeTruthy();
    expect(screen.getByText("Ends in 2 days")).toBeTruthy();
  });

  it("labels an upcoming event as coming up", () => {
    act(() =>
      useStore.setState({ bonusEvents: [ev({ startsAt: Date.now() + 5 * H, endsAt: Date.now() + 50 * H })] }),
    );
    render(<BonusEventStrip />);
    expect(screen.getByText(/Coming up: Double Bounty Weekend/)).toBeTruthy();
    expect(screen.getByText("Starts in 5h")).toBeTruthy();
  });

  it("hides while visiting, with the economy off, or once the event has ended", () => {
    act(() => useStore.setState({ bonusEvents: [ev()], economyEnabled: false }));
    expect(render(<BonusEventStrip />).container.firstChild).toBeNull();
    act(() =>
      useStore.setState({
        economyEnabled: true,
        bonusEvents: [ev({ startsAt: Date.now() - 5 * H, endsAt: Date.now() - H })],
      }),
    );
    expect(render(<BonusEventStrip />).container.firstChild).toBeNull();
  });
});
