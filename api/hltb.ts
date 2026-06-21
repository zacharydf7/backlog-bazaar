import type { VercelRequest, VercelResponse } from "@vercel/node";

// Serverless proxy for HowLongToBeat's (unofficial) search API. Runs server-side
// so it can set Referer/Origin headers and keep the browser request same-origin.
// HLTB requires a two-step handshake: fetch a short-lived token from /api/bleed/init,
// then POST the search to /api/bleed with that token in the headers + payload.
//
// Best-effort by design: any failure returns { hours: null } so the app simply
// falls back to manual length entry. If HLTB changes their scheme and this breaks,
// nothing else is affected.

const BASE = "https://howlongtobeat.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface InitResp {
  token: string;
  hpKey: string;
  hpVal: string;
}
interface HltbGame {
  game_name: string;
  comp_main: number; // main story (seconds)
  comp_plus: number; // main + extras (seconds)
  comp_100: number; // completionist (seconds)
}

interface HltbTimes {
  main: number | null;
  mainExtra: number | null;
  completionist: number | null;
}

const EMPTY: HltbTimes = { main: null, mainExtra: null, completionist: null };

function commonHeaders(): Record<string, string> {
  return { "User-Agent": UA, Referer: `${BASE}/`, Origin: BASE };
}

async function lookupTimes(title: string): Promise<HltbTimes> {
  const signal = AbortSignal.timeout(8000);

  const init = (await (
    await fetch(`${BASE}/api/bleed/init?t=${Date.now()}`, {
      headers: commonHeaders(),
      signal,
    })
  ).json()) as InitResp;

  const payload: Record<string, unknown> = {
    searchType: "games",
    searchTerms: title.trim().split(/\s+/),
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: "",
        sortCategory: "popular",
        rangeCategory: "main",
        rangeTime: { min: null, max: null },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        rangeYear: { min: "", max: "" },
        modifier: "",
      },
      users: { sortCategory: "postcount" },
      lists: { sortCategory: "follows" },
      filter: "",
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };
  payload[init.hpKey] = init.hpVal;

  const res = await fetch(`${BASE}/api/bleed`, {
    method: "POST",
    headers: {
      ...commonHeaders(),
      "Content-Type": "application/json",
      "x-auth-token": init.token,
      "x-hp-key": init.hpKey,
      "x-hp-val": init.hpVal,
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) return EMPTY;

  const data = (await res.json()) as { data?: HltbGame[] };
  const games = data.data ?? [];
  const best =
    games.find((g) => g.comp_main > 0 || g.comp_plus > 0 || g.comp_100 > 0) ?? games[0];
  if (!best) return EMPTY;
  const toHours = (s?: number) => (s && s > 0 ? Math.round(s / 3600) : null);
  return {
    main: toHours(best.comp_main),
    mainExtra: toHours(best.comp_plus),
    completionist: toHours(best.comp_100),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const title =
    typeof req.query.title === "string" ? req.query.title.trim() : undefined;

  // Cache in the browser (1d) and at Vercel's edge (7d) so repeat titles —
  // across all users — don't re-hit HLTB.
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  try {
    res.status(200).json(await lookupTimes(title));
  } catch {
    res.status(200).json(EMPTY);
  }
}
