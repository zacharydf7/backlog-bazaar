import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CoOpPact, Game } from "./types";

// A dissolved pact removes the invitee's Player 2 copy server-side (issue
// 76409d16); the store must drop that card too rather than keep showing it.
// We mock the Supabase boundary and keep every other real export.
const { rpc, maybeSingle, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  return {
    rpc: vi.fn(),
    maybeSingle,
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
  };
});

vi.mock("./lib/supabase", async (importActual) => {
  const actual = await importActual<typeof import("./lib/supabase")>();
  return { ...actual, supabase: { rpc, from } };
});

import { useStore } from "./store";

const store = () => useStore.getState();

const player2Copy: Game = {
  id: "p2-copy",
  title: "Pumpkin Jack",
  status: "playing",
  genres: [],
  platforms: [],
  copies: [{ id: "c1", platform: "PlayStation 5", acquisition: "player2" }],
  addedAt: 1,
  pricePaid: 30,
} as Game;
const ownCopy: Game = {
  ...player2Copy,
  id: "own-copy",
  status: "backlog",
  copies: [{ id: "c2", platform: "Nintendo Switch" }],
  pricePaid: undefined,
};

const joinedPact = {
  id: "pact-1",
  status: "active",
  gameKey: "r:7",
  title: "Pumpkin Jack",
  myGameId: "p2-copy",
  iAmInviter: false,
} as CoOpPact;

beforeEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
  useStore.setState({
    cloud: true,
    userId: "u1",
    coins: 100,
    games: [player2Copy, ownCopy],
    coOpPacts: [joinedPact],
  });
});

describe("Player 2 copies leave with a dissolved pact (76409d16)", () => {
  it("drops the copy when dissolving finds it gone, keeping the player's own copy", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "dissolve_co_op_pact" ? { data: true, error: null } : { data: [], error: null },
    );
    // The re-read of the bound card finds nothing: the server removed it.
    maybeSingle.mockImplementation(async () => ({ data: null }));

    expect(await store().dissolveCoOpPact("pact-1")).toBe(true);
    expect(store().games.map((g) => g.id)).toEqual(["own-copy"]);
  });

  it("drops the copy when shelving it dissolves the pact, with the refund", async () => {
    rpc.mockImplementation((name: string) =>
      name === "apply_shelve"
        ? { single: async () => ({ data: { coins: 130, refund: 30 }, error: null }) }
        : Promise.resolve({ data: [], error: null }),
    );

    await store().abandonGame("p2-copy");
    expect(store().games.map((g) => g.id)).toEqual(["own-copy"]);
    expect(store().coins).toBe(130);
  });

  it("keeps a shelved copy of the player's own as a Bazaar card", async () => {
    useStore.setState({
      games: [{ ...ownCopy, status: "playing" }],
      coOpPacts: [{ ...joinedPact, myGameId: "own-copy" }],
    });
    rpc.mockImplementation(() => ({
      single: async () => ({ data: { coins: 100, refund: 0 }, error: null }),
    }));

    await store().abandonGame("own-copy");
    expect(store().games.map((g) => [g.id, g.status])).toEqual([["own-copy", "backlog"]]);
  });
});
