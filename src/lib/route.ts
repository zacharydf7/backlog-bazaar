// Hash-based routing: the current page otherwise lives only in React state, so
// the browser Back button and a refresh both lose it. We mirror the page into
// `location.hash` (e.g. "#leaderboard", "#u/<id>" for a visit) so Back walks
// pages and a reload restores where you were. Pure helpers here so the parsing
// is unit-tested without the DOM; the effects that read/write history live in App.

import type { View } from "../components/Sidebar";

// Pages that can appear in the URL. The slug is the View id for stability;
// "backlog" is home and uses an empty hash to keep the root URL clean.
const VIEWS: View[] = [
  "backlog",
  "playing",
  "finished",
  "wishlist",
  "market",
  "ledger",
  "leaderboard",
  "requests",
  "account",
  "users",
  "economy",
  "whatsnew",
  "about",
];

const VIEW_SET = new Set<string>(VIEWS);

export type Route =
  | { kind: "view"; view: View }
  | { kind: "visit"; userId: string };

export const HOME: Route = { kind: "view", view: "backlog" };

/** Drop the leading "#" (and optional "/") from a location.hash value. */
function stripHash(hash: string): string {
  return hash.replace(/^#\/?/, "");
}

/** Parse a `location.hash` into a Route. Unknown values — including Supabase's
 *  OAuth callback hash (`#access_token=…`) — fall back to home so nothing breaks. */
export function parseHash(hash: string): Route {
  const raw = stripHash(hash);
  if (!raw) return HOME;
  if (raw.startsWith("u/")) {
    const userId = raw.slice(2);
    return userId ? { kind: "visit", userId } : HOME;
  }
  const view = raw.split(/[/?#]/)[0];
  return VIEW_SET.has(view) ? { kind: "view", view: view as View } : HOME;
}

/** The hash for a Route, including the leading "#". Home is "" (no hash). */
export function routeToHash(route: Route): string {
  if (route.kind === "visit") return `#u/${route.userId}`;
  return route.view === "backlog" ? "" : `#${route.view}`;
}
