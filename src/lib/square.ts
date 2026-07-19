// Pure helpers for the Market Square's Open Stalls directory — the community
// page that replaced the coin-ranked leaderboard. The directory reuses the
// leaderboard() RPC rows (LeaderboardRow in src/lib/supabase.ts); the split,
// ordering, and subtitle rules live here so the component stays thin and the
// behaviour is unit-tested offline.

import type { Badge } from "../types";
import { isOnline, lastSeenLabel } from "./presence";
import { clampScore } from "./reviews";

/** The row fields the directory helpers read — a structural subset of
 *  LeaderboardRow so tests can build tiny literals. */
export interface StallRow {
  displayName: string;
  gamesFinished: number;
  hoursFinished: number;
  lastSeenAt: number | null;
  activity: string | null;
}

/** How the "All stalls" list can be ordered. */
export type StallSort = "active" | "clears" | "name";

/** The sort control's options, in display order. */
export const STALL_SORTS: { key: StallSort; label: string }[] = [
  { key: "active", label: "Recently active" },
  { key: "clears", label: "Most clears" },
  { key: "name", label: "A–Z" },
];

function byName(a: StallRow, b: StallRow): number {
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
}

/** Partition the directory into the pinned "Open now" group (players whose
 *  heartbeat is inside the online window) and everyone else. The open group is
 *  ordered A–Z rather than by last-seen: heartbeats land every ~45s, so a
 *  recency order would reshuffle the rows under the reader on every poll. The
 *  rest keep their input order — the caller applies the user's chosen sort. */
export function splitOpenStalls<T extends StallRow>(
  rows: T[],
  now: number = Date.now(),
): { open: T[]; rest: T[] } {
  const open: T[] = [];
  const rest: T[] = [];
  for (const r of rows) (isOnline(r.lastSeenAt, now) ? open : rest).push(r);
  open.sort(byName);
  return { open, rest };
}

/** A copy of `rows` in the chosen order. Ties (and missing heartbeats) fall
 *  back to name order so the list is stable and deterministic. */
export function sortStalls<T extends StallRow>(rows: T[], sort: StallSort): T[] {
  const out = [...rows];
  switch (sort) {
    case "active":
      out.sort((a, b) => (b.lastSeenAt ?? -Infinity) - (a.lastSeenAt ?? -Infinity) || byName(a, b));
      break;
    case "clears":
      out.sort(
        (a, b) =>
          b.gamesFinished - a.gamesFinished || b.hoursFinished - a.hoursFinished || byName(a, b),
      );
      break;
    case "name":
      out.sort(byName);
      break;
  }
  return out;
}

/** What a stall row's subtitle shows, in priority order: the live activity line
 *  while online, else how recently they were around, else their all-time stats
 *  (players who have never pinged a heartbeat). `kind` drives styling — the
 *  live activity renders in the success colour. */
export function stallSubtitle(
  row: StallRow,
  now: number = Date.now(),
): { kind: "activity" | "seen" | "stats"; text: string } {
  if (isOnline(row.lastSeenAt, now) && row.activity) {
    return { kind: "activity", text: row.activity };
  }
  const seen = lastSeenLabel(row.lastSeenAt, now);
  if (seen) return { kind: "seen", text: seen };
  return {
    kind: "stats",
    text: `${row.gamesFinished} finished · ${row.hoursFinished}h played`,
  };
}

// ── Phase 2: community sections (Fresh Clears / Talk of the Bazaar / Stall of
// the Week). Coercion + presentation stay pure here; the RPCs live in
// supabase/schema.sql and the store actions stay thin.

/** One row of Talk of the Bazaar: a recent written review across the whole
 *  community, from the list_recent_reviews RPC. */
export interface SquareReview {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  gameTitle: string;
  rawgId: number | null;
  catalogId: string | null;
  review: string;
  score: number | null; // 1–10 half-star scale, like games.review_score
  reviewedAt: string | null; // ISO timestamp
}

/** Coerce one list_recent_reviews row, dropping malformed entries. */
export function coerceSquareReview(row: Record<string, unknown>): SquareReview | null {
  if (typeof row.user_id !== "string") return null;
  const title = typeof row.game_title === "string" ? row.game_title.trim() : "";
  const review = typeof row.review === "string" ? row.review.trim() : "";
  if (!title || !review) return null;
  return {
    userId: row.user_id,
    displayName:
      typeof row.display_name === "string" && row.display_name.trim()
        ? row.display_name
        : "Someone",
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    gameTitle: title,
    rawgId: typeof row.rawg_id === "number" ? row.rawg_id : null,
    catalogId: typeof row.catalog_id === "string" ? row.catalog_id : null,
    review,
    score: clampScore(typeof row.score === "number" ? row.score : null),
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
  };
}

/** The Stall of the Week: most distinct clears in the trailing 7 days. A
 *  celebration, not a ladder — the RPC returns at most one row. */
export interface SquareSpotlight {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  title: Badge | null;
  clears: number;
  lastTitle: string | null;
  lastAt: number | null; // ms epoch of the latest clear
}

/** Shorten a review body for the feed: cut at the last word boundary that
 *  keeps at least ~60% of `max`, with an ellipsis. Short bodies pass through. */
export function reviewSnippet(text: string, max = 240): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

/** A half-star score (1–10) as its star number: 7 → "3.5", 8 → "4". */
export function formatHalfStars(score: number): string {
  return (score / 2).toString();
}

/** Toggle a cheer on the event with this id: flips cheeredByMe and bumps the
 *  count, leaving every other row (and an already-matching row) untouched.
 *  Shared by the friends feed and the Square feed so an event appearing in
 *  both stays consistent. */
export function applyCheerToggle<
  T extends { id: string; cheeredByMe: boolean; cheerCount: number },
>(events: T[], eventId: string, on: boolean): T[] {
  return events.map((e) =>
    e.id === eventId && e.cheeredByMe !== on
      ? { ...e, cheeredByMe: on, cheerCount: Math.max(0, e.cheerCount + (on ? 1 : -1)) }
      : e,
  );
}

/** The viewer's own library row matching a review's catalog identity (rawg id
 *  first, then catalog id) — drives the "open it in your library" affordance.
 *  Any instance will do: the game page serves the whole title. */
export function findOwnedGameId(
  games: { id: string; rawgId?: number | null; catalogId?: string | null }[],
  rawgId: number | null,
  catalogId: string | null,
): string | null {
  const hit =
    (rawgId != null && games.find((g) => g.rawgId === rawgId)) ||
    (catalogId != null && games.find((g) => g.catalogId === catalogId)) ||
    null;
  return hit ? hit.id : null;
}
