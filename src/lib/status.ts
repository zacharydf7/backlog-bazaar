// Canonical, human-readable labels for a game's economic status. Kept here (pure,
// no UI deps) so the StatusBadge component, the Master Ledger's group headers, and
// anywhere else all name a status the same way.

import type { GameStatus } from "../types";

export const STATUS_LABEL: Record<GameStatus, string> = {
  playing: "Now Playing",
  backlog: "Bazaar",
  wishlist: "Wishlist",
  finished: "Finished",
};

/** Display order for owned statuses (highest activity first). Wishlist is omitted
 *  — it's unowned and never appears in owned-only views like the Ledger. */
export const OWNED_STATUS_ORDER: GameStatus[] = ["playing", "backlog", "finished"];
