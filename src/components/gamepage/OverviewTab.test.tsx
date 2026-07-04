import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ReadOnlyOverview } from "./OverviewTab";
import { useStore } from "../../store";
import type { Game } from "../../types";

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
  act(() => useStore.setState({ cloud: false, viewing: null }));
});

describe("ReadOnlyOverview", () => {
  it("describes the card's actually-shared fields (title, length, screenshots) — not platforms", () => {
    render(<ReadOnlyOverview game={game()} hideSpend />);
    const blurb = screen.getByText(/shared with everyone/i);
    expect(blurb.textContent).toMatch(/Title, length and screenshots/i);
    expect(blurb.textContent).not.toMatch(/platforms/i);
  });

  it("shows owned platforms without the physical/digital format label", () => {
    const g = game({
      copies: [{ id: "cp1", platform: "Nintendo Switch", format: "physical" }],
    });
    render(<ReadOnlyOverview game={g} hideSpend />);
    // The "Owned on" tag shows the platform alone — no "(Physical)".
    expect(screen.getByText("Nintendo Switch")).toBeTruthy();
    expect(screen.queryByText(/Nintendo Switch \(Physical\)/i)).toBeNull();
  });
});
