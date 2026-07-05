import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
  it("lists every edition with its status, platforms, the primary crown, and unlink control", () => {
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
    // No stored designation → the playing member is the implicit primary.
    expect(screen.getByText("Primary")).toBeTruthy();
    // Status sits on its own line so a long title can't push it out of view.
    expect(screen.getByText("Now Playing")).toBeTruthy();
    // Each edition surfaces the platform(s) it's owned on.
    expect(screen.getByText(/Switch 2/)).toBeTruthy();
    // One Unlink control per member, plus the family-level tools.
    expect(screen.getAllByRole("button", { name: /^Unlink$/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Change primary edition/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sever family link/i })).toBeTruthy();
  });

  it("crowns the stored designation over a more-active sibling", () => {
    const a = game({ id: "a", title: "Old Port", familyId: "F", status: "finished", familyPrimaryGameId: "a" });
    const b = game({ id: "b", title: "Remaster", familyId: "F", status: "playing", familyPrimaryGameId: "a" });
    act(() => useStore.setState({ games: [a, b] }));
    render(<FamilyHub game={b} onClose={() => {}} />);

    const primaryChip = screen.getByText("Primary");
    // The crown sits on Old Port's row, not the playing Remaster's.
    expect(primaryChip.closest("li")!.textContent).toContain("Old Port");
  });

  it("offers a link entry (and no roster) for an unlinked game", () => {
    const solo = game({ id: "solo", title: "Solo" });
    act(() => useStore.setState({ games: [solo, game({ id: "x", title: "X" })] }));
    render(<FamilyHub game={solo} onClose={() => {}} />);

    expect(screen.getByRole("button", { name: /Link to another edition/i })).toBeTruthy();
    expect(screen.queryByText(/Family of/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Unlink/i })).toBeNull();
  });

  it("creating a NEW family demands a primary before the link saves", () => {
    const linkGames = vi.fn().mockResolvedValue(undefined);
    const solo = game({ id: "solo", title: "Solo Edition" });
    const other = game({ id: "x", title: "Other Edition" });
    act(() => useStore.setState({ games: [solo, other], linkGames }));
    render(<FamilyHub game={solo} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Link to another edition/i }));
    fireEvent.click(screen.getByRole("button", { name: /Other Edition/ }));
    // Nothing linked yet — the primary picker interjects.
    expect(linkGames).not.toHaveBeenCalled();
    expect(screen.getByText(/Which edition is the/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Other Edition/ }));
    expect(linkGames).toHaveBeenCalledWith("solo", "x", "x");
  });

  it("adding to an EXISTING family links directly (its primary stands)", () => {
    const linkGames = vi.fn().mockResolvedValue(undefined);
    const a = game({ id: "a", title: "A", familyId: "F", familyPrimaryGameId: "a" });
    const b = game({ id: "b", title: "B", familyId: "F", familyPrimaryGameId: "a" });
    const c = game({ id: "c", title: "C Edition" });
    act(() => useStore.setState({ games: [a, b, c], linkGames }));
    render(<FamilyHub game={a} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Link another edition/i }));
    fireEvent.click(screen.getByRole("button", { name: /C Edition/ }));
    expect(linkGames).toHaveBeenCalledWith("a", "c");
  });
});
