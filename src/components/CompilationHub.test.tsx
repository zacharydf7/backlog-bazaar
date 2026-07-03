import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { CompilationHub } from "./CompilationHub";
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

const comp: Compilation = { id: "C", title: "Bundle", totalCost: 40, createdAt: 1, expanded: true, carryoverHours: 0 };
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

describe("CompilationHub collapsed-card cover", () => {
  it("offers Upload on the cloud and sends the picked file to the store", () => {
    const setCover = vi.fn(async () => {});
    act(() => useStore.setState({ cloud: true, setCompilationParentImage: setCover }));
    render(<CompilationHub game={a} onClose={() => {}} />);

    expect(screen.getByText(/Collapsed-card cover/i)).toBeTruthy();
    const input = screen.getByText(/Upload image/i).parentElement!.querySelector("input")!;
    const file = new File(["x"], "cover.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(setCover).toHaveBeenCalledWith("C", file);
  });

  it("offers Remove only when a custom parent cover is set, and clears it", () => {
    const clearCover = vi.fn(async () => {});
    act(() =>
      useStore.setState({
        compilations: [{ ...comp, parentImage: "custom.png" }],
        clearCompilationParentImage: clearCover,
      }),
    );
    render(<CompilationHub game={a} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Remove — use the first game/i }));
    expect(clearCover).toHaveBeenCalledWith("C");
  });

  it("previews exactly the cover the collapsed card uses — library order, not A-Z (regression)", () => {
    // Library order: Zebra first (its cover is the card's fallback). The hub
    // lists children alphabetically, which used to make the preview show
    // Alpha's cover while the collapsed card showed Zebra's.
    const zebra = game({ id: "z", title: "Zebra Quest", compilationId: "C", image: "zebra.png" });
    const alpha = game({ id: "al", title: "Alpha Quest", compilationId: "C", image: "alpha.png" });
    act(() =>
      useStore.setState({ cloud: true, games: [zebra, alpha], compilations: [comp] }),
    );
    render(<CompilationHub game={zebra} onClose={() => {}} />);

    const preview = document.querySelector("img");
    expect(preview?.getAttribute("src")).toBe("zebra.png");
    expect(preview?.getAttribute("src")).toBe(compilationRollup(comp, [zebra, alpha]).image);
  });

  it("hides the whole block offline with no custom cover, and Upload while offline", () => {
    const first = render(<CompilationHub game={a} onClose={() => {}} />); // cloud: false, no parentImage
    expect(screen.queryByText(/Collapsed-card cover/i)).toBeNull();
    first.unmount();

    // Offline with a leftover custom cover: Remove still works, Upload doesn't show.
    act(() => useStore.setState({ compilations: [{ ...comp, parentImage: "custom.png" }] }));
    render(<CompilationHub game={a} onClose={() => {}} />);
    expect(screen.getByText(/Collapsed-card cover/i)).toBeTruthy();
    expect(screen.queryByText(/Upload image/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Remove — use the first game/i })).toBeTruthy();
  });
});
