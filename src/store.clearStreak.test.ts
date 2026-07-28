import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { CLEAR_STREAK } from "./lib/pricing";
import type { Game } from "./types";

// Offline (guest-mode) Clear Streak behavior (issue 01cc7662): finishing games
// back-to-back builds the streak and pays an escalating bonus; adding a new
// game to play resets it (straight-to-Finished logs and wishlist wants don't);
// undo rewinds it. The cloud path is server-authoritative and covered by the
// SQL; here we exercise the client mirror that runs with no backend.

const store = () => useStore.getState();

function playing(id: string): Game {
  return { id, title: `Game ${id}`, status: "playing", addedAt: 1, genres: [] };
}

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    cloud: false,
    userId: null,
    economyEnabled: true,
    clearStreak: 0,
    clearStreakBest: 0,
    lastFinishStreak: null,
    clearStreak_cfg: { ...CLEAR_STREAK },
    coins: 1000,
    ledger: [],
    games: [playing("a"), playing("b"), playing("c"), playing("d"), playing("e")],
  });
});

describe("Clear Streak — offline finishGame", () => {
  it("builds the streak one finish at a time and tracks the all-time best", async () => {
    await store().finishGame("a");
    expect(store().clearStreak).toBe(1);
    await store().finishGame("b");
    expect(store().clearStreak).toBe(2);
    await store().finishGame("c");
    expect(store().clearStreak).toBe(3);
    expect(store().clearStreakBest).toBe(3);
  });

  it("pays no bonus below the threshold, then the escalating bonus", async () => {
    const start = store().coins;
    await store().finishGame("a"); // streak 1 — no bonus
    await store().finishGame("b"); // streak 2 — no bonus
    const beforeThird = store().coins;
    await store().finishGame("c"); // streak 3 — +100 bonus (default)
    // The 3rd finish's coin gain = its bounty + the streak base bonus.
    expect(store().coins - beforeThird).toBeGreaterThanOrEqual(CLEAR_STREAK.base);
    // A clear_streak_bonus ledger row was written for the paid bonus.
    expect(store().ledger.some((e) => e.kind === "clear_streak_bonus")).toBe(true);
    expect(store().coins).toBeGreaterThan(start);
    // The celebration payload reflects the just-finished streak.
    expect(store().lastFinishStreak).toEqual({ streak: 3, bonus: CLEAR_STREAK.base, newRecord: true });
  });

  it("flags a new personal best only when the streak surpasses the prior best", async () => {
    useStore.setState({ clearStreakBest: 5 });
    await store().finishGame("a"); // streak 1, best still 5 → not a record
    expect(store().lastFinishStreak?.newRecord).toBe(false);
    expect(store().clearStreakBest).toBe(5);
  });
});

describe("Clear Streak — the break condition (a new game to play)", () => {
  it("resets the streak to zero when a game to play is added, keeping the best", async () => {
    await store().finishGame("a");
    await store().finishGame("b");
    expect(store().clearStreak).toBe(2);

    await store().addGame({ title: "Newly bought", genres: [] }, "backlog");
    expect(store().clearStreak).toBe(0);
    expect(store().clearStreakBest).toBe(2); // the record survives the break
  });

  it("a wishlist add does NOT break the streak (not owned yet)", async () => {
    await store().finishGame("a");
    await store().addGame({ title: "Just wishlisted", genres: [] }, "wishlist");
    expect(store().clearStreak).toBe(1);
  });

  it("logging an already-beaten game straight to Finished does NOT break it", async () => {
    await store().finishGame("a");
    await store().finishGame("b");
    expect(store().clearStreak).toBe(2);

    await store().addGame({ title: "Beaten years ago", genres: [] }, "finished", "beaten");
    expect(store().clearStreak).toBe(2); // cataloging the past, not new backlog
  });
});

describe("Clear Streak — resumed re-finishes don't farm it", () => {
  it("re-finishing a resumed game leaves the streak unchanged", async () => {
    useStore.setState({
      games: [{ ...playing("r"), resumed: true }, playing("a")],
      clearStreak: 4,
      clearStreakBest: 4,
    });
    await store().finishGame("r");
    expect(store().clearStreak).toBe(4); // unchanged — no free farm
  });
});

// Issue 89bda3e6: joining a friend's pact as Player 2 inserts a granted card,
// which used to trip the break trigger and wipe the joiner's streak — so a game
// the two of them cleared together could only ever count for the owner. The
// carve-out is a transaction-local GUC: respond_co_op_pact sets it for its own
// insert, break_clear_streak reads it. Neither half means anything alone, and
// the suite runs offline (no Supabase) so the trigger itself can't be executed
// here — this guards the contract between the two halves instead, the way a GUC
// rename or a dropped `perform set_config` would silently restore the bug.
describe("Clear Streak — the co-op join carve-out is wired on both sides", () => {
  // Vitest runs from the package root, so the schema is a fixed path from cwd.
  const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
  const body = (fn: string) => {
    const start = schema.indexOf(`create or replace function public.${fn}`);
    expect(start).toBeGreaterThan(-1);
    return schema.slice(start, schema.indexOf("\n$$;", start));
  };

  it("respond_co_op_pact flags its Player 2 insert, transaction-locally", () => {
    const fn = body("respond_co_op_pact");
    expect(fn).toContain("set_config('app.co_op_join', '1', true)");
    // The flag must be set BEFORE the insert it exempts, or the trigger has
    // already fired by the time it lands.
    expect(fn.indexOf("set_config('app.co_op_join'")).toBeLessThan(
      fn.indexOf("insert into public.games"),
    );
  });

  it("break_clear_streak reads that same flag and bails out", () => {
    const fn = body("break_clear_streak");
    expect(fn).toContain("current_setting('app.co_op_join', true)");
    // Still breaks on every other new game to play.
    expect(fn).toContain("clear_streak = 0");
  });
});

describe("Clear Streak — undo rewinds it", () => {
  it("undoing a finish restores the pre-finish streak and best", async () => {
    await store().finishGame("a");
    await store().finishGame("b");
    await store().finishGame("c"); // streak 3, best 3, bonus paid
    expect(store().clearStreak).toBe(3);

    // Undo the 3rd finish via the pending-undo snapshot it created.
    await store().undoAction({
      id: null,
      gameId: "c",
      action: "finish",
      label: "Game c",
      prevGame: playing("c"),
      coinsDelta: 0,
      prevStreak: 2,
      prevStreakBest: 2,
    });
    expect(store().clearStreak).toBe(2);
    expect(store().clearStreakBest).toBe(2);
  });
});
