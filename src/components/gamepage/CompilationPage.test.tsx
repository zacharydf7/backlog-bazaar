import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CompilationPage } from "./CompilationPage";
import { useStore } from "../../store";
import type { Compilation, Game } from "../../types";
import type { GameMeta } from "../../types";
import type { GameMilestone, MilestoneKind } from "../../lib/milestones";

const searchGamesMock = vi.fn<(q: string) => Promise<GameMeta[]>>();
vi.mock("../../lib/gamedata", async (importActual) => ({
  ...(await importActual<typeof import("../../lib/gamedata")>()),
  searchGames: (q: string) => searchGamesMock(q),
}));

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
  act(() => useStore.setState({ targetCostPerHour: null }));
  // jsdom doesn't implement scrollTo; framer-motion's Reorder touches it on mount.
  window.scrollTo = () => {};
  act(() =>
    useStore.setState({
      cloud: false,
      viewing: null,
      games: children,
      compilations: [comp],
      compilationGames: [],
    }),
  );
});

/** The compilation's own game row (issue 86fc0b4b). */
const container = game({
  id: "CG",
  title: "Trilogy Collection",
  compilationGameFor: "C",
  image: "box.png",
  rawgId: 77,
});

/** Online, with the compilation's own game row loaded. */
function withContainer(over: Partial<Game> = {}) {
  act(() =>
    useStore.setState({
      cloud: true,
      compilationGames: [{ ...container, ...over }],
      fetchGameMilestones: vi.fn(async () => []),
      fetchGameScreenshots: vi.fn(async () => []),
      fetchGameReviews: vi.fn(async () => []),
      fetchCommunityStats: vi.fn(async () => null),
      ensureCompilationGame: vi.fn(async () => null),
    }),
  );
}

function openTab(name: RegExp) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

describe("CompilationPage", () => {
  it("renders the hero rollup: title, badge, progress, and aggregate time/spend", () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.getByRole("heading", { name: "Trilogy Collection" })).toBeTruthy();
    expect(screen.getByText(/Compilation · 2 games · 1 finished/)).toBeTruthy();
    // 5 + 2 child hours + 3 carryover = 10h.
    expect(screen.getByText("10h played")).toBeTruthy(); // the header chip
    expect(screen.getByText(/\$45 spent/)).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
    const hero = screen.getByRole("heading", { name: "Trilogy Collection" }).closest("section")!;
    expect(within(hero as HTMLElement).getByText("Nintendo Switch")).toBeTruthy();
  });

  it("shows what you own and paid on the Overview, like a game's (9132df8d)", () => {
    act(() => useStore.setState({ targetCostPerHour: 4.5 }));
    withContainer();
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    const owned = screen.getByText("Owned on").parentElement!;
    expect(within(owned).getByText("Nintendo Switch")).toBeTruthy();
    expect(screen.getByText(/Spent \$45/)).toBeTruthy();
    expect(screen.getByText(/· 10h played/)).toBeTruthy();
    expect(screen.getByText(/value played/)).toBeTruthy();
    expect(screen.getByText("Nintendo Switch (Physical)")).toBeTruthy();
  });

  it("values the time played on a bundle with nothing spent (9132df8d)", () => {
    act(() =>
      useStore.setState({
        targetCostPerHour: 2,
        compilations: [{ ...comp, totalCost: 0, copies: [{ id: "cp1", platform: "Nintendo Switch", format: "physical" }] }],
      }),
    );
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    // 10h at $2/hr — the value alone, with no empty spend box, like a game's Overview.
    expect(screen.getByText(/\$20 value played/)).toBeTruthy();
    expect(screen.queryByText(/Spent —/)).toBeNull();
    // The Library tab keeps its full copies box, unchanged.
    openTab(/Library/);
    expect(screen.getByText(/Spent —/)).toBeTruthy();
    expect(screen.queryByText(/value played/)).toBeNull();
  });

  it("shows no ownership block on an Overview with nothing to show (9132df8d)", () => {
    act(() => useStore.setState({ compilations: [{ ...comp, totalCost: 0, copies: [] }] }));
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.queryByText("Owned on")).toBeNull();
    expect(screen.queryByText(/Spent/)).toBeNull();
  });

  it("lists every bundled game on the Games tab; a row opens the game's page (86fc0b4b)", () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    openTab(/Games/);
    expect(screen.getByText("Part 1")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Open Part 2"));
    expect(window.location.hash).toBe("#g/g2");
  });

  it("keeps the games lightweight: status, priority and hours, with no drawer (86fc0b4b)", () => {
    act(() =>
      useStore.setState({
        games: children.map((g) => (g.id === "g2" ? { ...g, hours: 12, priority: "high" as const } : g)),
      }),
    );
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    openTab(/Games/);
    const row = screen.getByTitle("Open Part 2");
    // Hours logged against the game's length, its status and its priority.
    expect(within(row).getByText("/ 12h")).toBeTruthy();
    expect(within(row).getByText("Bazaar")).toBeTruthy();
    expect(within(row).getByText(/High/)).toBeTruthy();
    // Its economy lives on its own page, not in an in-place panel.
    expect(row.getAttribute("aria-expanded")).toBeNull();
    expect(screen.queryByRole("button", { name: /Buy & Start/i })).toBeNull();
  });

  it("renders the bundle in the saved child order, with a handle per game (140ac868)", () => {
    act(() => useStore.setState({ compilations: [{ ...comp, childOrder: ["g2", "g1"] }] }));
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    openTab(/Games/);
    const p1 = screen.getByText("Part 1");
    const p2 = screen.getByText("Part 2");
    // Custom order puts Part 2 first, so it precedes Part 1 in the document.
    expect(p2.compareDocumentPosition(p1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A drag handle per game, and the note explaining where the order shows.
    expect(screen.getAllByRole("button", { name: /Drag to reorder/i })).toHaveLength(2);
    expect(screen.getByText(/cards list its games in this order/i)).toBeTruthy();
  });

  it("takes its status from its games: Now Playing while any is played (86fc0b4b)", () => {
    const { unmount } = render(<CompilationPage compilationId="C" onBack={() => {}} />);
    // One finished, one in the Bazaar: still in the Bazaar.
    expect(screen.getAllByText("Bazaar").length).toBeGreaterThan(0);
    unmount();
    act(() =>
      useStore.setState({ games: children.map((g) => ({ ...g, status: "finished" as const })) }),
    );
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.getByText("Finished")).toBeTruthy();
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

  it("totals the bundle's played time and judges its Money Well Spent value (86fc0b4b)", () => {
    // $45 spent; 5h + 2h + 3h carryover = 10h played. At $4.50/hr, 10h pays it off.
    act(() => useStore.setState({ targetCostPerHour: 4.5 }));
    const { unmount } = render(<CompilationPage compilationId="C" onBack={() => {}} />);
    openTab(/Library/);
    expect(screen.getByText(/· 10h played/)).toBeTruthy();
    expect(screen.getByText(/value played/).textContent).not.toMatch(/to well spent/);
    expect(screen.getByText("Well spent")).toBeTruthy(); // header chip
    unmount();

    // At $1/hr the bundle needs 45h: not yet — the box names the hours to go.
    act(() => useStore.setState({ targetCostPerHour: 1 }));
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    openTab(/Library/);
    expect(screen.getByText(/value played/).textContent).toMatch(/35h to well spent/);
    expect(screen.queryByText("Well spent")).toBeNull();
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

describe("CompilationPage as a game (86fc0b4b)", () => {
  it("shows its own game row's cover, and offers Review and Community", () => {
    withContainer();
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(document.querySelector("img")?.getAttribute("src")).toBe("box.png");
    for (const name of [/Overview/, /Games/, /Journey/, /Review/, /Community/, /Library/]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    // The legacy card-cover block gives way to the game row's cover controls.
    expect(screen.queryByText("Card cover")).toBeNull();
  });

  it("offers no Review or Community without its game row", () => {
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(screen.queryByRole("tab", { name: /Review/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Community/ })).toBeNull();
  });

  it("likes and covers the compilation's own game row, not a game inside it", () => {
    const toggleGameLike = vi.fn(async () => {});
    const setGameImage = vi.fn(async () => {});
    withContainer();
    act(() => useStore.setState({ toggleGameLike, setGameImage }));
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Like/i }));
    expect(toggleGameLike).toHaveBeenCalledWith("CG");
    const input = screen.getByText(/Upload image/).parentElement!.querySelector("input")!;
    const file = new File(["x"], "box.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(setGameImage).toHaveBeenCalledWith("CG", file);
  });

  it("creates the game row once when a compilation opens without one", () => {
    const ensureCompilationGame = vi.fn(async () => null);
    act(() =>
      useStore.setState({
        cloud: true,
        fetchGameMilestones: vi.fn(async () => []),
        ensureCompilationGame,
      }),
    );
    const { rerender } = render(<CompilationPage compilationId="C" onBack={() => {}} />);
    rerender(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(ensureCompilationGame).toHaveBeenCalledTimes(1);
    expect(ensureCompilationGame).toHaveBeenCalledWith("C");
  });

  it("doesn't create a game row offline or when one exists", () => {
    const ensureCompilationGame = vi.fn(async () => null);
    act(() => useStore.setState({ ensureCompilationGame }));
    const { unmount } = render(<CompilationPage compilationId="C" onBack={() => {}} />);
    unmount();
    withContainer();
    act(() => useStore.setState({ ensureCompilationGame }));
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    expect(ensureCompilationGame).not.toHaveBeenCalled();
  });

  it("links an unlinked compilation to the database entry picked from search", async () => {
    vi.useFakeTimers();
    try {
      const entry = { title: "Trilogy Collection", igdbId: 4242, genres: [] };
      searchGamesMock.mockResolvedValue([entry]);
      withContainer({ rawgId: undefined, igdbId: undefined, catalogId: undefined });
      const ensureCompilationGame = vi.fn(async () => null);
      act(() => useStore.setState({ ensureCompilationGame }));
      render(<CompilationPage compilationId="C" onBack={() => {}} />);
      openTab(/Library/);
      expect(screen.getByText(/Not linked yet/)).toBeTruthy();
      expect(screen.getByRole("button", { name: /Suggest/i })).toBeTruthy();
      fireEvent.change(screen.getByLabelText(/Find this compilation/), {
        target: { value: "Trilogy" },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      fireEvent.mouseDown(screen.getByRole("option"));
      expect(ensureCompilationGame).toHaveBeenCalledWith("C", {
        rawgId: undefined,
        igdbId: 4242,
        catalogId: undefined,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a linked compilation's link, with a way to change it", () => {
    withContainer();
    render(<CompilationPage compilationId="C" onBack={() => {}} />);
    openTab(/Library/);
    expect(screen.queryByLabelText(/Find this compilation/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change link" }));
    expect(screen.getByLabelText(/Find this compilation/)).toBeTruthy();
  });
});
