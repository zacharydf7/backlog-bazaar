import type { GameMeta } from "../types";

// IGDB (igdb.com, Twitch's game database) through our serverless proxy at
// /api/igdb — IGDB refuses browser requests (no CORS) so the credential and
// OAuth handshake live server-side (see api/igdb.ts). The proxy passes IGDB's
// JSON through unmapped; all field mapping happens here where it's testable.
//
// Coverage is best-in-class (console exclusives included) with covers, genres,
// platforms, critic + user ratings, developers, and age ratings — everything
// RAWG gave us EXCEPT a game-length estimate, which by design comes from
// HowLongToBeat instead (fetchHltbTimes in ./gamedata fires on pick).
//
// When the proxy isn't deployed or configured (local `npm run dev`, missing
// env vars) requests fail fast and the provider chain in ./gamedata simply
// moves on to the next source.

// Matches the RAWG/HLTB timeout: an unreachable provider fails fast so the
// search box falls through the chain instead of spinning.
const TIMEOUT_MS = 8000;

interface IgdbGame {
  id: number;
  name: string;
  first_release_date?: number; // unix seconds
  rating?: number; // user rating, 0–100
  aggregated_rating?: number; // critic average, 0–100
  cover?: { url?: string };
  genres?: { name?: string }[];
  platforms?: { name?: string }[];
  involved_companies?: { developer?: boolean; company?: { name?: string } }[];
  age_ratings?: { organization?: { name?: string }; rating_category?: { rating?: string } }[];
}

// IGDB's names for a few platforms differ from the labels used everywhere in
// this app (and by RAWG, whose names the taxonomy grew up with) — normalize the
// known ones so platform chips and copy pickers match; unknowns pass through.
const PLATFORM_NAMES: Record<string, string> = {
  "PC (Microsoft Windows)": "PC",
  "Xbox Series X|S": "Xbox Series X/S",
};

// IGDB age-rating categories are short codes ("E10", "M"); the app displays
// RAWG-style long names ("Everyone 10+", "Mature"). Unknown codes pass through.
const ESRB_NAMES: Record<string, string> = {
  RP: "Rating Pending",
  EC: "Early Childhood",
  E: "Everyone",
  E10: "Everyone 10+",
  T: "Teen",
  M: "Mature",
  AO: "Adults Only",
};

/** IGDB serves search covers as tiny t_thumb images; the same hash is hosted at
 *  every size, so rewrite to t_cover_big (~264×352) and make the scheme-relative
 *  URL absolute. */
function coverUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const abs = url.startsWith("//") ? `https:${url}` : url;
  return abs.replace("/t_thumb/", "/t_cover_big/");
}

/** Unix seconds → "YYYY-MM-DD" (IGDB dates are UTC midnight timestamps). */
function isoDate(sec?: number): string | undefined {
  if (!sec) return undefined;
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function esrb(ratings?: IgdbGame["age_ratings"]): string | undefined {
  const hit = (ratings ?? []).find((r) => r.organization?.name === "ESRB");
  const code = hit?.rating_category?.rating;
  if (!code) return undefined;
  return ESRB_NAMES[code] ?? code;
}

/** Map one raw IGDB game record onto GameMeta. Exported for tests.
 *
 *  Two deliberate choices:
 *   - Identity goes into `igdbId`, NEVER `rawgId`. Both providers use small
 *     integer ids, so sharing the field would alias unrelated games onto the
 *     same catalog row. The two id spaces stay separate all the way down
 *     (games.igdb_id / catalog_games.igdb_id mirror the rawg_id columns).
 *   - `metacritic` carries IGDB's aggregated_rating: same 0–100 critic-average
 *     semantics, different review panel. Users read the field as "critic score",
 *     which is what this is.
 */
export function mapIgdbGame(r: IgdbGame): GameMeta {
  return {
    igdbId: r.id,
    title: r.name,
    released: isoDate(r.first_release_date),
    image: coverUrl(r.cover?.url),
    rating: r.rating ? Math.round(r.rating / 20 * 100) / 100 : undefined, // 0–100 → 0–5
    hours: undefined, // IGDB has no length; HowLongToBeat fills it on pick
    metacritic: r.aggregated_rating ? Math.round(r.aggregated_rating) : null,
    genres: (r.genres ?? []).map((g) => g.name).filter((n): n is string => Boolean(n)),
    platforms: (r.platforms ?? [])
      .map((p) => p.name)
      .filter((n): n is string => Boolean(n))
      .map((n) => PLATFORM_NAMES[n] ?? n),
    developers: (r.involved_companies ?? [])
      .filter((c) => c.developer)
      .map((c) => c.company?.name)
      .filter((n): n is string => Boolean(n)),
    esrb: esrb(r.age_ratings),
  };
}

/** Fetch one proxy op and map the returned games, throwing on anything that
 *  isn't IGDB's array so the caller's provider chain moves on to its standby. */
async function fetchGames(params: string): Promise<GameMeta[]> {
  const res = await fetch(`/api/igdb?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`IGDB request failed (${res.status}).`);
  const data = (await res.json()) as IgdbGame[];
  // A dev server with no /api can answer 200 with something that isn't IGDB's
  // array — treat that as the provider being unavailable, not as zero results.
  if (!Array.isArray(data)) throw new Error("IGDB proxy returned an unexpected response.");
  return data.map(mapIgdbGame);
}

/** Search IGDB for games by name (through the proxy). */
export function searchGames(query: string): Promise<GameMeta[]> {
  const q = query.trim();
  if (!q) return Promise.resolve([]);
  return fetchGames(`op=search&q=${encodeURIComponent(q)}`);
}

// --- The Caravan (discovery) ---------------------------------------------

export type CaravanSection = "trending" | "new" | "recommended";

// IGDB's genre catalog is a fixed small list; map both IGDB's own names (which
// newly-added games carry) and the RAWG-era names still common in libraries
// onto IGDB genre ids for the recommendation filter. Lowercased keys; names
// with no IGDB genre (e.g. RAWG's "Action" — an IGDB theme, not a genre) are
// simply skipped.
const GENRE_IDS: Record<string, number> = {
  "point-and-click": 2,
  fighting: 4,
  shooter: 5,
  music: 7,
  platform: 8,
  platformer: 8,
  puzzle: 9,
  racing: 10,
  "real time strategy (rts)": 11,
  "role-playing (rpg)": 12,
  rpg: 12,
  simulator: 13,
  simulation: 13,
  sport: 14,
  sports: 14,
  strategy: 15,
  "turn-based strategy (tbs)": 16,
  tactical: 24,
  "hack and slash/beat 'em up": 25,
  "quiz/trivia": 26,
  pinball: 30,
  adventure: 31,
  indie: 32,
  arcade: 33,
  "visual novel": 34,
  "card & board game": 35,
  "card board game": 35,
  moba: 36,
};

/** IGDB genre ids for a set of genre names (either provider's naming). */
export function genreIdsFor(names: string[]): number[] {
  const out = new Set<number>();
  for (const name of names) {
    const id = GENRE_IDS[name.trim().toLowerCase()];
    if (id) out.add(id);
  }
  return [...out];
}

/** One Caravan discovery section (through the proxy): trending / new releases /
 *  recommended-by-genre. Ids are IGDB platform/genre ids (see lib/platforms and
 *  genreIdsFor). Throws on failure so gamedata's chain can fall back to RAWG. */
export function fetchSection(
  section: CaravanSection,
  opts: { platformIds?: number[]; genreIds?: number[] } = {},
): Promise<GameMeta[]> {
  const params = new URLSearchParams({ op: "list", section });
  if (opts.platformIds?.length) params.set("platforms", opts.platformIds.join(","));
  if (opts.genreIds?.length) params.set("genres", opts.genreIds.join(","));
  return fetchGames(params.toString());
}
