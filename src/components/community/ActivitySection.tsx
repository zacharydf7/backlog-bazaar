import { useEffect, useRef, useState } from "react";
import {
  Clock,
  Download,
  Handshake,
  Layers,
  Loader2,
  Medal,
  Newspaper,
  PartyPopper,
  Play,
  RotateCcw,
  StickyNote,
  Trophy,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../../store";
import { Avatar } from "../Avatar";
import { CoinIcon } from "../CoinIcon";
import { TitleBadge } from "../TitleBadge";
import { EmptyState } from "./EmptyState";
import { timeAgo } from "../../lib/time";
import { activityHeadline, activityCoins } from "../../lib/social";
import { loadFeedShowMine, saveFeedShowMine } from "../../lib/community";
import type { ActivityKind } from "../../types";

const KIND_ICONS: Record<ActivityKind, LucideIcon> = {
  game_imported: Download,
  family_created: Layers,
  bounty_claimed: Trophy,
  co_op_completed: Handshake,
  drop_in: RotateCcw,
  game_started: Play,
  played: Clock,
  note: StickyNote,
  medal_earned: Medal,
};

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

  // Show mine (issue 337e39ca): your own lines alongside your friends', as
  // they see them. Remembered on this device.
  const [showMine, setShowMine] = useState(loadFeedShowMine);
  useEffect(() => {
    void fetchFeed(showMine);
  }, [fetchFeed, showMine]);

  const showMineToggle = (
    <div className="flex justify-end border-b border-line px-4 py-2">
      <button
        onClick={() => {
          setShowMine(!showMine);
          saveFeedShowMine(!showMine);
        }}
        aria-pressed={showMine}
        title="Include your own activity, as your friends see it"
        className={
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition " +
          (showMine
            ? "border-brand/50 bg-brand/10 text-accent"
            : "border-line bg-panel text-ink hover:bg-panel/70")
        }
      >
        <UserRound size={14} /> Show mine
      </button>
    </div>
  );

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
        {showMineToggle}
        <EmptyState
          icon={Newspaper}
          title="No activity yet"
          body="When your friends start, play or finish games, or earn medals, it shows up here."
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
      {showMineToggle}
      <ul className="divide-y divide-line">
        {feed.map((e) => {
          const coins = activityCoins(e);
          const KindIcon = KIND_ICONS[e.kind];
          return (
            <li key={e.id} className="flex items-start gap-3 px-4 py-3">
              <Avatar
                url={e.actorAvatar}
                name={e.actorName}
                size={36}
                frame={e.actorCosmetics.frame}
                calm
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-ink">
                  <span className="font-semibold">{e.actorName}</span>{" "}
                  <span className="text-muted">{activityHeadline(e)}</span>
                </p>
                {e.detail.note && (
                  <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-panel px-2.5 py-1.5 text-xs text-muted">
                    &ldquo;{e.detail.note}&rdquo;
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                  {e.actorTitle && <TitleBadge badge={e.actorTitle} size="xs" calm />}
                  <KindIcon size={12} aria-hidden className="shrink-0" />
                  <span>{timeAgo(e.createdAt)}</span>
                  {coins != null && (
                    <span className="inline-flex items-center gap-1 text-accent">
                      {/* Their payout wears their own mint. */}
                      <CoinIcon size={12} ownerCoin={e.actorCosmetics.coin} />{" "}
                      {coins.toLocaleString()}
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
