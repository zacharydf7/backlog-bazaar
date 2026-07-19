import { useEffect, useMemo, useRef, useState } from "react";
import { Tent, ChevronRight } from "lucide-react";
import { AvatarWithPresence } from "./PresenceDot";
import { useStore } from "../store";
import { isOnline } from "../lib/presence";
import {
  splitOpenStalls,
  sortStalls,
  stallSubtitle,
  STALL_SORTS,
  type StallSort,
} from "../lib/square";
import { useIncrementalReveal } from "../lib/useIncrementalReveal";
import { TitleBadge } from "./TitleBadge";
import type { LeaderboardRow } from "../lib/supabase";

/** The Market Square: the community directory that replaced the coin-ranked
 *  leaderboard. Players who are online right now are pinned as "Open now" with
 *  their live activity; everyone else lists below under a sort of the reader's
 *  choosing. Tapping a stall visits that player's Bazaar. */
export function MarketSquare() {
  const { fetchLeaderboard, openUserBazaar, userId } = useStore();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<StallSort>("active");

  // Load once, then poll so presence (online dots + activity) stays fresh and
  // the online-window math re-evaluates on each refetch. Only the first load
  // shows the "Loading…" state; later polls quietly replace the rows.
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

  const { open, rest } = useMemo(() => splitOpenStalls(rows ?? []), [rows]);
  const sorted = useMemo(() => sortStalls(rest, sort), [rest, sort]);

  // Long directories reveal a page at a time (the boards' pattern); switching
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
            : "border-line bg-panel hover:border-brand/50")
        }
      >
        <AvatarWithPresence
          url={r.avatarUrl}
          name={r.displayName}
          size={36}
          online={isOnline(r.lastSeenAt)}
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
      </button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <Tent size={18} className="text-accent" /> Market Square
        </h2>
      </div>

      <div className="p-4">
        {error && <p className="text-sm text-danger">Couldn&apos;t load the Market Square.</p>}
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
  );
}
