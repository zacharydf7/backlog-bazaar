// The game page's Community tab: every player's review of one game, served by
// the list_game_reviews RPC (matched by shared catalog identity — rawg_id or
// catalog_id). Pure coercion/labeling here so the feed logic is unit-tested
// offline; the store action and tab component stay thin.

import type { GameStatus } from "../types";
import { clampScore } from "./reviews";
import { finishTagLabel, coerceFinishTag, type FinishTag } from "./finishTags";

/** One player's review row, as the Community feed renders it. */
export interface CommunityReview {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  review: string; // "" when they only left a score
  score: number | null; // 1–10 half-star scale, like games.review_score
  status: GameStatus;
  finishTag: FinishTag | null;
  platforms: string[];
  reviewedAt: string | null; // ISO timestamp; null for legacy rows
}

const STATUSES: GameStatus[] = ["backlog", "playing", "finished", "wishlist"];

/** Coerce one RPC row into a CommunityReview; null when it's malformed or has
 *  nothing to show (mirrors the server's has-something-reviewable filter). */
export function coerceCommunityReview(row: Record<string, unknown>): CommunityReview | null {
  if (typeof row.user_id !== "string") return null;
  const review = typeof row.review === "string" ? row.review.trim() : "";
  const score = clampScore(typeof row.score === "number" ? row.score : null);
  if (!review && score == null) return null;
  const status = STATUSES.includes(row.status as GameStatus)
    ? (row.status as GameStatus)
    : "backlog";
  return {
    userId: row.user_id,
    displayName:
      typeof row.display_name === "string" && row.display_name.trim()
        ? row.display_name
        : "Someone",
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    review,
    score,
    status,
    finishTag: coerceFinishTag(row.finish_tag),
    platforms: Array.isArray(row.platforms)
      ? row.platforms.filter((p): p is string => typeof p === "string" && p.trim() !== "")
      : [],
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
  };
}

/** The reviewer's relationship with the game, for the status dot — a finished
 *  game reads by HOW it concluded (untagged finished ⇒ Beaten, the same
 *  convention as the profile's platform bars). */
export function reviewStatusLabel(status: GameStatus, finishTag: string | null): string {
  if (status === "finished") return finishTagLabel(coerceFinishTag(finishTag)) || "Beaten";
  if (status === "playing") return "Now Playing";
  if (status === "wishlist") return "Wishlisted";
  return "In their Bazaar";
}

/** Absolute date for a review row, e.g. "Jun 27, 2026" ("" when unknown). */
export function reviewDateLabel(reviewedAt: string | null): string {
  if (!reviewedAt) return "";
  const d = new Date(reviewedAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
