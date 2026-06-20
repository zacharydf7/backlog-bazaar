import type { GameMeta } from "../types";

// Wikidata: free, no API key, CORS-enabled. Good coverage of games (including
// console exclusives) with reliable titles + release dates. It does NOT carry
// game length or ratings, so those come back undefined (entered by hand).

const API = "https://www.wikidata.org/w/api.php";
const VIDEO_GAME = "Q7889"; // wikidata id for "video game" (P31 "instance of")

interface WdClaim {
  mainsnak?: {
    datavalue?: { value?: { time?: string; id?: string } | string };
  };
}

function extractDate(claims?: WdClaim[]): string | undefined {
  const v = claims?.[0]?.mainsnak?.datavalue?.value;
  const time = typeof v === "object" ? v?.time : undefined; // "+2017-03-03T00:00:00Z"
  if (!time) return undefined;
  const m = /^[+-](\d{4})-(\d{2})-(\d{2})/.exec(time);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  return `${y}-${mo === "00" ? "01" : mo}-${d === "00" ? "01" : d}`;
}

function yearFromText(text: string): string | undefined {
  const m = /\b(19|20)\d{2}\b/.exec(text);
  return m ? `${m[0]}-01-01` : undefined;
}

function extractImage(claims?: WdClaim[]): string | undefined {
  const v = claims?.[0]?.mainsnak?.datavalue?.value;
  const file = typeof v === "string" ? v : undefined; // a Commons filename
  if (!file) return undefined;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=320`;
}

function isVideoGame(claims: Record<string, WdClaim[]>): boolean {
  return (claims.P31 ?? []).some((c) => {
    const v = c.mainsnak?.datavalue?.value;
    return typeof v === "object" && v?.id === VIDEO_GAME;
  });
}

export async function searchGames(query: string): Promise<GameMeta[]> {
  const q = query.trim();
  if (!q) return [];

  // 1) Autocomplete candidate entities by name.
  const searchUrl =
    `${API}?action=wbsearchentities&search=${encodeURIComponent(q)}` +
    `&language=en&uselang=en&type=item&limit=15&format=json&origin=*`;
  const sres = await fetch(searchUrl);
  if (!sres.ok) throw new Error(`Wikidata search failed (${sres.status}).`);
  const sdata = (await sres.json()) as {
    search?: { id: string; label?: string; description?: string }[];
  };
  const candidates = (sdata.search ?? []).map((e) => ({
    id: e.id,
    label: e.label ?? e.id,
    description: e.description ?? "",
  }));
  if (candidates.length === 0) return [];

  // 2) One batched lookup of claims for all candidates (release date, image, type).
  const ids = candidates.map((c) => c.id).join("|");
  const detUrl = `${API}?action=wbgetentities&ids=${ids}&props=claims&format=json&origin=*`;
  const dres = await fetch(detUrl);
  if (!dres.ok) throw new Error(`Wikidata lookup failed (${dres.status}).`);
  const ddata = (await dres.json()) as {
    entities?: Record<string, { claims?: Record<string, WdClaim[]> }>;
  };
  const entities = ddata.entities ?? {};

  const games: GameMeta[] = [];
  for (const c of candidates) {
    const claims = entities[c.id]?.claims ?? {};
    // Keep things that are clearly games (avoids people, studios, etc.).
    if (!isVideoGame(claims) && !/\bgame\b/i.test(c.description)) continue;
    games.push({
      title: c.label,
      released: extractDate(claims.P577) ?? yearFromText(c.description),
      image: extractImage(claims.P18),
      hours: undefined, // not available on Wikidata
      rating: undefined,
      metacritic: null,
      genres: [],
    });
  }
  return games;
}
