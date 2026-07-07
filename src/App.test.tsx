import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import { useStore, type ViewingSession } from "./store";
import type { Game } from "./types";

beforeAll(() => {
  // jsdom implements neither; returning from a game page scrolls its card into
  // view, which would otherwise throw from inside a rAF callback.
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
});

afterEach(() => {
  window.history.replaceState(null, "", "/"); // drop any hash a spec navigated to
});

function libGame(over: Partial<Game> = {}): Game {
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

describe("App", () => {
  it("mounts in local mode and shows the app shell", async () => {
    render(<App />);
    // The wordmark renders once the store finishes its initial (local) load. It
    // appears in both the desktop sidebar and the mobile top bar, so allow many.
    const headings = await screen.findAllByRole("heading", { name: /Backlog Bazaar/i });
    expect(headings.length).toBeGreaterThan(0);
  });

  it("hides cloud-only nav controls in local/guest mode", async () => {
    render(<App />);
    await screen.findAllByRole("heading", { name: /Backlog Bazaar/i });
    // Leaderboard, requests, and account are cloud-gated; only "What's new" shows.
    expect(screen.queryByRole("button", { name: /Leaderboard/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Requests & bugs/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sign out/i })).toBeNull();
  });

  it("restores a game deep link (#g/<id>) to the game page, with Back to the board", async () => {
    // An unknown id still lands on the page — its graceful not-found panel —
    // proving the route survives a cold load instead of bouncing to home.
    window.history.replaceState(null, "", "/#g/nope");
    render(<App />);
    expect(await screen.findByText(/isn’t in the library/i)).toBeTruthy();

    // A cold deep link has no in-app history behind it: the page's Back button
    // goes to the home board rather than leaving the site.
    fireEvent.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(await screen.findByText(/Your Bazaar is empty/i)).toBeTruthy();
    expect(window.location.hash === "" || window.location.hash === "#").toBe(true);
  });

  it("Leave returns to the page the visit started from (b5fd4afb regression)", async () => {
    render(<App />);
    await screen.findAllByRole("heading", { name: /Backlog Bazaar/i });
    // Visit starts from the (default) Bazaar board; entering lands on THEIR
    // Profile Hub.
    act(() => useStore.setState({ viewing: visit() }));
    expect(await screen.findAllByText(/Pat/)).toBeTruthy();

    // Leaving from their profile page must return to the Bazaar board the
    // visit started from — not surface YOUR profile page. (The Leave control
    // renders in both the desktop sidebar and the mobile chrome.)
    fireEvent.click(screen.getAllByRole("button", { name: /^Leave$/i })[0]);
    expect(await screen.findByText(/Your Bazaar is empty/i)).toBeTruthy();
    expect(useStore.getState().viewing).toBeNull();
  });

  it("keeps a board filter applied and its panel open after a game round-trip (7bea6684)", async () => {
    render(<App />);
    await screen.findAllByRole("heading", { name: /Backlog Bazaar/i });

    const pc = libGame({
      id: "gpc",
      title: "PC Game",
      copies: [{ id: "c1", platform: "PC", format: "digital" } as never],
    });
    const ps = libGame({
      id: "gps",
      title: "PS Game",
      copies: [{ id: "c2", platform: "PlayStation 5", format: "digital" } as never],
    });
    act(() => useStore.setState({ viewing: null, games: [pc, ps] }));

    // Both cards on the Bazaar board; expand Filters and slice to PC.
    expect(await screen.findByText("PC Game")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Filters/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^PC$/ }));
    await waitFor(() => expect(screen.queryByText("PS Game")).toBeNull());

    // Open the PC game's page, then Back to the board.
    fireEvent.click(screen.getByTitle("Edit PC Game"));
    fireEvent.click(await screen.findByRole("button", { name: /^Back$/i }));
    await screen.findByText("PC Game");

    // The filter is still applied (PS Game stays hidden)…
    expect(screen.queryByText("PS Game")).toBeNull();
    // …and the facet panel is still expanded, so the active filter is visible
    // rather than reading as gone (the pre-fix regression: the panel collapsed).
    const filtersBtn = screen.getByRole("button", { name: /^Filters/i });
    expect(filtersBtn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /^PC$/ })).toBeTruthy();
  });

  it("keeps a Master Ledger filter applied after a card round-trip (7bea6684)", async () => {
    render(<App />);
    await screen.findAllByRole("heading", { name: /Backlog Bazaar/i });

    const pc = libGame({
      id: "gpc",
      title: "PC Game",
      copies: [{ id: "c1", platform: "PC", format: "digital" } as never],
    });
    const ps = libGame({
      id: "gps",
      title: "PS Game",
      copies: [{ id: "c2", platform: "PlayStation 5", format: "digital" } as never],
    });
    act(() => useStore.setState({ viewing: null, games: [pc, ps] }));

    // Open the Master Ledger (a full view that UNMOUNTS when a game overlays it,
    // so its filter must be held by App to survive the round-trip).
    fireEvent.click(screen.getAllByRole("button", { name: /Master Ledger/i })[0]);
    expect(await screen.findByText("PC Game")).toBeTruthy();
    expect(screen.getByText("PS Game")).toBeTruthy();

    // Filter to PC only.
    fireEvent.click(screen.getByRole("button", { name: /^Filters/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^PC$/ }));
    await waitFor(() => expect(screen.queryByText("PS Game")).toBeNull());

    // Open a card, then Back to the ledger.
    fireEvent.click(screen.getByTitle("Open PC Game"));
    fireEvent.click(await screen.findByRole("button", { name: /^Back$/i }));
    await screen.findByText("PC Game");

    // Filter survived the ledger remount, and its panel is still open.
    expect(screen.queryByText("PS Game")).toBeNull();
    const filtersBtn = screen.getByRole("button", { name: /^Filters/i });
    expect(filtersBtn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /^PC$/ })).toBeTruthy();
  });

  it("collapses empty Now Playing lanes on mobile while keeping filled ones (98ff1bf8)", async () => {
    render(<App />);
    await screen.findAllByRole("heading", { name: /Backlog Bazaar/i });

    // One game in the Focus lane (status "playing", no lane flags); Replay,
    // Completionist, and Rotation all stay empty.
    act(() =>
      useStore.setState({
        viewing: null,
        games: [libGame({ id: "gp", title: "Now Playing Game", status: "playing" })],
      }),
    );

    // Open the Now Playing board, where the four-lane slot meter renders.
    fireEvent.click(screen.getAllByRole("button", { name: /^Now Playing$/i })[0]);

    // The filled Focus lane keeps its body (tiles + note) on every breakpoint —
    // its wrapper carries no responsive-hide class.
    const focusNote = await screen.findByText(/buying a game starts it here/i);
    expect(focusNote.parentElement?.className ?? "").not.toMatch(/(^|\s)hidden(\s|$)/);

    // An empty lane hides its body on mobile (reclaiming the empty "Open" tiles)
    // and restores it at lg — the heading + meter still mark its place.
    const replayNote = screen.getByText(/re-finishing pays the Replay Bonus/i);
    expect(replayNote.parentElement?.className ?? "").toMatch(/(^|\s)hidden(\s|$)/);
    expect(replayNote.parentElement?.className ?? "").toMatch(/lg:block/);
    // The Replay heading itself never collapses — the lane stays discoverable,
    // and it sits OUTSIDE the hidden body wrapper.
    const replayHeading = screen.getByTitle("Jump to your Replay games");
    expect(replayHeading).toBeTruthy();
    expect(replayHeading.closest(".hidden")).toBeNull();
  });

  it("pages a large board behind a Show more control instead of mounting all cards (86dce059)", async () => {
    render(<App />);
    await screen.findAllByRole("heading", { name: /Backlog Bazaar/i });

    // 60 games on the Bazaar board — more than the 48-card first page.
    const many = Array.from({ length: 60 }, (_, i) =>
      libGame({
        id: "g" + i,
        title: "Game " + String(i).padStart(3, "0"),
        copies: [{ id: "c" + i, platform: "PC", format: "digital" } as never],
      }),
    );
    act(() => useStore.setState({ viewing: null, games: many }));

    // Only the first page mounts; the remaining 12 wait behind the control.
    const more = await screen.findByRole("button", { name: /Show more \(12 more\)/i });
    fireEvent.click(more);
    // Revealing the last page clears the control (everything now shown).
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Show more/i })).toBeNull(),
    );
  });

  it("clears a board filter and collapses its panel on a real board switch", async () => {
    render(<App />);
    await screen.findAllByRole("heading", { name: /Backlog Bazaar/i });

    const bl = libGame({
      id: "gbl",
      title: "Backlog Game",
      copies: [{ id: "c1", platform: "PC", format: "digital" } as never],
    });
    const fin = libGame({
      id: "gfin",
      title: "Finished Game",
      status: "finished",
      finishedAt: 1,
      finishTag: "beaten",
      copies: [{ id: "c2", platform: "PC", format: "digital" } as never],
    });
    act(() => useStore.setState({ viewing: null, games: [bl, fin] }));

    // Filter the Bazaar board, then navigate to the Finished board.
    fireEvent.click(screen.getByRole("button", { name: /^Filters/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^PC$/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Finished/i })[0]);
    expect(await screen.findByText("Finished Game")).toBeTruthy();

    // Switching boards is a fresh slate: the filter is cleared and the panel is
    // collapsed again.
    const filtersBtn = screen.getByRole("button", { name: /^Filters/i });
    expect(filtersBtn.getAttribute("aria-expanded")).toBe("false");
    expect(filtersBtn.textContent).toBe("Filters"); // no active-count badge
  });
});
