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
      undefined,
      { timeout: 5000 },
    )) as HTMLInputElement;
    // The field mounts one effect-tick BEFORE the drafts seed its value (it
    // renders "" for that first commit), so the seeded value must be awaited —
    // asserting it synchronously flaked under a loaded parallel suite.
    await waitFor(() => expect(ps4.value).toBe("5h"), { timeout: 5000 });

    fireEvent.change(ps4, { target: { value: "45h" } });
    fireEvent.blur(ps4);
    await waitFor(
      () =>
        expect(setPlatformPlaytime).toHaveBeenCalledWith("g1", "PlayStation 4", "physical", 45),
      { timeout: 5000 },
    );

    // Reassigning the unspecified bucket is its own row + blur.
    const unspec = screen.getByLabelText(/^Hours played$/i) as HTMLInputElement;
    fireEvent.change(unspec, { target: { value: "0h" } });
    fireEvent.blur(unspec);
    await waitFor(() => expect(setPlatformPlaytime).toHaveBeenCalledWith("g1", null, null, 0), {
      timeout: 5000,
    });
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

    const field = (await screen.findByLabelText(/Played/i, undefined, {
      timeout: 5000,
    })) as HTMLInputElement;
    fireEvent.blur(field);
    await waitFor(() => expect(fetchPlaySessions).toHaveBeenCalled(), { timeout: 5000 });
    expect(setPlatformPlaytime).not.toHaveBeenCalled();
  });

  it("only ever fetches and edits this instance's own sessions (isolation)", async () => {
    // A bundle copy of the same game keeps its hours on its own record — the
    // standalone card neither displays nor absorbs them.
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

    // Only the master's sessions are fetched; the child's hours never surface.
    const sw = (await screen.findByLabelText(/Played/i, undefined, {
      timeout: 5000,
    })) as HTMLInputElement;
    expect(fetchPlaySessions).toHaveBeenCalledWith("m");
    expect(fetchPlaySessions).not.toHaveBeenCalledWith("c");
    expect(screen.queryByText(/logged on bundle copies/i)).toBeNull();
    expect(screen.queryByLabelText(/PlayStation 4/i)).toBeNull();

    // An edit writes only to this record.
    fireEvent.change(sw, { target: { value: "2h" } });
    fireEvent.blur(sw);
    await waitFor(
      () => expect(setPlatformPlaytime).toHaveBeenCalledWith("m", "Nintendo Switch", null, 2),
      { timeout: 5000 },
    );
    expect(setPlatformPlaytime).not.toHaveBeenCalledWith(
      "c",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});
