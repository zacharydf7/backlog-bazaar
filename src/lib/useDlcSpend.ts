import { useStore } from "../store";
import { dlcSpendByGame } from "./dlc";
import type { Game } from "../types";

/** What your DLC records cost across some games, for the spend and value
 *  totals (owner, 2026-10-18: DLC counts in what a game cost). Only your own
 *  records load, so a visited library adds nothing. */
export function useDlcSpend(): (games: Pick<Game, "id">[]) => number {
  const byGame = dlcSpendByGame(useStore((s) => s.gameDlc));
  return (games) => games.reduce((sum, g) => sum + (byGame.get(g.id) ?? 0), 0);
}
