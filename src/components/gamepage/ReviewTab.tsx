import { useState } from "react";
import { Star, StarHalf, PenLine, X } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { REVIEW_MAX, clampScore, formatScore } from "../../lib/reviews";
import { StarRating } from "../StarRating";

/** "Leave a Review": your long-form take on a game plus a half-star score —
 *  distinct from the progress note (that's "where I left off"; this is "what I
 *  think"). The score saves the moment it's tapped; the write-up saves on
 *  blur. Visitors get the read-only variant when a review exists. */
export function ReviewTab({ game, readOnly = false }: { game: Game; readOnly?: boolean }) {
  if (readOnly) return <ReadOnlyReview game={game} />;
  return <ReviewEditor game={game} />;
}

function ReviewEditor({ game }: { game: Game }) {
  const setGameReview = useStore((s) => s.setGameReview);
  const [score, setScore] = useState<number | null>(clampScore(game.reviewScore ?? null));
  const [text, setText] = useState(game.review ?? "");

  const pick = (next: number | null) => {
    setScore(next);
    void setGameReview(game.id, text, next);
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
          <Star size={15} className="text-accent" /> Your score
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <StarPicker value={score} onPick={pick} />
          <span className="text-sm text-muted">
            {score ? `${formatScore(score)} / 5` : "Tap a star — halves count"}
          </span>
          {score != null && (
            <button
              onClick={() => pick(null)}
              className="inline-flex items-center gap-1 text-[11px] text-subtle underline-offset-2 transition hover:text-ink hover:underline"
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-line pt-4">
        <label className="inline-flex items-center gap-1.5 text-sm font-medium text-ink" htmlFor="review-text">
          <PenLine size={15} className="text-accent" /> Your review
        </label>
        <textarea
          id="review-text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, REVIEW_MAX))}
          onBlur={() => void setGameReview(game.id, text, score)}
          rows={8}
          maxLength={REVIEW_MAX}
          placeholder="What did you think? Favorite moments, gripes, who you'd recommend it to — or just document the journey…"
          className="w-full resize-y rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
        <div className="flex items-center justify-between text-[11px] text-subtle">
          <span>Saves when you click away. Visitors to your Bazaar can read it.</span>
          <span>
            {text.length}/{REVIEW_MAX}
          </span>
        </div>
      </div>
    </section>
  );
}

/** Five stars, each split into a left (half) and right (full) tap zone. */
function StarPicker({ value, onPick }: { value: number | null; onPick: (v: number) => void }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const halfUnits = i * 2 + 1; // score after tapping this star's left half
        const fullUnits = i * 2 + 2; // …and its right half
        const filled = v - i * 2; // 2+ full, 1 half, else empty
        return (
          <span key={i} className="relative inline-flex h-7 w-7">
            <Star
              size={28}
              className={filled >= 2 ? "text-accent" : "text-subtle/60"}
              fill={filled >= 2 ? "currentColor" : "none"}
            />
            {filled === 1 && (
              <StarHalf size={28} className="absolute inset-0 text-accent" fill="currentColor" />
            )}
            <button
              type="button"
              aria-label={`Rate ${formatScore(halfUnits)} stars`}
              onClick={() => onPick(halfUnits)}
              className="absolute inset-y-0 left-0 w-1/2 rounded-l-md focus-visible:ring-2 focus-visible:ring-brand/50"
            />
            <button
              type="button"
              aria-label={`Rate ${formatScore(fullUnits)} stars`}
              onClick={() => onPick(fullUnits)}
              className="absolute inset-y-0 right-0 w-1/2 rounded-r-md focus-visible:ring-2 focus-visible:ring-brand/50"
            />
          </span>
        );
      })}
    </div>
  );
}

function ReadOnlyReview({ game }: { game: Game }) {
  const score = clampScore(game.reviewScore ?? null);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
          <Star size={15} className="text-accent" /> Their review
        </span>
        {score != null && (
          <>
            <StarRating score={score} />
            <span className="text-sm text-muted">{formatScore(score)} / 5</span>
          </>
        )}
        {game.reviewedAt && (
          <span className="text-[11px] text-subtle">
            {new Date(game.reviewedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      {game.review?.trim() ? (
        <p className="whitespace-pre-wrap break-words text-sm text-muted">{game.review}</p>
      ) : (
        <p className="text-sm text-subtle">Scored, no write-up.</p>
      )}
    </section>
  );
}
