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
  it("marks a clear verified once enough of its length is logged", () => {
    render(<ClearLogChip game={finished()} />);
    expect(screen.getByText(/Verified/)).toBeTruthy();
    expect(screen.getByText(/26h 36m \/ 27h/)).toBeTruthy();
  });

  it("shows logged time without the mark when too little is logged", () => {
    render(<ClearLogChip game={finished({ title: "Granblue", hours: 130, playedHours: 1 })} />);
    expect(screen.queryByText(/Verified/)).toBeNull();
    expect(screen.getByText(/1h \/ 130h/)).toBeTruthy();
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
