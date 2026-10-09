// Cancel replay / Abandon Completion are not clears: the server puts back the
// finish date the run pulled the game away from and returns it, and the store
// mirrors that date instead of stamping "now". These specs mock the supabase
// boundary (the suite runs offline); the RPCs themselves are exercised for real
// in lib/milestones.sql.test.ts.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Game } from "./types";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("./lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/supabase")>()),
  supabase: { rpc: h.rpc },
}));

import { useStore } from "./store";

const RESTORED = "2024-02-23T18:30:00+00:00";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Final Fantasy VII Remake",
    status: "playing",
    finishTag: "beaten",
    resumed: true,
    genres: [],
    platforms: [],
    copies: [],
    addedAt: Date.parse("2024-02-16T00:00:00Z"),
    ...over,
  } as Game;
}

beforeEach(() => {
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: RESTORED, error: null });
});

describe("leaving a resumed run keeps the original finish date", () => {
  it("abortReplay takes the finish date the server restored", async () => {
    useStore.setState({ cloud: true, userId: "u1", games: [game()], error: null });

    await useStore.getState().abortReplay("g1");

    expect(h.rpc).toHaveBeenCalledWith("abort_replay", { p_game: "g1" });
    const g = useStore.getState().games[0];
    expect(g.status).toBe("finished");
    expect(g.finishedAt).toBe(Date.parse(RESTORED));
  });

  it("abandonCompletion takes the finish date the server restored", async () => {
    useStore.setState({
      cloud: true,
      userId: "u1",
      games: [game({ completionist: true })],
      error: null,
    });

    await useStore.getState().abandonCompletion("g1");

    expect(h.rpc).toHaveBeenCalledWith("abandon_completion", { p_game: "g1" });
    const g = useStore.getState().games[0];
    expect(g.status).toBe("finished");
    expect(g.finishedAt).toBe(Date.parse(RESTORED));
  });
});
