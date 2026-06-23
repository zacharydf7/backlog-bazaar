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
  it("lists every edition (including the opened one) with unlink controls", () => {
    const a = game({ id: "a", title: "Witcher PC", familyId: "F", status: "playing", playedHours: 10 });
    const b = game({ id: "b", title: "Witcher Switch", familyId: "F", status: "finished", playedHours: 5 });
    act(() => useStore.setState({ games: [a, b] }));
    render(<FamilyHub game={a} onClose={() => {}} />);

    expect(screen.getByText(/Family of 2/i)).toBeTruthy();
    expect(screen.getByText("This edition")).toBeTruthy();
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
