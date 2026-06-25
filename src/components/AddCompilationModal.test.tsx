import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { AddCompilationModal } from "./AddCompilationModal";
import { useStore } from "../store";
import { totalCost } from "../lib/copies";
import type { Compilation, Game } from "../types";

beforeEach(() => {
  act(() =>
    useStore.setState({ cloud: false, viewing: null, games: [], compilations: [] }),
  );
});

function fill(title: string, total: string, names: string[]) {
  fireEvent.change(screen.getByPlaceholderText(/Super Mario 3D All-Stars/i), {
    target: { value: title },
  });
  fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: total } });
  const nameInputs = screen.getAllByLabelText("Game name");
  names.forEach((n, i) => fireEvent.change(nameInputs[i], { target: { value: n } }));
  // Format is a required personal field now — pick one so submit can enable.
  fireEvent.click(screen.getByRole("button", { name: "Physical" }));
}

describe("AddCompilationModal", () => {
  it("splits the total evenly across the child games by default", async () => {
    render(<AddCompilationModal onClose={() => {}} />);
    fill("Bundle", "40", ["Game A", "Game B"]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Add 2 games to/i }));
    });

    const { games, compilations } = useStore.getState();
    expect(games).toHaveLength(2);
    expect(games.every((g) => totalCost(g.copies) === 20)).toBe(true);
    expect(games.every((g) => g.compilationId === compilations[0].id)).toBe(true);
    expect(compilations[0].totalCost).toBe(40);
    expect(compilations[0].title).toBe("Bundle");
  });

  it("blocks submit in custom mode until the breakdown sums to the total", () => {
    render(<AddCompilationModal onClose={() => {}} />);
    fill("Bundle", "40", ["Game A", "Game B"]);
    fireEvent.click(screen.getByLabelText(/Edit breakdown/i));

    const costs = screen.getAllByLabelText("Assigned cost");
    fireEvent.change(costs[0], { target: { value: "10" } });
    fireEvent.change(costs[1], { target: { value: "10" } }); // sums to 20, not 40

    const submit = screen.getByRole("button", { name: /Add 2 games to/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(costs[0], { target: { value: "30" } }); // now 30 + 10 = 40
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the bottom 'Add games to' in sync with the per-game toggles", () => {
    render(<AddCompilationModal onClose={() => {}} />);
    fill("Bundle", "40", ["Game A", "Game B"]); // defaults both games to the Bazaar
    expect(screen.getByRole("button", { name: "Add 2 games to Bazaar" })).toBeTruthy();

    // Mark only the first game Finished → the set is mixed, so the submit button
    // drops the single destination and the bottom buttons reflect "no common one".
    const firstStatus = screen.getAllByRole("group", { name: "Game status" })[0];
    fireEvent.click(within(firstStatus).getByText("Finished"));
    expect(screen.getByRole("button", { name: "Add 2 games" })).toBeTruthy();

    // Clicking the bottom Finished re-syncs every game (master toggle).
    const addTo = screen.getByText("Add games to").parentElement as HTMLElement;
    fireEvent.click(within(addTo).getByRole("button", { name: /Finished/ }));
    expect(screen.getByRole("button", { name: "Add 2 games to Finished" })).toBeTruthy();
  });

  it("distributes by length when 'Balance by length' is used", () => {
    render(<AddCompilationModal onClose={() => {}} />);
    fill("Bundle", "40", ["Short", "Long"]);
    // lengths 10h and 30h → 25% / 75%
    const lengths = screen.getAllByLabelText("Length");
    fireEvent.change(lengths[0], { target: { value: "10h" } });
    fireEvent.change(lengths[1], { target: { value: "30h" } });
    fireEvent.click(screen.getByLabelText(/Edit breakdown/i));
    fireEvent.click(screen.getByRole("button", { name: /Balance by length/i }));

    const costs = screen.getAllByLabelText("Assigned cost") as HTMLInputElement[];
    expect(costs[0].value).toBe("10");
    expect(costs[1].value).toBe("30");
  });
});

describe("AddCompilationModal — edit mode", () => {
  const comp: Compilation = { id: "C", title: "Bundle", totalCost: 40, format: "physical", createdAt: 1 };
  const child = (over: Partial<Game>): Game =>
    ({
      id: "x",
      title: "X",
      status: "backlog",
      genres: [],
      platforms: [],
      copies: [{ id: "c", platform: "Switch", cost: 20 }],
      addedAt: 1,
      familyId: null,
      compilationId: "C",
      compilationName: "Bundle",
      ...over,
    }) as Game;

  beforeEach(() => {
    act(() =>
      useStore.setState({
        cloud: false,
        viewing: null,
        compilations: [comp],
        games: [
          child({ id: "g1", title: "Game A" }),
          child({ id: "g2", title: "Game B" }),
        ],
      }),
    );
  });

  it("pre-fills the form from the existing compilation and saves changes", async () => {
    render(<AddCompilationModal compilation={comp} onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: /Edit compilation/i })).toBeTruthy();
    // The pre-filled game names must NOT auto-open a search dropdown on mount.
    expect(screen.queryByRole("option")).toBeNull();
    // Title + the two existing games are pre-filled.
    expect((screen.getByDisplayValue("Bundle") as HTMLInputElement).value).toBe("Bundle");
    const names = screen.getAllByLabelText("Game name") as HTMLInputElement[];
    expect(names.map((n) => n.value).sort()).toEqual(["Game A", "Game B"]);

    // An even split opens with the breakdown collapsed (not forced custom).
    expect((screen.getByLabelText(/Edit breakdown/i) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText(/balanced/i)).toBeNull();

    fireEvent.change(screen.getByDisplayValue("Bundle"), { target: { value: "Renamed" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    });

    expect(useStore.getState().compilations[0].title).toBe("Renamed");
    expect(useStore.getState().games.every((g) => g.compilationName === "Renamed")).toBe(true);
  });

  it("opens with the breakdown expanded when the existing split is custom", () => {
    act(() =>
      useStore.setState({
        compilations: [comp],
        games: [
          child({ id: "g1", title: "Game A", copies: [{ id: "c1", platform: "Switch", cost: 30 }] }),
          child({ id: "g2", title: "Game B", copies: [{ id: "c2", platform: "Switch", cost: 10 }] }),
        ],
      }),
    );
    render(<AddCompilationModal compilation={comp} onClose={() => {}} />);
    expect((screen.getByLabelText(/Edit breakdown/i) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/balanced/i)).toBeTruthy();
  });
});

describe("AddCompilationModal — suggest to the community", () => {
  const submitMock = vi.fn(async () => ({ ok: true }) as { ok: boolean; duplicate?: boolean });

  beforeEach(() => {
    submitMock.mockClear();
    act(() =>
      useStore.setState({
        cloud: true,
        viewing: null,
        games: [],
        compilations: [],
        searchCompilationTemplates: async () => [],
        submitCompilationTemplate: submitMock,
      }),
    );
  });

  it("submits the current draft as a new template", async () => {
    render(<AddCompilationModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Super Mario 3D All-Stars/i), {
      target: { value: "My Bundle" },
    });
    const names = screen.getAllByLabelText("Game name");
    fireEvent.change(names[0], { target: { value: "Game A" } });
    fireEvent.change(names[1], { target: { value: "Game B" } });

    const btn = screen.getByRole("button", { name: /Suggest this compilation/i });
    await act(async () => {
      fireEvent.click(btn);
      fireEvent.click(btn); // a second rapid click must not double-submit
    });

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    // The button confirms in place and locks afterward.
    expect(screen.getByText(/Suggested — awaiting review/i)).toBeTruthy();
    const calls = submitMock.mock.calls as unknown as Array<
      [{ kind: string; title: string; games: { name: string }[] }]
    >;
    const arg = calls[0][0];
    expect(arg.kind).toBe("new");
    expect(arg.title).toBe("My Bundle");
    expect(arg.games.map((g) => g.name)).toEqual(["Game A", "Game B"]);
  });

  it("carries each game's cover image when suggesting from edit mode", async () => {
    const comp: Compilation = { id: "C", title: "Bundle", totalCost: 20, createdAt: 1 };
    const child = {
      id: "g1",
      title: "Game A",
      status: "backlog",
      genres: [],
      platforms: [],
      copies: [{ id: "c1", platform: "Switch", cost: 20 }],
      addedAt: 1,
      familyId: null,
      compilationId: "C",
      compilationName: "Bundle",
      image: "cover.png",
      hours: 10,
    } as Game;
    act(() => useStore.setState({ compilations: [comp], games: [child] }));

    render(<AddCompilationModal compilation={comp} onClose={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Suggest this compilation/i }));
    });

    await waitFor(() => expect(submitMock).toHaveBeenCalled());
    const calls = submitMock.mock.calls as unknown as Array<[{ games: { name: string; image?: string }[] }]>;
    expect(calls[0][0].games[0].image).toBe("cover.png");
  });

  it("blocks an unchanged edit-mode draft that already matches a shared template", async () => {
    const comp: Compilation = { id: "C", title: "Bundle", totalCost: 20, createdAt: 1 };
    const child = {
      id: "g1",
      title: "Game A",
      status: "backlog",
      genres: [],
      platforms: [],
      copies: [{ id: "c1", platform: "Switch", cost: 20 }],
      addedAt: 1,
      familyId: null,
      compilationId: "C",
      compilationName: "Bundle",
      hours: 10,
    } as Game;
    // Edit mode never runs the title autocomplete, so suggest() must look the
    // shared templates up itself — here one matches the draft verbatim.
    act(() =>
      useStore.setState({
        compilations: [comp],
        games: [child],
        searchCompilationTemplates: async () => [
          { id: "T", title: "Bundle", games: [{ name: "Game A", hours: 10 }], createdAt: 1 },
        ],
      }),
    );

    render(<AddCompilationModal compilation={comp} onClose={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Suggest this compilation/i }));
    });

    expect(submitMock).not.toHaveBeenCalled();
    expect(screen.getByText(/already shared/i)).toBeTruthy();
  });

  it("reflects a blocked (already-pending) submit in the button text", async () => {
    submitMock.mockResolvedValueOnce({ ok: false, duplicate: true });
    render(<AddCompilationModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Super Mario 3D All-Stars/i), {
      target: { value: "Dupe" },
    });
    const names = screen.getAllByLabelText("Game name");
    fireEvent.change(names[0], { target: { value: "Game A" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Suggest this compilation/i }));
    });

    expect(screen.getByText(/already awaiting review/i)).toBeTruthy();
  });
});
