// "Play a Game" on a bundle card (issue 86fc0b4b): which of the bundle's Bazaar
// games can start right now, and how. It applies the same gates a game card's
// own Buy & Start enforces (GameActions), so the picker never offers a start the
// card itself would refuse. Fee, lane room and coins are left to the activation
// dialog the pick hands off to.

import type { Game } from "../types";
import { accessLost } from "./copies";
import { isPreordered } from "./preorders";
import { prerequisiteOf } from "./prerequisites";

export type PlayOption =
  /** A regular Buy & Start through the activation dialog. */
  | { kind: "start" }
  /** A live-service game: it joins the Rotation lane for free instead. */
  | { kind: "rotation" }
  /** Can't start yet; `reason` says why. */
  | { kind: "blocked"; reason: string };

/** How (or whether) a Bazaar game can be started from the bundle picker. */
export function playOptionFor(game: Game, games: Game[]): PlayOption {
  if (isPreordered(game)) {
    return { kind: "blocked", reason: "Pre-ordered — unlock it from its page once it arrives" };
  }
  if (accessLost(game.copies)) {
    return { kind: "blocked", reason: "You no longer have access to it" };
  }
  const pre = prerequisiteOf(games, game);
  if (pre && pre.status !== "finished") {
    return { kind: "blocked", reason: `Story-locked — finish ${pre.title} first` };
  }
  return game.ongoing ? { kind: "rotation" } : { kind: "start" };
}
