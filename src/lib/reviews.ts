// Player reviews: one long-form write-up + star score per game (distinct from
// the progress note). Scores are stored in HALF-STAR UNITS — an integer 1–10
// mapping to 0.5–5 stars — so the DB check stays a simple int range and no
// float rounding ever creeps in. Pure (no React/DOM) so it's directly tested.

/** Max review length (kept in sync with the games_review_len DB check). */
export const REVIEW_MAX = 8000;

/** Score bounds, in half-star units (1 = ½ star … 10 = 5 stars). */
export const SCORE_MIN = 1;
export const SCORE_MAX = 10;

/** Clamp a raw value to a valid stored score: an integer 1–10, else null
 *  (null/0/garbage all mean "no score"). */
export function clampScore(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const v = Math.round(value);
  if (v < SCORE_MIN || v > SCORE_MAX) return null;
  return v;
}

/** A score as its star number: "4.5", "3" — no trailing ".0". */
export function formatScore(halfStars: number): string {
  const stars = halfStars / 2;
  return Number.isInteger(stars) ? String(stars) : stars.toFixed(1);
}

export type StarPart = "full" | "half" | "empty";

/** The five star glyphs a score renders as, left to right. */
export function starParts(halfStars: number | null | undefined): StarPart[] {
  const v = clampScore(halfStars ?? null) ?? 0;
  return Array.from({ length: 5 }, (_, i) => {
    const filled = v - i * 2;
    return filled >= 2 ? "full" : filled === 1 ? "half" : "empty";
  });
}

/** Whether a game has anything reviewable to SHOW (drives the visitor-facing
 *  Review tab and the score chips). */
export function hasReview(g: { review?: string; reviewScore?: number }): boolean {
  return Boolean((g.review && g.review.trim()) || clampScore(g.reviewScore ?? null));
}
