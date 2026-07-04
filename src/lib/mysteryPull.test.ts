import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import { DEFAULT_ECONOMY, computeFormula } from "./economy";
import { mysteryPullPool, drawPull, type PullContext } from "./mysteryPull";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g",
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: Date.now(),
    hours: 10,
    ...over,
  } as Game;
}

/** A context with plenty of everything; tests tighten one dial at a time. */
function ctx(over: Partial<PullContext> = {}): PullContext {
  return {
    coins: 10_000,
    vouchers: 0,
    economy: DEFAULT_ECONOMY,
    replayBonusPct: 25,
    generalSlots: 2,
    completionistSlots: 2,
    ...over,
  };
}

const priceOf = (g: Game) => computeFormula(g, DEFAULT_ECONOMY.price);

describe("mysteryPullPool", () => {
  it("includes an affordable, unlocked Bazaar game when a slot is open", () => {
    const g = game({ id: "a" });
    const { pool, reason } = mysteryPullPool([g], ctx());
    expect(pool.map((x) => x.id)).toEqual(["a"]);
    expect(reason).toBeNull();
  });

  it("excludes live-service games, other statuses, and story-locked games", () => {
    const prereq = game({ id: "pre", title: "Part 1", status: "backlog" });
    const games = [
      game({ id: "ongoing", ongoing: true }),
      game({ id: "wish", status: "wishlist" }),
      game({ id: "done", status: "finished" }),
      game({ id: "locked", prerequisiteGameId: "pre" }),
      prereq,
    ];
    const { pool } = mysteryPullPool(games, ctx());
    // Only the unlocked backlog games qualify (the prerequisite itself is fine).
    expect(pool.map((x) => x.id)).toEqual(["pre"]);
  });

  it("unlocks a story-locked game once its prerequisite is finished", () => {
    const games = [
      game({ id: "pre", status: "finished" }),
      game({ id: "sequel", prerequisiteGameId: "pre" }),
    ];
    const { pool } = mysteryPullPool(games, ctx());
    expect(pool.map((x) => x.id)).toEqual(["sequel"]);
  });

  it("excludes games the player can't pay for — and explains it", () => {
    const g = game({ id: "a" });
    const { pool, reason } = mysteryPullPool([g], ctx({ coins: priceOf(g) - 1 }));
    expect(pool).toEqual([]);
    expect(reason).toMatch(/afford/i);
  });

  it("a voucher rescues an unaffordable game, but only into an open Focus slot", () => {
    const g = game({ id: "a" });
    const broke = ctx({ coins: 0, vouchers: 1 });
    expect(mysteryPullPool([g], broke).pool.map((x) => x.id)).toEqual(["a"]);

    // Focus full (two plain playing units), completionist open: vouchers can't
    // land there, and with no coins the game drops out of the pool.
    const focusFull = [
      g,
      game({ id: "p1", status: "playing" }),
      game({ id: "p2", status: "playing" }),
    ];
    const { pool, reason } = mysteryPullPool(focusFull, broke);
    expect(pool).toEqual([]);
    expect(reason).toMatch(/afford/i);
  });

  it("reports no-open-slot when every lane is full", () => {
    const games = [
      game({ id: "a" }),
      game({ id: "p1", status: "playing" }),
      game({ id: "p2", status: "playing" }),
      game({ id: "c1", status: "playing", completionist: true }),
      game({ id: "c2", status: "playing", completionist: true }),
    ];
    const { pool, reason } = mysteryPullPool(games, ctx());
    expect(pool).toEqual([]);
    expect(reason).toMatch(/No open Now Playing slot/);
  });

  it("reports an empty Bazaar and an all-locked Bazaar distinctly", () => {
    expect(mysteryPullPool([], ctx()).reason).toMatch(/No games in your Bazaar/);
    const locked = [
      game({ id: "locked", prerequisiteGameId: "pre" }),
      game({ id: "pre", status: "playing" }),
    ];
    expect(mysteryPullPool(locked, ctx()).reason).toMatch(/story-locked/);
  });
});

describe("drawPull", () => {
  const pool = [game({ id: "a" }), game({ id: "b" }), game({ id: "c" })];

  it("draws deterministically with an injected rng", () => {
    expect(drawPull(pool, new Set(), () => 0)?.id).toBe("a");
    expect(drawPull(pool, new Set(), () => 0.99)?.id).toBe("c");
  });

  it("skips already-seen games until the pool is exhausted, then cycles", () => {
    expect(drawPull(pool, new Set(["a"]), () => 0)?.id).toBe("b");
    expect(drawPull(pool, new Set(["a", "b"]), () => 0)?.id).toBe("c");
    // Everything seen: the cycle restarts over the full pool.
    expect(drawPull(pool, new Set(["a", "b", "c"]), () => 0)?.id).toBe("a");
  });

  it("returns null for an empty pool", () => {
    expect(drawPull([], new Set(), () => 0)).toBeNull();
  });
});
