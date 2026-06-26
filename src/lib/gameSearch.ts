import type { GameMeta } from "../types";
import { searchGames } from "./gamedata";
import { applyCatalogOverride, type CatalogOverride } from "./submissions";

/** Order suggestions by how well their title matches the query: exact match
 *  first, then prefix, then substring, then the rest — with a stable tiebreak so
 *  the providers' existing order is otherwise preserved. Without this, community
 *  catalog matches (appended after the RAWG results) always sank to the bottom,
 *  even when one was an exact match. */
export function sortByRelevance<T extends { title: string }>(list: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const rank = (title: string): number => {
    const t = title.trim().toLowerCase();
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (t.includes(q)) return 2;
    return 3;
  };
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rank(a.item.title) - rank(b.item.title) || a.i - b.i)
    .map((x) => x.item);
}

/** Store-backed lookups the search pipeline needs: the community-catalog search
 *  and the batch override fetch. Both are cloud-only and return empties offline. */
export interface CatalogSearchDeps {
  searchCatalogGames: (query: string) => Promise<GameMeta[]>;
  fetchCatalogOverrides: (rawgIds: number[]) => Promise<Record<number, CatalogOverride>>;
}

/** The shared game-suggestion pipeline used by every search box (Add Game, the
 *  compilation rows, …). It:
 *   1. searches RAWG/Wikidata for the query,
 *   2. enriches those results with approved catalog edits (title, cover, length,
 *      …) so a renamed or re-covered game shows its *current* details — not the
 *      stale provider data,
 *   3. folds in community-added catalog games (deduped against the RAWG results
 *      by id and title), and
 *   4. sorts by relevance.
 *  Centralizing this keeps every entry point consistent — previously the
 *  compilation rows skipped the override step and showed stale covers/lengths.
 *  Each provider call is guarded so one failing source still returns the others. */
export async function searchGameSuggestions(
  query: string,
  deps: CatalogSearchDeps,
): Promise<GameMeta[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const [enriched, community] = await Promise.all([
    (async () => {
      const found = await searchGames(q).catch(() => [] as GameMeta[]);
      const ids = [
        ...new Set(found.map((r) => r.rawgId).filter((x): x is number => typeof x === "number")),
      ];
      const overrides: Record<number, CatalogOverride> = ids.length
        ? await deps.fetchCatalogOverrides(ids).catch(() => ({}))
        : {};
      return found.map((r) =>
        r.rawgId && overrides[r.rawgId] ? applyCatalogOverride(r, overrides[r.rawgId]) : r,
      );
    })(),
    deps.searchCatalogGames(q).catch(() => [] as GameMeta[]),
  ]);
  const seenRawg = new Set(enriched.map((r) => r.rawgId).filter(Boolean));
  const seenTitle = new Set(enriched.map((r) => r.title.toLowerCase()));
  const extra = community.filter(
    (c) => !(c.rawgId && seenRawg.has(c.rawgId)) && !seenTitle.has(c.title.toLowerCase()),
  );
  return sortByRelevance([...enriched, ...extra], q);
}
