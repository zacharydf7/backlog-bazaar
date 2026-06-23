import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { CompilationHub } from "./CompilationHub";
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

const comp: Compilation = { id: "C", title: "Bundle", totalCost: 40, createdAt: 1 };
const a = game({
  id: "g1",
  title: "Game A",
  status: "finished",
  compilationId: "C",
  playedHours: 5,
  copies: [{ id: "c1", platform: "Switch", cost: 20 }],
});
const b = game({
  id: "g2",
  title: "Game B",
  status: "backlog",
  compilationId: "C",
  playedHours: 2,
  copies: [{ id: "c2", platform: "Switch", cost: 20 }],
});

beforeEach(() => {
  act(() =>
    useStore.setState({ cloud: false, viewing: null, games: [a, b], compilations: [comp] }),
  );
});

describe("CompilationHub", () => {
  it("shows the total spent and a checklist of every bundled game", () => {
    render(<CompilationHub game={a} onClose={() => {}} />);
    expect(screen.getByText(/\$40 spent/)).toBeTruthy();
    expect(screen.getByText("Game A")).toBeTruthy();
    expect(screen.getByText("Game B")).toBeTruthy();
    expect(screen.getByText(/2 games · 1 finished/)).toBeTruthy();
    // Total hours played across the children (5h + 2h).
    expect(screen.getByText(/7h played/)).toBeTruthy();
  });

  it("deletes the whole compilation after confirming", async () => {
    const onClose = vi.fn();
    render(<CompilationHub game={a} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /Delete compilation/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Delete everything/i }));
    });

    const { games, compilations } = useStore.getState();
    expect(games).toHaveLength(0);
    expect(compilations).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
  });
});
