import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Game } from "./types";

// The logged-time gate on finish bounties (coin outliers, 2026-10-17): a finish
// with too little of the game logged pays the activation refund now and holds
// the rest until time is logged. Offline, finishGame/setPlayedHours mirror the
// server; in the cloud the store reads the server's held amount and re-reads
// the hold after logged hours change. The Supabase boundary is mocked.
const h = vi.hoisted(() => {
  const state = {
    rpcData: {} as Record<string, unknown>,
    gameRow: null as unknown,
    coins: 0,
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rpc = vi.fn((name: string) => {
    const res = { data: state.rpcData[name] ?? null, error: null };
    return { single: () => Promise.resolve(res), then: (f: any) => Promise.resolve(res).then(f) };
  });
  const from = vi.fn((table: string) => {
    const result = () =>
      table === "games" ? { data: state.gameRow, error: null } : { data: { coins: state.coins }, error: null };
    const chain: any = {
      select: () => chain,
      update: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve(result()),
      then: (f: any) => Promise.resolve({ error: null }).then(f),
    };
    return chain;
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { state, rpc, from };
});

vi.mock("./lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/supabase")>()),
  supabase: { from: h.from, rpc: h.rpc },
}));

import { useStore } from "./store";
import { computeFormula } from "./lib/economy";

const store = () => useStore.getState();

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g",
    title: "Nekopara Vol. 1",
    status: "playing",
    addedAt: Date.now(),
    startedAt: Date.now(),
    genres: [],
    hours: 40,
    pricePaid: 10,
    playedHours: 0,
    ...over,
  } as Game;
}

beforeEach(() => {
  localStorage.clear();
  h.state.rpcData = {};
  h.state.gameRow = null;
  useStore.setState({
    cloud: false,
    userId: null,
    economyEnabled: true,
    bountyGatePct: 25,
    coins: 1000,
    ledger: [],
    clearStreak: 0,
    clearStreakBest: 0,
  });
});

describe("offline", () => {
  it("pays the activation refund now and holds the rest with nothing logged", async () => {
    useStore.setState({ games: [game()] });
    const bounty = computeFormula(game(), store().economy.bounty);
    await store().finishGame("g");

    const done = store().games[0];
    expect(store().coins).toBe(1000 + 10);
    expect(done).toMatchObject({ bountyHeld: bounty - 10, bountyHeldTotal: bounty, bountyGateHours: 10 });
    expect(store().ledger.map((e) => e.kind)).toEqual(["bounty_held", "bounty"]);
  });

  it("releases the held bounty as time is logged, all of it at the gate", async () => {
    useStore.setState({ games: [game()] });
    const bounty = computeFormula(game(), store().economy.bounty);
    await store().finishGame("g");

    await store().setPlayedHours("g", 5); // half the 10h gate
    expect(store().coins).toBe(1000 + Math.round(bounty / 2));
    await store().setPlayedHours("g", 12);
    expect(store().coins).toBe(1000 + bounty);
    expect(store().games[0]).toMatchObject({ bountyHeld: 0, bountyHeldTotal: undefined });
    expect(store().ledger[0].kind).toBe("bounty_release");
  });

  it("pays in full when enough is logged, or with the gate off", async () => {
    useStore.setState({ games: [game({ playedHours: 10 })] });
    await store().finishGame("g");
    expect(store().games[0].bountyHeld).toBe(0);

    useStore.setState({ bountyGatePct: 0, games: [game({ id: "h" })] });
    await store().finishGame("h");
    expect(store().games[0].bountyHeld).toBe(0);
  });
});

describe("cloud", () => {
  beforeEach(() => {
    useStore.setState({ cloud: true, userId: "u1" });
  });

  it("credits only what the server paid, keeping the hold on the game", async () => {
    useStore.setState({ games: [game()] });
    h.state.rpcData.apply_finish = {
      coins: 1010,
      reward: 300,
      replay: false,
      undo_id: "undo-1",
      streak: 1,
      streak_bonus: 0,
      new_record: true,
      story_bonus: 0,
      collector_bonus: 0,
      held: 290,
    };
    await store().finishGame("g");
    expect(store().coins).toBe(1010);
    expect(store().games[0]).toMatchObject({ reward: 300, bountyHeld: 290, bountyHeldTotal: 300 });
  });

  it("credits a Daily Session bonus for time added in the Played editor", async () => {
    useStore.setState({ coins: 1000, games: [game({ status: "finished", playedHours: 2 })] });
    h.state.rpcData.set_platform_playtime = 3;
    h.state.coins = 1005; // the server paid the bonus
    await store().setPlatformPlaytime("g", null, null, 3);
    expect(store().coins).toBe(1005);
    expect(h.rpc).toHaveBeenLastCalledWith("set_platform_playtime", expect.objectContaining({ p_session_bonus: true }));
  });

  it("asks for no bonus on starting playtime entered at add time", async () => {
    useStore.setState({ games: [game({ status: "backlog", playedHours: 0 })] });
    h.state.rpcData.set_platform_playtime = 4;
    await store().setPlatformPlaytime("g", null, null, 4, { sessionBonus: false });
    expect(h.rpc).toHaveBeenLastCalledWith("set_platform_playtime", expect.objectContaining({ p_session_bonus: false }));
  });

  it("re-reads the hold after logged hours change and credits the release", async () => {
    useStore.setState({
      games: [game({ status: "finished", bountyHeld: 290, bountyHeldTotal: 300, bountyGateHours: 10 })],
    });
    h.state.rpcData.set_platform_playtime = 5;
    h.state.gameRow = { bounty_held: 150, bounty_held_total: 300, bounty_gate_hours: 10 };
    h.state.coins = 1150;

    await store().setPlatformPlaytime("g", null, null, 5);
    expect(store().coins).toBe(1150);
    expect(store().games[0]).toMatchObject({ playedHours: 5, bountyHeld: 150 });
  });
});
