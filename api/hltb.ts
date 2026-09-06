import type { VercelRequest, VercelResponse } from "@vercel/node";

// Serverless proxy for HowLongToBeat's (unofficial) search API. Runs server-side
// so it can set Referer/Origin headers and keep the browser request same-origin.
// HLTB requires a two-step handshake: fetch a short-lived token from an init
// endpoint, then POST the search to its sibling with that token in the headers
// + payload. The endpoint PAIR moves every few months (search → find → seek →
// bleed → search/site…), so the known pairs are tried first and, when they all
// 404, the current one is scraped out of HLTB's own page bundle (the same way
// the community scrapers keep up) and remembered for the life of the instance.
//
// Best-effort by design: any failure returns { hours: null } so the app simply
// falls back to manual length entry. If HLTB changes their scheme and this breaks,
// nothing else is affected.

const BASE = "https://howlongtobeat.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** An init + search endpoint pair (paths relative to BASE). */
interface Endpoints {
  init: string;
  search: string;
}

/** Newest first. The current pair (2026-09) plus the previous generation, so
 *  a rollback on their side keeps working without a deploy on ours. */
const KNOWN_ENDPOINTS: Endpoints[] = [
  { init: "/api/search/site/init", search: "/api/search/site" },
  { init: "/api/bleed/init", search: "/api/bleed" },
];

/** Endpoints discovered from HLTB's bundle, kept per warm instance. */
let discovered: { endpoints: Endpoints; at: number } | null = null;
const DISCOVERY_TTL = 6 * 60 * 60 * 1000;

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

/** Signals that an endpoint pair is gone (404) rather than the lookup merely
 *  finding nothing — the cue to try the next pair. */
class EndpointGone extends Error {}

async function initToken(endpoints: Endpoints, signal: AbortSignal): Promise<InitResp> {
  const res = await fetch(`${BASE}${endpoints.init}?t=${Date.now()}`, {
    headers: commonHeaders(),
    signal,
  });
  if (res.status === 404) throw new EndpointGone(endpoints.init);
  if (!res.ok) throw new Error(`init ${res.status}`);
  const body = (await res.json()) as Partial<InitResp>;
  if (!body.token || !body.hpKey) throw new Error("init shape");
  return { token: body.token, hpKey: body.hpKey, hpVal: body.hpVal ?? "" };
}

async function searchWith(
  endpoints: Endpoints,
  title: string,
  signal: AbortSignal,
): Promise<HltbTimes> {
  const init = await initToken(endpoints, signal);

  // Mirrors the site's own search payload (its defaults for a plain query).
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
        year: { mode: "include", values: [] },
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

  const res = await fetch(`${BASE}${endpoints.search}`, {
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
  if (res.status === 404) throw new EndpointGone(endpoints.search);
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

/** Find the live endpoint pair inside HLTB's page bundle: the search context
 *  fetches `<init>?t=${Date.now()}` and POSTs to a sibling path with the
 *  x-auth-token header. Exported for the unit test. */
export function extractEndpoints(source: string): Endpoints | null {
  const init = /["'`](\/api\/[\w/-]+\/init)\?t=/.exec(source)?.[1];
  const search = /fetch\(["'`](\/api\/[\w/-]+)["'`],\{method:"POST",headers:\{"Content-Type":"application\/json","x-auth-token"/.exec(
    source,
  )?.[1];
  if (!init || !search) return null;
  return { init, search };
}

async function discoverEndpoints(signal: AbortSignal): Promise<Endpoints | null> {
  const home = await (await fetch(`${BASE}/`, { headers: commonHeaders(), signal })).text();
  const chunks = [...new Set(home.match(/\/_next\/static\/chunks\/[^"']+\.js/g) ?? [])];
  // Scan chunks in parallel and take the first that carries the handshake.
  const found = await Promise.all(
    chunks.map(async (path) => {
      try {
        const js = await (await fetch(`${BASE}${path}`, { headers: commonHeaders(), signal })).text();
        return extractEndpoints(js);
      } catch {
        return null;
      }
    }),
  );
  return found.find((e): e is Endpoints => e != null) ?? null;
}

async function lookupTimes(title: string): Promise<HltbTimes> {
  const signal = AbortSignal.timeout(8000);
  const candidates: Endpoints[] = [];
  if (discovered && Date.now() - discovered.at < DISCOVERY_TTL) candidates.push(discovered.endpoints);
  candidates.push(...KNOWN_ENDPOINTS);

  for (const endpoints of candidates) {
    try {
      return await searchWith(endpoints, title, signal);
    } catch (e) {
      if (!(e instanceof EndpointGone)) throw e;
    }
  }
  // Every known pair is gone: learn the current one from the site itself.
  const live = await discoverEndpoints(signal);
  if (!live) return EMPTY;
  discovered = { endpoints: live, at: Date.now() };
  return await searchWith(live, title, signal);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const title =
    typeof req.query.title === "string" ? req.query.title.trim() : undefined;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  let times = EMPTY;
  try {
    times = await lookupTimes(title);
  } catch {
    times = EMPTY;
  }
  const found = times.main != null || times.mainExtra != null || times.completionist != null;
  // A hit is stable: cache in the browser (1d) and at Vercel's edge (7d) so
  // repeat titles — across all users — don't re-hit HLTB. A miss is NOT: it
  // may be an outage on their side, so keep it short (5m / 1h) rather than
  // pinning a blank for a week.
  res.setHeader(
    "Cache-Control",
    found ? "public, max-age=86400, s-maxage=604800" : "public, max-age=300, s-maxage=3600",
  );
  res.status(200).json(times);
}
