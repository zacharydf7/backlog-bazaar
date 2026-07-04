import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { OverviewTab, ReadOnlyOverview } from "./OverviewTab";
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

  it("offers no Suggest edit affordance while visiting someone else's game", () => {
    render(<ReadOnlyOverview game={game()} hideSpend />);
    expect(screen.queryByRole("button", { name: /Suggest edit/i })).toBeNull();
  });
});

describe("OverviewTab (your own game)", () => {
  beforeEach(() => act(() => useStore.setState({ cloud: true })));

  it("offers Suggest edit on your own game's overview", () => {
    render(<OverviewTab game={game()} screenshots={[]} />);
    expect(screen.getByRole("button", { name: /Suggest edit/i })).toBeTruthy();
  });
});

describe("OverviewTab cover controls — Restore original", () => {
  // Community game (no rawgId) so originalTarget is game.originalImage and no RAWG
  // cover is fetched. Cover controls only render in cloud mode.
  beforeEach(() => act(() => useStore.setState({ cloud: true })));

  it("hides 'Restore original' when the cover is the default/approved one", () => {
    // On the approved cover, even though the old original differs, the button is
    // gone — approved art is the new canonical cover.
    const g = game({
      rawgId: undefined,
      image: "approved.jpg",
      stockImage: "approved.jpg",
      originalImage: "old-original.jpg",
    });
    render(<OverviewTab game={g} screenshots={[]} />);
    expect(screen.queryByRole("button", { name: /Restore original/i })).toBeNull();
  });

  it("shows 'Restore original' only when the user uploaded their own cover", () => {
    const g = game({
      rawgId: undefined,
      image: "my-upload.jpg",
      stockImage: "approved.jpg",
      originalImage: "old-original.jpg",
    });
    render(<OverviewTab game={g} screenshots={[]} />);
    expect(screen.getByRole("button", { name: /Restore original/i })).toBeTruthy();
  });
});
