import { useEffect, useMemo, useRef, useState } from "react";
import {
  Library,
  Layers,
  SlidersHorizontal,
  Clock,
  Trophy,
  X,
  ThumbsUp,
  Users,
  Infinity as InfinityIcon,
  Banknote,
  Gem,
} from "lucide-react";
import { useStore } from "../store";
import { LedgerCard } from "./LedgerCard";
import { JumpToTopButton } from "./JumpToTopButton";
import { FilterChips } from "./FilterChips";
import { StatusBadge } from "./StatusBadge";
import { CoinIcon } from "./CoinIcon";
import { ViewingProvider } from "../lib/viewContext";
import { filterByQuery } from "../lib/librarySearch";
import { boardGameAnchor } from "../lib/pageNav";
import { visibleLibrary } from "../lib/families";
import { formatPlaytime } from "../lib/playtime";
import { STATUS_LABEL } from "../lib/status";
import {
  ownedGames,
  ledgerFacets,
  applyLedgerFilters,
  ledgerStats,
  groupLedger,
  ledgerFilterCount,
  toggleLedgerValue,
  ledgerRowTotal,
  sliceLedgerGroups,
  ledgerRowIndexOf,
  EMPTY_LEDGER_FILTERS,
  GROUP_BY_OPTIONS,
  type LedgerFilters,
  type LedgerGroupBy,
  type LedgerStats,
} from "../lib/ledger";
import { useIncrementalReveal } from "../lib/useIncrementalReveal";
import { formatUsd } from "../lib/copies";
import {
  valueFinancials,
  formatRate,
  hasValueTarget,
  type ValueFinancials,
} from "../lib/valueMetrics";
import type { Game, GameStatus } from "../types";

/** The Master Ledger: every owned game (Wishlist excluded) in one filterable,
 *  groupable dashboard, with account-wide library-health metrics up top. While
 *  visiting another player it shows *their* collection, read-only. */
export function MasterLedger({
  searchQuery = "",
  onClearSearch,
  filters: filtersProp,
  onFiltersChange: onFiltersChangeProp,
  groupBy: groupByProp,
  onGroupByChange: onGroupByChangeProp,
  filtersOpen: filtersOpenProp,
  onFiltersOpenChange: onFiltersOpenChangeProp,
  revealToId,
}: {
  // The header search query also narrows the ledger live (same as the boards).
  searchQuery?: string;
  onClearSearch?: () => void;
  // Filter / group-by / panel state is normally lifted to App so it survives
  // opening a game page — which unmounts this whole view — and coming back
  // (issue 7bea6684). Omitted in standalone use (tests), where the ledger falls
  // back to its own local state.
  filters?: LedgerFilters;
  onFiltersChange?: (f: LedgerFilters) => void;
  groupBy?: LedgerGroupBy;
  onGroupByChange?: (g: LedgerGroupBy) => void;
  filtersOpen?: boolean;
  onFiltersOpenChange?: (open: boolean) => void;
  /** When set (returning from this game's page), reveal enough of the paged
   *  list at mount to include its row so the scroll-restore can land on it. */
  revealToId?: string | null;
} = {}) {
  const games = useStore((s) => s.games);
  const viewing = useStore((s) => s.viewing);
  // Your compilations supply each bundle's saved child order for clustering
  // (issue 140ac868); none while visiting (a visited bundle still clusters, in
  // its natural order, keyed off the games' compilationId).
  const compilations = useStore((s) => s.compilations);
  // Source the visited player's library while visiting, otherwise your own.
  // Hidden family siblings stay out — a linked family is ONE consolidated
  // ledger entry (the primary's); severing the link restores the rest.
  const source = useMemo(
    () => visibleLibrary(viewing ? viewing.games : games),
    [viewing, games],
  );

  // Controlled-or-uncontrolled: use the lifted state when App provides it,
  // otherwise keep our own so the component still works in isolation.
  const controlled = onFiltersChangeProp != null;
  const [groupByLocal, setGroupByLocal] = useState<LedgerGroupBy>("none");
  const [filtersLocal, setFiltersLocal] = useState<LedgerFilters>(EMPTY_LEDGER_FILTERS);
  const [filtersOpenLocal, setFiltersOpenLocal] = useState(false);
  const filters = filtersProp ?? filtersLocal;
  const setFilters = onFiltersChangeProp ?? setFiltersLocal;
  const groupBy = groupByProp ?? groupByLocal;
  const setGroupBy = onGroupByChangeProp ?? setGroupByLocal;
  const filtersOpen = filtersOpenProp ?? filtersOpenLocal;
  const setFiltersOpen = onFiltersOpenChangeProp ?? setFiltersOpenLocal;

  // Reset slicers when switching whose ledger we're looking at — a filter that
  // matched in one collection may hide everything in another. When App owns the
  // state it runs this reset itself; doing it here too would wipe the lifted
  // filter on every remount, which is exactly the bug being fixed.
  useEffect(() => {
    if (controlled) return;
    setFiltersLocal(EMPTY_LEDGER_FILTERS);
    setGroupByLocal("none");
  }, [viewing?.userId, controlled]);

  // One row per owned instance — records are never merged, so a game owned
  // standalone and again inside a bundle lists both rows, each with its own
  // copies, spend and hours (matching the boards).
  const owned = useMemo(() => ownedGames(source), [source]);
  // Family members keyed by familyId, from the UNfiltered library (visibleLibrary
  // hides the siblings), so a family primary's card can roll up the whole
  // family's name / spend / hours (issue dacee1d9).
  const familyMembers = useMemo(() => {
    const byFamily = new Map<string, Game[]>();
    for (const g of viewing ? viewing.games : games) {
      if (g.familyId == null) continue;
      const arr = byFamily.get(g.familyId);
      if (arr) arr.push(g);
      else byFamily.set(g.familyId, [g]);
    }
    return byFamily;
  }, [viewing, games]);
  // Facets stay off the WHOLE collection so the filter options never vanish as
  // you narrow (picking PlayStation 5 must still offer the other platforms).
  const facets = useMemo(() => ledgerFacets(owned), [owned]);
  // Slicers first, then the live header search, narrow the shown collection.
  const filtered = useMemo(
    () => filterByQuery(applyLedgerFilters(owned, filters), searchQuery),
    [owned, filters, searchQuery],
  );
  // Stats reflect the CURRENT view, not lifetime totals: filtering to a
  // platform/status recomputes every metric for just that subset (issue
  // 678e6574).
  const stats = useMemo(() => ledgerStats(filtered), [filtered]);
  // "Money Well Spent" financials over the same filtered view (issue 6c60c213).
  // Own ledger only: your personal target never judges a visited player's
  // library, and their spend privacy is theirs to keep.
  const targetCostPerHour = useStore((s) => s.targetCostPerHour);
  const financials = useMemo(
    () => (viewing ? null : valueFinancials(filtered, targetCostPerHour)),
    [viewing, filtered, targetCostPerHour],
  );
  const groups = useMemo(
    () => groupLedger(filtered, groupBy, viewing ? [] : compilations),
    [filtered, groupBy, viewing, compilations],
  );
  // Progressive rendering (issue 86dce059, same as the boards): only mount a
  // page of rows at a time and reveal more as you scroll (or via the button) —
  // mounting hundreds of LedgerCards at once lagged the tab switch. Rows count
  // across groups, so a partially-revealed group renders its first rows and
  // later groups wait their turn.
  const rowTotal = ledgerRowTotal(groups);
  // How many rows must be revealed at mount to include the row we're returning
  // to. Computed once (the reveal only consumes it as an initial floor).
  const seedRef = useRef<number | null>(null);
  if (seedRef.current === null) {
    const i = revealToId ? ledgerRowIndexOf(groups, revealToId) : -1;
    seedRef.current = i >= 0 ? i + 1 : 0;
  }
  // Reveal resets when the collection or its ordering changes wholesale
  // (switching whose ledger, regrouping); slicers and search just clamp,
  // exactly like the boards' behaviour under filtering.
  const { count, hasMore, showMore } = useIncrementalReveal(
    `${viewing?.userId ?? "self"}:${groupBy}`,
    rowTotal,
    48,
    seedRef.current,
  );
  const visibleGroups = useMemo(() => sliceLedgerGroups(groups, count), [groups, count]);
  const groupSizes = useMemo(
    () => new Map(groups.map((g) => [g.key, g.games.length])),
    [groups],
  );
  // Auto-load the next page well before the sentinel scrolls into view; the
  // button stays as the manual/observer-less fallback.
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
  // Anchor the first row of each game so returning from its page scrolls back to
  // it (issue 86dce059 — the boards already did this; the Ledger now matches).
  // Platform grouping lists a game under each platform, so only its first row
  // takes the id, keeping DOM ids unique.
  const anchorRowKeys = useMemo(() => {
    const seen = new Set<string>();
    const keys = new Set<string>();
    for (const group of groups) {
      for (const g of group.games) {
        if (seen.has(g.id)) continue;
        seen.add(g.id);
        keys.add(`${group.key}:${g.id}`);
      }
    }
    return keys;
  }, [groups]);
  const searching = searchQuery.trim() !== "";
  const filterActive = ledgerFilterCount(filters) > 0;

  // Snap back to the top whenever a control changes so the (unpinned) stat block
  // and the fresh results are both in view — the control bar itself stays pinned
  // (issue 9a7f6a3e). Guarded for jsdom, which doesn't implement scrollTo.
  const scrollToTop = () => {
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      /* not implemented under test */
    }
  };
  const changeFilters = (f: LedgerFilters) => {
    setFilters(f);
    scrollToTop();
  };
  const changeGroupBy = (g: LedgerGroupBy) => {
    setGroupBy(g);
    scrollToTop();
  };
  const clearView = () => {
    setFilters(EMPTY_LEDGER_FILTERS);
    onClearSearch?.();
    scrollToTop();
  };

  // "Stuck" state for the pinned control bar: light up a divider/shadow only once
  // it pins under the app chrome (issue 9a7f6a3e). Observing the bar itself with a
  // top rootMargin = its sticky offset flips the ratio below 1 when it pins. The
  // offset is whatever `top: var(--chrome-h)` resolves to — read it straight off
  // the element's computed style so it always matches the real chrome height, and
  // re-observe on resize or when entering/leaving a visit (both change the mobile
  // header's height — issue 7df3dd85).
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let io: IntersectionObserver | null = null;
    const attach = () => {
      io?.disconnect();
      const offset = parseFloat(getComputedStyle(el).top) || 0;
      io = new IntersectionObserver(
        ([entry]) => setStuck(entry.intersectionRatio < 1),
        { threshold: [1], rootMargin: `-${offset + 1}px 0px 0px 0px` },
      );
      io.observe(el);
    };
    attach();
    window.addEventListener("resize", attach);
    return () => {
      io?.disconnect();
      window.removeEventListener("resize", attach);
    };
  }, [viewing]);

  const heading = (
    <h2 className="inline-flex items-center gap-2 font-display text-2xl tracking-tight text-ink">
      <Library size={22} className="text-accent" />{" "}
      {viewing ? `${viewing.displayName}'s Master Ledger` : "Master Ledger"}
    </h2>
  );

  if (owned.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {heading}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line py-16 text-center">
          <p className="font-display text-xl text-ink">
            {viewing
              ? `${viewing.displayName} doesn't own any games yet`
              : "Nothing in your collection yet"}
          </p>
          <p className="max-w-md text-sm text-muted">
            {viewing ? (
              <>
                When {viewing.displayName} adds or buys games, their collection shows up here.
                (Wishlist games aren&apos;t shown — they&apos;re not owned yet.)
              </>
            ) : (
              <>
                Games you own — in the Bazaar, Now Playing, or Finished — gather here. Add or buy a
                game to start your ledger. (Wishlist games aren&apos;t shown; you don&apos;t own them
                yet.)
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {heading}

      {/* Controls come first (they dictate the data below) and stay pinned under
          the app chrome so you can refine without scrolling back up — the larger
          stat block deliberately is NOT pinned, freeing vertical space for cards
          (issues 678e6574 + 9a7f6a3e). The divider/shadow lights up only once the
          bar pins. */}
      <div
        ref={barRef}
        // top offset clears the sticky app chrome so the bar isn't cut off. It's
        // the live chrome height (--chrome-h): a 56px desktop TopBar, or the mobile
        // header — which grows with the "You're visiting" banner, so a fixed offset
        // clipped it (issues 9a7f6a3e, 7df3dd85).
        style={{ top: "var(--chrome-h)" }}
        className={
          "sticky z-10 -mx-4 bg-canvas px-4 py-2 transition-shadow md:-mx-6 md:px-6 " +
          (stuck ? "border-b border-line shadow-sm" : "")
        }
      >
        <LedgerToolbar
          groupBy={groupBy}
          onGroupByChange={changeGroupBy}
          filters={filters}
          onFiltersChange={changeFilters}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          facets={facets}
          total={owned.length}
          shown={filtered.length}
        />
      </div>

      {/* Account-wide library health — recalculated for the active filter, and
          flagged as a subset when one is on. */}
      <StatsBar
        stats={stats}
        financials={financials}
        judged={hasValueTarget(targetCostPerHour)}
        filtered={filterActive || searching}
        onClear={clearView}
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
          <p className="font-display text-xl text-ink">
            {searching ? `No games match “${searchQuery.trim()}”` : "No games match your filters"}
          </p>
          <p className="max-w-md text-sm text-muted">
            {searching
              ? "Try a different search, or clear it to see your whole collection."
              : "Try removing a filter to widen your search."}
          </p>
          {searching && onClearSearch ? (
            <button
              onClick={onClearSearch}
              className="mt-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel"
            >
              Clear search
            </button>
          ) : (
            <button
              onClick={() => setFilters(EMPTY_LEDGER_FILTERS)}
              className="mt-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        // Visiting → render the cards read-only and honour the player's hidden
        // real-world spend, just like their boards do.
        <ViewingProvider
          value={{ readOnly: viewing != null, hideSpend: viewing?.hideSpend ?? false }}
        >
          <div className="flex flex-col gap-6">
            {visibleGroups.map((group) => (
              <section key={group.key}>
                {group.label && (
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="font-display text-lg text-ink">{group.label}</h3>
                    {/* The group's true size — a partially revealed group still
                        reports how many games it holds in total. */}
                    <span className="rounded-full bg-line px-2 py-0.5 text-xs font-medium text-subtle">
                      {groupSizes.get(group.key) ?? group.games.length}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.games.map((g) => {
                    const rowKey = `${group.key}:${g.id}`;
                    return (
                      <div
                        key={rowKey}
                        id={anchorRowKeys.has(rowKey) ? boardGameAnchor(g.id) : undefined}
                        className="h-full scroll-mt-24"
                      >
                        <LedgerCard
                          game={g}
                          family={g.familyId != null ? familyMembers.get(g.familyId) : undefined}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {hasMore && (
            // Doubles as the scroll sentinel (auto-loads via the observer
            // above) and a manual affordance for anyone without one.
            <div ref={sentinelRef} className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={showMore}
                className="rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink transition hover:border-brand/50"
              >
                Show more ({rowTotal - count} more)
              </button>
            </div>
          )}
        </ViewingProvider>
      )}
      {/* One-tap return to the top of a long ledger (issue 936d0ca7) —
          self-hides until the page is a screenful deep. */}
      <JumpToTopButton />
    </div>
  );
}

/** The library-health summary: two headline metrics plus a per-status breakdown
 *  and a completion progress bar. When `filtered`, the numbers describe the
 *  current subset — flagged with a badge + a one-tap Clear back to lifetime
 *  totals (issue 678e6574). */
function StatsBar({
  stats,
  financials,
  judged = false,
  filtered = false,
  onClear,
}: {
  stats: LedgerStats;
  /** "Money Well Spent" rollup for the same view (issue 6c60c213); null while
   *  visiting (a visitor's target never judges someone else's library). */
  financials?: ValueFinancials | null;
  /** Whether a target rate is set, so a 0-count "well spent" line still shows
   *  (vs. hiding the judgement entirely when the feature is off). */
  judged?: boolean;
  filtered?: boolean;
  onClear?: () => void;
}) {
  const economyEnabled = useStore((s) => s.economyEnabled);
  return (
    <div className="flex flex-col gap-2">
      {filtered && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
            <SlidersHorizontal size={11} /> Filtered view
          </span>
          <span className="text-[11px] text-subtle">
            These numbers reflect the games shown below, not your whole collection.
          </span>
          {onClear && (
            <button
              onClick={onClear}
              className="text-[11px] font-semibold text-accent underline-offset-2 transition hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Metric value={String(stats.total)} label="Games owned" />
        {/* "Finished" is any clear; Beaten/Completed split it by finish tag. */}
        <Metric value={`${stats.finishedPct}%`} label="Finished" />
        <Metric value={`${stats.beatenPct}%`} label="Beaten" />
        <Metric value={`${stats.completedPct}%`} label="Completed" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <StatusBadge status="playing" /> {stats.playing}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <StatusBadge status="backlog" /> {stats.backlog}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <StatusBadge status="finished" /> {stats.finished}
          </span>
        </div>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={stats.finishedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Library completion"
      >
        <div className="h-full rounded-full bg-success" style={{ width: `${stats.finishedPct}%` }} />
      </div>

      {/* Secondary lifetime stats — deliberately quiet so they don't compete with
          the headline metrics above. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <Clock size={12} className="text-accent/70" /> {formatPlaytime(stats.hoursPlayed)} played
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Trophy size={12} className="text-accent/70" /> {stats.finishedThisYear} finished in{" "}
          {new Date().getFullYear()}
        </span>
        {economyEnabled && (
          <span className="inline-flex items-center gap-1.5">
            <CoinIcon size={12} /> {stats.coinsEarned} earned
          </span>
        )}
        {/* Endless games are retired live-service titles — only worth a line
            when the player actually has some. */}
        {stats.endless > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <InfinityIcon size={12} className="text-accent/70" /> {stats.endless} endless
          </span>
        )}
        {/* Financials (issue 6c60c213): real-money spend + effective rate for
            the games in view, and — with a target set — how many have earned
            "Money Well Spent". Recomputed per filter like everything above. */}
        {financials && financials.totalSpent > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Banknote size={12} className="text-accent/70" /> {formatUsd(financials.totalSpent)}{" "}
            spent
            {financials.costPerHour != null && <>&nbsp;· {formatRate(financials.costPerHour)}</>}
          </span>
        )}
        {financials && judged && financials.eligible > 0 && (
          <span
            className="inline-flex items-center gap-1.5 text-success"
            title="Paid games whose logged hours have reached your target cost per hour"
          >
            <Gem size={12} /> {financials.wellSpent} of {financials.eligible} well spent (
            {financials.wellSpentPct}%)
          </span>
        )}
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-2xl leading-none text-accent">{value}</span>
      <span className="mt-0.5 text-[11px] uppercase tracking-wide text-subtle">{label}</span>
    </div>
  );
}

/** Group-by toggle + multi-select slicers (Status, Platform). Mirrors the
 *  Bazaar toolbar's collapse-on-mobile pattern. */
function LedgerToolbar({
  groupBy,
  onGroupByChange,
  filters,
  onFiltersChange,
  open,
  onOpenChange,
  facets,
  total,
  shown,
}: {
  groupBy: LedgerGroupBy;
  onGroupByChange: (g: LedgerGroupBy) => void;
  filters: LedgerFilters;
  onFiltersChange: (f: LedgerFilters) => void;
  /** Whether the facet panel is expanded. Controlled by the parent so the choice
   *  survives leaving the ledger for a game page and coming back (issue 7bea6684). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facets: ReturnType<typeof ledgerFacets>;
  total: number;
  shown: number;
}) {
  const count = ledgerFilterCount(filters);
  const active = count > 0;
  const hasFacets = facets.statuses.length > 0 || facets.platforms.length > 0;

  return (
    <div className="rounded-xl border border-line bg-surface p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Group by */}
        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
          <Layers size={15} className="text-subtle" />
          <span className="sr-only sm:not-sr-only">Group by</span>
        </span>
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          {GROUP_BY_OPTIONS.map((o) => {
            const on = groupBy === o.value;
            return (
              <button
                key={o.value}
                onClick={() => onGroupByChange(o.value)}
                aria-pressed={on}
                className={
                  "px-2.5 py-2 text-sm transition " +
                  (on ? "bg-brand text-brand-fg" : "bg-panel text-muted hover:text-ink")
                }
              >
                {o.label}
              </button>
            );
          })}
        </div>

        {/* Filters toggle */}
        {hasFacets && (
          <button
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
            className={
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm transition " +
              (active
                ? "border-brand/50 bg-brand/10 text-accent"
                : "border-line bg-panel text-ink hover:bg-panel/70")
            }
          >
            <SlidersHorizontal size={15} />
            Filters
            {count > 0 && (
              <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-fg">
                {count}
              </span>
            )}
          </button>
        )}

        {/* Favorites-only: one-tap curation down to liked games, mirroring the
            board toolbar's chip. */}
        <button
          onClick={() => onFiltersChange({ ...filters, liked: !filters.liked })}
          aria-pressed={filters.liked}
          title="Show only games you've liked"
          className={
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm transition " +
            (filters.liked
              ? "border-brand/50 bg-brand/10 text-accent"
              : "border-line bg-panel text-ink hover:bg-panel/70")
          }
        >
          <ThumbsUp size={15} className={filters.liked ? "fill-current" : ""} /> Liked
        </button>

        {/* Guest copies only: games held as a Player 2 seat on someone else's
            copy (couch co-op / screen share / a partner's license) — issue
            3eb956ff. */}
        <button
          onClick={() => onFiltersChange({ ...filters, player2: !filters.player2 })}
          aria-pressed={filters.player2}
          title="Show only games you play as Player 2 — on someone else's copy"
          className={
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm transition " +
            (filters.player2
              ? "border-brand/50 bg-brand/10 text-accent"
              : "border-line bg-panel text-ink hover:bg-panel/70")
          }
        >
          <Users size={15} /> Player 2
        </button>

        {active && (
          <button
            onClick={() => onFiltersChange(EMPTY_LEDGER_FILTERS)}
            className="inline-flex items-center gap-1 text-xs text-subtle transition hover:text-danger"
          >
            <X size={13} /> Clear
          </button>
        )}

        <span className="ml-auto text-xs text-muted">
          {shown !== total ? `${shown} of ${total}` : `${total} ${total === 1 ? "game" : "games"}`}
        </span>
      </div>

      {open && hasFacets && (
        <div className="mt-2.5 space-y-3 border-t border-line pt-3">
          <FilterChips
            title="Status"
            options={facets.statuses}
            labelOf={(s) => STATUS_LABEL[s as GameStatus]}
            selected={filters.statuses}
            onToggle={(s) =>
              onFiltersChange({
                ...filters,
                statuses: toggleLedgerValue(filters.statuses, s as GameStatus),
              })
            }
          />
          <FilterChips
            title="Platform"
            options={facets.platforms}
            selected={filters.platforms}
            onToggle={(p) =>
              onFiltersChange({ ...filters, platforms: toggleLedgerValue(filters.platforms, p) })
            }
          />
        </div>
      )}
    </div>
  );
}
