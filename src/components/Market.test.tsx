import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { Market, hiddenMarketKeys } from "./Market";
import { useStore } from "../store";
import type { GameMeta } from "../types";

// A key IS configured (otherwise the Caravan renders its "add a RAWG key" empty
// state); each test decides whether the discovery fetches succeed.
const fetchTrending = vi.fn<() => Promise<GameMeta[]>>();
const fetchNewReleases = vi.fn<() => Promise<GameMeta[]>>();
const fetchRecommended = vi.fn<() => Promise<GameMeta[]>>();

vi.mock("../lib/gamedata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/gamedata")>();
  return {
    ...actual,
    usingRawg: true,
    fetchTrending: () => fetchTrending(),
    fetchNewReleases: () => fetchNewReleases(),
    fetchRecommended: () => fetchRecommended(),
    fetchGameDetails: vi.fn(async () => ({})),
    fetchHltbTimes: vi.fn(async () => null),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  act(() => useStore.setState({ cloud: false, games: [], hiddenMarket: [], myPlatforms: [] }));
});

describe("Market caravan (832e9525)", () => {
  it("says the game database is unreachable when the fetches fail", async () => {
    // The RAWG outage that broke Add-game search also emptied every caravan
    // section — which read as "nothing on offer" rather than "we couldn't ask".
    const boom = () => Promise.reject(new Error("RAWG request failed (522)."));
    fetchTrending.mockImplementation(boom);
    fetchNewReleases.mockImplementation(boom);
    fetchRecommended.mockImplementation(boom);

    render(<Market />);

    await waitFor(() =>
      expect(screen.getAllByText(/couldn't reach the game database/i)).toHaveLength(3),
    );
    expect(screen.queryByText(/Nothing to show here right now/i)).toBeNull();
  });

  it("still says 'nothing to show' when a section genuinely comes back empty", async () => {
    fetchTrending.mockResolvedValue([]);
    fetchNewReleases.mockResolvedValue([]);
    fetchRecommended.mockResolvedValue([]);

    render(<Market />);

    await waitFor(() =>
      expect(screen.getAllByText(/Nothing to show here right now/i)).toHaveLength(3),
    );
    expect(screen.queryByText(/couldn't reach the game database/i)).toBeNull();
  });

  it("renders the games a healthy fetch returns", async () => {
    fetchTrending.mockResolvedValue([{ title: "Hades", rawgId: 1, genres: [] }]);
    fetchNewReleases.mockResolvedValue([]);
    fetchRecommended.mockResolvedValue([]);

    render(<Market />);

    expect(await screen.findByText("Hades")).toBeTruthy();
  });

  it("filters out IGDB-sourced games the player dismissed or already owns", async () => {
    act(() =>
      useStore.setState({
        hiddenMarket: ["i:200"], // dismissed under the new key format
        games: [{ id: "g1", title: "Owned", igdbId: 300, status: "backlog", genres: [], copies: [] }] as never,
      }),
    );
    fetchTrending.mockResolvedValue([
      { title: "Dismissed Game", igdbId: 200, genres: [] },
      { title: "Owned", igdbId: 300, genres: [] },
      { title: "Fresh Find", igdbId: 400, genres: [] },
    ]);
    fetchNewReleases.mockResolvedValue([]);
    fetchRecommended.mockResolvedValue([]);

    render(<Market />);

    expect(await screen.findByText("Fresh Find")).toBeTruthy();
    expect(screen.queryByText("Dismissed Game")).toBeNull();
    expect(screen.queryByText("Owned")).toBeNull();
  });
});

describe("hiddenMarketKeys", () => {
  it("reads legacy numeric entries as RAWG keys alongside new-format strings", () => {
    const keys = hiddenMarketKeys([42, "i:42", "r:7"]);
    expect(keys).toEqual(new Set(["r:42", "i:42", "r:7"]));
  });
});
