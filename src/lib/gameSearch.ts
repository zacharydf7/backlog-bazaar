import type { GameMeta } from "../types";
import { searchGames } from "./gamedata";
import { applyCatalogOverride, type CatalogOverride } from "./submissions";

/** The 4-digit release year of a game, or "" when unknown/unparseable. */
function releaseYear(released?: string): string {
  if (!released) return "";
  const y = new Date(released).getFullYear();
  return Number.isNaN(y) ? "" : String(y);
}

/** Numeric release timestamp for ordering (Infinity when unknown, so dateless
 *  entries sort last among same-named twins rather than jumping to the front). */
function releaseTime(released?: string): number {
  if (!released) return Infinity;
  const t = Date.parse(released);
  return Number.isNaN(t) ? Infinity : t;
}

/** Order suggestions by how well their title matches the query: exact match
 *  first, then prefix, then substring, then the rest. The tiebreak is the
 *  providers' existing order, EXCEPT that two results sharing an identical title
 *  (a reboot/remake/legacy game by the same name) order by release date, oldest
 *  first — so both are shown and are easy to tell apart. Without the rank pass,
 *  community catalog matches (appended after the RAWG results) always sank to the
 *  bottom even when one was an exact match. */
export function sortByRelevance<T extends { title: string; released?: string }>(
  list: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const rank = (title: string): number => {
    const t = title.trim().toLowerCase();
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (t.includes(q)) return 2;
    return 3;
  };
  const norm = (title: string) => title.trim().toLowerCase();
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const byRank = rank(a.item.title) - rank(b.item.title);
      if (byRank) return byRank;
      // Same relevance AND the exact same title → order same-named games by
      // release date (oldest first); everything else keeps provider order.
      if (norm(a.item.title) === norm(b.item.title)) {
        const byDate = releaseTime(a.item.released) - releaseTime(b.item.released);
        if (byDate) return byDate;
      }
      return a.i - b.i;
    })
    .map((x) => x.item);
}

/** Store-backed lookups the search pipeline needs: the community-catalog search
 *  and the batch override fetch. Both are cloud-only and return empties offline. */
export interface CatalogSearchDeps {
  searchCatalogGames: (query: string) => Promise<GameMeta[]>;
  fetchCatalogOverrides: (ids: { rawgIds?: number[]; igdbIds?: number[] }) => Promise<{
    byRawg: Record<number, CatalogOverride>;
    byIgdb: Record<number, CatalogOverride>;
  }>;
}

/** What a suggestion search produced: the merged list, plus whether every
 *  external game-data provider failed. `providerDown` exists so a UI never tells
 *  the user "no matches found" when the truth is "we couldn't ask" — that
 *  conflation is what made a provider outage look like missing games. */
export interface GameSuggestions {
  results: GameMeta[];
  providerDown: boolean;
}

/** Shown when every game-data provider is unreachable. Callers append their own
 *  "you can still…" escape hatch. */
export const PROVIDER_DOWN_MESSAGE = "The game database is unreachable right now.";

/** The shared game-suggestion pipeline used by every search box (Add Game, the
 *  compilation rows, …). It:
 *   1. searches the provider chain (IGDB/RAWG/Wikidata) for the query,
 *   2. enriches those results with approved catalog edits (title, cover, length,
 *      …) so a renamed or re-covered game shows its *current* details — not the
 *      stale provider data,
 *   3. folds in community-added catalog games (deduped against the provider
 *      results by id and title), and
 *   4. sorts by relevance.
 *  Centralizing this keeps every entry point consistent — previously the
 *  compilation rows skipped the override step and showed stale covers/lengths.
 *  Each source is guarded so one failing side still returns the other: an
 *  external outage still yields the community catalog's games (flagged with
 *  `providerDown`), and a cloud hiccup still yields the provider's. */
export async function searchGameSuggestions(
  query: string,
  deps: CatalogSearchDeps,
): Promise<GameSuggestions> {
  const q = query.trim();
  if (q.length < 2) return { results: [], providerDown: false };
  const [external, community] = await Promise.all([
    (async () => {
      let providerDown = false;
      const found = await searchGames(q).catch(() => {
        providerDown = true;
        return [] as GameMeta[];
      });
      const rawgIds = [
        ...new Set(found.map((r) => r.rawgId).filter((x): x is number => typeof x === "number")),
      ];
      const igdbIds = [
        ...new Set(found.map((r) => r.igdbId).filter((x): x is number => typeof x === "number")),
      ];
      const none: Awaited<ReturnType<CatalogSearchDeps["fetchCatalogOverrides"]>> = {
        byRawg: {},
        byIgdb: {},
      };
      const overrides =
        rawgIds.length || igdbIds.length
          ? await deps.fetchCatalogOverrides({ rawgIds, igdbIds }).catch(() => none)
          : none;
      const enriched = found.map((r) => {
        const c =
          (r.rawgId != null ? overrides.byRawg[r.rawgId] : undefined) ??
          (r.igdbId != null ? overrides.byIgdb[r.igdbId] : undefined) ??
          null;
        return c ? applyCatalogOverride(r, c) : r;
      });
      return { enriched, providerDown };
    })(),
    deps.searchCatalogGames(q).catch(() => [] as GameMeta[]),
  ]);
  const { enriched, providerDown } = external;
  // Dedupe community games against the provider results by id (either id space),
  // and by title+year so a true duplicate (the same game also in the community
  // catalog) is dropped — but two distinct games sharing a name and released in
  // different years (a reboot or remake) BOTH survive, so neither disappears
  // from the results.
  const titleYearKey = (g: GameMeta) => g.title.trim().toLowerCase() + "|" + releaseYear(g.released);
  const seenRawg = new Set(enriched.map((r) => r.rawgId).filter(Boolean));
  const seenIgdb = new Set(enriched.map((r) => r.igdbId).filter(Boolean));
  const seenTitleYear = new Set(enriched.map(titleYearKey));
  const extra = community.filter(
    (c) =>
      !(c.rawgId && seenRawg.has(c.rawgId)) &&
      !(c.igdbId && seenIgdb.has(c.igdbId)) &&
      !seenTitleYear.has(titleYearKey(c)),
  );
  return { results: sortByRelevance([...enriched, ...extra], q), providerDown };
}
