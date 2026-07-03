import { describe, it, expect } from "vitest";
import { prerequisiteOf, isPrerequisiteLocked, wouldCreateCycle } from "./prerequisites";
import type { Game, GameStatus } from "../types";

const game = (id: string, over: Partial<Game> = {}): Game => ({
  id,
  title: id,
  genres: [],
  status: "backlog" as GameStatus,
  addedAt: Date.now(),
  ...over,
});

describe("prerequisiteOf / isPrerequisiteLocked", () => {
  it("locks while the prerequisite is anything but Finished", () => {
    const a = game("a", { status: "backlog" });
    const b = game("b", { prerequisiteGameId: "a" });
    expect(prerequisiteOf([a, b], b)?.id).toBe("a");
    expect(isPrerequisiteLocked([a, b], b)).toBe(true);
    expect(isPrerequisiteLocked([{ ...a, status: "playing" }, b], b)).toBe(true);
    expect(isPrerequisiteLocked([{ ...a, status: "wishlist" }, b], b)).toBe(true);
  });

  it("unlocks the moment the prerequisite is Finished (derived, no stored state)", () => {
    const a = game("a", { status: "finished" });
    const b = game("b", { prerequisiteGameId: "a" });
    expect(isPrerequisiteLocked([a, b], b)).toBe(false);
  });

  it("never locks when no prerequisite is set or the row is missing", () => {
    const b = game("b");
    expect(isPrerequisiteLocked([b], b)).toBe(false);
    const orphan = game("b", { prerequisiteGameId: "deleted" });
    expect(prerequisiteOf([orphan], orphan)).toBeNull();
    expect(isPrerequisiteLocked([orphan], orphan)).toBe(false);
  });
});

describe("wouldCreateCycle", () => {
  it("rejects self-reference", () => {
    expect(wouldCreateCycle([game("a")], "a", "a")).toBe(true);
  });

  it("rejects a two-node cycle (A requires B while B would require A)", () => {
    const a = game("a", { prerequisiteGameId: "b" });
    const b = game("b");
    expect(wouldCreateCycle([a, b], "b", "a")).toBe(true);
  });

  it("rejects a loop through a longer chain", () => {
    // c → b → a; pointing a at c closes the loop.
    const a = game("a");
    const b = game("b", { prerequisiteGameId: "a" });
    const c = game("c", { prerequisiteGameId: "b" });
    expect(wouldCreateCycle([a, b, c], "a", "c")).toBe(true);
  });

  it("allows a legitimate chain (C requires B, B requires A)", () => {
    const a = game("a");
    const b = game("b", { prerequisiteGameId: "a" });
    const c = game("c");
    expect(wouldCreateCycle([a, b, c], "c", "b")).toBe(false);
  });

  it("treats an absurdly long chain as a cycle (bounded walk, mirrors the trigger)", () => {
    const chain: Game[] = [];
    for (let i = 0; i < 60; i++) {
      chain.push(game(`g${i}`, { prerequisiteGameId: i > 0 ? `g${i - 1}` : undefined }));
    }
    expect(wouldCreateCycle(chain, "x", "g59")).toBe(true);
  });
});
