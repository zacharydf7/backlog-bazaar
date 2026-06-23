import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { FamilyHub } from "./FamilyHub";
import { useStore } from "../store";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Game",
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
  act(() => useStore.setState({ games: [] }));
});

describe("FamilyHub", () => {
  it("lists every edition with its status, platforms, and unlink control", () => {
    const a = game({
      id: "a",
      title: "Witcher PC",
      familyId: "F",
      status: "playing",
      playedHours: 10,
      copies: [{ id: "c1", platform: "Switch 2" }],
    });
    const b = game({ id: "b", title: "Witcher Switch", familyId: "F", status: "finished", playedHours: 5 });
    act(() => useStore.setState({ games: [a, b] }));
    render(<FamilyHub game={a} onClose={() => {}} />);

    expect(screen.getByText(/Family of 2/i)).toBeTruthy();
    expect(screen.getByText("This edition")).toBeTruthy();
    // Status sits on its own line so a long title can't push it out of view.
    expect(screen.getByText("Now Playing")).toBeTruthy();
    // Each edition surfaces the platform(s) it's owned on.
    expect(screen.getByText(/Switch 2/)).toBeTruthy();
    // One Unlink control per member.
    expect(screen.getAllByRole("button", { name: /Unlink/i })).toHaveLength(2);
  });

  it("offers a link entry (and no roster) for an unlinked game", () => {
    const solo = game({ id: "solo", title: "Solo" });
    act(() => useStore.setState({ games: [solo, game({ id: "x", title: "X" })] }));
    render(<FamilyHub game={solo} onClose={() => {}} />);

    expect(screen.getByRole("button", { name: /Link to another edition/i })).toBeTruthy();
    expect(screen.queryByText(/Family of/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Unlink/i })).toBeNull();
  });
});
