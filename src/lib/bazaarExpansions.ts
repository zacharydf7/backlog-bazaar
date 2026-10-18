// Expansions in the Bazaar (owner, 2026-10-18): each story expansion you own
// and haven't played gets its own Bazaar card, priced and started there, while
// its game stays on Finished. One whose game isn't finished shows locked until
// it is. They count in the Bazaar's total but are never games rows, so the
// Mystery Pull (which draws games) skips them. Pure, so it's unit-tested.

import type { Game } from "../types";
import { gameMatches, type Filters, type SortKey } from "./bazaarView";
import { DEFAULT_HOURS } from "./economy";
import { expansionAcquiredAt, type ExpansionQuote, type GameDlc } from "./dlc";
import { isRetired } from "./finishTags";
import { textMatchesQuery } from "./librarySearch";

export interface BazaarExpansion {
  dlc: GameDlc;
  /** The game it expands. */
  game: Game;
  /** What starting it costs and clearing it pays now. */
  quote: ExpansionQuote;
  /** Why it can't start yet ("Finish Ghost of Yotei first."), or null when it
   *  can (start_expansion's own checks). */
  lockedReason: string | null;
}

/** The expansions to show in your Bazaar: every story expansion still owned
 *  (not started or cleared) on a game in your library. */
export function bazaarExpansions(
  games: Game[],
  dlc: GameDlc[],
  quoteOf: (dlc: GameDlc) => ExpansionQuote,
): BazaarExpansion[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  const out: BazaarExpansion[] = [];
  for (const d of dlc) {
    if (d.kind !== "expansion" || d.runStatus !== "owned" || d.gameId == null) continue;
    const game = byId.get(d.gameId);
    if (!game) continue;
    const running = game.expansionRun
      ? dlc.find((o) => o.gameId === game.id && o.runStatus === "playing")
      : undefined;
    const lockedReason = running
      ? `Clear ${running.name} first.`
      : game.status !== "finished"
        ? `Finish ${game.title} first. It unlocks by itself.`
        : isRetired(game)
          ? `Return ${game.title} to your Bazaar and finish it first.`
          : null;
    out.push({ dlc: d, game, quote: quoteOf(d), lockedReason });
  }
  return out;
}

/** Does the query find this expansion, by its own name or its game's? */
export function expansionMatchesQuery(x: BazaarExpansion, query: string): boolean {
  return textMatchesQuery(`${x.dlc.name} ${x.game.title}`, query);
}

/** Does an expansion card pass the board slicers? It goes where its game
 *  would, except priority: an expansion has no tier of its own, so it counts
 *  as unprioritized, as the priority sorts treat it. */
export function expansionMatchesFilters(x: BazaarExpansion, filters: Filters): boolean {
  return gameMatches({ ...x.game, priority: undefined }, filters);
}

/** Where an expansion card sits under a board sort, on the same scale the sort
 *  measures games by: its start price, bounty, length or acquired date.
 *  Undefined where it has no value (A–Z sorts by name; an expansion has no
 *  priority tier, so it sinks like an unprioritized game). */
export function expansionSortValue(x: BazaarExpansion, key: SortKey): number | undefined {
  switch (key) {
    case "cost-asc":
      return x.quote.price;
    case "bounty-desc":
      return x.quote.bounty;
    case "playtime-asc":
      return x.dlc.hours ?? DEFAULT_HOURS;
    case "added-asc":
    case "added-desc":
      return expansionAcquiredAt(x.dlc);
    default:
      return undefined;
  }
}
