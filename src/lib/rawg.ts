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
  };
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
