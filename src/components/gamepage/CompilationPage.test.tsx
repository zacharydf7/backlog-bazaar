import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompilationPage } from "./CompilationPage";
import { useStore } from "../../store";
import type { Compilation, Game } from "../../types";

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
  copies: [{ id: "cp1", platform: "Nintendo Switch", format: "physical", cost: 45 }],
  createdAt: 1,
  expanded: false,
  carryoverHours: 3,
};

const children = [
  game({ id: "g1", title: "Part 1", status: "finished", compilationId: "C", playedHours: 5 }),
  game({ id: "g2", title: "Part 2", status: "backlog", compilationId: "C", playedHours: 2 }),
];

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  act(() =>
    useStore.setState({
      cloud: false,
      viewing: null,
      games: children,
      compilations: [comp],
    }),
  );
});

describe("CompilationPage", () => {
  it("renders the hero rollup: title, badge, progress, and aggregate time/spend", () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.getByRole("heading", { name: "Trilogy Collection" })).toBeTruthy();
    expect(screen.getByText(/Compilation · 2 games · 1 finished/)).toBeTruthy();
    // 5 + 2 child hours + 3 carryover = 10h.
    expect(screen.getByText(/10h played/)).toBeTruthy();
    expect(screen.getByText(/\$45 spent/)).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getByText("Nintendo Switch")).toBeTruthy();
  });

  it("lists every bundled game and opens a child's own page on click", () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.getByText("Part 1")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Open Part 2"));
    expect(window.location.hash).toBe("#g/g2");
  });

  it("offers no Journey tab offline (milestones are cloud-only)", () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.queryByRole("tab", { name: /Journey/i })).toBeNull();
  });

  it("breaks out a milestone timeline per game on the Journey tab (cloud)", async () => {
    act(() =>
      useStore.setState({
        cloud: true,
        fetchGameMilestones: vi.fn(async () => []),
      }),
    );
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /Journey/i }));
    // One milestone section per child, each under the child's own heading.
    expect(screen.getByRole("heading", { name: "Part 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Part 2" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Milestones/i })).toHaveLength(2),
    );
    // The bundle-level carryover is explained, not attributed to a child.
    expect(screen.getByText(/3h was logged on the single card/)).toBeTruthy();
  });

  it("carries the management actions the hub modal had", () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.getByRole("button", { name: /Expand into cards/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Edit compilation/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete compilation/i })).toBeTruthy();
  });

  it("shows a not-found panel for an unknown id, and leaves once a shown bundle vanishes", () => {
    const onBack = vi.fn();
    const { rerender } = render(<CompilationPage compilationId="nope" onBack={onBack} />);
    expect(screen.getByText(/isn’t in the library/)).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    // Now show a real one, then delete it out from under the page.
    rerender(<CompilationPage compilationId="C" onBack={onBack} />);
    expect(screen.getByRole("heading", { name: "Trilogy Collection" })).toBeTruthy();
    act(() => useStore.setState({ compilations: [] }));
    expect(onBack).toHaveBeenCalled();
  });
});
