import { useStore } from "../store";
import { inheritedCover } from "./compilationGrouping";
import type { Game } from "../types";

/** The cover to show for a game from the library (issue 66fbc1ef): its own
 *  art, else its bundle's, as the board cards show it (inheritedCover). A
 *  visited library has no bundles loaded, so its games keep their own art. */
export function useCoverOf(): (game: Pick<Game, "image" | "compilationId">) => string | undefined {
  const compilations = useStore((s) => s.compilations);
  const games = useStore((s) => s.games);
  const compilationGames = useStore((s) => s.compilationGames);
  const viewing = useStore((s) => s.viewing);
  return (game) => inheritedCover(game, viewing ? [] : compilations, games, compilationGames);
}
