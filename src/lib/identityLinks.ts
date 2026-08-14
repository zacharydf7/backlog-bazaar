// The RAWG ↔ IGDB crosswalk, admin side. RAWG and IGDB number the same game
// differently and neither knows the other's ids, so a copy added before the
// 2026-08 provider switch and the same game added after it would otherwise look
// like two unrelated games — no co-op pact between friends who both own it, no
// shared dedup, two trending entries. The server matches titles and links the
// unambiguous pairs on its own (see sync_game_identity_links); anything a title
// alone can't settle lands here as a suggestion for a human.
//
// Pure helpers — the crosswalk itself is server-authoritative
// (game_identity_links + the definer RPCs).

export type IdentityLinkStatus = "linked" | "suggested" | "dismissed";

export interface IdentityLink {
  id: string;
  rawgId: number;
  igdbId: number;
  /** The normalized title the pair was matched on. */
  titleKey: string;
  status: IdentityLinkStatus;
  /** 'auto' = the matcher decided it, 'admin' = a human did. */
  source: "auto" | "admin";
  decidedByName: string | null;
  decidedAt: number | null;
  createdAt: number;
  /** How each side is titled/dated in the catalog — what tells Doom 1993 from
   *  Doom 2016. Null when nothing in the shared data names that id. */
  rawgTitle: string | null;
  rawgReleased: string | null;
  igdbTitle: string | null;
  igdbReleased: string | null;
  /** Copies across the site wearing either id — the blast radius of the call. */
  copyCount: number;
}

export interface IdentityLinkRow {
  id: string;
  rawg_id: number;
  igdb_id: number;
  title_key: string | null;
  status: string;
  source: string;
  decided_by: string | null;
  decided_name: string | null;
  decided_at: string | null;
  created_at: string;
  rawg_title: string | null;
  rawg_released: string | null;
  igdb_title: string | null;
  igdb_released: string | null;
  copy_count: number | null;
}

const STATUSES: IdentityLinkStatus[] = ["linked", "suggested", "dismissed"];

export function rowToIdentityLink(r: IdentityLinkRow): IdentityLink {
  return {
    id: r.id,
    rawgId: r.rawg_id,
    igdbId: r.igdb_id,
    titleKey: r.title_key ?? "",
    status: STATUSES.includes(r.status as IdentityLinkStatus)
      ? (r.status as IdentityLinkStatus)
      : "suggested",
    source: r.source === "admin" ? "admin" : "auto",
    decidedByName: r.decided_name,
    decidedAt: r.decided_at ? Date.parse(r.decided_at) : null,
    createdAt: r.created_at ? Date.parse(r.created_at) : 0,
    rawgTitle: r.rawg_title,
    rawgReleased: r.rawg_released,
    igdbTitle: r.igdb_title,
    igdbReleased: r.igdb_released,
    copyCount: typeof r.copy_count === "number" ? r.copy_count : 0,
  };
}

/** The year an ISO date names, or null. */
export function releaseYear(released: string | null): number | null {
  if (!released) return null;
  const year = Number(released.slice(0, 4));
  return Number.isFinite(year) && year > 1900 ? year : null;
}

/** Whether the two sides carry different release years — the loudest hint that
 *  a title match caught two different games (Doom 1993 vs Doom 2016). Not proof
 *  either way: providers date remasters and regional releases differently, so
 *  this flags a pair for a closer look rather than condemning it. */
export function yearsDisagree(link: IdentityLink): boolean {
  const a = releaseYear(link.rawgReleased);
  const b = releaseYear(link.igdbReleased);
  return a != null && b != null && a !== b;
}

/** One line naming a side of the pair: its title and year as that provider
 *  records them, falling back to the matched title when a side is unnamed. */
export function sideLabel(title: string | null, released: string | null, fallback: string): string {
  const year = releaseYear(released);
  const name = title?.trim() || fallback || "Untitled";
  return year != null ? `${name} (${year})` : name;
}

/** Open candidates first (they need a decision), then live links, then the
 *  dismissed ones; newest first inside each group. */
export function sortForReview(links: IdentityLink[]): IdentityLink[] {
  const rank: Record<IdentityLinkStatus, number> = { suggested: 0, linked: 1, dismissed: 2 };
  return [...links].sort(
    (a, b) => rank[a.status] - rank[b.status] || b.createdAt - a.createdAt,
  );
}

/** How many pairs are still waiting on a human — drives the tab's badge. */
export function pendingCount(links: IdentityLink[]): number {
  return links.filter((l) => l.status === "suggested").length;
}
