// Custom game lists (issue d6fee1a8): the pure types and logic behind the
// Lists workspace — ranked, blurb-annotated collections referencing shared
// catalog identity (rawg/catalog id, both optional) with title+cover snapshots,
// organised into owner-private folders. Everything here is DOM/Supabase-free so
// the folder rollups, identity matching and RPC row coercion are unit-tested;
// the store and components stay thin.

import type { Game, GameMeta } from "../types";

export type ListVisibility = "private" | "unlisted" | "public";

export interface GameListFolder {
  id: string;
  name: string;
  sort: number;
  createdAt: number;
}

/** One list on a shelf (workspace grid or profile module) — counts and cover
 *  previews, no items. folderId is only present on your own lists. */
export interface GameListSummary {
  id: string;
  folderId: string | null;
  title: string;
  description: string;
  visibility: ListVisibility;
  itemCount: number;
  /** Up to 4 item covers, rank order — the shelf card's collage. */
  preview: string[];
  createdAt: number;
  updatedAt: number;
}

export interface GameListItem {
  id: string;
  rawgId?: number;
  catalogId?: string;
  title: string;
  image?: string;
  blurb: string;
  rank: number;
}

/** A full list as the routed page renders it (owner or shared link). */
export interface GameListDetail {
  id: string;
  userId: string;
  ownerName: string | null;
  ownerAvatar: string | null;
  title: string;
  description: string;
  visibility: ListVisibility;
  createdAt: number;
  updatedAt: number;
  items: GameListItem[];
}

const VISIBILITIES = new Set<string>(["private", "unlisted", "public"]);

function coerceVisibility(v: unknown): ListVisibility {
  return VISIBILITIES.has(String(v)) ? (v as ListVisibility) : "private";
}

function ts(v: unknown): number {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/* ── RPC row coercion ─────────────────────────────────────────────────────── */

/** A list_user_game_lists row → summary. Defensive like the store's other
 *  coercers: bad shapes degrade to safe defaults rather than throwing. */
export function coerceListSummary(r: Record<string, unknown>): GameListSummary {
  const preview = Array.isArray(r.preview)
    ? (r.preview as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return {
    id: String(r.id),
    folderId: r.folder_id ? String(r.folder_id) : null,
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    visibility: coerceVisibility(r.visibility),
    itemCount: Number(r.item_count) || 0,
    preview,
    createdAt: ts(r.created_at),
    updatedAt: ts(r.updated_at),
  };
}

/** A get_game_list row → detail, items parsed from the aggregated jsonb and
 *  re-sorted by rank (belt and braces — the server already orders them). */
export function coerceListDetail(r: Record<string, unknown>): GameListDetail {
  const rawItems = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
  const items = rawItems
    .map((i): GameListItem => ({
      id: String(i.id),
      rawgId: typeof i.rawg_id === "number" ? i.rawg_id : undefined,
      catalogId: i.catalog_id ? String(i.catalog_id) : undefined,
      title: String(i.title ?? ""),
      image: typeof i.image === "string" && i.image ? i.image : undefined,
      blurb: String(i.blurb ?? ""),
      rank: Number(i.rank) || 0,
    }))
    .sort((a, b) => a.rank - b.rank);
  return {
    id: String(r.id),
    userId: String(r.user_id),
    ownerName: r.owner_name ? String(r.owner_name) : null,
    ownerAvatar: r.owner_avatar ? String(r.owner_avatar) : null,
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    visibility: coerceVisibility(r.visibility),
    createdAt: ts(r.created_at),
    updatedAt: ts(r.updated_at),
    items,
  };
}

export function coerceListFolder(r: Record<string, unknown>): GameListFolder {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    sort: Number(r.sort) || 0,
    createdAt: ts(r.created_at),
  };
}

/* ── Folder rollups (the directory sidebar) ───────────────────────────────── */

/** Lists per folder id (null = unfiled), for the sidebar's count badges. */
export function folderCounts(lists: GameListSummary[]): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  for (const l of lists) counts.set(l.folderId, (counts.get(l.folderId) ?? 0) + 1);
  return counts;
}

/** The lists shown for a sidebar selection: null = "All Lists". */
export function listsInFolder(
  lists: GameListSummary[],
  folderId: string | null,
): GameListSummary[] {
  if (folderId === null) return lists;
  return lists.filter((l) => l.folderId === folderId);
}

/* ── Identity matching ────────────────────────────────────────────────────── */

type CatalogRef = Pick<GameMeta, "rawgId" | "catalogId" | "title">;

/** Whether the list already holds this game — the same shared-identity match
 *  the rest of the app uses (rawg id, else catalog id), with a case-insensitive
 *  title fallback for snapshot-only entries (custom games have no shared id). */
export function listHasGame(items: GameListItem[], meta: CatalogRef): boolean {
  return items.some((i) => {
    if (meta.rawgId != null && i.rawgId != null) return i.rawgId === meta.rawgId;
    if (meta.catalogId && i.catalogId) return i.catalogId === meta.catalogId;
    return i.title.trim().toLowerCase() === meta.title.trim().toLowerCase();
  });
}

/** The viewer's own library instance of a list entry (any owned board), for
 *  the "in your library" badge. Prefers identity matches; snapshot-only items
 *  fall back to the title. */
export function ownedListGame(games: Game[], item: GameListItem): Game | undefined {
  const owned = games.filter((g) => g.status !== "wishlist");
  if (item.rawgId != null) {
    const hit = owned.find((g) => g.rawgId === item.rawgId);
    if (hit) return hit;
  }
  if (item.catalogId) {
    const hit = owned.find((g) => g.catalogId === item.catalogId);
    if (hit) return hit;
  }
  const t = item.title.trim().toLowerCase();
  return owned.find((g) => g.title.trim().toLowerCase() === t);
}

/* ── Ordering ─────────────────────────────────────────────────────────────── */

/** The rank a newly added item takes (append to the end, 1-based). */
export function nextRank(items: GameListItem[]): number {
  return items.reduce((max, i) => Math.max(max, i.rank), 0) + 1;
}

/** Re-rank a full item array to match its order (1-based, gap-free) — what a
 *  drag-reorder persists via reorder_game_list. */
export function rerank(items: GameListItem[]): GameListItem[] {
  return items.map((i, idx) => ({ ...i, rank: idx + 1 }));
}

/* ── Presentation ─────────────────────────────────────────────────────────── */

export const VISIBILITY_META: Record<
  ListVisibility,
  { label: string; blurb: string }
> = {
  private: { label: "Private", blurb: "Only you can see this list." },
  unlisted: { label: "Unlisted", blurb: "Anyone with the link can view it." },
  public: { label: "Public", blurb: "Shown on your profile for anyone who drops by." },
};
