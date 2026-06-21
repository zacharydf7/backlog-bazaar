import type { GameMeta } from "../types";
import { hasRawgKey, searchGames as rawgSearch, fetchGameDetails as rawgDetails } from "./rawg";
import { searchGames as wikidataSearch } from "./wikidata";

// Picks a game-data provider at runtime:
//   - RAWG when a key is configured (full data: length, rating, cover art)
//   - Wikidata otherwise (no key needed; release date only — length typed by hand)
// There is always a working provider, so autocomplete is always available.

export const usingRawg = hasRawgKey;
export const providerName = hasRawgKey ? "RAWG" : "Wikidata";

export function searchGames(query: string): Promise<GameMeta[]> {
  return hasRawgKey ? rawgSearch(query) : wikidataSearch(query);
}

/** Extra per-game stats (RAWG only). Returns {} when unavailable. */
export function fetchGameDetails(rawgId?: number): Promise<Partial<GameMeta>> {
  if (!hasRawgKey || !rawgId) return Promise.resolve({});
  return rawgDetails(rawgId);
}
