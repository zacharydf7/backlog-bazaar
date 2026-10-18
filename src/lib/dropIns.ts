// Drop-in sessions (issue f40bf121): time logged on a Finished (or Retired)
// game without moving it, a quick return to a favorite. The server keeps each
// one as a playtime_events row with drop_in set and an optional note.

/** Can time be logged on this game? Playing games, and Finished (or Retired)
 *  ones as drop-ins (log_playtime and start_play_session check the same). */
export function canLogTime(game: { status: string }): boolean {
  return game.status === "playing" || game.status === "finished";
}

/** The longest note a session takes (playtime_events_note_check). */
export const SESSION_NOTE_MAX = 140;

