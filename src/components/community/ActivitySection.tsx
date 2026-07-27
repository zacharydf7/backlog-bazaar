import { useEffect, useRef } from "react";
import { Loader2, Newspaper, PartyPopper, Users } from "lucide-react";
import { useStore } from "../../store";
import { Avatar } from "../Avatar";
import { CoinIcon } from "../CoinIcon";
import { EmptyState } from "./EmptyState";
import { timeAgo } from "../../lib/time";
import { activityHeadline, activityCoins } from "../../lib/social";

/** The Activity section: your friends' feed as a full page. The old drawer
 *  paged on its own scrollbox; here the page itself scrolls, so older rows load
 *  via a sentinel near the bottom, with a "Show more" button as the fallback for
 *  environments without an IntersectionObserver (the boards' pattern). */
export function ActivitySection({ onFindFriends }: { onFindFriends: () => void }) {
  const {
    feed,
    feedHasMore,
    feedLoadingMore,
    fetchFeed,
    loadMoreFeed,
    cheerActivity,
    uncheerActivity,
  } = useStore();

  useEffect(() => {
    void fetchFeed();
  }, [fetchFeed]);

  // Auto-load ahead of the sentinel; the store guards re-entrancy and the end
  // of the feed, so firing on every intersection tick is safe.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!feedHasMore || typeof IntersectionObserver === "undefined") return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreFeed();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feedHasMore, loadMoreFeed]);

  if (feed.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface">
        <EmptyState
          icon={Newspaper}
          title="No activity yet"
          body="When your friends import games, start Game Families, or finish a game, it shows up here."
          action={
            <button
              onClick={onFindFriends}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105"
            >
              <Users size={15} /> Find friends
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <ul className="divide-y divide-line">
        {feed.map((e) => {
          const coins = activityCoins(e);
          return (
            <li key={e.id} className="flex items-start gap-3 px-4 py-3">
              <Avatar url={e.actorAvatar} name={e.actorName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-ink">
                  <span className="font-semibold">{e.actorName}</span>{" "}
                  <span className="text-muted">{activityHeadline(e)}</span>
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                  <span>{timeAgo(e.createdAt)}</span>
                  {coins != null && (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <CoinIcon size={12} /> {coins.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => (e.cheeredByMe ? uncheerActivity(e.id) : cheerActivity(e.id))}
                aria-pressed={e.cheeredByMe}
                title={e.cheeredByMe ? "Remove your cheer" : "Cheer this"}
                className={
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                  (e.cheeredByMe
                    ? "border-brand/50 bg-brand/15 text-accent"
                    : "border-line text-muted hover:border-brand/40 hover:text-ink")
                }
              >
                <PartyPopper size={13} /> {e.cheerCount > 0 ? e.cheerCount : "Cheer"}
              </button>
            </li>
          );
        })}
      </ul>
      {feedLoadingMore && (
        <p className="flex items-center justify-center gap-2 border-t border-line py-3 text-[11px] text-subtle">
          <Loader2 size={13} className="animate-spin" /> Loading…
        </p>
      )}
      {feedHasMore && !feedLoadingMore && (
        <div className="border-t border-line p-3 text-center">
          <button
            onClick={() => void loadMoreFeed()}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel"
          >
            Show more
          </button>
        </div>
      )}
      {!feedHasMore && (
        <p className="border-t border-line py-3 text-center text-[11px] text-subtle">
          You&apos;re all caught up.
        </p>
      )}
      <div ref={sentinelRef} aria-hidden className="h-px" />
    </div>
  );
}
