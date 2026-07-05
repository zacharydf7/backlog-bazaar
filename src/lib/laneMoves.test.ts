import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import { planLaneMove, legalLaneTargets, type LaneCaps } from "./laneMoves";

let seq = 0;
function game(over: Partial<Game> = {}): Game {
  seq += 1;
  return {
    id: `g${seq}`,
    title: `Game ${seq}`,
    status: "playing",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: seq,
    ...over,
  } as Game;
}

const caps: LaneCaps = {
  generalSlots: 2,
  replaySlots: 2,
  completionistSlots: 2,
};

describe("planLaneMove", () => {
  it("allows focus → completionist via enterCompletionist", () => {
    const g = game();
    const plan = planLaneMove(g, [g], "completionist", caps);
    expect(plan).toEqual({ allowed: true, action: "enterCompletionist" });
  });

  it("allows replay → completionist (a resumed game can start a 100% run)", () => {
    const g = game({ resumed: true });
    const plan = planLaneMove(g, [g], "completionist", caps);
    expect(plan).toEqual({ allowed: true, action: "enterCompletionist" });
  });

  it("routes completionist → focus/replay through exitCompletionist by resumed flag", () => {
    const fresh = game({ completionist: true });
    expect(planLaneMove(fresh, [fresh], "focus", caps)).toEqual({
      allowed: true,
      action: "exitCompletionist",
    });
    // A resumed 100% run falls back to Replay, not Focus — mirroring the button.
    expect(planLaneMove(fresh, [fresh], "replay", caps).allowed).toBe(false);
    const resumed = game({ completionist: true, resumed: true });
    expect(planLaneMove(resumed, [resumed], "replay", caps)).toEqual({
      allowed: true,
      action: "exitCompletionist",
    });
    expect(planLaneMove(resumed, [resumed], "focus", caps).allowed).toBe(false);
  });

  it("blocks focus → replay (the user-reported guard case)", () => {
    const g = game();
    const plan = planLaneMove(g, [g], "replay", caps);
    expect(plan.allowed).toBe(false);
  });

  it("gates Rotation on the ongoing flag", () => {
    const standard = game();
    expect(planLaneMove(standard, [standard], "rotation", caps).allowed).toBe(false);
    const live = game({ ongoing: true });
    expect(planLaneMove(live, [live], "rotation", caps)).toEqual({
      allowed: true,
      action: "enterRotation",
    });
  });

  it("never blocks Rotation on occupancy — the lane is uncapped (issue 2a435c06)", () => {
    const mover = game({ ongoing: true });
    const occupants = Array.from({ length: 5 }, () =>
      game({ ongoing: true, inRotation: true }),
    );
    expect(planLaneMove(mover, [mover, ...occupants], "rotation", caps)).toEqual({
      allowed: true,
      action: "enterRotation",
    });
  });

  it("keeps Rotation games out of the other lanes (they exit via Remove from Rotation)", () => {
    const g = game({ ongoing: true, inRotation: true });
    expect(planLaneMove(g, [g], "focus", caps).allowed).toBe(false);
    expect(planLaneMove(g, [g], "replay", caps).allowed).toBe(false);
    expect(planLaneMove(g, [g], "completionist", caps).allowed).toBe(false);
  });

  it("respects lane capacity (a full target lane blocks the drop)", () => {
    const mover = game();
    const occupants = [game({ completionist: true }), game({ completionist: true })];
    const all = [mover, ...occupants];
    const plan = planLaneMove(mover, all, "completionist", caps);
    expect(plan.allowed).toBe(false);
    // With more room it goes through.
    expect(planLaneMove(mover, all, "completionist", { ...caps, completionistSlots: 3 }).allowed).toBe(
      true,
    );
  });

  it("rejects same-lane drops and non-playing games", () => {
    const g = game();
    expect(planLaneMove(g, [g], "focus", caps).allowed).toBe(false);
    const finished = game({ status: "finished" });
    expect(planLaneMove(finished, [finished], "completionist", caps).allowed).toBe(false);
  });
});

describe("legalLaneTargets", () => {
  it("lists exactly the droppable lanes for a plain focus game", () => {
    const g = game();
    expect(legalLaneTargets(g, [g], caps)).toEqual(["completionist"]);
  });

  it("offers only Rotation to an ongoing focus game (100% runs are for standard games)", () => {
    const g = game({ ongoing: true });
    expect(legalLaneTargets(g, [g], caps)).toEqual(["rotation"]);
  });
});
