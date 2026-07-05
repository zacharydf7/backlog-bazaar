// The game page's Community Stats panel: anonymous community-wide aggregates
// served by the community_game_stats RPC (matched by shared catalog identity).
// Pure coercion + presentation helpers here so the panel logic is unit-tested
// offline; the store action and tab component stay thin.

/** One game's community aggregates. Counts are whole numbers; avg/hoursAvg are
 *  null when there's nothing to average. `dist` maps a half-star unit (1–10) to
 *  how many ratings landed there. */
export interface CommunityStats {
  owners: number; // distinct players who OWN it (any non-wishlist status)
  playing: number;
  backlog: number;
  finished: number;
  wishlist: number;
  reviewCount: number; // written reviews (with text)
  ratingCount: number; // reviews carrying a score
  avgHalfStars: number | null; // mean score in half-star units (1–10)
  hoursTotal: number;
  hoursAvg: number | null; // mean over rows that logged time
  dist: Record<number, number>; // half-star unit → count
  likes: number; // distinct players who currently like/favorite it
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerce the single RPC row (bigints/numerics may arrive as strings; jsonb as
 *  an object) into typed stats. Tolerant: a null/missing row yields all-zero
 *  stats so the panel never crashes. */
export function coerceCommunityStats(row: Record<string, unknown> | null | undefined): CommunityStats {
  const r = row ?? {};
  const distRaw =
    r.dist && typeof r.dist === "object" ? (r.dist as Record<string, unknown>) : {};
  const dist: Record<number, number> = {};
  for (let unit = 1; unit <= 10; unit++) {
    const c = num(distRaw[String(unit)], 0);
    if (c > 0) dist[unit] = c;
  }
  return {
    owners: num(r.owners),
    playing: num(r.playing),
    backlog: num(r.backlog),
    finished: num(r.finished),
    wishlist: num(r.wishlist),
    reviewCount: num(r.review_count),
    ratingCount: num(r.rating_count),
    avgHalfStars: numOrNull(r.avg_score),
    hoursTotal: num(r.hours_total),
    hoursAvg: numOrNull(r.hours_avg),
    dist,
    likes: num(r.likes),
  };
}

/** Whether there's anything worth showing — nobody owning, wishlisting or
 *  rating the game means the panel stays hidden. */
export function hasCommunityData(s: CommunityStats): boolean {
  return s.owners > 0 || s.wishlist > 0 || s.ratingCount > 0;
}

/** One player in the who-liked-this list (the clickable count's modal). */
export interface GameLiker {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  likedAt: number; // ms epoch
}

/** Page size for the likers modal — a full page back means older ones remain. */
export const LIKERS_PAGE = 30;

/** Coerce raw `list_game_likers` rows, dropping malformed entries. */
export function coerceGameLikers(rows: unknown): GameLiker[] {
  if (!Array.isArray(rows)) return [];
  const out: GameLiker[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.user_id !== "string") continue;
    out.push({
      userId: r.user_id,
      displayName: typeof r.display_name === "string" && r.display_name ? r.display_name : "Player",
      avatarUrl: typeof r.avatar_url === "string" ? r.avatar_url : null,
      likedAt: typeof r.liked_at === "string" ? Date.parse(r.liked_at) : 0,
    });
  }
  return out;
}

/** The average score as a one-decimal star number, e.g. "4.2" — always a
 *  decimal so it reads as an average (unlike a single score). */
export function formatAvgScore(avgHalfStars: number): string {
  return (avgHalfStars / 2).toFixed(1);
}

/** One bar in the rating histogram: a half-star unit, its count, and its height
 *  as a percentage of the tallest bar (so the shape is legible even for small
 *  samples). Always ten bars, units 1–10, left (½★) to right (5★). */
export interface DistBar {
  unit: number;
  count: number;
  pct: number;
}

export function distributionBars(dist: Record<number, number>): DistBar[] {
  const counts = Array.from({ length: 10 }, (_, i) => dist[i + 1] ?? 0);
  const max = Math.max(1, ...counts);
  return counts.map((count, i) => ({
    unit: i + 1,
    count,
    pct: (count / max) * 100,
  }));
}

/** A whole-hour count as "420h"; an average keeps one decimal ("12.5h"). */
export function formatHours(hours: number, decimals = false): string {
  return `${decimals ? Math.round(hours * 10) / 10 : Math.round(hours)}h`;
}
