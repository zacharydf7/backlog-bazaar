import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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

  it("keeps a wishlisted-elsewhere platform under Want on, not Owned on (15d13b9a)", () => {
    const owned = game({
      id: "a",
      status: "finished",
      copies: [{ id: "c1", platform: "PlayStation 5", format: "physical", cost: 32.24 }],
    });
    const wish = game({
      id: "b",
      status: "wishlist",
      copies: [{ id: "c2", platform: "Nintendo Switch 2", format: "physical" }],
    });
    render(<ReadOnlyOverview game={owned} hideSpend={false} members={[owned, wish]} />);

    // "Owned on" holds only the owned platform…
    const ownedBlock = within(screen.getByText("Owned on").closest("div") as HTMLElement);
    expect(ownedBlock.getByText("PlayStation 5")).toBeTruthy();
    expect(ownedBlock.queryByText("Nintendo Switch 2")).toBeNull();
    // …and the wishlist platform sits under its own "Want on".
    const wantBlock = within(screen.getByText("Want on").closest("div") as HTMLElement);
    expect(wantBlock.getByText("Nintendo Switch 2")).toBeTruthy();
    // Spend reflects only the owned copy.
    expect(screen.getByText(/Spent \$32\.24/)).toBeTruthy();
  });
});

describe("OverviewTab (your own game)", () => {
  beforeEach(() => act(() => useStore.setState({ cloud: true })));

  it("offers Suggest edit on your own game's overview", () => {
    render(<OverviewTab game={game()} screenshots={[]} />);
    expect(screen.getByRole("button", { name: /Suggest edit/i })).toBeTruthy();
  });
});

describe("Value played on the spend rollup (6c60c213 follow-up)", () => {
  beforeEach(() => act(() => useStore.setState({ targetCostPerHour: null })));

  it("shows the effective rate beside the Spent total, with the math in the tooltip", () => {
    // $75.24 across 35h ≈ $2.15/hr — no target needed for the plain rate.
    const g = game({
      copies: [{ id: "c1", platform: "Nintendo Switch 2", format: "physical", cost: 75.24 }],
      playedHours: 35,
    });
    render(<OverviewTab game={g} screenshots={[]} />);
    expect(screen.getByText(/Spent \$75\.24/)).toBeTruthy();
    const rate = screen.getByText(/\$2\.15\/hr played/);
    expect(rate.closest("span")?.getAttribute("title")).toBe(
      "Value played: $75.24 spent ÷ 35h played = $2.15/hr",
    );
  });

  it("stays silent until there are hours to divide by", () => {
    const g = game({ copies: [{ id: "c1", platform: "PC", cost: 60 }], playedHours: 0 });
    render(<OverviewTab game={g} screenshots={[]} />);
    expect(screen.getByText(/Spent \$60/)).toBeTruthy();
    expect(screen.queryByText(/\/hr played/)).toBeNull();
  });

  it("wears the goal-met styling once the rate beats your target", () => {
    act(() => useStore.setState({ targetCostPerHour: 2 }));
    // $60 at $2/hr → 30h required; 40h logged = met ($1.50/hr).
    const g = game({
      copies: [{ id: "c1", platform: "PC", cost: 60 }],
      playedHours: 40,
    });
    render(<OverviewTab game={g} screenshots={[]} />);
    const rate = screen.getByText(/\$1\.50\/hr played/).closest("span")!;
    expect(rate.className).toContain("text-success");
    act(() => useStore.setState({ targetCostPerHour: null }));
  });

  it("sums the rate across every owned hub member, ignoring wishlist twins", () => {
    // ($20 + $10) ÷ (6h + 4h) = $3.00/hr; the wishlist note's cost stays out.
    const a = game({ id: "a", copies: [{ id: "c1", platform: "PC", cost: 20 }], playedHours: 6 });
    const b = game({
      id: "b",
      copies: [{ id: "c2", platform: "Steam Deck", cost: 10 }],
      playedHours: 4,
    });
    const w = game({
      id: "w",
      status: "wishlist",
      copies: [{ id: "c3", platform: "PlayStation 5", cost: 500 }],
    });
    render(<ReadOnlyOverview game={a} hideSpend={false} members={[a, b, w]} />);
    expect(screen.getByText(/\$3\.00\/hr played/)).toBeTruthy();
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
