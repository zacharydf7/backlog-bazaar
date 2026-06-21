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

const LENGTH_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

/**
 * Look up a game's main-story length (hours) from HowLongToBeat via our serverless
 * proxy. Used to fill the gap when RAWG has no playtime. Returns undefined if
 * unavailable (network, no match, or running locally without the function).
 */
export async function fetchLength(title: string): Promise<number | undefined> {
  const t = title.trim();
  if (!t) return undefined;
  const key = `len:${t.toLowerCase()}`;
  const cached = cacheGet<number | null>(key);
  if (cached !== undefined) return cached ?? undefined; // null = "looked up, none found"

  try {
    const res = await fetch(`/api/hltb?title=${encodeURIComponent(t)}`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { hours?: number | null };
    const hours = typeof data.hours === "number" ? data.hours : null;
    cacheSet(key, hours, LENGTH_TTL);
    return hours ?? undefined;
  } catch {
    return undefined;
  }
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
