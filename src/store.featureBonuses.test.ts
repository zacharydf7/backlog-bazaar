// Feature bonuses — Story Order, Collector's Record, Reviewer, Daily Session.
// The offline (guest-mode) finish mirrors apply_finish, so it's exercised
// directly; the cloud paths mock the supabase boundary (the suite runs offline)
// and check the store asks the server at the right moments and credits what it
// reports. The anti-farm rules live in SQL that can't execute here, so the last
// block pins them in the schema text, as the Clear Streak suite does.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Game } from "./types";

const h = vi.hoisted(() => {
  const state = {
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
    rpcData: {} as Record<string, unknown>,
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const ok = { data: null, error: null };
  const chain: any = {
    update: () => chain,
    eq: () => chain,
    then: (onOk: any, onErr: any) => Promise.resolve(ok).then(onOk, onErr),
  };
  // Achievement evaluation also hits rpc after these actions — record only the
  // calls under test.
  const tracked = new Set(["claim_review_bonus", "log_playtime"]);
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    if (tracked.has(name)) state.rpcCalls.push({ name, args });
    const res = { data: state.rpcData[name] ?? null, error: null };
    return { single: () => Promise.resolve(res) };
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { state, rpc, from: vi.fn(() => chain) };
});

vi.mock("./lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/supabase")>()),
  supabase: { from: h.from, rpc: h.rpc },
}));

import { useStore } from "./store";
import { FEATURE_BONUS_DEFAULTS } from "./lib/featureBonuses";

const store = () => useStore.getState();

const prequel: Game = { id: "p", title: "Part One", status: "finished", addedAt: 1, genres: [] };

function game(over: Partial<Game> = {}): Game {
  return { id: "s", title: "Part Two", status: "playing", addedAt: 1, genres: [], ...over };
}

beforeEach(() => {
  localStorage.clear();
  h.state.rpcCalls = [];
  h.state.rpcData = {};
  useStore.setState({
    cloud: false,
    userId: null,
    economyEnabled: true,
    featureBonuses: { ...FEATURE_BONUS_DEFAULTS },
    clearStreak: 0,
    clearStreakBest: 0,
    coins: 1000,
    ledger: [],
    games: [],
  });
});

describe("finish bonuses — offline finishGame", () => {
  it("pays Story Order and Collector's Record on a first clear, as their own ledger rows", async () => {
    const run = game({ startedStoryLocked: true, prerequisiteGameId: "p", copies: [{ id: "c", platform: "PC", cost: 30 }] });
    useStore.setState({ games: [prequel, run] });
    const before = store().coins;
    await store().finishGame("s");
    const kinds = store().ledger.map((e) => e.kind);
    expect(kinds).toContain("story_order_bonus");
    expect(kinds).toContain("collectors_record_bonus");
    const bounty = store().ledger.find((e) => e.kind === "bounty")?.coinDelta ?? 0;
    expect(store().coins - before).toBe(bounty + 20 + 10);
  });

  it("doesn't pay Story Order for a lock added mid-run (no start stamp)", async () => {
    useStore.setState({ games: [prequel, game({ prerequisiteGameId: "p" })] });
    await store().finishGame("s");
    expect(store().ledger.some((e) => e.kind === "story_order_bonus")).toBe(false);
  });

  it("pays neither bonus on a resumed re-clear or with the economy off", async () => {
    const setUp = { startedStoryLocked: true, copies: [{ id: "c", platform: "PC", cost: 0 }] };
    useStore.setState({ games: [prequel, game({ ...setUp, resumed: true })] });
    await store().finishGame("s");
    useStore.setState({ economyEnabled: false, games: [prequel, game({ ...setUp, id: "t" })] });
    await store().finishGame("t");
    const kinds = store().ledger.map((e) => e.kind);
    expect(kinds).not.toContain("story_order_bonus");
    expect(kinds).not.toContain("collectors_record_bonus");
  });
});

describe("the story-locked start stamp — offline buyGame", () => {
  it("stamps a run started behind a finished prerequisite, and only that", async () => {
    useStore.setState({
      games: [
        prequel,
        game({ id: "s", status: "backlog", prerequisiteGameId: "p", hours: 10 }),
        game({ id: "u", status: "backlog", hours: 10 }),
      ],
    });
    await store().buyGame("s");
    await store().buyGame("u");
    const byId = (id: string) => store().games.find((g) => g.id === id);
    expect(byId("s")?.status).toBe("playing");
    expect(byId("s")?.startedStoryLocked).toBe(true);
    expect(byId("u")?.startedStoryLocked).toBe(false);
  });
});

describe("Reviewer bonus — cloud setGameReview", () => {
  const longReview =
    "A sharp, funny sequel that tightens every system the first game introduced, fixes the pacing, and ends on a real high.";

  beforeEach(() => {
    useStore.setState({ cloud: true, userId: "u1", games: [game({ status: "finished" })] });
    h.state.rpcData.claim_review_bonus = { coins: 1015, awarded: 15 };
  });

  it("claims after saving a qualifying review and credits what the server awarded", async () => {
    await store().setGameReview("s", longReview, null);
    expect(h.state.rpcCalls).toEqual([{ name: "claim_review_bonus", args: { p_game: "s" } }]);
    expect(store().coins).toBe(1015);
  });

  it("doesn't ask for short reviews, unfinished games, or with the economy off", async () => {
    await store().setGameReview("s", "Loved it.", null);
    useStore.setState({ games: [game({ status: "playing" })] });
    await store().setGameReview("s", longReview, null);
    useStore.setState({ economyEnabled: false, games: [game({ status: "finished" })] });
    await store().setGameReview("s", longReview, null);
    expect(h.state.rpcCalls).toEqual([]);
    expect(store().coins).toBe(1000);
  });
});

describe("Daily Session bonus — cloud logPlaytime", () => {
  it("takes the balance the server reports, bonus included", async () => {
    useStore.setState({ cloud: true, userId: "u1", games: [game()] });
    h.state.rpcData.log_playtime = { coins: 1003, played_hours: 0.5, bonus: 3 };
    await store().logPlaytime("s", 0.5);
    expect(h.state.rpcCalls[0]?.name).toBe("log_playtime");
    expect(store().coins).toBe(1003);
    expect(store().games[0].playedHours).toBe(0.5);
  });
});

describe("feature bonuses — the server-side anti-farm rules", () => {
  // Vitest runs from the package root, so the schema is a fixed path from cwd.
  const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
  const body = (fn: string) => {
    const start = schema.indexOf(`create or replace function public.${fn}`);
    expect(start).toBeGreaterThan(-1);
    return schema.slice(start, schema.indexOf("\n$$;", start));
  };

  it("apply_finish pays Story Order off the start stamp, only on a paying first clear", () => {
    const fn = body("apply_finish");
    expect(fn).toContain("coalesce(started_story_locked, false)");
    expect(fn).toContain("if v_econ and not v_free_start and not v_replay then");
    // The undo snapshot rolls the bonuses back with the bounty.
    expect(fn).toContain("v_net + v_streak_bonus + v_story_bonus + v_collector_bonus");
  });

  it("the start stamp is derived on backlog → playing and sheds client writes", () => {
    const fn = body("games_stamp_story_start");
    expect(fn).toContain("new.status = 'playing' and old.status = 'backlog'");
    expect(fn).toContain("p.status = 'finished'");
    expect(fn).toContain("new.started_story_locked := coalesce(old.started_story_locked, false)");
  });

  it("claim_review_bonus requires a clear paid through the loop and pays once per game", () => {
    const fn = body("claim_review_bonus");
    expect(fn).toContain("e.kind in ('bounty', 'replay_bonus', 'completion_bonus')");
    expect(fn).toContain("e.kind = 'review_bonus'");
    expect(fn).toContain("for update");
  });

  it("log_playtime pays the Daily Session bonus once per day, under a row lock", () => {
    const fn = body("log_playtime");
    expect(fn).toContain("e.kind = 'session_bonus'");
    expect(fn).toContain("date_trunc('day', now() at time zone v_tz) at time zone v_tz");
    expect(fn).toContain("for update");
  });
});
