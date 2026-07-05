// Canonical, human-readable labels for a game's economic status. Kept here (pure,
// no UI deps) so the StatusBadge component, the Master Ledger's group headers, and
// anywhere else all name a status the same way.

import type { Game, GameStatus } from "../types";

export const STATUS_LABEL: Record<GameStatus, string> = {
  playing: "Now Playing",
  backlog: "Bazaar",
  wishlist: "Wishlist",
  finished: "Finished",
};

/** True when a game is actively in the Rotation lane. Live-service play is a
 *  different rhythm from a Now Playing run — it wears "In Rotation" wherever a
 *  per-game status is shown. */
export function isInRotation(game: Pick<Game, "status" | "inRotation">): boolean {
  return game.status === "playing" && game.inRotation === true;
}

/** The status label a SPECIFIC game wears: "In Rotation" for a live-service
 *  game in the Rotation lane, else the plain status label. Prefer this over
 *  raw STATUS_LABEL whenever a concrete game (not an aggregate) is named. */
export function gameStatusLabel(game: Pick<Game, "status" | "inRotation">): string {
  return isInRotation(game) ? "In Rotation" : STATUS_LABEL[game.status];
}

/** Display order for owned statuses (highest activity first). Wishlist is omitted
 *  — it's unowned and never appears in owned-only views like the Ledger. */
export const OWNED_STATUS_ORDER: GameStatus[] = ["playing", "backlog", "finished"];
