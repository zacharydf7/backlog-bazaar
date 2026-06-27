import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditGameModal } from "./EditGameModal";
import { ViewingProvider } from "../lib/viewContext";
import { useStore } from "../store";
import type { Game } from "../types";

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

beforeEach(() => {
  act(() => useStore.setState({ viewing: null, games: [game()], cloud: false }));
});

describe("EditGameModal family integration", () => {
  it("shows the family name in the header plus combined stats and a Manage Family entry", () => {
    const a = game({ id: "a", title: "Witcher 3 PC", familyId: "F", familyName: "The Witcher 3", status: "finished", playedHours: 10 });
    const b = game({ id: "b", title: "Witcher 3 Switch", familyId: "F", playedHours: 5 });
    act(() => useStore.setState({ viewing: null, games: [a, b] }));
    render(<EditGameModal game={a} onClose={() => {}} />);
    // #5: the family's name leads the modal header for a linked edition.
    expect(screen.getByRole("heading", { name: /The Witcher 3/i })).toBeTruthy();
    expect(screen.getByText(/Game Family · 2 editions/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Manage Family/i })).toBeTruthy();
  });

  it("shows no family stats or in-modal Link editions button for an unlinked game", () => {
    // #6: linking moved to the card's ⋮ menu, so the detail modal stays focused.
    const solo = game({ id: "solo", title: "Solo" });
    act(() => useStore.setState({ viewing: null, games: [solo] }));
    render(<EditGameModal game={solo} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /Link editions/i })).toBeNull();
    expect(screen.queryByText(/Game Family/i)).toBeNull();
  });

  it("opens the Manage Family hub from the detail modal", () => {
    const a = game({ id: "a", title: "A", familyId: "F" });
    const b = game({ id: "b", title: "B", familyId: "F" });
    act(() => useStore.setState({ viewing: null, games: [a, b] }));
    render(<EditGameModal game={a} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Manage Family/i }));
    expect(screen.getByRole("heading", { name: /Manage Game Family/i })).toBeTruthy();
  });
});

describe("EditGameModal per-version playtime editor (cloud)", () => {
  it("shows a field per version + Unspecified, and logs attributed corrections on save", async () => {
    const setPlatformPlaytime = vi.fn(async () => {});
    const editGame = vi.fn(async (_id: string, _patch: { playedHours?: number }) => {});
    const fetchPlaySessions = vi.fn(async () => [
      { platform: "PlayStation 4", format: "physical" as const, hours: 5, createdAt: 2 },
      { platform: null, format: null, hours: 40, createdAt: 1 },
    ]);
    const g = game({
      id: "g1",
      status: "backlog",
      copies: [{ id: "c1", platform: "PlayStation 4", format: "physical" }],
    });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [g],
        cloud: true,
        fetchPlaySessions,
        setPlatformPlaytime,
        editGame,
      }),
    );
    render(<EditGameModal game={g} onClose={() => {}} />);

    // One field per played version (the physical PS4 copy is its own version),
    // pre-filled with that version's logged hours.
    const ps4 = (await screen.findByLabelText(
      /Hours played on PlayStation 4 \(Physical\)/i,
    )) as HTMLInputElement;
    const unspec = screen.getByLabelText(/^Hours played$/i) as HTMLInputElement;
    expect(ps4.value).toBe("5h");
    expect(unspec.value).toBe("40h");

    // Reassign the 40 unspecified hours onto the physical PlayStation 4 copy.
    fireEvent.change(ps4, { target: { value: "45h" } });
    fireEvent.change(unspec, { target: { value: "0h" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() =>
      expect(setPlatformPlaytime).toHaveBeenCalledWith("g1", "PlayStation 4", "physical", 45),
    );
    expect(setPlatformPlaytime).toHaveBeenCalledWith("g1", null, null, 0);
    // editGame runs too, but must not carry played_hours (cloud manages it).
    await waitFor(() => expect(editGame).toHaveBeenCalled());
    expect(editGame.mock.calls[0][1].playedHours).toBeUndefined();
  });
});

describe("EditGameModal playtime for a single-copy game (cloud)", () => {
  it("shows a plain Played field and attributes time to that version (no Unspecified)", async () => {
    const setPlatformPlaytime = vi.fn(async () => {});
    const editGame = vi.fn(async (_id: string, _patch: { playedHours?: number }) => {});
    const fetchPlaySessions = vi.fn(async () => []);
    const g = game({
      id: "g1",
      status: "backlog",
      copies: [{ id: "c1", platform: "PlayStation 4", format: "digital" }],
    });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [g],
        cloud: true,
        fetchPlaySessions,
        setPlatformPlaytime,
        editGame,
      }),
    );
    render(<EditGameModal game={g} onClose={() => {}} />);

    // One owned version → a single plain "Played" field, no per-version split.
    const played = (await screen.findByRole("textbox", { name: /^Played$/i })) as HTMLInputElement;
    expect(screen.queryByText(/Unspecified/i)).toBeNull();

    fireEvent.change(played, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    // The 30 hours land on the digital PlayStation 4 copy, not the null bucket.
    await waitFor(() =>
      expect(setPlatformPlaytime).toHaveBeenCalledWith("g1", "PlayStation 4", "digital", 30),
    );
  });
});

describe("EditGameModal folds legacy format-less time onto the sole formatted copy", () => {
  it("shows old PlayStation 4 time as the digital copy and reassigns it when edited", async () => {
    const setPlatformPlaytime = vi.fn(async () => {});
    const editGame = vi.fn(async (_id: string, _patch: { playedHours?: number }) => {});
    // 40h logged on PlayStation 4 with no format (legacy); the one copy is digital.
    const fetchPlaySessions = vi.fn(async () => [
      { platform: "PlayStation 4", format: null, hours: 40, createdAt: 1 },
    ]);
    const g = game({
      id: "g1",
      status: "backlog",
      copies: [{ id: "c1", platform: "PlayStation 4", format: "digital" }],
    });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [g],
        cloud: true,
        fetchPlaySessions,
        setPlatformPlaytime,
        editGame,
      }),
    );
    render(<EditGameModal game={g} onClose={() => {}} />);

    // Folded onto the digital copy → a single plain "Played" field at 40h, no
    // separate format-less row and no "Unspecified".
    const played = (await screen.findByRole("textbox", { name: /^Played$/i })) as HTMLInputElement;
    expect(played.value).toBe("40h");
    expect(screen.queryByText(/Unspecified/i)).toBeNull();

    fireEvent.change(played, { target: { value: "45h" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    // Editing clears the format-less bucket and moves the total onto digital.
    await waitFor(() =>
      expect(setPlatformPlaytime).toHaveBeenCalledWith("g1", "PlayStation 4", null, 0),
    );
    expect(setPlatformPlaytime).toHaveBeenCalledWith("g1", "PlayStation 4", "digital", 45);
  });
});

describe("EditGameModal copies collapse", () => {
  it("collapses the copies editor by default with several copies, and expands on click", () => {
    const g = game({
      copies: [
        { id: "c1", platform: "PC" },
        { id: "c2", platform: "PlayStation 5" },
      ],
    });
    act(() => useStore.setState({ viewing: null, games: [g], cloud: false }));
    render(<EditGameModal game={g} onClose={() => {}} />);

    // Collapsed by default: a summary of the platforms shows, the editor doesn't.
    expect(screen.getByRole("button", { name: /Copies you own \(2\)/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add a copy/i })).toBeNull();
    expect(screen.getByText(/PC · PlayStation 5/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Copies you own/i }));
    expect(screen.getByRole("button", { name: /Add a copy/i })).toBeTruthy();
  });

  it("collapses the copies editor for a single copy too (only an empty list stays open)", () => {
    const g = game({ copies: [{ id: "c1", platform: "PC" }] });
    act(() => useStore.setState({ viewing: null, games: [g], cloud: false }));
    render(<EditGameModal game={g} onClose={() => {}} />);
    // Collapsed: the editor's "Add a copy" isn't shown; the platform summary is.
    expect(screen.getByRole("button", { name: /Copies you own \(1\)/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add a copy/i })).toBeNull();
  });

  it("leaves the copies editor open when no copies are recorded yet", () => {
    const g = game({ copies: [] });
    act(() => useStore.setState({ viewing: null, games: [g], cloud: false }));
    render(<EditGameModal game={g} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /Add a copy/i })).toBeTruthy();
  });
});

describe("EditGameModal relocated metadata", () => {
  it("shows Developer and Metacritic in the hub (relocated off the focused card)", () => {
    const g = game({
      developers: ["Team Cherry"],
      metacritic: 90,
      genres: ["Metroidvania"],
    });
    act(() => useStore.setState({ viewing: null, games: [g], cloud: false }));
    render(<EditGameModal game={g} onClose={() => {}} />);
    expect(screen.getByText("Developer")).toBeTruthy();
    expect(screen.getByText("Team Cherry")).toBeTruthy();
    expect(screen.getByText("Metacritic")).toBeTruthy();
    expect(screen.getByText("90")).toBeTruthy();
  });
});

describe("EditGameModal read-only (visiting) cover", () => {
  it("shows the game's cover image large when viewing another player's game", () => {
    const g = game({ image: "https://img.example/cover.png" });
    act(() => useStore.setState({ viewing: null, games: [g], cloud: true }));
    render(
      <ViewingProvider value={{ readOnly: true, hideSpend: false }}>
        <EditGameModal game={g} onClose={() => {}} />
      </ViewingProvider>,
    );
    const img = screen.getByAltText("Hollow Knight") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://img.example/cover.png");
  });
});

describe("EditGameModal per-version Unspecified explainer", () => {
  it("shows the explainer only when there's actually Unspecified time", async () => {
    const fetchPlaySessions = vi.fn(async () => [
      { platform: "PlayStation 4", format: "physical" as const, hours: 5, createdAt: 2 },
      { platform: null, format: null, hours: 40, createdAt: 1 },
    ]);
    const g = game({ copies: [{ id: "c1", platform: "PlayStation 4", format: "physical" }] });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [g],
        cloud: true,
        fetchPlaySessions,
        setPlatformPlaytime: vi.fn(async () => {}),
        editGame: vi.fn(async () => {}),
      }),
    );
    render(<EditGameModal game={g} onClose={() => {}} />);

    await screen.findByText(/Played by version/i);
    expect(screen.getByText(/collects hours not tied to a copy you own/i)).toBeTruthy();
  });

  it("hides the explainer when every version's time is attributed", async () => {
    const fetchPlaySessions = vi.fn(async () => [
      { platform: "PlayStation 4", format: "physical" as const, hours: 5, createdAt: 2 },
      { platform: "PlayStation 5", format: "digital" as const, hours: 3, createdAt: 3 },
    ]);
    const g = game({
      copies: [
        { id: "c1", platform: "PlayStation 4", format: "physical" },
        { id: "c2", platform: "PlayStation 5", format: "digital" },
      ],
    });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [g],
        cloud: true,
        fetchPlaySessions,
        setPlatformPlaytime: vi.fn(async () => {}),
        editGame: vi.fn(async () => {}),
      }),
    );
    render(<EditGameModal game={g} onClose={() => {}} />);

    // Two versions → the splitter still shows, but with no unattributed hours the
    // Unspecified explainer (and its row) are gone.
    await screen.findByText(/Played by version/i);
    expect(screen.queryByText(/collects hours not tied to a copy you own/i)).toBeNull();
    expect(screen.queryByLabelText(/^Hours played$/i)).toBeNull();
  });
});

describe("EditGameModal close behavior", () => {
  it("does not close when the backdrop is clicked (only the ✕ closes it)", () => {
    const onClose = vi.fn();
    const { container } = render(<EditGameModal game={game()} onClose={onClose} />);
    // The outermost node is the backdrop; a stray tap on it must not discard edits.
    fireEvent.click(container.firstChild as Element);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the ✕ button is clicked", () => {
    const onClose = vi.fn();
    render(<EditGameModal game={game()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
