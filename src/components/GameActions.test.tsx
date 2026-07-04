import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GameActions } from "./GameActions";
import { useStore } from "../store";
import { versionKey } from "../lib/copies";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Alwa's Awakening",
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
  act(() => useStore.setState({ viewing: null }));
});

describe("GameActions Family Discount price tag", () => {
  it("crosses out the full fee and shows the discounted price for a qualifying edition", () => {
    const bazaar = game({ id: "a", familyId: "F", released: "2015-01-01", hours: 10 });
    const done = game({ id: "b", familyId: "F", status: "finished" });
    act(() => useStore.setState({ viewing: null, games: [bazaar, done], coins: 500 }));
    render(<GameActions game={bazaar} />);

    // The struck-through full fee sits next to the discounted price…
    const struck = document.querySelector("s");
    expect(struck).toBeTruthy();
    const full = Number(struck!.textContent);
    expect(screen.getByText(/Family Discount — an edition is already active or finished/i)).toBeTruthy();
    // …and the buy button charges less than the crossed-out amount.
    const buy = screen.getByRole("button", { name: /Buy & Start/i });
    const charged = Number(buy.textContent!.replace(/\D/g, ""));
    expect(charged).toBeLessThan(full);
  });

  it("shows the plain fee when no sibling is active or finished", () => {
    const solo = game({ id: "a", released: "2015-01-01", hours: 10 });
    act(() => useStore.setState({ viewing: null, games: [solo], coins: 500 }));
    render(<GameActions game={solo} />);
    expect(document.querySelector("s")).toBeNull();
    expect(screen.queryByText(/Family Discount/i)).toBeNull();
  });
});

describe("GameActions Now Playing platform picker (folded compilation copies)", () => {
  // A standalone game you also own inside a compilation tracks its play time on the
  // master (only the master is ever Now Playing), so the log-time picker must span
  // the platforms you own across your own copies AND the folded compilation copies.
  const master = () =>
    game({
      id: "m",
      rawgId: 1,
      compilationId: null,
      status: "playing",
      copies: [{ id: "a", platform: "Nintendo Switch", format: "digital" }],
    });
  const child = () =>
    game({
      id: "c",
      rawgId: 1,
      compilationId: "C",
      compilationName: "Alwa's Collection",
      copies: [{ id: "b", platform: "PlayStation 4", format: "physical" }],
    });

  it("offers a platform picker spanning the master + folded copies", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        games: [master(), child()],
        trackEditions: false,
        fetchPlaySessions: vi.fn(async () => []),
      }),
    );
    render(<GameActions game={master()} />);
    const select = screen.getByRole("combobox", { name: /Version played for/i });
    expect(select).toBeTruthy();
    // Both the standalone platform and the bundle-only platform are offered.
    expect(screen.getByRole("option", { name: "Nintendo Switch" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "PlayStation 4" })).toBeTruthy();
  });

  it("logs time to the master record with the chosen platform", async () => {
    const logPlaytime = vi.fn(async () => {});
    act(() =>
      useStore.setState({
        viewing: null,
        games: [master(), child()],
        trackEditions: false,
        fetchPlaySessions: vi.fn(async () => []),
        logPlaytime,
      }),
    );
    render(<GameActions game={master()} />);

    // Pick the bundle-only platform, enter time, and log it.
    fireEvent.change(screen.getByRole("combobox", { name: /Version played for/i }), {
      target: { value: versionKey("PlayStation 4", undefined) },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Log play time for/i }), {
      target: { value: "2h" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Log$/i }));

    // Attribution carries the chosen platform; the target is the master record.
    await waitFor(() =>
      expect(logPlaytime).toHaveBeenCalledWith("m", 2, "PlayStation 4", undefined),
    );
  });

  it("shows no picker for a plain standalone game with a single platform", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        games: [master()],
        trackEditions: false,
        fetchPlaySessions: vi.fn(async () => []),
      }),
    );
    render(<GameActions game={master()} />);
    expect(screen.queryByRole("combobox", { name: /Version played for/i })).toBeNull();
  });
});

describe("GameActions story locking (prerequisites)", () => {
  const prereq = () => game({ id: "pre", title: "Xenoblade Chronicles 2", status: "backlog" });
  const sequel = () =>
    game({
      id: "seq",
      title: "Xenoblade Chronicles 3",
      released: "2022-07-29",
      hours: 60,
      prerequisiteGameId: "pre",
    });

  it("replaces Buy & Start with an interception while the prerequisite is unfinished", () => {
    act(() => useStore.setState({ viewing: null, games: [prereq(), sequel()], coins: 500 }));
    render(<GameActions game={sequel()} />);

    const locked = screen.getByRole("button", { name: /Story-locked/i });
    expect(locked).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Buy & Start/i })).toBeNull();

    // Clicking explains the lock instead of opening the activation chooser.
    fireEvent.click(locked);
    expect(screen.getByRole("heading", { name: /Story-locked/i })).toBeTruthy();
    expect(screen.getByText(/unlocks the moment/i)).toBeTruthy();
    expect(screen.queryByText(/How do you want to start/i)).toBeNull();
  });

  it("unlocks automatically once the prerequisite is Finished (derived state)", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        games: [{ ...prereq(), status: "finished" as const }, sequel()],
        coins: 500,
      }),
    );
    render(<GameActions game={sequel()} />);
    expect(screen.getByRole("button", { name: /Buy & Start/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Story-locked/i })).toBeNull();
  });

  it("never locks when the prerequisite row is gone (deleted → set-null semantics)", () => {
    act(() => useStore.setState({ viewing: null, games: [sequel()], coins: 500 }));
    render(<GameActions game={sequel()} />);
    expect(screen.getByRole("button", { name: /Buy & Start/i })).toBeTruthy();
  });
});

describe("GameActions — Retire It", () => {
  it("offers a Bazaar retire with no salvage (nothing was invested)", async () => {
    const retireGame = vi.fn(async () => {});
    act(() =>
      useStore.setState({ viewing: null, games: [game()], coins: 500, retireGame }),
    );
    render(<GameActions game={game()} />);

    fireEvent.click(screen.getByRole("button", { name: /Retire it/i }));
    // The confirm explains the terminal move and that no coins change hands.
    expect(screen.getByText(/No coins move/i)).toBeTruthy();
    expect(screen.getByText(/buying it again at full price/i)).toBeTruthy();

    // An optional "why" note rides along to the store action. (The opener and
    // the modal confirm share a name — the portaled confirm renders last.)
    fireEvent.change(screen.getByPlaceholderText(/Why didn't it click/i), {
      target: { value: "Combat felt off" },
    });
    const confirms = screen.getAllByRole("button", { name: /^Retire it$/i });
    fireEvent.click(confirms[confirms.length - 1]);
    await waitFor(() => expect(retireGame).toHaveBeenCalledWith("g1", "Combat felt off"));
  });

  it("retiring from a lane advertises the same salvage rate as Shelve It", () => {
    const playing = game({ status: "playing", pricePaid: 100 });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [playing],
        coins: 0,
        shelveRefundPct: 50,
        fetchPlaySessions: vi.fn(async () => []),
      }),
    );
    render(<GameActions game={playing} />);

    fireEvent.click(screen.getByRole("button", { name: /Retire it/i }));
    // 50% of the 100 paid — the SAME rate Shelve pays, so there's no
    // shelve-first arbitrage.
    expect(screen.getByText(/You'll salvage/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retire · \+.*50/i })).toBeTruthy();
  });

  it("a Retired card hides every free re-entry and offers only Return to Bazaar", async () => {
    const unretireGame = vi.fn(async () => {});
    const retired = game({ status: "finished", finishTag: "retired" });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [retired],
        replaySlots: 2,
        completionistSlots: 2,
        rotationSlots: 2,
        fetchPlaySessions: vi.fn(async () => []),
        unretireGame,
      }),
    );
    render(<GameActions game={retired} />);

    // No free way back into play…
    expect(screen.queryByRole("button", { name: /^Replay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Go for 100%/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Convert to Endless/i })).toBeNull();

    // …only the road through the Bazaar, confirmed with the full-price warning.
    // (Opener and confirm share a name — the portaled confirm renders last.)
    fireEvent.click(screen.getByRole("button", { name: /Return to Bazaar/i }));
    expect(screen.getByText(/normal buy at its full price/i)).toBeTruthy();
    const confirms = screen.getAllByRole("button", { name: /^Return to Bazaar$/i });
    fireEvent.click(confirms[confirms.length - 1]);
    await waitFor(() => expect(unretireGame).toHaveBeenCalledWith("g1"));
  });

  it("'Retired' is pickable in the Finished tag select", () => {
    const beaten = game({ status: "finished", finishTag: "beaten" });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [beaten],
        fetchPlaySessions: vi.fn(async () => []),
      }),
    );
    render(<GameActions game={beaten} />);
    expect(screen.getByRole("option", { name: "Retired" })).toBeTruthy();
  });
});
