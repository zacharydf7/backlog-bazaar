// Custom game lists (issue d6fee1a8): the pure types and logic behind the
// Lists workspace — ranked, blurb-annotated collections referencing shared
// catalog identity (rawg/catalog id, both optional) with title+cover snapshots,
// organised into owner-private folders. Everything here is DOM/Supabase-free so
// the folder rollups, identity matching and RPC row coercion are unit-tested;
// the store and components stay thin.

import type { Game, GameMeta } from "../types";
import { applyCatalogOverride, type CatalogOverride } from "./submissions";
import { catalogKey } from "./ownershipMerge";

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
  /** 'contributor' when the list is shared WITH you (issue b2059a55). */
  role: "owner" | "contributor";
  /** The owner's name, set only on lists shared with you. */
  ownerName: string | null;
  /** Accepted contributors — > 0 drives the shared badge. */
  contributorCount: number;
}

export interface GameListItem {
  id: string;
  rawgId?: number;
  igdbId?: number;
  catalogId?: string;
  title: string;
  image?: string;
  blurb: string;
  rank: number;
  // Collaboration (issue b2059a55): who added it (undefined = the owner or a
  // pre-collaboration entry) and the pending-removal flag a contributor set.
  addedBy?: string;
  addedByName?: string;
  addedByAvatar?: string;
  removalRequestedBy?: string;
  removalRequestedByName?: string;
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
    role: r.role === "contributor" ? "contributor" : "owner",
    ownerName: typeof r.owner_name === "string" && r.owner_name ? r.owner_name : null,
    contributorCount: Number(r.contributor_count) || 0,
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
      igdbId: typeof i.igdb_id === "number" ? i.igdb_id : undefined,
      catalogId: i.catalog_id ? String(i.catalog_id) : undefined,
      title: String(i.title ?? ""),
      image: typeof i.image === "string" && i.image ? i.image : undefined,
      blurb: String(i.blurb ?? ""),
      rank: Number(i.rank) || 0,
      addedBy: i.added_by ? String(i.added_by) : undefined,
      addedByName: typeof i.added_by_name === "string" ? i.added_by_name : undefined,
      addedByAvatar: typeof i.added_by_avatar === "string" ? i.added_by_avatar : undefined,
      removalRequestedBy: i.removal_requested_by ? String(i.removal_requested_by) : undefined,
      removalRequestedByName:
        typeof i.removal_requested_by_name === "string" ? i.removal_requested_by_name : undefined,
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

type CatalogRef = Pick<GameMeta, "rawgId" | "igdbId" | "catalogId" | "title">;

/** Whether the list already holds this game — the shared-identity match the
 *  rest of the app uses (catalogKey: rawg, else igdb with the provider
 *  crosswalk applied, else catalog id), with a case-insensitive title fallback
 *  for snapshot-only entries (custom games have no shared id). */
export function listHasGame(items: GameListItem[], meta: CatalogRef): boolean {
  const key = catalogKey(meta);
  return items.some((i) => {
    const itemKey = catalogKey(i);
    if (key != null && itemKey != null) return itemKey === key;
    return i.title.trim().toLowerCase() === meta.title.trim().toLowerCase();
  });
}

/** The first game in `pool` that is the same title as this entry — shared
 *  catalog identity (catalogKey, crosswalk-aware, so an IGDB item matches a
 *  RAWG-era copy and vice versa), else a case-insensitive title match for
 *  snapshot-only entries (custom games carry no shared id). */
function matchByIdentity(pool: Game[], item: GameListItem): Game | undefined {
  const key = catalogKey(item);
  if (key != null) {
    const hit = pool.find((g) => catalogKey(g) === key);
    if (hit) return hit;
  }
  const t = item.title.trim().toLowerCase();
  return pool.find((g) => g.title.trim().toLowerCase() === t);
}

/** The viewer's own library instance of a list entry (any owned board), for
 *  the "in your library" badge. A wishlist want is not "in your library", so
 *  those are ignored here — use `listGamePage` for navigation. */
export function ownedListGame(games: Game[], item: GameListItem): Game | undefined {
  return matchByIdentity(
    games.filter((g) => g.status !== "wishlist"),
    item,
  );
}

/** The game whose page a list entry should open: your owned copy when you have
 *  one, otherwise a wishlist row for the same title. Wishlist wants have a real,
 *  editable page too — gating the tap on `ownedListGame` left every entry in a
 *  wishlist-built list dead (issue 86d274d1). Undefined when the entry names a
 *  game you don't hold at all: there is no page then, so the tap offers to add
 *  it instead (see `listItemMeta`). */
export function listGamePage(games: Game[], item: GameListItem): Game | undefined {
  return ownedListGame(games, item) ?? matchByIdentity(games, item);
}

/** A list entry as game metadata — the shared identity and cover snapshot it
 *  carries, overlaid with the game's approved catalog record when one was
 *  fetched (title, art, length, release, genres, platforms). */
export function listItemMeta(item: GameListItem, catalog?: CatalogOverride | null): GameMeta {
  return applyCatalogOverride(
    {
      rawgId: item.rawgId,
      igdbId: item.igdbId,
      catalogId: item.catalogId,
      title: item.title,
      image: item.image,
      genres: [],
    },
    catalog ?? null,
  );
}

/** A list entry as a stand-in Game, so an entry you don't hold can be shown in
 *  the same look-only card you get for a game on someone else's page. Lists are
 *  built from the whole catalog, so most entries name a game nobody in view
 *  owns — a grail list is nothing but those — and before this they were simply
 *  inert (issue 86d274d1).
 *
 *  Nothing owns this record: it never reaches the database, so its id is a local
 *  stand-in, and it carries no copies, no playtime and no real status. Wishlist
 *  is the honest placeholder — you don't have it — and renders nothing of its
 *  own in the card, which is all catalog data plus the way to make it yours. */
export function listItemPreviewGame(item: GameListItem, catalog?: CatalogOverride | null): Game {
  return {
    ...listItemMeta(item, catalog),
    id: `list-item:${item.id}`,
    status: "wishlist",
    addedAt: 0,
    copies: [],
  };
}

/* ── Collaboration (issue b2059a55) ───────────────────────────────────────── */

/** A row of list_list_members: the owner plus invited contributors. */
export interface ListMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  status: "pending" | "accepted";
  isOwner: boolean;
}

export function coerceListMember(r: Record<string, unknown>): ListMember | null {
  if (typeof r.user_id !== "string") return null;
  const status = r.status === "pending" ? "pending" : r.status === "accepted" ? "accepted" : null;
  if (!status) return null;
  return {
    userId: r.user_id,
    displayName: String(r.display_name ?? ""),
    avatarUrl: typeof r.avatar_url === "string" ? r.avatar_url : null,
    status,
    isOwner: Boolean(r.is_owner),
  };
}

/** One List Activity ledger row (list_list_activity). */
export interface ListActivityEvent {
  id: string;
  action: string;
  actor: string | null;
  actorName: string | null;
  actorAvatar: string | null;
  detail: Record<string, unknown>;
  createdAt: number;
}

export function coerceListActivity(r: Record<string, unknown>): ListActivityEvent | null {
  if (typeof r.id !== "string" || typeof r.action !== "string") return null;
  return {
    id: r.id,
    action: r.action,
    actor: r.actor ? String(r.actor) : null,
    actorName: typeof r.actor_name === "string" ? r.actor_name : null,
    actorAvatar: typeof r.actor_avatar === "string" ? r.actor_avatar : null,
    detail:
      r.detail && typeof r.detail === "object" ? (r.detail as Record<string, unknown>) : {},
    createdAt: ts(r.created_at),
  };
}

export type ListRole = "owner" | "contributor" | "viewer";

/** The viewer's role on a list page. Owner beats membership; an accepted
 *  member is a contributor; everyone else (pending invitees included) views. */
export function listRole(
  detail: Pick<GameListDetail, "userId">,
  userId: string | null,
  members: ListMember[],
): ListRole {
  if (!userId) return "viewer";
  if (detail.userId === userId) return "owner";
  return members.some((m) => !m.isOwner && m.userId === userId && m.status === "accepted")
    ? "contributor"
    : "viewer";
}

/** A contributor asked for this entry's removal and the owner hasn't ruled. */
export function isPendingRemoval(item: GameListItem): boolean {
  return item.removalRequestedBy != null;
}

/** Human line for a ledger row — who did what, with the game/member named. */
export function listActivityLabel(e: ListActivityEvent): string {
  const who = e.actorName ?? "Someone";
  const title = typeof e.detail.title === "string" ? e.detail.title : "a game";
  switch (e.action) {
    case "created":
      return `${who} created the list`;
    case "renamed":
      return `${who} renamed the list to “${String(e.detail.to ?? "")}”`;
    case "visibility_changed":
      return `${who} made the list ${String(e.detail.to ?? "different")}`;
    case "item_added":
      return `${who} added ${title}`;
    case "item_removed":
      return `${who} removed ${title}`;
    case "member_invited":
      return `${who} invited a contributor`;
    case "member_accepted":
      return `${who} joined as a contributor`;
    case "member_declined":
      return `${who} declined the invite`;
    case "member_removed":
      return `${who} removed a contributor`;
    case "member_left":
      return `${who} left the list`;
    case "removal_requested":
      return `${who} asked to remove ${title}`;
    case "removal_approved":
      return `${who} approved removing ${title}`;
    case "removal_denied":
      return `${who} kept ${title} (removal denied)`;
    case "deleted":
      return `${who} deleted the list`;
    default:
      return `${who} · ${e.action}`;
  }
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
