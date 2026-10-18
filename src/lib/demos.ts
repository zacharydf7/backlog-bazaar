// Demos (issue 02759349): a wishlist game the player is trying as a demo. It
// isn't owned, so it stays a wishlist entry (no lane, no finish, no streak
// effect); the flag lets time be logged on it, earning nothing, and puts it in
// the Demos row on Now Playing. "Get the full game" imports it with its hours.
import type { Game, GameStatus } from "../types";

/** Is this game a demo being played? The flag means nothing off the wishlist
 *  (the server clears it when the game leaves). */
export function isDemo(game: Pick<Game, "status" | "demo">): boolean {
  return game.status === "wishlist" && game.demo === true;
}

/** The board a game shows on: its status, except a demo, which sits on Now
 *  Playing. */
export function boardOf(game: Pick<Game, "status" | "demo">): GameStatus {
  return isDemo(game) ? "playing" : game.status;
}
