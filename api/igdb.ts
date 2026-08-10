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

// Everything the search box needs in ONE query — unlike RAWG, IGDB returns
// developers (involved_companies) and age ratings inline, so there is no
// second "details" round-trip per game. `version_parent = null` drops the
// Collector's/GOTY edition entries that would otherwise clutter results.
const SEARCH_FIELDS =
  "fields name,first_release_date,rating,aggregated_rating,cover.url," +
  "genres.name,platforms.name," +
  "involved_companies.developer,involved_companies.company.name," +
  "age_ratings.organization.name,age_ratings.rating_category.rating;";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(503).json({ error: "IGDB is not configured." });
    return;
  }

  const op = typeof req.query.op === "string" ? req.query.op : undefined;
  if (op !== "search") {
    res.status(400).json({ error: "Unknown op." });
    return;
  }

  const q = sanitizeTerm(typeof req.query.q === "string" ? req.query.q : "");
  if (!q) {
    res.status(400).json({ error: "q is required" });
    return;
  }

  try {
    const games = await igdbQuery(
      "games",
      `search "${q}"; ${SEARCH_FIELDS} where version_parent = null; limit 10;`,
    );
    // Cache in the browser (1d) and at Vercel's edge (7d, keyed per query
    // string) — matches the client-side search cache TTL, and repeat searches
    // across all users never re-hit IGDB's 4 req/s shared credential limit.
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.status(200).json(games);
  } catch {
    res.status(502).json({ error: "IGDB is unreachable." });
  }
}
