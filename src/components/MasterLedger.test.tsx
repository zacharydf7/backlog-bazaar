import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { MasterLedger } from "./MasterLedger";
import { useStore, type ViewingSession } from "../store";
import type { Game } from "../types";

/** The headline value shown in the metric tile with the given label. */
function metricTile(label: string) {
  return within(screen.getByText(label).closest("div") as HTMLElement);
}

let seq = 0;
function game(over: Partial<Game> = {}): Game {
  seq += 1;
  return {
    id: `g${seq}`,
    title: `Game ${seq}`,
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: seq,
    ...over,
  } as Game;
}

function visit(over: Partial<ViewingSession> = {}): ViewingSession {
  return {
    userId: "u2",
    displayName: "Pat",
    avatarUrl: null,
    coins: 0,
    theme: null,
    gamesFinished: 0,
    hoursFinished: 0,
    hideSpend: false,
    cosmetics: { frame: null, stall: null, coin: null },
    economyEnabled: true,
    lastSeenAt: null,
    activity: null,
    badges: [],
    title: null,
    aboutMe: null,
    bannerUrl: null,
    accent: null,
    bg: null,
    games: [],
    ...over,
  };
}

beforeEach(() => {
  act(() => useStore.setState({ viewing: null, games: [] }));
});

describe("MasterLedger", () => {
  it("renders one row PER INSTANCE for a game owned through several bundles", () => {
    act(() =>
      useStore.setState({
        games: [
          game({
            title: "Alwa's Awakening",
            rawgId: 1,
            compilationId: "C-ps4",
            copies: [{ id: "a", platform: "PlayStation 4", format: "physical", cost: 20 }],
          }),
          game({
            title: "Alwa's Awakening",
            rawgId: 1,
            compilationId: "C-switch",
            copies: [{ id: "b", platform: "Nintendo Switch", format: "physical", cost: 11.88 }],
          }),
          game({
            title: "Alwa's Awakening",
            rawgId: 1,
            compilationId: "C-switch-d",
            copies: [{ id: "c", platform: "Nintendo Switch", format: "digital", cost: 4.99 }],
          }),
        ],
      }),
    );
    render(<MasterLedger />);

    // Instances are never merged: each record is its own row…
    expect(screen.getAllByText("Alwa's Awakening")).toHaveLength(3);
    // …with its own ownership badge and its own spend.
    expect(screen.getByText("PlayStation 4 (Physical)")).not.toBeNull();
    expect(screen.getByText("Nintendo Switch (Physical)")).not.toBeNull();
    expect(screen.getByText("Nintendo Switch (Digital)")).not.toBeNull();
    expect(screen.getByText(/Spent \$20\b/)).not.toBeNull();
    expect(screen.getByText(/Spent \$11\.88/)).not.toBeNull();
    expect(screen.getByText(/Spent \$4\.99/)).not.toBeNull();
  });

  it("anchors each game's row so returning from its page can scroll back to it (86dce059)", () => {
    act(() => useStore.setState({ games: [game({ id: "g1" }), game({ id: "g2" })] }));
    const { container } = render(<MasterLedger />);
    // The App's scroll-restore looks these ids up by boardGameAnchor(id).
    expect(container.querySelector("#np-game-g1")).not.toBeNull();
    expect(container.querySelector("#np-game-g2")).not.toBeNull();
  });

  it("clusters a compilation's rows together in the owner's order (140ac868)", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        games: [
          game({ id: "alpha", title: "Alpha Game" }),
          game({ id: "rem", title: "BioShock Remastered", compilationId: "C" }),
          game({ id: "two", title: "BioShock 2 Remastered", compilationId: "C" }),
          game({ id: "z", title: "Zelda" }),
        ],
        compilations: [
          {
            id: "C",
            title: "BioShock",
            totalCost: 0,
            createdAt: 1,
            expanded: true,
            carryoverHours: 0,
            childOrder: ["rem", "two"],
          },
        ],
      }),
    );
    const { container } = render(<MasterLedger />);
    // Rows render in clustered order: the bundle sits together (in order) placed
    // by its first title, not scattered A–Z among Alpha…Zelda.
    const ids = [...container.querySelectorAll('[id^="np-game-"]')].map((el) =>
      el.id.replace("np-game-", ""),
    );
    expect(ids).toEqual(["alpha", "rem", "two", "z"]);
  });

  it("keeps a multi-platform game's anchor unique even when it lists under each platform", () => {
    act(() =>
      useStore.setState({
        games: [
          game({
            id: "m",
            title: "Multiplat",
            copies: [
              { id: "c1", platform: "PC" },
              { id: "c2", platform: "PlayStation 5" },
            ],
          }),
        ],
      }),
    );
    const { container } = render(<MasterLedger groupBy="platform" />);
    // Listed under both platform groups (two cards)…
    expect(screen.getAllByText("Multiplat")).toHaveLength(2);
    // …but only the first row carries the anchor id, so it stays unique.
    expect(container.querySelectorAll("#np-game-m")).toHaveLength(1);
  });

  it("aggregates owned games and excludes wishlist", () => {
    act(() =>
      useStore.setState({
        games: [
          game({ title: "Owned Finished", status: "finished" }),
          game({ title: "Owned Backlog", status: "backlog" }),
          game({ title: "Wished For", status: "wishlist" }),
        ],
      }),
    );
    render(<MasterLedger />);

    expect(screen.getByText("Owned Finished")).not.toBeNull();
    expect(screen.getByText("Owned Backlog")).not.toBeNull();
    // Wishlist items represent unowned assets — never shown in the Ledger.
    expect(screen.queryByText("Wished For")).toBeNull();
  });

  it("filters the ledger by the header search query", () => {
    act(() =>
      useStore.setState({
        games: [
          game({ title: "Halo Infinite", status: "finished" }),
          game({ title: "DOOM Eternal", status: "backlog" }),
        ],
      }),
    );
    render(<MasterLedger searchQuery="halo" />);
    expect(screen.getByText("Halo Infinite")).not.toBeNull();
    expect(screen.queryByText("DOOM Eternal")).toBeNull();
  });

  it("offers a Clear search action when a search matches nothing", () => {
    let cleared = false;
    act(() => useStore.setState({ games: [game({ title: "Halo", status: "backlog" })] }));
    render(<MasterLedger searchQuery="zelda" onClearSearch={() => (cleared = true)} />);
    expect(screen.getByText(/No games match/i)).not.toBeNull();
    screen.getByRole("button", { name: /Clear search/i }).click();
    expect(cleared).toBe(true);
  });

  it("shows library-health metrics (owned total + finished/beaten/completed %)", () => {
    act(() =>
      useStore.setState({
        games: [
          game({ status: "finished", finishTag: "beaten" }),
          game({ status: "backlog" }),
          game({ status: "wishlist" }), // excluded from both count and %
        ],
      }),
    );
    render(<MasterLedger />);

    expect(screen.getByText("Games owned")).not.toBeNull();
    // Scope to the metric label spans (text-subtle) — "Finished"/"Beaten" also
    // appear on card status badges and finish-tag stamps.
    expect(screen.getByText("Finished", { selector: "span.text-subtle" })).not.toBeNull();
    expect(screen.getByText("Beaten", { selector: "span.text-subtle" })).not.toBeNull();
    expect(screen.getByText("Completed", { selector: "span.text-subtle" })).not.toBeNull();
    // 1 finished of 2 owned = 50% finished AND 50% beaten (two metrics).
    expect(screen.getAllByText("50%")).toHaveLength(2);
    // Nothing 100%'d yet.
    expect(screen.getByText("0%")).not.toBeNull();
  });

  it("shows the endless count only when the player has endless games", () => {
    act(() =>
      useStore.setState({
        games: [
          game({ status: "finished", finishTag: "endless" }),
          game({ status: "finished", finishTag: "endless" }),
          game({ status: "backlog" }),
        ],
      }),
    );
    const { unmount } = render(<MasterLedger />);
    expect(screen.getByText(/2 endless/)).not.toBeNull();
    unmount();

    act(() => useStore.setState({ games: [game({ status: "backlog" })] }));
    render(<MasterLedger />);
    expect(screen.queryByText(/endless/i)).toBeNull();
  });

  it("stamps finished cards with their finish tag (Beaten / Completed / Endless)", () => {
    act(() =>
      useStore.setState({
        games: [
          game({ title: "Hundred Percented", status: "finished", finishTag: "completed" }),
          game({ title: "Still Backlogged", status: "backlog", finishTag: null }),
        ],
      }),
    );
    render(<MasterLedger />);
    // The finished card carries the Completed stamp next to its status badge…
    const card = screen.getByRole("button", { name: "Open Hundred Percented" });
    expect(card.textContent).toMatch(/Completed/);
    // …while an unfinished card shows only its status.
    const backlogCard = screen.getByRole("button", { name: "Open Still Backlogged" });
    expect(backlogCard.textContent).not.toMatch(/Beaten|Completed|Endless/);
  });

  it("slices the ledger by how a copy is held — physical vs digital (de55c48b)", () => {
    act(() =>
      useStore.setState({
        games: [
          game({ title: "On Disc", copies: [{ id: "a", platform: "PlayStation 5", format: "physical" }] }),
          game({ title: "Downloaded", copies: [{ id: "b", platform: "PlayStation 5", format: "digital" }] }),
        ],
      }),
    );
    render(<MasterLedger />);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));

    // The Format facet offers only what's actually held.
    fireEvent.click(screen.getByRole("button", { name: /^Physical$/ }));
    expect(screen.getByRole("button", { name: "Open On Disc" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Downloaded" })).toBeNull();

    // Adding Digital widens back out (OR within the category).
    fireEvent.click(screen.getByRole("button", { name: /^Digital$/ }));
    expect(screen.getByRole("button", { name: "Open On Disc" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Downloaded" })).toBeTruthy();
  });

  it("invites the player to start a collection when nothing is owned", () => {
    act(() => useStore.setState({ games: [game({ status: "wishlist" })] }));
    render(<MasterLedger />);
    expect(screen.getByText(/Nothing in your collection yet/i)).not.toBeNull();
  });

  it("recalculates the stat block for the active filter and flags it a subset (678e6574)", () => {
    act(() =>
      useStore.setState({
        games: [
          game({ title: "PS5 A", status: "finished", finishTag: "beaten", copies: [{ id: "a", platform: "PlayStation 5" }] }),
          game({ title: "PS5 B", status: "backlog", copies: [{ id: "b", platform: "PlayStation 5" }] }),
          game({ title: "Switch C", status: "backlog", copies: [{ id: "c", platform: "Nintendo Switch" }] }),
        ],
      }),
    );
    render(<MasterLedger />);
    // Unfiltered: all three counted, no subset flag.
    expect(metricTile("Games owned").getByText("3")).toBeTruthy();
    expect(screen.queryByText("Filtered view")).toBeNull();

    // Slice to PlayStation 5.
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: /^PlayStation 5$/ }));

    // The stat block recomputes for the subset and flags itself.
    expect(metricTile("Games owned").getByText("2")).toBeTruthy();
    expect(screen.getByText("Filtered view")).toBeTruthy();

    // Clear (from the stat block) returns to lifetime totals.
    fireEvent.click(
      within(screen.getByText("Filtered view").closest("div") as HTMLElement).getByText("Clear"),
    );
    expect(screen.queryByText("Filtered view")).toBeNull();
    expect(metricTile("Games owned").getByText("3")).toBeTruthy();
  });

  it("rolls up spend + well-spent financials and recomputes them per filter (6c60c213)", () => {
    act(() =>
      useStore.setState({
        targetCostPerHour: 2,
        games: [
          // $60 / 40h at a $2/hr target → goal met (needs 30h).
          game({ title: "PS5 Hit", copies: [{ id: "a", platform: "PlayStation 5", cost: 60 }], playedHours: 40 }),
          // $30 / 5h → not met (needs 15h).
          game({ title: "Switch Miss", copies: [{ id: "b", platform: "Nintendo Switch", cost: 30 }], playedHours: 5 }),
          // Free game: bypassed entirely — its 100h must not flatter the rate.
          game({ title: "Freebie", copies: [{ id: "c", platform: "PC" }], playedHours: 100 }),
        ],
      }),
    );
    render(<MasterLedger />);

    // Whole view: $90 across 45 paid hours = $2.00/hr; 1 of 2 paid games met.
    expect(screen.getByText(/\$90 spent/)).toBeTruthy();
    expect(screen.getByText(/\$2\.00\/hr/)).toBeTruthy();
    expect(screen.getByText(/1 of 2 well spent \(50%\)/)).toBeTruthy();
    // The met card also wears its badge in the list below.
    expect(screen.getByText("Well spent")).toBeTruthy();

    // Slice to PlayStation 5 → the financials recompute for just that subset.
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: /^PlayStation 5$/ }));
    expect(screen.getByText(/\$60 spent/)).toBeTruthy();
    expect(screen.getByText(/1 of 1 well spent \(100%\)/)).toBeTruthy();

    act(() => useStore.setState({ targetCostPerHour: null }));
  });

  it("keeps financial judgement off your view of another player's ledger", () => {
    act(() =>
      useStore.setState({
        targetCostPerHour: 2,
        viewing: visit({
          games: [
            game({ title: "Their Game", copies: [{ id: "a", platform: "PC", cost: 10 }], playedHours: 99 }),
          ],
        }),
      }),
    );
    render(<MasterLedger />);
    expect(screen.queryByText(/well spent/i)).toBeNull();
    act(() => useStore.setState({ viewing: null, targetCostPerHour: null }));
  });

  it("pins the control bar clear of the app chrome via the live --chrome-h var (7df3dd85)", () => {
    act(() =>
      useStore.setState({
        games: [game({ title: "Solo", status: "backlog", copies: [{ id: "a", platform: "PC" }] })],
      }),
    );
    render(<MasterLedger />);
    const bar = screen.getByText("Group by").closest(".sticky") as HTMLElement;
    // The offset tracks the REAL chrome height (which grows with the "You're
    // visiting" banner) instead of a fixed value that clipped the bar on mobile.
    expect(bar.style.top).toBe("var(--chrome-h)");
    // No baked-in pixel offset left behind to drift out of sync with the chrome.
    expect(bar.className).not.toMatch(/top-24|top-16|md:top-14/);
  });

  it("puts the control bar above the stat block and snaps to top on a change (9a7f6a3e)", () => {
    window.scrollTo = vi.fn();
    act(() =>
      useStore.setState({
        games: [game({ title: "Solo", status: "backlog", copies: [{ id: "a", platform: "PC" }] })],
      }),
    );
    render(<MasterLedger />);

    // Controls precede the (unpinned) stat block in the document.
    const control = screen.getByText("Group by");
    const stat = screen.getByText("Games owned");
    expect(control.compareDocumentPosition(stat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Changing the grouping snaps the viewport back to the top.
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it("shows the visited player's collection (not your own) while visiting", () => {
    act(() =>
      useStore.setState({
        games: [game({ title: "My Own Game", status: "finished" })],
        viewing: visit({
          displayName: "Pat",
          games: [game({ title: "Pat's Game", status: "backlog" })],
        }),
      }),
    );
    render(<MasterLedger />);

    expect(screen.getByText(/Pat's Master Ledger/)).not.toBeNull();
    expect(screen.getByText("Pat's Game")).not.toBeNull();
    // Your own library must not bleed into a visited ledger.
    expect(screen.queryByText("My Own Game")).toBeNull();
  });
});

describe("Master Ledger paging (86dce059 — reveal a page of rows at a time)", () => {
  const bigLibrary = () =>
    Array.from({ length: 60 }, (_, i) =>
      game({ id: `p${i}`, title: `Paged ${String(i).padStart(2, "0")}` }),
    );

  it("mounts one page of rows and reveals the rest via Show more", () => {
    act(() => useStore.setState({ games: bigLibrary() }));
    render(<MasterLedger />);

    // First page only: 48 of 60 rows in the DOM…
    expect(screen.getByText("Paged 00")).not.toBeNull();
    expect(screen.getByText("Paged 47")).not.toBeNull();
    expect(screen.queryByText("Paged 48")).toBeNull();
    // …with the count still reporting the whole collection.
    expect(screen.getByText("60 games")).not.toBeNull();

    // jsdom has no IntersectionObserver, so the button is the reveal path.
    fireEvent.click(screen.getByRole("button", { name: "Show more (12 more)" }));
    expect(screen.getByText("Paged 59")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  });

  it("keeps a partially revealed group's badge at its full size", () => {
    // 50 PC games + 10 Switch: grouping by platform cuts PC at the page edge.
    const games = Array.from({ length: 60 }, (_, i) =>
      game({
        id: `q${i}`,
        title: `Grouped ${String(i).padStart(2, "0")}`,
        copies: [{ id: `c${i}`, platform: i < 50 ? "PC" : "Switch" }],
      }),
    );
    act(() => useStore.setState({ games }));
    render(<MasterLedger />);
    fireEvent.click(screen.getByRole("button", { name: "Platform" }));

    const pcHeading = screen.getByRole("heading", { name: "PC" });
    // 48 of its 50 rows are mounted, but the badge reports the true group size.
    expect(within(pcHeading.parentElement as HTMLElement).getByText("50")).not.toBeNull();
    // The Switch group is wholly past the first page — no empty heading.
    expect(screen.queryByRole("heading", { name: "Switch" })).toBeNull();
  });

  it("seeds the reveal past the first page when returning to a deep row", () => {
    act(() => useStore.setState({ games: bigLibrary() }));
    const { container } = render(<MasterLedger revealToId="p55" />);
    // The row we came back from is already mounted (with its scroll anchor)…
    expect(container.querySelector("#np-game-p55")).not.toBeNull();
    // …and rows past it stay unrevealed.
    expect(screen.queryByText("Paged 56")).toBeNull();
  });
});
