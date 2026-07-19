import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Tent,
  ChevronRight,
  Crown,
  Flame,
  ListOrdered,
  PartyPopper,
  Sparkles,
  MessageSquareQuote,
  Star,
} from "lucide-react";
import { AvatarWithPresence } from "./PresenceDot";
import { Avatar } from "./Avatar";
import { TitleBadge } from "./TitleBadge";
import { useStore } from "../store";
import { isOnline } from "../lib/presence";
import {
  splitOpenStalls,
  sortStalls,
  stallSubtitle,
  STALL_SORTS,
  reviewSnippet,
  formatHalfStars,
  findOwnedGameId,
  trendingBits,
  type StallSort,
  type SquareReview,
  type TrendingGame,
} from "../lib/square";
import { activityHeadline } from "../lib/social";
import { timeAgo } from "../lib/time";
import { reviewDateLabel } from "../lib/communityReviews";
import { gameHash, listHash } from "../lib/route";
import { resolveStallStyle } from "../lib/shopCosmetics";
import { StallOrnament } from "./CosmeticOrnaments";
import { useIncrementalReveal } from "../lib/useIncrementalReveal";
import type { LeaderboardRow } from "../lib/supabase";
import type { ActivityEvent } from "../types";

/** How many Talk of the Bazaar reviews show before "Show more". */
const REVIEWS_PREVIEW = 6;

/** The Market Square: the community hub that replaced the coin-ranked
 *  leaderboard. Left (main) column: the Stall of the Week spotlight, the
 *  community Fresh Clears feed (cheerable by anyone), and Talk of the Bazaar
 *  (the newest reviews). Right rail: the player directory — online players
 *  pinned as "Open now", everyone else sortable below. Tapping a player
 *  anywhere visits their Bazaar. */
export function MarketSquare() {
  const {
    fetchLeaderboard,
    fetchSquare,
    loadMoreSquareFeed,
    squareFeed,
    squareFeedHasMore,
    squareFeedLoadingMore,
    squareReviews,
    squareSpotlight,
    cheerActivity,
    uncheerActivity,
    openUserBazaar,
    userId,
  } = useStore();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<StallSort>("active");

  // Directory: load once, then poll so presence (online dots + activity) stays
  // fresh and the online-window math re-evaluates on each refetch. Only the
  // first load shows "Loading…"; later polls quietly replace the rows.
  useEffect(() => {
    let active = true;
    const load = () =>
      fetchLeaderboard()
        .then((r) => {
          if (!active) return;
          setRows(r);
          setError(false);
        })
        .catch(() => active && setError(true));
    load();
    const id = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [fetchLeaderboard]);

  // Community sections load once per visit to the page.
  useEffect(() => {
    void fetchSquare();
  }, [fetchSquare]);

  const { open, rest } = useMemo(() => splitOpenStalls(rows ?? []), [rows]);
  const sorted = useMemo(() => sortStalls(rest, sort), [rest, sort]);

  // The directory reveals a page at a time (the boards' pattern); switching
  // sorts starts back at one page. The observer auto-loads ahead of the
  // sentinel; the button remains for environments without one.
  const { count, hasMore, showMore } = useIncrementalReveal(sort, sorted.length);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || typeof IntersectionObserver === "undefined") return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) showMore();
      },
      { rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, showMore]);

  const stallButton = (r: LeaderboardRow) => {
    const me = r.id === userId;
    const sub = stallSubtitle(r);
    // An equipped stall decoration replaces the card's default dressing (the
    // "you" highlight still wins so your own stall stays findable).
    const stall = me ? null : resolveStallStyle(r.cosmetics.stall);
    return (
      <button
        key={r.id}
        onClick={() => !me && void openUserBazaar(r.id)}
        disabled={me}
        title={me ? "This is you" : `Visit ${r.displayName}'s Bazaar`}
        className={
          "flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition " +
          (me
            ? "cursor-default border-brand/50 bg-brand/10"
            : stall
              ? "bg-panel hover:border-brand/50 " + stall.cardClassName
              : "border-line bg-panel hover:border-brand/50")
        }
      >
        <AvatarWithPresence
          url={r.avatarUrl}
          name={r.displayName}
          size={36}
          online={isOnline(r.lastSeenAt)}
          frame={r.cosmetics.frame}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-ink">
              {r.displayName} {me && <span className="text-xs text-accent">(you)</span>}
            </span>
            {r.title && <TitleBadge badge={r.title} size="xs" />}
          </div>
          <div
            className={
              "truncate text-xs " + (sub.kind === "activity" ? "text-success" : "text-subtle")
            }
          >
            {sub.text}
          </div>
        </div>
        {r.gamesFinished > 0 && (
          <span className="shrink-0 text-xs text-subtle">
            {r.gamesFinished} {r.gamesFinished === 1 ? "clear" : "clears"}
          </span>
        )}
        {!me && <ChevronRight size={16} className="shrink-0 text-subtle" />}
        {stall && <StallOrnament styleKey={r.cosmetics.stall} />}
      </button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <Tent size={18} className="text-accent" /> Market Square
        </h2>
      </div>

      <div className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        {/* Main column: spotlight + community activity. */}
        <div className="flex min-w-0 flex-col gap-4">
          {squareSpotlight && <SpotlightCard me={squareSpotlight.userId === userId} />}

          <TrendingSection />

          <SectionCard icon={Sparkles} title="Fresh Clears">
            {!squareFeed && <p className="text-sm text-muted">Loading…</p>}
            {squareFeed && squareFeed.length === 0 && (
              <p className="text-sm text-muted">
                No clears yet — the next finished game opens the celebration.
              </p>
            )}
            {squareFeed && squareFeed.length > 0 && (
              <div className="flex flex-col gap-2">
                {squareFeed.map((e) => (
                  <ClearRow
                    key={e.id}
                    event={e}
                    me={e.actor === userId}
                    onVisit={() => void openUserBazaar(e.actor)}
                    onCheer={() =>
                      e.cheeredByMe ? void uncheerActivity(e.id) : void cheerActivity(e.id)
                    }
                  />
                ))}
              </div>
            )}
            {squareFeedHasMore && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadMoreSquareFeed()}
                  disabled={squareFeedLoadingMore}
                  className="rounded-xl border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:border-brand/50 disabled:opacity-60"
                >
                  {squareFeedLoadingMore ? "Loading…" : "Show more"}
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard icon={MessageSquareQuote} title="Talk of the Bazaar">
            <ReviewsList />
          </SectionCard>

          <CuratedStallsSection />
        </div>

        {/* Rail: the player directory (the leaderboard's old job, minus coins). */}
        <div className="rounded-2xl border border-line bg-surface p-4">
          {error && <p className="text-sm text-danger">Couldn&apos;t load the stalls.</p>}
          {!rows && !error && <p className="text-sm text-muted">Loading…</p>}
          {rows && rows.length === 0 && <p className="text-sm text-muted">No stalls yet.</p>}

          {open.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Open now
              </h3>
              <div className="flex flex-col gap-2">{open.map(stallButton)}</div>
            </section>
          )}

          {sorted.length > 0 && (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                  All stalls
                </h3>
                <div className="flex flex-wrap gap-1">
                  {STALL_SORTS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSort(s.key)}
                      aria-pressed={sort === s.key}
                      className={
                        "rounded-full border px-2.5 py-1 text-xs transition " +
                        (sort === s.key
                          ? "border-brand/50 bg-brand/10 text-ink"
                          : "border-line bg-panel text-muted hover:border-brand/50")
                      }
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">{sorted.slice(0, count).map(stallButton)}</div>
              {hasMore && (
                // Doubles as the scroll sentinel (auto-loads via the observer
                // above) and a manual affordance for anyone without one.
                <div ref={sentinelRef} className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={showMore}
                    className="rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink transition hover:border-brand/50"
                  >
                    Show more ({sorted.length - count} more)
                  </button>
                </div>
              )}
            </section>
          )}

          <p className="mt-4 text-center text-[11px] text-subtle">
            Tap a stall to visit that player&apos;s Bazaar.
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="mb-3 inline-flex items-center gap-2 font-display text-lg text-ink">
        <Icon size={16} className="text-accent" /> {title}
      </h3>
      {children}
    </section>
  );
}

/** One community clear: who, what, when — cheerable by anyone who can see it. */
function ClearRow({
  event: e,
  me,
  onVisit,
  onCheer,
}: {
  event: ActivityEvent;
  me: boolean;
  onVisit: () => void;
  onCheer: () => void;
}) {
  const coins = typeof e.detail?.coins === "number" && e.detail.coins > 0 ? e.detail.coins : null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2">
      <button
        onClick={onVisit}
        disabled={me}
        title={me ? "This is you" : `Visit ${e.actorName}'s Bazaar`}
        className={"shrink-0 " + (me ? "cursor-default" : "transition hover:opacity-80")}
      >
        <Avatar url={e.actorAvatar} name={e.actorName} size={32} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">
          <button
            onClick={onVisit}
            disabled={me}
            className={"font-medium " + (me ? "cursor-default" : "hover:underline")}
          >
            {e.actorName}
          </button>{" "}
          <span className="text-muted">{activityHeadline(e)}</span>
          {coins != null && <span className="text-accent"> (+{coins})</span>}
        </p>
        <p className="text-[11px] text-subtle">{timeAgo(e.createdAt)}</p>
      </div>
      <button
        onClick={onCheer}
        aria-pressed={e.cheeredByMe}
        title={e.cheeredByMe ? "Remove your cheer" : "Cheer this"}
        className={
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs transition " +
          (e.cheeredByMe
            ? "border-brand/50 bg-brand/10 text-ink"
            : "border-line text-muted hover:border-brand/50")
        }
      >
        <PartyPopper size={13} /> {e.cheerCount > 0 ? e.cheerCount : "Cheer"}
      </button>
    </div>
  );
}

/** Stall of the Week — a celebration of the week's most prolific finisher,
 *  deliberately a single card and never a ranked list. */
function SpotlightCard({ me }: { me: boolean }) {
  const { squareSpotlight: s, openUserBazaar } = useStore();
  if (!s) return null;
  const stall = resolveStallStyle(s.cosmetics.stall);
  return (
    <section className="rounded-2xl border border-brand/40 bg-brand/5 p-4">
      <h3 className="mb-3 inline-flex items-center gap-2 font-display text-lg text-ink">
        <Crown size={16} className="text-accent" /> Stall of the Week
      </h3>
      <button
        onClick={() => !me && void openUserBazaar(s.userId)}
        disabled={me}
        title={me ? "This is you — enjoy the spotlight!" : `Visit ${s.displayName}'s Bazaar`}
        className={
          "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition " +
          (me
            ? "cursor-default border-brand/50 bg-brand/10"
            : stall
              ? "bg-panel hover:border-brand/50 " + stall.cardClassName
              : "border-line bg-panel hover:border-brand/50")
        }
      >
        <Avatar url={s.avatarUrl} name={s.displayName} size={40} frame={s.cosmetics.frame} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-ink">
              {s.displayName} {me && <span className="text-xs text-accent">(you)</span>}
            </span>
            {s.title && <TitleBadge badge={s.title} size="xs" />}
          </div>
          <p className="truncate text-xs text-muted">
            {s.clears} {s.clears === 1 ? "game" : "games"} cleared this week
            {s.lastTitle ? ` — latest: ${s.lastTitle}` : ""}
          </p>
        </div>
        {!me && <ChevronRight size={16} className="shrink-0 text-subtle" />}
        {!me && stall && <StallOrnament styleKey={s.cosmetics.stall} />}
      </button>
    </section>
  );
}

/** Talk of the Bazaar: the newest written reviews across the community. */
function ReviewsList() {
  const { squareReviews, openUserBazaar, userId, games } = useStore();
  const [showAll, setShowAll] = useState(false);
  if (!squareReviews) return <p className="text-sm text-muted">Loading…</p>;
  if (squareReviews.length === 0) {
    return <p className="text-sm text-muted">No reviews yet — finished something? Say a few words.</p>;
  }
  const shown = showAll ? squareReviews : squareReviews.slice(0, REVIEWS_PREVIEW);
  return (
    <>
      <div className="flex flex-col gap-2">
        {shown.map((r) => (
          <ReviewRow
            key={`${r.userId}:${r.gameTitle}:${r.reviewedAt ?? ""}`}
            review={r}
            me={r.userId === userId}
            ownedGameId={findOwnedGameId(games, r.rawgId, r.catalogId)}
            onVisit={() => void openUserBazaar(r.userId)}
          />
        ))}
      </div>
      {!showAll && squareReviews.length > REVIEWS_PREVIEW && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-xl border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:border-brand/50"
          >
            Show more ({squareReviews.length - REVIEWS_PREVIEW} more)
          </button>
        </div>
      )}
    </>
  );
}

function ReviewRow({
  review: r,
  me,
  ownedGameId,
  onVisit,
}: {
  review: SquareReview;
  me: boolean;
  ownedGameId: string | null;
  onVisit: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button
          onClick={onVisit}
          disabled={me}
          title={me ? "This is you" : `Visit ${r.displayName}'s Bazaar`}
          className={"shrink-0 " + (me ? "cursor-default" : "transition hover:opacity-80")}
        >
          <Avatar url={r.avatarUrl} name={r.displayName} size={28} />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm text-ink">
          <button
            onClick={onVisit}
            disabled={me}
            className={"font-medium " + (me ? "cursor-default" : "hover:underline")}
          >
            {r.displayName}
          </button>{" "}
          <span className="text-muted">on</span>{" "}
          {ownedGameId ? (
            <button
              onClick={() => {
                window.location.hash = gameHash(ownedGameId);
              }}
              title="Open it in your library"
              className="font-medium hover:underline"
            >
              {r.gameTitle}
            </button>
          ) : (
            <span className="font-medium">{r.gameTitle}</span>
          )}
        </p>
        {r.score != null && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-accent">
            <Star size={12} className="fill-current" /> {formatHalfStars(r.score)}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted">{reviewSnippet(r.review)}</p>
      {r.reviewedAt && (
        <p className="mt-1 text-[11px] text-subtle">{reviewDateLabel(r.reviewedAt)}</p>
      )}
    </div>
  );
}

/** Hot This Week: anonymous per-title activity counts from the event logs,
 *  rendered as a horizontally-scrolling shelf of cover tiles. Hidden entirely
 *  until something trended. Owned titles open in the viewer's library. */
function TrendingSection() {
  const { squareTrending, games } = useStore();
  if (!squareTrending || squareTrending.length === 0) return null;
  return (
    <SectionCard icon={Flame} title="Hot This Week">
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {squareTrending.map((t) => (
          <TrendingTile
            key={`${t.rawgId ?? ""}:${t.catalogId ?? ""}:${t.title}`}
            game={t}
            ownedGameId={findOwnedGameId(games, t.rawgId, t.catalogId)}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function TrendingTile({ game: t, ownedGameId }: { game: TrendingGame; ownedGameId: string | null }) {
  const body = (
    <>
      <div className="h-20 w-full overflow-hidden rounded-lg border border-line bg-panel">
        {t.image ? (
          <img src={t.image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-subtle">
            {t.title}
          </div>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-tight text-ink">{t.title}</p>
      <p className="mt-0.5 text-[10px] text-subtle">{trendingBits(t)}</p>
    </>
  );
  return ownedGameId ? (
    <button
      onClick={() => {
        window.location.hash = gameHash(ownedGameId);
      }}
      title="Open it in your library"
      className="w-32 shrink-0 text-left transition hover:opacity-90"
    >
      {body}
    </button>
  ) : (
    <div className="w-32 shrink-0">{body}</div>
  );
}

/** Curated Stalls: recently-updated public lists — the browse surface the
 *  lists feature never had. Hidden until someone publishes a list. */
function CuratedStallsSection() {
  const { squareLists, openUserBazaar, userId } = useStore();
  if (!squareLists || squareLists.length === 0) return null;
  return (
    <SectionCard icon={ListOrdered} title="Curated Stalls">
      <div className="flex flex-col gap-2">
        {squareLists.map((l) => {
          const mine = l.ownerId === userId;
          return (
            <div key={l.id} className="rounded-xl border border-line bg-panel px-3 py-2.5">
              <div className="flex items-center gap-3">
                {l.covers.length > 0 && (
                  <div className="flex shrink-0 -space-x-2">
                    {l.covers.map((c, i) => (
                      <img
                        key={i}
                        src={c}
                        alt=""
                        loading="lazy"
                        className="h-9 w-7 rounded border border-line object-cover"
                        style={{ zIndex: l.covers.length - i }}
                      />
                    ))}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => {
                      window.location.hash = listHash(l.id);
                    }}
                    title={`Open ${l.title}`}
                    className="block max-w-full truncate text-left text-sm font-medium text-ink hover:underline"
                  >
                    {l.title}
                  </button>
                  <p className="truncate text-[11px] text-subtle">
                    {l.itemCount} {l.itemCount === 1 ? "game" : "games"} · by{" "}
                    <button
                      onClick={() => !mine && void openUserBazaar(l.ownerId)}
                      disabled={mine}
                      className={mine ? "cursor-default" : "hover:underline"}
                    >
                      {mine ? "you" : l.ownerName}
                    </button>{" "}
                    · updated {timeAgo(l.updatedAt)}
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-subtle" />
              </div>
              {l.description && (
                <p className="mt-1 line-clamp-2 text-xs text-muted">{l.description}</p>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
