import type { GameMeta } from "../types";
import { hasRawgKey, searchGames as rawgSearch, fetchGameDetails as rawgDetails } from "./rawg";
import { searchGames as wikidataSearch } from "./wikidata";
import { cacheGet, cacheSet } from "./cache";

// Picks a game-data provider at runtime:
//   - RAWG when a key is configured (full data: length, rating, cover art)
//   - Wikidata otherwise (no key needed; release date only — length typed by hand)
// Results are cached (see ./cache) to limit how often the external API is hit.

export const usingRawg = hasRawgKey;
export const providerName = hasRawgKey ? "RAWG" : "Wikidata";

const SEARCH_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days
const DETAIL_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function searchGames(query: string): Promise<GameMeta[]> {
  const q = query.trim();
  if (!q) return [];
  const key = `search:${providerName}:${q.toLowerCase()}`;
  const cached = cacheGet<GameMeta[]>(key);
  if (cached) return cached;

  const results = await (hasRawgKey ? rawgSearch(q) : wikidataSearch(q));
  cacheSet(key, results, SEARCH_TTL);
  return results;
}

/** Extra per-game stats (RAWG only). Returns {} when unavailable. */
export async function fetchGameDetails(rawgId?: number): Promise<Partial<GameMeta>> {
  if (!hasRawgKey || !rawgId) return {};
  const key = `detail:${rawgId}`;
  const cached = cacheGet<Partial<GameMeta>>(key);
  if (cached) return cached;

  const details = await rawgDetails(rawgId);
  cacheSet(key, details, DETAIL_TTL);
  return details;
}
