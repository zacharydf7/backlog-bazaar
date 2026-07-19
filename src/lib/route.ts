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
  "profile",
  "lists",
  "master-ledger",
  "transaction-ledger",
  "leaderboard",
  "shop",
  "achievements",
  "requests",
  "account",
  "admin",
  "users",
  "slots",
  "economy",
  "submissions",
  "catalog",
  "taxonomy",
  "reports",
  "stats",
  "roles",
  "mysubmissions",
  "whatsnew",
  "about",
  "privacy",
];

const VIEW_SET = new Set<string>(VIEWS);

export type Route =
  | { kind: "view"; view: View }
  | { kind: "visit"; userId: string }
  | { kind: "game"; gameId: string }
  | { kind: "visitGame"; userId: string; gameId: string }
  // A collapsed compilation's own page. Owner-only: visits never render
  // collapsed parents (the boards get an empty compilations list), so there is
  // no "#u/<id>/c/<id>" variant.
  | { kind: "compilation"; compilationId: string }
  // A custom game list's page — also the share URL for public/unlisted lists,
  // so it needs no owner context in the hash (the server gates access).
  | { kind: "list"; listId: string };

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
    const rest = raw.slice(2);
    // A game inside a visit: "u/<userId>/g/<gameId>". A missing game id
    // degrades to the plain visit; a missing user id can't anchor anything.
    const sep = rest.indexOf("/g/");
    if (sep >= 0) {
      const userId = rest.slice(0, sep);
      const gameId = rest.slice(sep + 3);
      if (userId && gameId) return { kind: "visitGame", userId, gameId };
      return userId ? { kind: "visit", userId } : HOME;
    }
    return rest ? { kind: "visit", userId: rest } : HOME;
  }
  if (raw.startsWith("g/")) {
    const gameId = raw.slice(2);
    return gameId ? { kind: "game", gameId } : HOME;
  }
  if (raw.startsWith("c/")) {
    const compilationId = raw.slice(2);
    return compilationId ? { kind: "compilation", compilationId } : HOME;
  }
  if (raw.startsWith("l/")) {
    const listId = raw.slice(2);
    return listId ? { kind: "list", listId } : HOME;
  }
  const view = raw.split(/[/?#]/)[0];
  return VIEW_SET.has(view) ? { kind: "view", view: view as View } : HOME;
}

/** The hash for a Route, including the leading "#". Home is "" (no hash). */
export function routeToHash(route: Route): string {
  if (route.kind === "visit") return `#u/${route.userId}`;
  if (route.kind === "game") return `#g/${route.gameId}`;
  if (route.kind === "visitGame") return `#u/${route.userId}/g/${route.gameId}`;
  if (route.kind === "compilation") return `#c/${route.compilationId}`;
  if (route.kind === "list") return `#l/${route.listId}`;
  return route.view === "backlog" ? "" : `#${route.view}`;
}

/** The hash that opens a game's page — in your own library, or inside the
 *  Bazaar you're visiting when `visitUserId` is set. Open sites navigate by
 *  assigning this to `location.hash`; the hashchange listener does the rest. */
export function gameHash(gameId: string, visitUserId?: string | null): string {
  return routeToHash(
    visitUserId ? { kind: "visitGame", userId: visitUserId, gameId } : { kind: "game", gameId },
  );
}

/** The hash that opens a collapsed compilation's own page (owner-only). */
export function compilationHash(compilationId: string): string {
  return routeToHash({ kind: "compilation", compilationId });
}

/** The hash that opens a custom list's page — also its share link. */
export function listHash(listId: string): string {
  return routeToHash({ kind: "list", listId });
}

/** True when a *different* account has just signed in, compared to the last one
 *  seen. Used to send the user to the home board on an account switch — but NOT on
 *  the first sign-in of a session (prev === null), so a reload or deep-link still
 *  restores the saved page. A signed-out gap (next === null) is never a switch. */
export function isAccountSwitch(prev: string | null, next: string | null): boolean {
  return next != null && prev != null && prev !== next;
}
