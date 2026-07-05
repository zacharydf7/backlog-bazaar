import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Users, Gamepad2, Store, Heart, ThumbsUp, Trophy, Clock, MessageSquare, Star, X } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import {
  reviewDateLabel,
  reviewStatusLabel,
  type CommunityReview,
} from "../../lib/communityReviews";
import {
  hasCommunityData,
  formatAvgScore,
  distributionBars,
  formatHours,
  LIKERS_PAGE,
  type CommunityStats,
  type GameLiker,
} from "../../lib/communityStats";
import { formatScore } from "../../lib/reviews";
import { useScrollLock } from "../../lib/useScrollLock";
import { StarRating } from "../StarRating";
import { Avatar } from "../Avatar";
import { PlatformBadge } from "../PlatformBadge";

/** The Community tab: the game's community-wide stats (owners by status,
 *  ratings + distribution, hours logged) up top, then every player's review
 *  (matched by shared catalog identity), newest first. Read-only by design;
 *  your own opinion is written on the Review tab and simply appears here like
 *  everyone else's. */
export function CommunityTab({ game }: { game: Game }) {
  const fetchGameReviews = useStore((s) => s.fetchGameReviews);
  const fetchCommunityStats = useStore((s) => s.fetchCommunityStats);
  const userId = useStore((s) => s.userId);
  const [reviews, setReviews] = useState<CommunityReview[] | null>(null);
  const [stats, setStats] = useState<CommunityStats | null>(null);

  useEffect(() => {
    let active = true;
    const ref = { rawgId: game.rawgId, catalogId: game.catalogId };
    void fetchGameReviews(ref).then((rows) => active && setReviews(rows));
    void fetchCommunityStats(ref).then((s) => active && setStats(s));
    return () => {
      active = false;
    };
  }, [game.rawgId, game.catalogId, fetchGameReviews, fetchCommunityStats]);

  if (reviews == null) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">
        Loading community…
      </div>
    );
  }

  const showStats = stats != null && hasCommunityData(stats);

  return (
    <div className="flex flex-col gap-3">
      {showStats && <CommunityStatsPanel stats={stats} game={game} />}
      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
          <Users size={22} className="mx-auto mb-2 text-subtle" aria-hidden />
          <p className="font-display text-lg text-ink">No reviews yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {showStats
              ? "Nobody's written a review yet. Share yours from the Review tab."
              : "No player has reviewed this game so far. Reviews written on the Review tab show up here for everyone."}
          </p>
        </div>
      ) : (
        <>
          <p className="px-1 text-[11px] text-subtle">
            {reviews.length} review{reviews.length === 1 ? "" : "s"} from the community, newest
            first.
          </p>
          {reviews.map((r) => (
            <ReviewRow key={r.userId} review={r} isYou={r.userId === userId} />
          ))}
        </>
      )}
    </div>
  );
}

/** The community stats panel: a rating-distribution histogram + average, the
 *  owner breakdown by status, and hours logged across everyone who has the
 *  game. Aggregates are anonymous — except Likes, whose count opens the
 *  who-liked-this list (likes are public taste, like reviews). */
function CommunityStatsPanel({ stats, game }: { stats: CommunityStats; game: Game }) {
  const bars = distributionBars(stats.dist);
  const [likersOpen, setLikersOpen] = useState(false);
  return (
    <section
      data-testid="community-stats"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4"
    >
      {/* Ratings: histogram + the headline average. */}
      <div className="flex items-end justify-between gap-4">
        {stats.ratingCount > 0 ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex h-16 items-end gap-1">
              {bars.map((b) => (
                <span
                  key={b.unit}
                  title={`${b.count} rating${b.count === 1 ? "" : "s"} at ${b.unit / 2}★`}
                  className="flex-1 rounded-t-sm bg-accent/80"
                  style={{ height: `${Math.max(b.pct, b.count > 0 ? 8 : 2)}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-subtle">
              <span>½★</span>
              <span>5★</span>
            </div>
          </div>
        ) : (
          <p className="flex-1 text-xs text-subtle">No ratings yet.</p>
        )}
        {stats.avgHalfStars != null && (
          <div className="flex shrink-0 flex-col items-center leading-none">
            <span className="text-[10px] uppercase tracking-wide text-subtle">Avg rating</span>
            <span className="font-display text-3xl text-ink">{formatAvgScore(stats.avgHalfStars)}</span>
            <StarRating score={Math.round(stats.avgHalfStars)} size={13} />
          </div>
        )}
      </div>

      {/* At-a-glance counts. The Likes chip opens the who-liked-this list. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip icon={Users} label="Owners" value={stats.owners} />
        <StatChip
          icon={ThumbsUp}
          label={stats.likes === 1 ? "Like" : "Likes"}
          value={stats.likes}
          onClick={stats.likes > 0 ? () => setLikersOpen(true) : undefined}
        />
        <StatChip icon={MessageSquare} label={stats.reviewCount === 1 ? "Review" : "Reviews"} value={stats.reviewCount} />
        <StatChip icon={Star} label={stats.ratingCount === 1 ? "Rating" : "Ratings"} value={stats.ratingCount} />
      </div>

      {likersOpen &&
        createPortal(
          <LikersModal game={game} total={stats.likes} onClose={() => setLikersOpen(false)} />,
          document.body,
        )}

      {/* Where everyone stands with it. */}
      <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
        <StatRow icon={Gamepad2} label="Now Playing" value={stats.playing} />
        <StatRow icon={Store} label="In the Bazaar" value={stats.backlog} />
        <StatRow icon={Trophy} label="Finished" value={stats.finished} />
        <StatRow icon={Heart} label="Wishlisted" value={stats.wishlist} />
      </div>

      {/* Time played across the community. */}
      {stats.hoursTotal > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-panel px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Clock size={14} className="text-accent" /> {formatHours(stats.hoursTotal)} logged
          </span>
          {stats.hoursAvg != null && (
            <span className="text-subtle">· {formatHours(stats.hoursAvg, true)} average</span>
          )}
        </div>
      )}
    </section>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  /** Makes the chip interactive (e.g. Likes → who-liked-this list). */
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="font-display text-xl text-ink">{value}</span>
      <span className="inline-flex items-center gap-1 text-[11px] text-muted">
        <Icon size={12} className="text-accent" /> {label}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`See who — ${value} ${label.toLowerCase()}`}
        className="flex flex-col items-center gap-0.5 rounded-xl border border-line bg-panel py-2.5 transition hover:border-brand/50"
      >
        {body}
      </button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border border-line bg-panel py-2.5">
      {body}
    </div>
  );
}

/** Who liked this game: a paginated list of players (public taste, like
 *  reviews — the server already excludes private profiles and private copies).
 *  Each row opens that player's Bazaar. */
function LikersModal({
  game,
  total,
  onClose,
}: {
  game: Game;
  total: number;
  onClose: () => void;
}) {
  const fetchGameLikers = useStore((s) => s.fetchGameLikers);
  const [likers, setLikers] = useState<GameLiker[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  useScrollLock(true);

  const loadPage = (offset: number) => {
    void fetchGameLikers({ rawgId: game.rawgId, catalogId: game.catalogId }, offset).then(
      (page) => {
        setLikers((prev) => {
          const seen = new Set(prev.map((l) => l.userId));
          return [...prev, ...page.filter((l) => !seen.has(l.userId))];
        });
        setHasMore(page.length === LIKERS_PAGE);
        setLoading(false);
      },
    );
  };
  useEffect(() => {
    loadPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-line p-4">
          {/* The full game title matters here — wrap instead of truncating. */}
          <h3 className="inline-flex min-w-0 items-start gap-2 font-display text-lg text-ink">
            <ThumbsUp size={16} className="mt-1 shrink-0 fill-current text-accent" />
            <span className="min-w-0 break-words">
              {total} {total === 1 ? "player likes" : "players like"} {game.title}
            </span>
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Loading…</p>
          ) : likers.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">
              Only private profiles so far.
            </p>
          ) : (
            <>
              {likers.map((l) => (
                <button
                  key={l.userId}
                  type="button"
                  onClick={() => {
                    onClose();
                    window.location.hash = `#u/${l.userId}`;
                  }}
                  title={`Visit ${l.displayName}'s Bazaar`}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition hover:bg-panel"
                >
                  <Avatar url={l.avatarUrl} name={l.displayName} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {l.displayName}
                  </span>
                </button>
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => loadPage(likers.length)}
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-muted transition hover:bg-panel hover:text-ink"
                >
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-2 text-muted">
        <Icon size={14} className="text-accent/80" /> {label}
      </span>
      <span className="font-medium tabular-nums text-ink">{value}</span>
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
                {reviewStatusLabel(r.status, r.finishTag, r.inRotation)}
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
