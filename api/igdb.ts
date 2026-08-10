import type { VercelRequest, VercelResponse } from "@vercel/node";

// Serverless proxy for IGDB (igdb.com, Twitch's game database). IGDB blocks
// browser requests outright — no CORS, by design, so app credentials can't leak
// from a client bundle — so this proxy holds the Twitch credential server-side,
// performs the OAuth client-credentials handshake, and forwards a *fixed* set
// of queries. Mirrors the HowLongToBeat proxy (./hltb.ts) in shape.
//
// Security rules:
//  - The client never supplies an APIcalypse body. It picks a whitelisted `op`
//    and the query is built here — otherwise anyone could ride our credential
//    for arbitrary IGDB queries.
//  - The search term is sanitized before being interpolated into the query
//    (APIcalypse is a query language; quotes/semicolons are injection-shaped).
//
// Credentials are IGDB_CLIENT_ID / IGDB_CLIENT_SECRET — deliberately NOT
// VITE_-prefixed, so Vite can never inline them into the browser bundle. Get
// them by registering an app at https://dev.twitch.tv/console/apps.

const CLIENT_ID = process.env.IGDB_CLIENT_ID;
const CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

const TIMEOUT_MS = 8000;

// App access token, cached for the life of the lambda instance. Twitch tokens
// last ~60 days; the margin re-fetches before expiry, and a 401 (revoked early)
// forces a refresh below.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(force = false): Promise<string> {
  const now = Date.now();
  if (!force && cachedToken && cachedToken.expiresAt > now) return cachedToken.value;
  const url =
    "https://id.twitch.tv/oauth2/token" +
    `?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`;
  const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Twitch token request failed (${res.status}).`);
  const d = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: d.access_token, expiresAt: now + (d.expires_in - 60) * 1000 };
  return cachedToken.value;
}

function post(endpoint: string, body: string, token: string): Promise<Response> {
  return fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": CLIENT_ID as string,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function igdbQuery(endpoint: string, body: string): Promise<unknown> {
  let token = await getToken();
  let res = await post(endpoint, body, token);
  if (res.status === 401) {
    // Token revoked before its stated expiry — refresh once and retry.
    token = await getToken(true);
    res = await post(endpoint, body, token);
  }
  if (!res.ok) throw new Error(`IGDB request failed (${res.status}).`);
  return res.json();
}

/** Strip characters with meaning in APIcalypse (quotes end the search string,
 *  semicolons end the clause) so a search term can't smuggle in query syntax. */
function sanitizeTerm(raw: string): string {
  return raw.replace(/["\\;\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

// Everything the search box and the Caravan sections need in ONE query —
// unlike RAWG, IGDB returns developers (involved_companies) and age ratings
// inline, so there is no second "details" round-trip per game. Every op shares
// this list so all results map through the same client-side mapper.
const FIELDS =
  "fields name,first_release_date,rating,aggregated_rating,cover.url," +
  "genres.name,platforms.name," +
  "involved_companies.developer,involved_companies.company.name," +
  "age_ratings.organization.name,age_ratings.rating_category.rating;";

// --- The Caravan (discovery lists) ---------------------------------------

// Over-fetch each section so the client can drop games the player owns or has
// hidden and still fill its grid (mirrors the old RAWG SECTION_FETCH).
const LIST_LIMIT = 40;

// Shared list hygiene: no DLC/expansion children (parent_game), no edition
// re-releases (version_parent), no erotica (theme 42) — a discovery storefront
// shows base games.
const LIST_BASE = "themes != (42) & version_parent = null & parent_game = null";

/** A client-supplied id list ("6,48,130") reduced to verified integers, or null
 *  when nothing valid remains. Keeps interpolation injection-proof. */
function idList(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const ids = raw
    .split(",")
    .map((x) => Number.parseInt(x, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? ids.join(",") : null;
}

/** Build the APIcalypse body for one Caravan section. `platforms`/`genres` are
 *  pre-sanitized integer lists (IGDB ids) or null. */
function listQuery(
  section: string,
  platforms: string | null,
  genres: string | null,
): string | null {
  const withPlatforms = platforms ? ` & platforms = (${platforms})` : "";
  switch (section) {
    case "trending":
      // All-time popular, approximated by how many members rated the game
      // (IGDB's popularity endpoint needs a second round trip for no better
      // signal). Mirrors RAWG's ordering=-added.
      return (
        `${FIELDS} sort total_rating_count desc; ` +
        `where ${LIST_BASE} & total_rating_count > 20${withPlatforms}; limit ${LIST_LIMIT};`
      );
    case "new": {
      // Popular releases from the last 90 days, most-anticipated first (hypes =
      // pre-release follows, the closest analogue to RAWG's -added in-window).
      const now = Math.floor(Date.now() / 1000);
      const past = now - 60 * 60 * 24 * 90;
      return (
        `${FIELDS} sort hypes desc; ` +
        `where ${LIST_BASE} & first_release_date >= ${past} & first_release_date <= ${now}${withPlatforms}; ` +
        `limit ${LIST_LIMIT};`
      );
    }
    case "recommended": {
      // Highly-rated games, in the player's top genres when given (falls back
      // to top-rated overall — same shape as the RAWG version).
      const withGenres = genres ? ` & genres = (${genres})` : "";
      return (
        `${FIELDS} sort total_rating desc; ` +
        `where ${LIST_BASE} & total_rating >= 75 & total_rating_count >= 10${withGenres}${withPlatforms}; ` +
        `limit ${LIST_LIMIT};`
      );
    }
    default:
      return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(503).json({ error: "IGDB is not configured." });
    return;
  }

  const op = typeof req.query.op === "string" ? req.query.op : undefined;

  if (op === "search") {
    const q = sanitizeTerm(typeof req.query.q === "string" ? req.query.q : "");
    if (!q) {
      res.status(400).json({ error: "q is required" });
      return;
    }
    try {
      const games = await igdbQuery(
        "games",
        `search "${q}"; ${FIELDS} where version_parent = null; limit 10;`,
      );
      // Cache in the browser (1d) and at Vercel's edge (7d, keyed per query
      // string) — matches the client-side search cache TTL, and repeat searches
      // across all users never re-hit IGDB's 4 req/s shared credential limit.
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
      res.status(200).json(games);
    } catch {
      res.status(502).json({ error: "IGDB is unreachable." });
    }
    return;
  }

  if (op === "list") {
    const section = typeof req.query.section === "string" ? req.query.section : "";
    const body = listQuery(section, idList(req.query.platforms), idList(req.query.genres));
    if (!body) {
      res.status(400).json({ error: "Unknown section." });
      return;
    }
    try {
      const games = await igdbQuery("games", body);
      // Discovery lists move slowly — cache shorter in the browser (1h) and half
      // a day at the edge (the client also caches curated sections for 12h).
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=43200");
      res.status(200).json(games);
    } catch {
      res.status(502).json({ error: "IGDB is unreachable." });
    }
    return;
  }

  res.status(400).json({ error: "Unknown op." });
}
