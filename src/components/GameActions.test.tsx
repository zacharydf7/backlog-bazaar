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
