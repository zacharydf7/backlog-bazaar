import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompilationPage } from "./CompilationPage";
import { useStore } from "../../store";
import type { Compilation, Game } from "../../types";
import type { GameMilestone, MilestoneKind } from "../../lib/milestones";

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
  // jsdom doesn't implement scrollTo; framer-motion's Reorder touches it on mount.
  window.scrollTo = () => {};
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

  it("lists every bundled game; a row opens its drawer, which links to the game's page", () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.getByText("Part 1")).toBeTruthy();
    const row = screen.getByTitle("Manage Part 2");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Open Part 2's page/ }));
    expect(window.location.hash).toBe("#g/g2");
  });

  it("drawers manage a game in place with its own controls (86fc0b4b)", () => {
    act(() =>
      useStore.setState({
        games: children.map((g) => (g.id === "g2" ? { ...g, hours: 12 } : g)),
      }),
    );
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    // Collapsed header: hours logged against the game's length.
    expect(screen.getByText("/ 12h")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Manage Part 2"));
    // The game's own economy action, not a free status switch.
    expect(screen.getByRole("button", { name: /Buy & Start/i })).toBeTruthy();
    // Priority writes straight to the game record, and the header follows.
    fireEvent.click(screen.getByRole("button", { name: "High" }));
    expect(useStore.getState().games.find((g) => g.id === "g2")?.priority).toBe("high");
    expect(screen.getByText("Your length")).toBeTruthy();
    expect(screen.getByText("Your score")).toBeTruthy();
    // One drawer at a time: opening Part 1 closes Part 2.
    fireEvent.click(screen.getByTitle("Manage Part 1"));
    expect(screen.getByTitle("Manage Part 2").getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps one hours control per drawer: the time editor, or GameActions' logger in play", () => {
    act(() =>
      useStore.setState({
        games: children.map((g) => (g.id === "g2" ? { ...g, status: "playing" as const } : g)),
      }),
    );
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    fireEvent.click(screen.getByTitle("Manage Part 1")); // finished
    expect(screen.getByText("Played", { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByTitle("Manage Part 2")); // playing
    expect(screen.queryByText("Played", { exact: true })).toBeNull();
    expect(screen.getByRole("button", { name: "Log" })).toBeTruthy();
  });

  it("renders the bundle in the saved child order, with a handle per game (140ac868)", () => {
    act(() => useStore.setState({ compilations: [{ ...comp, childOrder: ["g2", "g1"] }] }));
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    const p1 = screen.getByText("Part 1");
    const p2 = screen.getByText("Part 2");
    // Custom order puts Part 2 first, so it precedes Part 1 in the document.
    expect(p2.compareDocumentPosition(p1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A drag handle per game, and the note explaining where the order shows.
    expect(screen.getAllByRole("button", { name: /Drag to reorder/i })).toHaveLength(2);
    expect(screen.getByText(/cards list its games in this order/i)).toBeTruthy();
  });

  it("offers no Journey tab offline (milestones are cloud-only)", () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.queryByRole("tab", { name: /Journey/i })).toBeNull();
  });

  it("interleaves every game's milestones into one dated bundle timeline (86fc0b4b)", async () => {
    const m = (id: string, gameId: string, kind: MilestoneKind, occurredOn: string): GameMilestone => ({
      id,
      gameId,
      kind,
      occurredOn,
      source: "auto",
      createdAt: 1,
    });
    const byGame: Record<string, GameMilestone[]> = {
      g1: [m("a", "g1", "started", "2026-01-05"), m("b", "g1", "beat", "2026-03-01")],
      g2: [m("c", "g2", "started", "2026-02-10")],
    };
    act(() =>
      useStore.setState({
        cloud: true,
        fetchGameMilestones: vi.fn(async (id: string) => byGame[id] ?? []),
      }),
    );
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /Journey/i }));
    const timeline = await screen.findByRole("list", { name: "Bundle timeline" });
    // Date order across games, each row naming its game.
    expect(Array.from(timeline.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
      "2026-01-05StartedPart 1",
      "2026-02-10StartedPart 2",
      "2026-03-01BeatPart 1",
    ]);
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

  it("carries Play a game and the management actions, but no Expand (86fc0b4b)", () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.queryByRole("button", { name: /Expand/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Collapse/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Edit compilation/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete compilation/i })).toBeTruthy();
    // Part 2 is still in the Bazaar, so the bundle can start a game.
    fireEvent.click(screen.getByRole("button", { name: /Play a game/i }));
    expect(screen.getByRole("dialog", { name: /Play a game from Trilogy Collection/ })).toBeTruthy();
  });

  it("hides Play a game once no game is left in the Bazaar", () => {
    act(() =>
      useStore.setState({ games: children.map((g) => ({ ...g, status: "finished" as const })) }),
    );
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.queryByRole("button", { name: /Play a game/i })).toBeNull();
  });

  it("browses to a neighbouring stop with Prev/Next (issue 28ec4975)", () => {
    const onNavigate = vi.fn();
    const nav = {
      stops: [
        { kind: "game" as const, id: "g0" },
        { kind: "compilation" as const, id: "C" },
        { kind: "game" as const, id: "g9" },
      ],
      label: "Bazaar",
    };
    render(
      <CompilationPage compilationId="C" onBack={() => {}} pageNav={nav} onNavigate={onNavigate} />,
    );
    expect(screen.getByText(/2 of 3/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Previous in Bazaar/i));
    expect(onNavigate).toHaveBeenCalledWith({ kind: "game", id: "g0" });
    fireEvent.click(screen.getByLabelText(/Next in Bazaar/i));
    expect(onNavigate).toHaveBeenCalledWith({ kind: "game", id: "g9" });
  });

  it("shows no Prev/Next without a pageNav (deep link)", () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.queryByLabelText(/in Bazaar/i)).toBeNull();
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

// Ported from the retired CompilationHub modal (issue 86fc0b4b): the page is
// now the bundle's only management surface.
describe("CompilationPage delete and card cover", () => {
  it("deletes the whole compilation after confirming", async () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Delete compilation/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Delete everything/i }));
    });
    const { games, compilations } = useStore.getState();
    expect(games).toHaveLength(0);
    expect(compilations).toHaveLength(0);
  });

  it("offers Upload on the cloud and sends the picked file to the store", () => {
    const setCover = vi.fn(async () => {});
    act(() =>
      useStore.setState({
        cloud: true,
        fetchGameMilestones: vi.fn(async () => []),
        setCompilationParentImage: setCover,
      }),
    );
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.getByText("Card cover")).toBeTruthy();
    const input = screen.getByText(/Upload image/i).parentElement!.querySelector("input")!;
    const file = new File(["x"], "cover.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(setCover).toHaveBeenCalledWith("C", file);
  });

  it("offers Remove only when a custom cover is set, and clears it", () => {
    const clearCover = vi.fn(async () => {});
    act(() =>
      useStore.setState({
        compilations: [{ ...comp, parentImage: "custom.png" }],
        clearCompilationParentImage: clearCover,
      }),
    );
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove — use the first game/i }));
    expect(clearCover).toHaveBeenCalledWith("C");
  });

  it("previews the cover the bundle card uses — bundle order, not A-Z (regression)", () => {
    const zebra = game({ id: "z", title: "Zebra Quest", compilationId: "C", image: "zebra.png" });
    const alpha = game({ id: "al", title: "Alpha Quest", compilationId: "C", image: "alpha.png" });
    act(() => useStore.setState({ cloud: true, games: [zebra, alpha] }));
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    const srcs = Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    // Hero and the card-cover preview both show the first game in bundle order.
    expect(srcs.filter((s) => s === "zebra.png")).toHaveLength(2);
    expect(srcs).not.toContain("alpha.png");
  });

  it("hides the cover block offline with no custom cover, and Upload while offline", () => {
    const first = render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.queryByText("Card cover")).toBeNull();
    first.unmount();
    // Offline with a leftover custom cover: Remove still works, Upload doesn't show.
    act(() => useStore.setState({ compilations: [{ ...comp, parentImage: "custom.png" }] }));
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.getByText("Card cover")).toBeTruthy();
    expect(screen.queryByText(/Upload image/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Remove — use the first game/i })).toBeTruthy();
  });
});
