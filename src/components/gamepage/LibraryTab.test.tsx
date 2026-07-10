import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LibraryTab } from "./LibraryTab";
import { SHOW_ALL_PLATFORMS } from "../CopyRowsEditor";
import { useStore } from "../../store";
import type { Game } from "../../types";

// The Add-a-platform block opens the real AddGameModal, whose pick path calls
// the length/detail lookups — keep those deterministic and offline.
vi.mock("../../lib/gamedata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/gamedata")>();
  return {
    ...actual,
    usingRawg: false,
    fetchGameDetails: vi.fn(async () => ({})),
    fetchHltbTimes: vi.fn(async () => null),
  };
});

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Hollow Knight",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

function setup(g: Game, over: Partial<Parameters<typeof useStore.setState>[0]> = {}) {
  act(() =>
    useStore.setState({
      viewing: null,
      cloud: true,
      games: [g],
      setGameCopies: vi.fn(async () => {}),
      submitGameSubmission: vi.fn(async () => true),
      ...over,
    }),
  );
  render(<LibraryTab hub={[g]} screenshots={[]} screenshotsKey={null} />);
}

function setupHub(hub: Game[], over: Partial<Parameters<typeof useStore.setState>[0]> = {}) {
  act(() =>
    useStore.setState({
      viewing: null,
      cloud: true,
      games: hub,
      setGameCopies: vi.fn(async () => {}),
      submitGameSubmission: vi.fn(async () => true),
      fetchGameScreenshots: vi.fn(async () => []),
      ...over,
    }),
  );
  render(<LibraryTab hub={hub} screenshots={[]} screenshotsKey={null} />);
}

beforeEach(() => {
  act(() => useStore.setState({ viewing: null }));
});

describe("LibraryTab immediate-write copies", () => {
  it("persists a platform pick immediately (no Save button anywhere)", async () => {
    setup(game({ platforms: ["PC", "Nintendo Switch"] }));
    fireEvent.click(screen.getByRole("button", { name: /Add a copy/i }));
    // The fresh row is incomplete (no platform) — nothing persisted yet.
    expect(useStore.getState().setGameCopies).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "PC" } });
    await waitFor(() => expect(useStore.getState().setGameCopies).toHaveBeenCalledTimes(1));
    const [, copies] = (useStore.getState().setGameCopies as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(copies).toHaveLength(1);
    expect(copies[0].platform).toBe("PC");
    expect(screen.queryByRole("button", { name: /Save changes/i })).toBeNull();
  });

  it("persists a format toggle immediately", async () => {
    setup(game({ platforms: ["PC"], copies: [{ id: "c1", platform: "PC" }] }));
    fireEvent.click(screen.getByRole("button", { name: "Digital" }));
    await waitFor(() => expect(useStore.getState().setGameCopies).toHaveBeenCalledTimes(1));
    const [, copies] = (useStore.getState().setGameCopies as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(copies[0].format).toBe("digital");
  });

  it("lets cost finish typing — persists on blur, not per keystroke", async () => {
    setup(game({ platforms: ["PC"], copies: [{ id: "c1", platform: "PC" }] }));
    const cost = screen.getByLabelText("Cost");
    fireEvent.change(cost, { target: { value: "19.99" } });
    expect(useStore.getState().setGameCopies).not.toHaveBeenCalled();

    fireEvent.blur(cost);
    await waitFor(() => expect(useStore.getState().setGameCopies).toHaveBeenCalledTimes(1));
    const [, copies] = (useStore.getState().setGameCopies as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(copies[0].cost).toBe(19.99);
  });

  it("does not persist when a blur changes nothing", async () => {
    setup(game({ platforms: ["PC"], copies: [{ id: "c1", platform: "PC", cost: 5 }] }));
    fireEvent.blur(screen.getByLabelText("Cost"));
    expect(useStore.getState().setGameCopies).not.toHaveBeenCalled();
  });

  it("files ONE missing-platform suggestion when a copy lands off the verified list", async () => {
    const g = game({ rawgId: 7, platforms: ["PC"] });
    setup(g);
    // The hatch now sits at the bottom of the platform dropdown itself
    // (issue 9aacac99); picking it widens the choices to the full master list
    // without selecting anything.
    fireEvent.click(screen.getByRole("button", { name: /Add a copy/i }));
    fireEvent.change(screen.getByLabelText("Platform"), {
      target: { value: SHOW_ALL_PLATFORMS },
    });
    fireEvent.change(screen.getByLabelText("Platform"), {
      target: { value: "Nintendo Switch" },
    });

    await waitFor(() =>
      expect(useStore.getState().submitGameSubmission).toHaveBeenCalledTimes(1),
    );
    const submission = (useStore.getState().submitGameSubmission as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(submission.kind).toBe("edit");
    expect(submission.proposed.platforms).toEqual(["PC", "Nintendo Switch"]);
    expect(submission.before.platforms).toEqual(["PC"]);

    // A later unrelated commit doesn't re-file the same platform.
    fireEvent.change(screen.getByLabelText("Cost"), { target: { value: "10" } });
    fireEvent.blur(screen.getByLabelText("Cost"));
    await waitFor(() => expect(useStore.getState().setGameCopies).toHaveBeenCalledTimes(2));
    expect(useStore.getState().submitGameSubmission).toHaveBeenCalledTimes(1);
  });

  it("shows a compilation child's copies locked (managed by the bundle)", () => {
    const g = game({
      compilationId: "C",
      compilationName: "Alwa's Collection",
      copies: [{ id: "c1", platform: "PlayStation 4", format: "physical", cost: 20 }],
    });
    setup(g);
    expect(screen.getByText(/managed by the/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add a copy/i })).toBeNull();
  });
});

describe("LibraryTab as the hub's instance control center", () => {
  it("lists every instance as its own sub-card with status and platform tags", () => {
    const ps = game({
      id: "a",
      rawgId: 7,
      status: "finished",
      copies: [{ id: "c1", platform: "PlayStation 4", format: "physical" }],
    });
    const sw = game({
      id: "b",
      rawgId: 7,
      status: "backlog",
      copies: [{ id: "c2", platform: "Nintendo Switch", format: "digital" }],
    });
    setupHub([ps, sw]);
    expect(screen.getByText("PlayStation 4 (Physical)")).toBeTruthy();
    expect(screen.getByText("Nintendo Switch (Digital)")).toBeTruthy();
    // Each instance keeps its own copies editor.
    expect(screen.getAllByRole("button", { name: /Add a copy/i })).toHaveLength(2);
  });

  it("crowns the family primary and names the family on linked rows", () => {
    const a = game({
      id: "a",
      familyId: "F",
      familyName: "Chrono Saga",
      familyPrimaryGameId: "a",
      copies: [{ id: "c1", platform: "PC" }],
    });
    const b = game({
      id: "b",
      familyId: "F",
      familyName: "Chrono Saga",
      familyPrimaryGameId: "a",
      copies: [{ id: "c2", platform: "Nintendo Switch" }],
    });
    setupHub([a, b]);
    expect(screen.getByText(/Primary/)).toBeTruthy();
    // Family name chips on the rows + the family block's summary line.
    expect(screen.getAllByText(/Chrono Saga/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: /Manage family/i })).toBeTruthy();
  });

  it("offers Link editions (opening the family manager) for unlinked instances", () => {
    const g = game({ copies: [{ id: "c1", platform: "PC" }] });
    setupHub([g]);
    const link = screen.getByRole("button", { name: /Link editions/i });
    fireEvent.click(link);
    // The Family Breakdown modal (the same manager the board card opens).
    expect(screen.getByRole("heading", { name: /Game Family/i })).toBeTruthy();
  });

  it("removes an instance through the Remove-version confirm (issue 2c6760ad)", () => {
    const removeGame = vi.fn(async () => {});
    const ps = game({
      id: "a",
      rawgId: 7,
      status: "finished",
      copies: [{ id: "c1", platform: "PlayStation 5", format: "physical" }],
    });
    const sw = game({
      id: "b",
      rawgId: 7,
      status: "backlog",
      copies: [{ id: "c2", platform: "Nintendo Switch 2", format: "physical" }],
    });
    setupHub([ps, sw], { removeGame });

    // One Remove control per instance.
    const removeButtons = screen.getAllByRole("button", { name: /Remove this .* version/i });
    expect(removeButtons).toHaveLength(2);
    const ps5Remove = removeButtons.find((b) =>
      /PlayStation 5/i.test(b.getAttribute("aria-label") ?? ""),
    )!;
    fireEvent.click(ps5Remove);
    // Confirm, then the instance (not just a copy) is deleted.
    fireEvent.click(screen.getByRole("button", { name: /Remove version/i }));
    expect(removeGame).toHaveBeenCalledWith("a");
  });

  it("routes removing an instance's LAST copy to the remove-version confirm — no zombie (2c6760ad)", () => {
    const removeGame = vi.fn(async () => {});
    const setGameCopies = vi.fn(async () => {});
    const ps = game({
      id: "a",
      rawgId: 7,
      status: "finished",
      copies: [{ id: "c1", platform: "PlayStation 5", format: "physical" }],
    });
    const sw = game({
      id: "b",
      rawgId: 7,
      status: "backlog",
      copies: [{ id: "c2", platform: "Nintendo Switch 2", format: "physical" }],
    });
    setupHub([ps, sw], { removeGame, setGameCopies });

    // Delete the PS5 instance's only copy (its editor is the first).
    fireEvent.click(screen.getAllByRole("button", { name: "Remove copy" })[0]);
    // It must NOT persist an empty copy list (which would strand a zombie)…
    expect(setGameCopies).not.toHaveBeenCalled();
    // …it asks to remove the whole version instead.
    fireEvent.click(screen.getByRole("button", { name: /Remove version/i }));
    expect(removeGame).toHaveBeenCalledWith("a");
  });

  it("lets a SOLE instance go copy-less — no siblings, so no version removal (2c6760ad)", async () => {
    const removeGame = vi.fn(async () => {});
    const setGameCopies = vi.fn(async () => {});
    setup(game({ platforms: ["PC"], copies: [{ id: "c1", platform: "PC" }] }), {
      removeGame,
      setGameCopies,
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove copy" }));
    // A lone instance keeps a valid copy-less state (custom/ongoing) — the last
    // copy simply persists as an empty list, and nothing is removed.
    await waitFor(() => expect(setGameCopies).toHaveBeenCalled());
    expect((setGameCopies as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual([]);
    expect(screen.queryByRole("button", { name: /Remove version/i })).toBeNull();
    expect(removeGame).not.toHaveBeenCalled();
  });

  it("Add a platform opens the Add Game form pre-picked with this game (issue 9e8de6a4)", async () => {
    const g = game({
      rawgId: 7,
      platforms: ["PC", "Nintendo Switch"],
      copies: [{ id: "c1", platform: "PC" }],
    });
    setupHub([g], { fetchCatalogGame: vi.fn(async () => null) });
    fireEvent.click(screen.getByRole("button", { name: /Add a platform/i }));
    // The Add Game modal opens with the search step already done. (The title
    // combobox is queried by placeholder — the copies editor's platform
    // selects are comboboxes too.)
    expect(await screen.findByRole("heading", { name: /Add a game/i })).toBeTruthy();
    const title = screen.getByPlaceholderText(/Start typing/i) as HTMLInputElement;
    expect(title.value).toBe("Hollow Knight");
  });
});
