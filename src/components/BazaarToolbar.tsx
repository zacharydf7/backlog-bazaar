import { ArrowDownUp, Layers, SlidersHorizontal, ThumbsUp, X } from "lucide-react";
import type { CopyFormat } from "../types";
import { formatLabel } from "../lib/copies";
import { FilterChips } from "./FilterChips";
import {
  activeFilterCount,
  EMPTY_FILTERS,
  hasActiveFilters,
  SORT_OPTIONS,
  toggleFilter,
  type Facets,
  type Filters,
  type SortKey,
} from "../lib/bazaarView";

const selectClass =
  "rounded-lg border border-line bg-panel px-2.5 py-2 text-sm text-ink outline-none transition focus:border-brand";

/** Sort + multi-select slicers for a game board. Collapses to a compact bar on
 *  phones; the slicer checkboxes live in an expandable panel so the controls
 *  never crowd a narrow screen. */
export function BazaarToolbar({
  sortKey,
  onSortChange,
  filters,
  onFiltersChange,
  open,
  onOpenChange,
  facets,
  total,
  shown,
  action,
  stacking,
}: {
  sortKey: SortKey;
  onSortChange: (k: SortKey) => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  /** Whether the facet panel is expanded. Controlled by the parent so the choice
   *  survives leaving the board for a game page and coming back (issue 7bea6684). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facets: Facets;
  total: number;
  shown: number;
  /** Optional board-specific action rendered in the bar (e.g. the Bazaar's
   *  Mystery Pull button). */
  action?: React.ReactNode;
  /** Optional "Stack by game" view toggle (grid boards): per-platform copies
   *  of one game render as a single fan-out deck while it's on. */
  stacking?: { on: boolean; onToggle: () => void };
}) {
  const count = activeFilterCount(filters);
  const active = hasActiveFilters(filters);
  const hasFacets = facets.platforms.length > 0 || facets.formats.length > 0;

  return (
    <div className="mb-5 rounded-xl border border-line bg-surface p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Sort */}
        <label className="inline-flex items-center gap-1.5 text-sm text-muted">
          <ArrowDownUp size={15} className="text-subtle" />
          <span className="sr-only sm:not-sr-only">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            className={selectClass}
            aria-label="Sort games"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

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

        {/* Favorites-only: a first-class one-tap slice (not buried in the
            facet panel), so curating down to liked games is instant. */}
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

        {/* Stack by game: copies of one game across platforms fold into a
            fan-out deck. A view preference, not a filter — counts unchanged. */}
        {stacking && (
          <button
            onClick={stacking.onToggle}
            aria-pressed={stacking.on}
            title="Stack copies of the same game into one deck"
            className={
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm transition " +
              (stacking.on
                ? "border-brand/50 bg-brand/10 text-accent"
                : "border-line bg-panel text-ink hover:bg-panel/70")
            }
          >
            <Layers size={15} /> Stack
          </button>
        )}

        {active && (
          <button
            onClick={() => onFiltersChange(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 text-xs text-subtle transition hover:text-danger"
          >
            <X size={13} /> Clear
          </button>
        )}

        {action}

        <span className="ml-auto text-xs text-muted">
          {active ? `${shown} of ${total}` : `${total} ${total === 1 ? "game" : "games"}`}
        </span>
      </div>

      {open && hasFacets && (
        <div className="mt-2.5 space-y-3 border-t border-line pt-3">
          <FilterChips
            title="Platform"
            options={facets.platforms}
            selected={filters.platforms}
            onToggle={(p) => onFiltersChange({ ...filters, platforms: toggleFilter(filters.platforms, p) })}
          />
          {facets.formats.length > 0 && (
            <FilterChips
              title="Format"
              options={facets.formats}
              labelOf={(f) => formatLabel(f as CopyFormat)}
              selected={filters.formats}
              onToggle={(f) =>
                onFiltersChange({
                  ...filters,
                  formats: toggleFilter(filters.formats, f as CopyFormat),
                })
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
