import { useEffect, useMemo, useRef, useState } from "react";
import {
  Library,
  Layers,
  SlidersHorizontal,
  Clock,
  Trophy,
  X,
  ThumbsUp,
  Infinity as InfinityIcon,
} from "lucide-react";
import { useStore } from "../store";
import { LedgerCard } from "./LedgerCard";
import { FilterChips } from "./FilterChips";
import { StatusBadge } from "./StatusBadge";
import { CoinIcon } from "./CoinIcon";
import { ViewingProvider } from "../lib/viewContext";
import { filterByQuery } from "../lib/librarySearch";
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
  EMPTY_LEDGER_FILTERS,
  GROUP_BY_OPTIONS,
  type LedgerFilters,
  type LedgerGroupBy,
  type LedgerStats,
} from "../lib/ledger";
import type { GameStatus } from "../types";

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
} = {}) {
  const games = useStore((s) => s.games);
  const viewing = useStore((s) => s.viewing);
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
  const groups = useMemo(() => groupLedger(filtered, groupBy), [filtered, groupBy]);
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
  // top rootMargin ≈ its sticky offset flips the ratio below 1 when it pins.
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setStuck(entry.intersectionRatio < 1),
      { threshold: [1], rootMargin: "-65px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
        className={
          "sticky top-16 z-10 -mx-4 bg-canvas px-4 py-2 transition-shadow md:top-14 md:-mx-6 md:px-6 " +
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
      <StatsBar stats={stats} filtered={filterActive || searching} onClear={clearView} />

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
            {groups.map((group) => (
              <section key={group.key}>
                {group.label && (
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="font-display text-lg text-ink">{group.label}</h3>
                    <span className="rounded-full bg-line px-2 py-0.5 text-xs font-medium text-subtle">
                      {group.games.length}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.games.map((g) => (
                    <div key={`${group.key}:${g.id}`} className="h-full">
                      <LedgerCard game={g} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </ViewingProvider>
      )}
    </div>
  );
}

/** The library-health summary: two headline metrics plus a per-status breakdown
 *  and a completion progress bar. When `filtered`, the numbers describe the
 *  current subset — flagged with a badge + a one-tap Clear back to lifetime
 *  totals (issue 678e6574). */
function StatsBar({
  stats,
  filtered = false,
  onClear,
}: {
  stats: LedgerStats;
  filtered?: boolean;
  onClear?: () => void;
}) {
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
        <span className="inline-flex items-center gap-1.5">
          <CoinIcon size={12} /> {stats.coinsEarned} earned
        </span>
        {/* Endless games are retired live-service titles — only worth a line
            when the player actually has some. */}
        {stats.endless > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <InfinityIcon size={12} className="text-accent/70" /> {stats.endless} endless
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
