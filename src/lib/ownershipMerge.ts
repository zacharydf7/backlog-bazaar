// Cross-instance identity and awareness. Every library record is its own
// independent instance — one card per record, with its own status, playtime and
// economy. Records are NEVER folded together: a game owned standalone and again
// inside a compilation renders as two cards (the bundle child keeps its badge
// and bundle-managed cost; the standalone keeps its own economy). What connects
// instances of the same game is purely informational: the shared catalog
// identity (catalogKey) and the "Cleared Elsewhere" marker, which tells you an
// unplayed copy has already been beaten on another instance without ever
// syncing status or coins across records.

import type { Game } from "../types";

// The RAWG ↔ IGDB crosswalk, mirrored from the server's game_identity_links
// (see supabase/schema.sql). RAWG and IGDB number the same game differently and
// neither provider knows the other's ids, so without this table a game bought
// before the 2026-08 provider switch and the same game bought after it look
// like two unrelated games. Keyed IGDB id → RAWG id: the RAWG spelling is the
// canonical one, matching game_identity_key server-side, so keys already
// persisted (pact identities, dismissed Caravan cards) stay valid.
//
// Module-level on purpose: this is catalog fact, not user state, and it has to
// reach every catalogKey() caller — grouping, routing, matching — without
// threading a parameter through all of them. The store loads it once at boot
// (fetchIdentityLinks) and tests set it directly.
let IGDB_TO_RAWG: ReadonlyMap<number, number> = new Map();
let RAWG_TO_IGDB: ReadonlyMap<number, number> = new Map();

/** Replace the crosswalk (store boot, sign-out, tests). */
export function setIdentityLinks(links: { rawgId: number; igdbId: number }[]): void {
  IGDB_TO_RAWG = new Map(links.map((l) => [l.igdbId, l.rawgId]));
  RAWG_TO_IGDB = new Map(links.map((l) => [l.rawgId, l.igdbId]));
}

/** Both provider spellings of one game's identity, crosswalk applied: each id
 *  filled from the link table when only the other axis is known. Lets catalog
 *  lookups reach a RAWG-keyed catalog row (with all its community edits) from
 *  an IGDB-sourced copy — and vice versa (issue d2309794). */
export function crosswalkedIds(ids: {
  rawgId?: number | null;
  igdbId?: number | null;
}): { rawgId: number | null; igdbId: number | null } {
  return {
    rawgId: ids.rawgId ?? (ids.igdbId != null ? (IGDB_TO_RAWG.get(ids.igdbId) ?? null) : null),
    igdbId: ids.igdbId ?? (ids.rawgId != null ? (RAWG_TO_IGDB.get(ids.rawgId) ?? null) : null),
  };
}

/** A game's shared catalog identity — the "same game in the dropdown". RAWG-backed
 *  games key on `rawgId`, IGDB-backed on `igdbId`, community games on `catalogId`.
 *  Returns null when none is set (a hand-typed custom game has no shared identity,
 *  so it never matches anything). The `r:`/`i:`/`c:` prefixes keep the id spaces
 *  from ever colliding (rawg and igdb ids are both small integers).
 *
 *  An IGDB id tied to a RAWG id by the crosswalk answers to the RAWG spelling,
 *  so both providers' copies of one game share a single key. */
export function catalogKey(game: Pick<Game, "rawgId" | "igdbId" | "catalogId">): string | null {
  if (game.rawgId != null) return "r:" + game.rawgId;
  if (game.igdbId != null) {
    const linked = IGDB_TO_RAWG.get(game.igdbId);
    return linked != null ? "r:" + linked : "i:" + game.igdbId;
  }
  if (game.catalogId) return "c:" + game.catalogId;
  return null;
}

/** The canonical spelling of an identity key that was stored earlier (a pact's
 *  gameKey, a dismissed Caravan card), so a key written before the two
 *  providers were linked still compares equal to today's. */
export function resolveIdentityKey(key: string): string {
  if (!key.startsWith("i:")) return key;
  const linked = IGDB_TO_RAWG.get(Number(key.slice(2)));
  return linked != null ? "r:" + linked : key;
}

/** Whether a finished record counts as a genuine clear for cross-instance
 *  awareness: beaten or 100%-completed (a legacy finish with no tag recorded
 *  counts as beaten). "Endless" is a live-service graduation, not a clear, and
 *  "retired" is an admitted non-clear. */
function isClear(game: Game): boolean {
  if (game.status !== "finished") return false;
  const tag = game.finishTag ?? "beaten";
  return tag === "beaten" || tag === "completed";
}

/** The other instance that already cleared this game, if any — drives the
 *  "Cleared Elsewhere" badge on an unplayed copy (backlog/wishlist), giving
 *  historical context without disrupting the copy's own status or bounty.
 *  Matches by shared catalog identity across every record (standalone and
 *  compilation children alike). Prefers a 100% completion over a plain beat,
 *  then the earliest finish, then the smallest id (stable). Strictly
 *  informational: callers must never sync state based on it. */
export function clearedElsewhere(games: Game[], game: Game): Game | null {
  if (game.status !== "backlog" && game.status !== "wishlist") return null;
  const key = catalogKey(game);
  if (!key) return null;
  const clears = games.filter((g) => g.id !== game.id && catalogKey(g) === key && isClear(g));
  if (clears.length === 0) return null;
  return clears.reduce((best, g) => {
    const bc = best.finishTag === "completed" ? 1 : 0;
    const gc = g.finishTag === "completed" ? 1 : 0;
    if (gc !== bc) return gc > bc ? g : best;
    const bt = best.finishedAt ?? Infinity;
    const gt = g.finishedAt ?? Infinity;
    if (gt !== bt) return gt < bt ? g : best;
    return g.id < best.id ? g : best;
  });
}
