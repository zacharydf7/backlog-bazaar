import { useMemo, useState } from "react";
import { Library, Layers, SlidersHorizontal, Clock, Trophy, X } from "lucide-react";
import { useStore } from "../store";
import { GameCard } from "./GameCard";
import { FilterChips } from "./FilterChips";
import { StatusBadge } from "./StatusBadge";
import { CoinIcon } from "./CoinIcon";
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
 *  groupable dashboard, with account-wide library-health metrics up top. */
export function MasterLedger() {
  const games = useStore((s) => s.games);
  const [groupBy, setGroupBy] = useState<LedgerGroupBy>("none");
  const [filters, setFilters] = useState<LedgerFilters>(EMPTY_LEDGER_FILTERS);

  const owned = useMemo(() => ownedGames(games), [games]);
  const stats = useMemo(() => ledgerStats(owned), [owned]);
  const facets = useMemo(() => ledgerFacets(owned), [owned]);
  const filtered = useMemo(() => applyLedgerFilters(owned, filters), [owned, filters]);
  const groups = useMemo(() => groupLedger(filtered, groupBy), [filtered, groupBy]);

  const heading = (
    <h2 className="inline-flex items-center gap-2 font-display text-2xl tracking-tight text-ink">
      <Library size={22} className="text-accent" /> Master Ledger
    </h2>
  );

  if (owned.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {heading}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line py-16 text-center">
          <p className="font-display text-xl text-ink">Nothing in your collection yet</p>
          <p className="max-w-md text-sm text-muted">
            Games you own — in the Bazaar, Now Playing, or Finished — gather here. Add or buy a game
            to start your ledger. (Wishlist games aren&apos;t shown; you don&apos;t own them yet.)
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {heading}

      {/* Account-wide library health — sticks below the app chrome while you scroll. */}
      <div className="sticky top-16 z-10 -mx-4 border-y border-line bg-canvas/95 px-4 py-3 backdrop-blur md:top-14 md:-mx-6 md:px-6">
        <StatsBar stats={stats} />
      </div>

      <LedgerToolbar
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        filters={filters}
        onFiltersChange={setFilters}
        facets={facets}
        total={owned.length}
        shown={filtered.length}
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
          <p className="font-display text-xl text-ink">No games match your filters</p>
          <p className="max-w-md text-sm text-muted">Try removing a filter to widen your search.</p>
          <button
            onClick={() => setFilters(EMPTY_LEDGER_FILTERS)}
            className="mt-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel"
          >
            Clear filters
          </button>
        </div>
      ) : (
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
                    <GameCard game={g} showStatus />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** The sticky summary: two headline metrics plus a per-status breakdown and a
 *  completion progress bar. */
function StatsBar({ stats }: { stats: LedgerStats }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Metric value={String(stats.total)} label="Games owned" />
        <Metric value={`${stats.completionPct}%`} label="Completed" />
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
        aria-valuenow={stats.completionPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Library completion"
      >
        <div className="h-full rounded-full bg-success" style={{ width: `${stats.completionPct}%` }} />
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

/** Group-by toggle + multi-select slicers (Status, Platform, Genre). Mirrors the
 *  Bazaar toolbar's collapse-on-mobile pattern. */
function LedgerToolbar({
  groupBy,
  onGroupByChange,
  filters,
  onFiltersChange,
  facets,
  total,
  shown,
}: {
  groupBy: LedgerGroupBy;
  onGroupByChange: (g: LedgerGroupBy) => void;
  filters: LedgerFilters;
  onFiltersChange: (f: LedgerFilters) => void;
  facets: ReturnType<typeof ledgerFacets>;
  total: number;
  shown: number;
}) {
  const [open, setOpen] = useState(false);
  const count = ledgerFilterCount(filters);
  const active = count > 0;
  const hasFacets =
    facets.statuses.length > 0 || facets.platforms.length > 0 || facets.genres.length > 0;

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
            onClick={() => setOpen((v) => !v)}
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

        {active && (
          <button
            onClick={() => onFiltersChange(EMPTY_LEDGER_FILTERS)}
            className="inline-flex items-center gap-1 text-xs text-subtle transition hover:text-danger"
          >
            <X size={13} /> Clear
          </button>
        )}

        <span className="ml-auto text-xs text-muted">
          {active ? `${shown} of ${total}` : `${total} ${total === 1 ? "game" : "games"}`}
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
          <FilterChips
            title="Genre"
            options={facets.genres}
            selected={filters.genres}
            onToggle={(g) =>
              onFiltersChange({ ...filters, genres: toggleLedgerValue(filters.genres, g) })
            }
          />
        </div>
      )}
    </div>
  );
}
