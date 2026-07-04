import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import {
  reviewDateLabel,
  reviewStatusLabel,
  type CommunityReview,
} from "../../lib/communityReviews";
import { formatScore } from "../../lib/reviews";
import { StarRating } from "../StarRating";
import { Avatar } from "../Avatar";
import { PlatformBadge } from "../PlatformBadge";

/** The Community tab: every player's review of this game (matched by shared
 *  catalog identity via the list_game_reviews RPC), newest first — the
 *  aggregation counterpart to the personal Review tab. Read-only by design;
 *  your own opinion is written on the Review tab and simply appears here like
 *  everyone else's. */
export function CommunityTab({ game }: { game: Game }) {
  const fetchGameReviews = useStore((s) => s.fetchGameReviews);
  const userId = useStore((s) => s.userId);
  const [reviews, setReviews] = useState<CommunityReview[] | null>(null);

  useEffect(() => {
    let active = true;
    void fetchGameReviews({ rawgId: game.rawgId, catalogId: game.catalogId }).then((rows) => {
      if (active) setReviews(rows);
    });
    return () => {
      active = false;
    };
  }, [game.rawgId, game.catalogId, fetchGameReviews]);

  if (reviews == null) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">
        Loading reviews…
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
        <Users size={22} className="mx-auto mb-2 text-subtle" aria-hidden />
        <p className="font-display text-lg text-ink">No reviews yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          No player has reviewed this game so far. Reviews written on the Review tab show up
          here for everyone.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[11px] text-subtle">
        {reviews.length} review{reviews.length === 1 ? "" : "s"} from the community, newest
        first.
      </p>
      {reviews.map((r) => (
        <ReviewRow key={r.userId} review={r} isYou={r.userId === userId} />
      ))}
    </div>
  );
}

function ReviewRow({ review: r, isYou }: { review: CommunityReview; isYou: boolean }) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar url={r.avatarUrl} name={r.displayName} size={36} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-ink">{r.displayName}</span>
              {isYou && (
                <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  You
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {r.score != null && (
                <span
                  className="inline-flex items-center gap-1"
                  title={`${formatScore(r.score)} out of 5 stars`}
                >
                  <StarRating score={r.score} size={13} />
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                <span
                  aria-hidden
                  className={
                    "h-1.5 w-1.5 rounded-full " +
                    (r.status === "finished"
                      ? "bg-success"
                      : r.status === "playing"
                        ? "bg-accent"
                        : "bg-subtle")
                  }
                />
                {reviewStatusLabel(r.status, r.finishTag)}
              </span>
              {r.platforms.map((p) => (
                <PlatformBadge key={p} label={p} />
              ))}
            </div>
          </div>
        </div>
        {r.reviewedAt && (
          <span className="shrink-0 text-[11px] text-subtle">{reviewDateLabel(r.reviewedAt)}</span>
        )}
      </div>
      {r.review && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{r.review}</p>
      )}
    </article>
  );
}
