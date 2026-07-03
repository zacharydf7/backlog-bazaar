// Game prerequisites (story locking): a game may name ONE other game in the
// same library that must be Finished before this one can be started. The lock
// is purely derived from live library state — the moment the prerequisite is
// marked Finished (or deleted, or the link is cleared) every predicate here
// re-evaluates and the game unlocks with no stored state to reconcile. The
// server mirrors these rules: a BEFORE trigger validates writes (ownership,
// self, cycles) and the cold-start RPCs raise PREREQUISITE_LOCKED.

import type { Game } from "../types";

/** The prerequisite game, resolved live from the library. null when none is
 *  set or the row is gone (deleted → the server FK set-nulls; a visitor may
 *  also simply not receive a private prerequisite — treated the same). */
export function prerequisiteOf(
  games: Game[],
  game: Pick<Game, "prerequisiteGameId">,
): Game | null {
  if (!game.prerequisiteGameId) return null;
  return games.find((g) => g.id === game.prerequisiteGameId) ?? null;
}

/** True while the game's prerequisite exists in the library and is not yet
 *  Finished. A missing prerequisite never locks — mirroring the server's
 *  on-delete-set-null semantics (and never leaking a private title). */
export function isPrerequisiteLocked(
  games: Game[],
  game: Pick<Game, "prerequisiteGameId">,
): boolean {
  const pre = prerequisiteOf(games, game);
  return pre != null && pre.status !== "finished";
}

/** Would pointing `gameId` at `prereqId` close a chain into a loop? Mirrors
 *  the server trigger's bounded walk (a chain longer than 50 hops is treated
 *  as a cycle rather than walking forever). Used to hide cycle-creating
 *  candidates from the picker before the server would reject them. */
export function wouldCreateCycle(games: Game[], gameId: string, prereqId: string): boolean {
  if (gameId === prereqId) return true;
  let cursor: string | null | undefined = prereqId;
  for (let hops = 0; cursor != null; hops++) {
    if (hops > 50) return true;
    if (cursor === gameId) return true;
    cursor = games.find((g) => g.id === cursor)?.prerequisiteGameId;
  }
  return false;
}
