// Drop-in sessions (issue f40bf121): time logged on a Finished (or Retired)
// game without moving it, a quick return to a favorite. The server keeps each
// one as a playtime_events row with drop_in set and an optional note.
import type { Game } from "../types";
import { isDemo } from "./demos";

/** Can time be logged on this game? Playing games, Finished (or Retired) ones
 *  as drop-ins, and demos (the server's game_takes_time). */
export function canLogTime(game: Pick<Game, "status" | "demo">): boolean {
  return game.status === "playing" || game.status === "finished" || isDemo(game);
}

/** The longest note a session takes (playtime_events_note_check). */
export const SESSION_NOTE_MAX = 140;

