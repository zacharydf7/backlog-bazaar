import type { GameMeta } from "../types";

const KEY = import.meta.env.VITE_RAWG_KEY as string | undefined;

export const hasRawgKey = Boolean(KEY);

interface RawgResult {
  id: number;
  name: string;
  released: string | null;
  background_image: string | null;
  rating: number | null;
  playtime: number | null;
  metacritic: number | null;
  genres?: { name: string }[];
  platforms?: { platform: { name: string } }[];
  esrb_rating?: { name: string } | null;
}

function mapResult(r: RawgResult): GameMeta {
  return {
    rawgId: r.id,
    title: r.name,
    released: r.released ?? undefined,
    image: r.background_image ?? undefined,
    rating: r.rating || undefined,
    hours: r.playtime || undefined,
    metacritic: r.metacritic ?? null,
    genres: (r.genres ?? []).map((g) => g.name),
    platforms: (r.platforms ?? []).map((p) => p.platform?.name).filter(Boolean) as string[],
    esrb: r.esrb_rating?.name,
  };
}

interface RawgDetail {
  developers?: { name: string }[];
  background_image?: string | null;
}

/**
 * Fetch extra details RAWG only returns from the single-game endpoint
 * (developer, etc.). Best-effort: returns {} on any failure so callers can
 * merge it in without worrying about errors.
 */
export async function fetchGameDetails(id: number): Promise<Partial<GameMeta>> {
  if (!KEY) return {};
  try {
    const res = await fetch(`https://api.rawg.io/api/games/${id}?key=${KEY}`);
    if (!res.ok) return {};
    const d = (await res.json()) as RawgDetail;
    return { developers: (d.developers ?? []).map((x) => x.name) };
  } catch {
    return {};
  }
}

/** The game's cover art straight from RAWG (its background_image), used to
 *  recover the original cover after a community edit changed it. Best-effort. */
export async function fetchGameCover(id: number): Promise<string | undefined> {
  if (!KEY) return undefined;
  try {
    const res = await fetch(`https://api.rawg.io/api/games/${id}?key=${KEY}`);
    if (!res.ok) return undefined;
    const d = (await res.json()) as RawgDetail;
    return d.background_image ?? undefined;
  } catch {
    return undefined;
  }
}

/** Fetch a list of games from RAWG with arbitrary query params (for discovery). */
export async function fetchGameList(
  params: Record<string, string | number>,
): Promise<GameMeta[]> {
  if (!KEY) return [];
  const qs = new URLSearchParams({ key: KEY });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`https://api.rawg.io/api/games?${qs.toString()}`);
  if (!res.ok) throw new Error(`RAWG request failed (${res.status}).`);
  const data = (await res.json()) as { results: RawgResult[] };
  return (data.results ?? []).map(mapResult);
}

/** Search RAWG for games by name. Throws if no API key is configured. */
export async function searchGames(query: string): Promise<GameMeta[]> {
  if (!KEY) throw new Error("No RAWG API key configured.");
  const url =
    `https://api.rawg.io/api/games?key=${KEY}` +
    `&search=${encodeURIComponent(query)}&page_size=10`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`RAWG request failed (${res.status}).`);
  }
  const data = (await res.json()) as { results: RawgResult[] };
  return (data.results ?? []).map(mapResult);
}
