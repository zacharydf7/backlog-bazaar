// Drag & drop between Now Playing lanes: which lane-to-lane moves are legal for
// a playing game, and which existing store action performs each one. This is a
// PURE mirror of the moves the lane buttons already offer — dragging never
// unlocks a transition the workflow doesn't have:
//
//   focus / replay  → completionist   enterCompletionist (start a 100% run)
//   completionist   → focus           exitCompletionist  (stop the run; !resumed)
//   completionist   → replay          exitCompletionist  (stop the run; resumed)
//   focus / replay  → rotation        enterRotation      (ongoing games only)
//
// Everything else is blocked with a human reason (shown on the lane while
// dragging): Replay only ever holds finished games pulled back in, Rotation is
// live-service-only, and Rotation games leave via "Remove from Rotation" (an
// origin-aware exit, not a lane hop). Capacity checks reuse the same predicates
// the buttons use, so a drop can never overfill a lane.

import type { Game } from "../types";
import { canEnterLane, laneOf, type Lane } from "./slots";

/** Per-user lane capacities, straight from the store. Rotation is absent on
 *  purpose — that lane is uncapped (see rotationMeterCells in slots.ts). */
export interface LaneCaps {
  generalSlots: number;
  replaySlots: number;
  completionistSlots: number;
}

/** The store action a legal move maps to. */
export type LaneMoveAction = "enterCompletionist" | "exitCompletionist" | "enterRotation";

export type LaneMovePlan =
  | { allowed: true; action: LaneMoveAction }
  | { allowed: false; reason: string };

/** Can `game` (playing) be dropped into `to` right now — and via which action? */
export function planLaneMove(game: Game, games: Game[], to: Lane, caps: LaneCaps): LaneMovePlan {
  if (game.status !== "playing") {
    return { allowed: false, reason: "Only a playing game can move between lanes" };
  }
  const from = laneOf(game);
  if (from === to) return { allowed: false, reason: "Already in this lane" };

  switch (to) {
    case "rotation":
      if (!game.ongoing) {
        return { allowed: false, reason: "Only live-service games can go in Rotation" };
      }
      // The Rotation lane is uncapped — an ongoing game always fits.
      return { allowed: true, action: "enterRotation" };

    case "completionist":
      if (game.ongoing) {
        return { allowed: false, reason: "Live-service games stay in Rotation" };
      }
      if (!canEnterLane(game, games, "completionist", caps.completionistSlots)) {
        return { allowed: false, reason: "Completionist lane is full" };
      }
      return { allowed: true, action: "enterCompletionist" };

    case "focus":
      if (from !== "completionist") {
        return {
          allowed: false,
          reason:
            from === "rotation"
              ? "Use Remove from Rotation instead"
              : "A replay stays in Replay until it's finished",
        };
      }
      if (game.resumed) {
        return { allowed: false, reason: "Stopping this 100% run returns it to Replay" };
      }
      if (!canEnterLane(game, games, "focus", caps.generalSlots)) {
        return { allowed: false, reason: "Focus lane is full" };
      }
      return { allowed: true, action: "exitCompletionist" };

    case "replay":
      if (from !== "completionist" || !game.resumed) {
        return { allowed: false, reason: "Replay holds finished games pulled back in" };
      }
      if (!canEnterLane(game, games, "replay", caps.replaySlots)) {
        return { allowed: false, reason: "Replay lane is full" };
      }
      return { allowed: true, action: "exitCompletionist" };

    case "coop":
      // Membership comes from accepting a Co-op Pact, never a drag.
      return { allowed: false, reason: "Games join the Co-op lane through a pact invite" };
  }
}

/** The lanes a drag of `game` could legally drop into (for rendering empty
 *  target lanes as drop zones while a drag is active). */
export function legalLaneTargets(game: Game, games: Game[], caps: LaneCaps): Lane[] {
  const all: Lane[] = ["focus", "replay", "completionist", "rotation"];
  return all.filter((lane) => planLaneMove(game, games, lane, caps).allowed);
}
