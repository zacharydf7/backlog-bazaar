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
  beforeEach(() => act(() => useStore.setState({ targetCostPerHour: 7.5, viewing: null })));

  it("shows the dollars of play banked (target × hours), with the formula in the tooltip", () => {
    // The requester's example: $7.50/hr × 10.65h = $79.88 — goal met vs $75.24.
    const g = game({
      copies: [{ id: "c1", platform: "Nintendo Switch 2", format: "physical", cost: 75.24 }],
      playedHours: 10.65,
    });
    render(<OverviewTab game={g} screenshots={[]} />);
    expect(screen.getByText(/Spent \$75\.24/)).toBeTruthy();
    const value = screen.getByText(/\$79\.88 value played/);
    expect(value.closest("span")?.getAttribute("title")).toBe(
      "Value played: $7.50/hr target × 10.7h played = $79.88",
    );
    expect(value.closest("span")?.className).toContain("text-success");
  });

  it("names the playtime still needed while the goal isn't met", () => {
    act(() => useStore.setState({ targetCostPerHour: 2 }));
    // $60 at $2/hr → 30h required; 12h in = $24 banked, 18h to go.
    const g = game({ copies: [{ id: "c1", platform: "PC", cost: 60 }], playedHours: 12 });
    render(<OverviewTab game={g} screenshots={[]} />);
    const value = screen.getByText(/\$24 value played · 18h to well spent/);
    expect(value.closest("span")?.className).not.toContain("text-success");
  });

  it("stays silent with no target set (feature off)", () => {
    act(() => useStore.setState({ targetCostPerHour: null }));
    const g = game({ copies: [{ id: "c1", platform: "PC", cost: 60 }], playedHours: 40 });
    render(<OverviewTab game={g} screenshots={[]} />);
    expect(screen.getByText(/Spent \$60/)).toBeTruthy();
    expect(screen.queryByText(/value played/)).toBeNull();
  });

  it("sums across every owned hub member, ignoring wishlist twins", () => {
    act(() => useStore.setState({ targetCostPerHour: 3 }));
    // ($20 + $10 spend) vs $3/hr × (6h + 4h) = $30 banked — exactly met; the
    // wishlist note's $500 cost stays out of the judgement.
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
    const value = screen.getByText(/\$30 value played/);
    expect(value.closest("span")?.className).toContain("text-success");
  });

  it("never prices a visited player's games with your target", () => {
    act(() =>
      useStore.setState({ viewing: { userId: "u2", games: [] } as never }),
    );
    const g = game({ copies: [{ id: "c1", platform: "PC", cost: 60 }], playedHours: 40 });
    render(<ReadOnlyOverview game={g} hideSpend={false} members={[g]} />);
    expect(screen.getByText(/Spent \$60/)).toBeTruthy();
    expect(screen.queryByText(/value played/)).toBeNull();
    act(() => useStore.setState({ viewing: null }));
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

describe("Spend breakdown grouped by source (2ebfcb7a)", () => {
  beforeEach(() => act(() => useStore.setState({ targetCostPerHour: null, viewing: null })));

  it("splits standalone and compilation copies, naming the bundle", () => {
    const solo = game({
      id: "a",
      copies: [{ id: "c1", platform: "Nintendo Switch", format: "physical", cost: 53.69 }],
    });
    const bundled = game({
      id: "b",
      compilationId: "C1",
      compilationName: "Monster Hunter Collection",
      copies: [{ id: "c2", platform: "Nintendo Switch", format: "physical", cost: 13.43 }],
    });
    render(<ReadOnlyOverview game={solo} hideSpend={false} members={[solo, bundled]} />);

    expect(screen.getByText(/Part of Monster Hunter Collection/)).toBeTruthy();
    // Both same-platform rows still render, one under each group.
    expect(screen.getAllByText(/Nintendo Switch \(Physical\)/)).toHaveLength(2);
    expect(screen.getByText("$53.69")).toBeTruthy();
    expect(screen.getByText("$13.43")).toBeTruthy();
  });

  it("lists each compilation the hub's instances belong to", () => {
    const a = game({
      id: "a",
      compilationId: "C1",
      compilationName: "Bundle A",
      copies: [{ id: "c1", platform: "PC", cost: 5 }],
    });
    const b = game({
      id: "b",
      compilationId: "C2",
      compilationName: "Bundle B",
      copies: [{ id: "c2", platform: "PC", cost: 6 }],
    });
    render(<ReadOnlyOverview game={a} hideSpend={false} members={[a, b]} />);
    expect(screen.getByText(/Part of Bundle A/)).toBeTruthy();
    expect(screen.getByText(/Part of Bundle B/)).toBeTruthy();
  });

  it("notes the bundle under Owned on when no costs are recorded (no breakdown shown)", () => {
    const bundled = game({
      compilationId: "C1",
      compilationName: "Costless Collection",
      copies: [{ id: "c1", platform: "PC" }],
    });
    render(<ReadOnlyOverview game={bundled} hideSpend={false} members={[bundled]} />);
    expect(screen.queryByText(/Spent/)).toBeNull();
    expect(screen.getByText(/Part of Costless Collection/)).toBeTruthy();
  });

  it("shows no bundle note for a purely standalone game", () => {
    const solo = game({ copies: [{ id: "c1", platform: "PC", cost: 10 }] });
    render(<ReadOnlyOverview game={solo} hideSpend={false} members={[solo]} />);
    expect(screen.queryByText(/Part of/)).toBeNull();
  });
});
