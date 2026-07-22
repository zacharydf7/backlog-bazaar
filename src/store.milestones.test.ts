// The milestone→game-date sync: DB triggers keep games.added_at in step with the
// earliest Added milestone (the Fresh-pickup price date) and games.cleared_on in
// step with the Beat/Completed one (the authoritative clear date the Ledger's
// year tally reads). After a milestone write that touches either, the store
// re-reads the game and mirrors the dates locally so prices and counts update
// without a reload. These specs mock the supabase boundary (the suite runs
// offline) and assert exactly when that re-read happens — and that milestone
// kinds carrying no game date leave the games array alone.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Game } from "./types";

const h = vi.hoisted(() => {
  const state = {
    /** Rows the milestone update/delete "returned" (what the write touched). */
    milestoneRows: [] as { game_id: string; kind: string }[],
    /** The inserted milestone row addGameMilestone gets back. */
    insertedRow: null as Record<string, unknown> | null,
    /** games.added_at as the server now reports it (post-trigger). */
    gamesAddedAt: null as string | null,
    /** games.cleared_on as the server now reports it (post-trigger). */
    gamesClearedOn: null as string | null,
    /** Every table passed to supabase.from(), in call order. */
    tables: [] as string[],
  };

  function fakeFrom(table: string) {
    state.tables.push(table);
    let op: "select" | "insert" | "update" | "delete" = "select";
    const result = () => {
      if (table === "games") {
        return state.gamesAddedAt || state.gamesClearedOn
          ? {
              data: { added_at: state.gamesAddedAt, cleared_on: state.gamesClearedOn },
              error: null,
            }
          : { data: null, error: null };
      }
      if (op === "insert") return { data: state.insertedRow, error: null };
      return { data: state.milestoneRows, error: null };
    };
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const chain: any = {
      insert: () => ((op = "insert"), chain),
      update: () => ((op = "update"), chain),
      delete: () => ((op = "delete"), chain),
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      single: () => Promise.resolve(result()),
      maybeSingle: () => Promise.resolve(result()),
      then: (onOk: any, onErr: any) => Promise.resolve(result()).then(onOk, onErr),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return chain;
  }

  return { state, from: vi.fn(fakeFrom) };
});

vi.mock("./lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/supabase")>()),
  supabase: { from: h.from },
}));

import { useStore } from "./store";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Chrono Trigger",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: Date.parse("2026-07-01T10:20:30Z"),
    ...over,
  } as Game;
}

const BACKDATED = "2022-07-06T00:00:00+00:00";

beforeEach(() => {
  h.from.mockClear();
  h.state.milestoneRows = [];
  h.state.insertedRow = null;
  h.state.gamesAddedAt = null;
  h.state.gamesClearedOn = null;
  h.state.tables.length = 0;
  useStore.setState({ cloud: true, userId: "u1", games: [game()], error: null });
});

describe("milestone writes sync the local addedAt", () => {
  it("updating an Added milestone re-reads added_at and patches the game", async () => {
    h.state.milestoneRows = [{ game_id: "g1", kind: "added" }];
    h.state.gamesAddedAt = BACKDATED;

    const ok = await useStore.getState().updateGameMilestone("m1", "2022-07-06");

    expect(ok).toBe(true);
    expect(useStore.getState().games[0].addedAt).toBe(Date.parse(BACKDATED));
  });

  it("backdating a Beat milestone re-reads cleared_on and patches the game (f9b7b594)", () => {
    h.state.milestoneRows = [{ game_id: "g1", kind: "beat" }];
    h.state.gamesClearedOn = "2025-08-10";
    const before = useStore.getState().games[0].addedAt;

    return useStore
      .getState()
      .updateGameMilestone("m3", "2025-08-10")
      .then((ok) => {
        expect(ok).toBe(true);
        // The clear date follows the milestone; the acquisition date is untouched.
        expect(useStore.getState().games[0].clearedOn).toBe("2025-08-10");
        expect(useStore.getState().games[0].addedAt).toBe(before);
      });
  });

  it("updating a milestone that carries no game date never touches games", async () => {
    h.state.milestoneRows = [{ game_id: "g1", kind: "started" }];
    const before = useStore.getState().games[0].addedAt;

    const ok = await useStore.getState().updateGameMilestone("m3", "2025-08-10");

    expect(ok).toBe(true);
    expect(h.state.tables).not.toContain("games");
    expect(useStore.getState().games[0].addedAt).toBe(before);
  });

  it("removing an Added milestone re-syncs from the earliest remaining date", async () => {
    h.state.milestoneRows = [{ game_id: "g1", kind: "added" }];
    h.state.gamesAddedAt = BACKDATED;

    const ok = await useStore.getState().removeGameMilestone("m1");

    expect(ok).toBe(true);
    expect(useStore.getState().games[0].addedAt).toBe(Date.parse(BACKDATED));
  });

  it("adding a backdated Added milestone patches the game too", async () => {
    h.state.insertedRow = {
      id: "new",
      game_id: "g1",
      kind: "added",
      occurred_on: "2022-07-06",
      source: "manual",
      created_at: "2026-07-03T00:00:00+00:00",
    };
    h.state.gamesAddedAt = BACKDATED;

    const row = await useStore.getState().addGameMilestone("g1", "added", "2022-07-06");

    expect(row?.kind).toBe("added");
    expect(useStore.getState().games[0].addedAt).toBe(Date.parse(BACKDATED));
  });

  it("adding a milestone that carries no game date never touches games", async () => {
    h.state.insertedRow = {
      id: "new",
      game_id: "g1",
      kind: "started",
      occurred_on: "2025-08-09",
      source: "manual",
      created_at: "2026-07-03T00:00:00+00:00",
    };

    const row = await useStore.getState().addGameMilestone("g1", "started", "2025-08-09");

    expect(row?.kind).toBe("started");
    expect(h.state.tables).not.toContain("games");
  });
});
