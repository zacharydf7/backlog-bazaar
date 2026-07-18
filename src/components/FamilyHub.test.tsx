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

describe("FamilyHub (Family Breakdown)", () => {
  it("lists every edition with its status, own playtime, platform tags, crown, and per-row tools", () => {
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

    expect(screen.getByRole("heading", { name: /Family Breakdown/i })).toBeTruthy();
    expect(screen.getByText(/Family of 2/i)).toBeTruthy();
    // No stored designation → the playing member is the implicit primary.
    expect(screen.getByText("Primary")).toBeTruthy();
    // Each row carries its own underlying status and logged hours.
    expect(screen.getByText("Now Playing")).toBeTruthy();
    expect(screen.getByText("Finished")).toBeTruthy();
    expect(screen.getByText(/10h logged/i)).toBeTruthy();
    expect(screen.getByText(/5h logged/i)).toBeTruthy();
    // Each edition surfaces the platform(s) it's owned on.
    expect(screen.getByText(/Switch 2/)).toBeTruthy();
    // Per-row tools: Remove on every member, Set as primary on non-primaries.
    expect(screen.getAllByRole("button", { name: /^Remove$/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Set as primary/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Sever family link/i })).toBeTruthy();
  });

  it("pins the stored primary on top, crowned, over a more-active sibling", () => {
    const a = game({ id: "a", title: "Old Port", familyId: "F", status: "finished", familyPrimaryGameId: "a" });
    const b = game({ id: "b", title: "Remaster", familyId: "F", status: "playing", familyPrimaryGameId: "a" });
    act(() => useStore.setState({ games: [a, b] }));
    render(<FamilyHub game={b} onClose={() => {}} />);

    const primaryChip = screen.getByText("Primary");
    // The crown sits on Old Port's row, not the playing Remaster's…
    expect(primaryChip.closest("li")!.textContent).toContain("Old Port");
    // …and Old Port's row is pinned first in the list.
    const rows = screen.getAllByRole("listitem");
    expect(rows[0].textContent).toContain("Old Port");
  });

  it("Set as primary reassigns instantly (designation only)", () => {
    const setFamilyPrimary = vi.fn().mockResolvedValue(undefined);
    const a = game({ id: "a", title: "Old Port", familyId: "F", status: "finished", familyPrimaryGameId: "a" });
    const b = game({ id: "b", title: "Remaster", familyId: "F", status: "backlog", familyPrimaryGameId: "a" });
    act(() => useStore.setState({ games: [a, b], setFamilyPrimary }));
    render(<FamilyHub game={a} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Set as primary/i }));
    expect(setFamilyPrimary).toHaveBeenCalledWith("F", "b");
  });

  it("flags Set as primary as blocked while the current primary is Now Playing", () => {
    const a = game({ id: "a", title: "Live Run", familyId: "F", status: "playing", familyPrimaryGameId: "a" });
    const b = game({ id: "b", title: "Backup", familyId: "F", status: "backlog", familyPrimaryGameId: "a" });
    act(() => useStore.setState({ games: [a, b] }));
    render(<FamilyHub game={a} onClose={() => {}} />);

    const btn = screen.getByRole("button", { name: /Set as primary/i });
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.title).toMatch(/Live Run is Now Playing/i);
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

/** The z-[N] layer of an element's nearest fixed overlay ancestor. */
function overlayZ(el: HTMLElement): number {
  let node: HTMLElement | null = el;
  while (node) {
    const m = node.className.match?.(/z-\[(\d+)\]/);
    if (m) return Number(m[1]);
    node = node.parentElement;
  }
  return -1;
}

describe("Sever family link (9f420872 regression)", () => {
  it("stacks the sever confirmation ABOVE the Family Breakdown overlay", () => {
    const a = game({ id: "a", title: "A", familyId: "F", familyPrimaryGameId: "a" });
    const b = game({ id: "b", title: "B", familyId: "F", familyPrimaryGameId: "a" });
    act(() => useStore.setState({ games: [a, b] }));
    render(<FamilyHub game={a} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Sever family link/i }));
    const confirm = screen.getByRole("button", { name: /^Sever link$/i });
    const hub = screen.getByRole("heading", { name: /Family Breakdown/i });
    // The confirm portals out of the hub — at z-[55] it rendered BEHIND the
    // z-[60] hub, so the button looked dead. It must outrank the hub now.
    expect(overlayZ(confirm)).toBeGreaterThan(overlayZ(hub as HTMLElement));
  });

  it("confirming actually severs and closes the hub", () => {
    const severFamily = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const a = game({ id: "a", title: "A", familyId: "F", familyPrimaryGameId: "a" });
    const b = game({ id: "b", title: "B", familyId: "F", familyPrimaryGameId: "a" });
    act(() => useStore.setState({ games: [a, b], severFamily }));
    render(<FamilyHub game={a} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /Sever family link/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Sever link$/i }));
    expect(severFamily).toHaveBeenCalledWith("F");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Link another edition suggestions (9f420872)", () => {
  it("surfaces kindred titles first instead of collection order", () => {
    const base = game({ id: "smt", title: "Shin Megami Tensei V: Vengeance" });
    act(() =>
      useStore.setState({
        games: [
          game({ id: "hk", title: "Hollow Knight" }),
          game({ id: "cel", title: "Celeste" }),
          base,
          game({ id: "smt3", title: "Shin Megami Tensei III: Nocturne HD Remaster" }),
          game({ id: "smt5", title: "Shin Megami Tensei V" }),
        ],
      }),
    );
    render(<FamilyHub game={base} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Link to another edition/i }));
    const options = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "")
      .filter((t) => t.includes("Shin") || t.includes("Hollow") || t.includes("Celeste"));
    // The two SMT games lead; the unrelated titles trail in collection order.
    expect(options[0]).toContain("Shin Megami Tensei V");
    expect(options[1]).toContain("Shin Megami Tensei");
    expect(options[options.length - 1]).toContain("Celeste");
  });
});
