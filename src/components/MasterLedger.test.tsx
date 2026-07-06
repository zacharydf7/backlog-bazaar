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
