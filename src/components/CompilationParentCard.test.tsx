import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { CompilationParentCard } from "./CompilationParentCard";
import { compilationRollup } from "../lib/compilationGrouping";
import { useStore } from "../store";
import type { Compilation, Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Game A",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    familyId: null,
    ...over,
  } as Game;
}

const comp: Compilation = {
  id: "C",
  title: "Trilogy Collection",
  totalCost: 45,
  createdAt: 1,
  expanded: false,
  carryoverHours: 3,
};
const children = [
  game({ id: "g1", title: "Part 1", status: "finished", compilationId: "C", playedHours: 5 }),
  game({ id: "g2", title: "Part 2", status: "backlog", compilationId: "C", playedHours: 2 }),
];

beforeEach(() => {
  act(() =>
    useStore.setState({ cloud: false, viewing: null, games: children, compilations: [comp] }),
  );
});

describe("CompilationParentCard", () => {
  it("shows the rollup: title, game counts, hours incl. carryover, and spend", () => {
    render(<CompilationParentCard collapsed={compilationRollup(comp, children)} />);
    expect(screen.getByText("Trilogy Collection")).toBeTruthy();
    expect(screen.getByText(/2 games · 1 finished/)).toBeTruthy();
    // 5 + 2 child hours + 3 carryover = 10h.
    expect(screen.getByText(/10h played/)).toBeTruthy();
    expect(screen.getByText(/\$45 spent/)).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
  });

  it("expands the bundle from the primary button", () => {
    const setCompilationExpanded = vi.fn().mockResolvedValue(undefined);
    act(() => useStore.setState({ setCompilationExpanded }));
    render(<CompilationParentCard collapsed={compilationRollup(comp, children)} />);
    fireEvent.click(screen.getByRole("button", { name: /Expand/ }));
    expect(setCompilationExpanded).toHaveBeenCalledWith("C", true);
  });

  it("is a pure data view — no playtime logging and no economy controls", () => {
    render(<CompilationParentCard collapsed={compilationRollup(comp, children)} />);
    expect(screen.queryByText(/Add time/i)).toBeNull();
    expect(screen.queryByText(/Buy & Start/i)).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
});
