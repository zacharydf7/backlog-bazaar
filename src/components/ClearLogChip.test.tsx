import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { Game } from "../types";
import { useStore } from "../store";
import { ClearLogChip, HeldBountyNote } from "./ClearLogChip";

function finished(over: Partial<Game> = {}): Game {
  return {
    id: "f",
    title: "Doom",
    status: "finished",
    finishTag: "beaten",
    addedAt: 1,
    genres: [],
    hours: 27,
    playedHours: 26.6,
    ...over,
  } as Game;
}

beforeEach(() => {
  act(() => useStore.setState({ bountyGatePct: 25 }));
});

describe("ClearLogChip (coin outliers, 2026-10-17)", () => {
  it("marks a clear Verified once enough of its length is logged", () => {
    render(<ClearLogChip game={finished()} />);
    const chip = screen.getByText("Verified");
    expect(chip.getAttribute("title")).toMatch(/26h 36m of 27h logged/);
  });

  it("marks it Unverified when too little is logged, naming the bar in the tooltip", () => {
    render(<ClearLogChip game={finished({ title: "Granblue", hours: 130, playedHours: 1 })} />);
    const chip = screen.getByText("Unverified");
    expect(chip.getAttribute("title")).toMatch(/1h of 130h logged — Verified at 25%/);
  });

  it("follows the admin-set percentage", () => {
    act(() => useStore.setState({ bountyGatePct: 50 }));
    render(<ClearLogChip game={finished({ hours: 40, playedHours: 15 })} />);
    expect(screen.getByText("Unverified")).toBeTruthy();
  });

  it("shows nothing for a retired game, an endless one, or one with no length", () => {
    const { container } = render(
      <>
        <ClearLogChip game={finished({ finishTag: "retired" })} />
        <ClearLogChip game={finished({ finishTag: "endless" })} />
        <ClearLogChip game={finished({ hours: undefined })} />
      </>,
    );
    expect(container.textContent).toBe("");
  });
});

describe("HeldBountyNote", () => {
  it("says how many coins wait and how much more logging releases them", () => {
    render(<HeldBountyNote game={finished({ playedHours: 1, bountyHeld: 283, bountyGateHours: 12.5 })} />);
    expect(screen.getByText(/283 coins/)).toBeTruthy();
    expect(screen.getByText(/all of them at 12h 30m logged \(11h 30m to go\)/)).toBeTruthy();
  });

  it("shows nothing without a hold", () => {
    const { container } = render(<HeldBountyNote game={finished()} />);
    expect(container.textContent).toBe("");
  });
});
