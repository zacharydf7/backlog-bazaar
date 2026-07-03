import { Star, StarHalf } from "lucide-react";
import { starParts, formatScore, clampScore } from "../lib/reviews";

/** A read-only row of five stars for a half-star score (1–10 units). The
 *  filled glyphs ride `text-accent` so a profile's custom accent tints them. */
export function StarRating({ score, size = 16 }: { score: number | null | undefined; size?: number }) {
  const parts = starParts(score ?? null);
  const v = clampScore(score ?? null);
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={v ? `${formatScore(v)} out of 5 stars` : "Not rated"}
    >
      {parts.map((p, i) => (
        <span key={i} className="relative inline-flex" style={{ width: size, height: size }}>
          <Star
            size={size}
            className={p === "full" ? "text-accent" : "text-subtle/60"}
            fill={p === "full" ? "currentColor" : "none"}
          />
          {p === "half" && (
            <StarHalf
              size={size}
              className="absolute inset-0 text-accent"
              fill="currentColor"
            />
          )}
        </span>
      ))}
    </span>
  );
}

/** The at-a-glance score pill (game-page hero, finished cards): ★ 4.5. */
export function ScoreChip({ score, className = "" }: { score: number; className?: string }) {
  const v = clampScore(score);
  if (!v) return null;
  return (
    <span
      title={`${formatScore(v)} out of 5 stars`}
      className={
        "inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted " +
        className
      }
    >
      <Star size={10} className="text-accent" fill="currentColor" />
      {formatScore(v)}
    </span>
  );
}
