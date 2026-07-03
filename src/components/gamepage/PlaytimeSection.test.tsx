import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PlaytimeSection } from "./PlaytimeSection";
import { useStore } from "../../store";
import type { Game } from "../../types";

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
  act(() =>
    useStore.setState({
      viewing: null,
      games: [game()],
      cloud: true,
      trackEditions: false,
      fetchPlaySessions: vi.fn(async () => []),
      setPlatformPlaytime: vi.fn(async () => {}),
    }),
  );
});

describe("PlaytimeSection immediate-write", () => {
  it("commits a row when its field loses focus (attributed correction, no Save)", async () => {
    const setPlatformPlaytime = vi.fn(async () => {});
    const fetchPlaySessions = vi.fn(async () => [
      { platform: "PlayStation 4", format: "physical" as const, hours: 5, createdAt: 2 },
      { platform: null, format: null, hours: 40, createdAt: 1 },
    ]);
    const g = game({
      copies: [{ id: "c1", platform: "PlayStation 4", format: "physical" }],
    });
    act(() =>
      useStore.setState({
        games: [g],
        trackEditions: true,
        fetchPlaySessions,
        setPlatformPlaytime,
      }),
    );
    render(<PlaytimeSection game={g} />);

    const ps4 = (await screen.findByLabelText(
      /Hours played on PlayStation 4 \(Physical\)/i,
    )) as HTMLInputElement;
    expect(ps4.value).toBe("5h");

    fireEvent.change(ps4, { target: { value: "45h" } });
    fireEvent.blur(ps4);
    await waitFor(() =>
      expect(setPlatformPlaytime).toHaveBeenCalledWith("g1", "PlayStation 4", "physical", 45),
    );

    // Reassigning the unspecified bucket is its own row + blur.
    const unspec = screen.getByLabelText(/^Hours played$/i) as HTMLInputElement;
    fireEvent.change(unspec, { target: { value: "0h" } });
    fireEvent.blur(unspec);
    await waitFor(() => expect(setPlatformPlaytime).toHaveBeenCalledWith("g1", null, null, 0));
  });

  it("does not write on an unchanged blur", async () => {
    const setPlatformPlaytime = vi.fn(async () => {});
    const fetchPlaySessions = vi.fn(async () => [
      { platform: "PC", format: null, hours: 3, createdAt: 1 },
    ]);
    const g = game({ copies: [{ id: "c1", platform: "PC" }] });
    act(() =>
      useStore.setState({ games: [g], fetchPlaySessions, setPlatformPlaytime }),
    );
    render(<PlaytimeSection game={g} />);

    const field = (await screen.findByLabelText(/Played/i)) as HTMLInputElement;
    fireEvent.blur(field);
    await waitFor(() => expect(fetchPlaySessions).toHaveBeenCalled());
    expect(setPlatformPlaytime).not.toHaveBeenCalled();
  });

  it("moves bundle-copy hours onto the master via the explicit consolidate button", async () => {
    const setPlatformPlaytime = vi.fn(async () => {});
    const childSessions = [
      { platform: "PlayStation 4", format: "physical" as const, hours: 5, createdAt: 1 },
    ];
    const fetchPlaySessions = vi.fn(async (id: string) => (id === "c" ? childSessions : []));
    const master = game({
      id: "m",
      rawgId: 1,
      compilationId: null,
      copies: [{ id: "a", platform: "Nintendo Switch", format: "digital" }],
    });
    const child = game({
      id: "c",
      rawgId: 1,
      compilationId: "C",
      compilationName: "Alwa's Collection",
      copies: [{ id: "b", platform: "PlayStation 4", format: "physical" }],
    });
    act(() =>
      useStore.setState({
        games: [master, child],
        fetchPlaySessions,
        setPlatformPlaytime,
      }),
    );
    render(<PlaytimeSection game={master} />);

    // The pending bundle hours are surfaced with an explicit move button.
    await screen.findByText(/5h of this time is logged on bundle copies/i);
    fireEvent.click(screen.getByRole("button", { name: /Move it onto this game/i }));

    // The 5h land on the master's PlayStation 4 bucket…
    await waitFor(() =>
      expect(setPlatformPlaytime).toHaveBeenCalledWith("m", "PlayStation 4", null, 5),
    );
    // …and the copy's own bucket is zeroed (hours moved, not duplicated).
    expect(setPlatformPlaytime).toHaveBeenCalledWith("c", "PlayStation 4", "physical", 0);
  });

  it("runs the full consolidation when a row is edited while bundle hours exist", async () => {
    // A lone-row write would double-count (the row already includes the folded
    // hours), so an edit mirrors the old Save: claim everything, zero the copies.
    const setPlatformPlaytime = vi.fn(async () => {});
    const childSessions = [
      { platform: "PlayStation 4", format: "physical" as const, hours: 5, createdAt: 1 },
    ];
    const fetchPlaySessions = vi.fn(async (id: string) => (id === "c" ? childSessions : []));
    const master = game({
      id: "m",
      rawgId: 1,
      compilationId: null,
      copies: [{ id: "a", platform: "Nintendo Switch", format: "digital" }],
    });
    const child = game({
      id: "c",
      rawgId: 1,
      compilationId: "C",
      compilationName: "Alwa's Collection",
      copies: [{ id: "b", platform: "PlayStation 4", format: "physical" }],
    });
    act(() =>
      useStore.setState({
        games: [master, child],
        fetchPlaySessions,
        setPlatformPlaytime,
      }),
    );
    render(<PlaytimeSection game={master} />);

    const sw = (await screen.findByLabelText(
      /Hours played on Nintendo Switch/i,
    )) as HTMLInputElement;
    fireEvent.change(sw, { target: { value: "2h" } });
    fireEvent.blur(sw);

    await waitFor(() =>
      expect(setPlatformPlaytime).toHaveBeenCalledWith("m", "Nintendo Switch", null, 2),
    );
    expect(setPlatformPlaytime).toHaveBeenCalledWith("m", "PlayStation 4", null, 5);
    expect(setPlatformPlaytime).toHaveBeenCalledWith("c", "PlayStation 4", "physical", 0);
  });
});
