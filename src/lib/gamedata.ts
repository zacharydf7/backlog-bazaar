import type { GameMeta } from "../types";
import {
  hasRawgKey,
  searchGames as rawgSearch,
  fetchGameDetails as rawgDetails,
  fetchGameList as rawgGameList,
} from "./rawg";
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

/** Main-story / main+extras / completionist lengths (hours) from HowLongToBeat. */
export interface HltbTimes {
  main?: number;
  mainExtra?: number;
  completionist?: number;
}

/**
 * Look up a game's HowLongToBeat times via our serverless proxy. Returns
 * undefined when unavailable (network, no match, or running locally without the
 * function) so callers can fall back to RAWG playtime or manual entry.
 */
export async function fetchHltbTimes(title: string): Promise<HltbTimes | undefined> {
  const t = title.trim();
  if (!t) return undefined;
  const key = `hltb:${t.toLowerCase()}`;
  const cached = cacheGet<HltbTimes | null>(key);
  if (cached !== undefined) return cached ?? undefined; // null = "looked up, none found"

  try {
    const res = await fetch(`/api/hltb?title=${encodeURIComponent(t)}`);
    if (!res.ok) return undefined;
    const d = (await res.json()) as {
      main?: number | null;
      mainExtra?: number | null;
      completionist?: number | null;
    };
    const times: HltbTimes = {
      main: d.main ?? undefined,
      mainExtra: d.mainExtra ?? undefined,
      completionist: d.completionist ?? undefined,
    };
    if (!times.main && !times.mainExtra && !times.completionist) {
      cacheSet(key, null, LENGTH_TTL);
      return undefined;
    }
    cacheSet(key, times, LENGTH_TTL);
    return times;
  } catch {
    return undefined;
  }
}

// --- The Market (discovery) ---------------------------------------------
const MARKET_TTL = 1000 * 60 * 60 * 12; // 12 hours

// RAWG genre slugs are mostly the slugified name; a couple need overrides.
const GENRE_SLUG_OVERRIDES: Record<string, string> = {
  rpg: "role-playing-games-rpg",
};

export function genreSlug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return GENRE_SLUG_OVERRIDES[s] ?? s;
}

async function marketFetch(
  label: string,
  params: Record<string, string | number>,
): Promise<GameMeta[]> {
  if (!hasRawgKey) return [];
  const key = `market:${label}:${JSON.stringify(params)}`;
  const cached = cacheGet<GameMeta[]>(key);
  if (cached) return cached;
  const results = await rawgGameList(params);
  cacheSet(key, results, MARKET_TTL);
  return results;
}

function withPlatforms(
  params: Record<string, string | number>,
  platformIds: number[],
): Record<string, string | number> {
  return platformIds.length ? { ...params, platforms: platformIds.join(",") } : params;
}

/** Most-added games (all-time popular). */
export function fetchTrending(platformIds: number[]): Promise<GameMeta[]> {
  return marketFetch("trending", withPlatforms({ ordering: "-added", page_size: 18 }, platformIds));
}

/** Recently released, popular games. */
export function fetchNewReleases(platformIds: number[]): Promise<GameMeta[]> {
  const today = new Date();
  const past = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 90);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return marketFetch(
    "new",
    withPlatforms(
      { dates: `${fmt(past)},${fmt(today)}`, ordering: "-added", page_size: 18 },
      platformIds,
    ),
  );
}

/** Highly-rated games in the given genres (falls back to top-rated overall). */
export function fetchRecommended(genres: string[], platformIds: number[]): Promise<GameMeta[]> {
  const params: Record<string, string | number> = {
    ordering: "-rating",
    metacritic: "75,100",
    page_size: 18,
  };
  const slugs = genres.map(genreSlug).filter(Boolean);
  if (slugs.length) params.genres = slugs.join(",");
  return marketFetch("rec", withPlatforms(params, platformIds));
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
