import { useState } from "react";
import { ArrowDownUp, SlidersHorizontal, X } from "lucide-react";
import type { CopyFormat } from "../types";
import { formatLabel } from "../lib/copies";
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
  facets,
  total,
  shown,
}: {
  sortKey: SortKey;
  onSortChange: (k: SortKey) => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  facets: Facets;
  total: number;
  shown: number;
}) {
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);
  const active = hasActiveFilters(filters);
  const hasFacets =
    facets.platforms.length > 0 || facets.genres.length > 0 || facets.formats.length > 0;

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
            onClick={() => onFiltersChange(EMPTY_FILTERS)}
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
          <FilterGroup
            title="Platform"
            options={facets.platforms}
            selected={filters.platforms}
            onToggle={(p) => onFiltersChange({ ...filters, platforms: toggleFilter(filters.platforms, p) })}
          />
          <FilterGroup
            title="Genre"
            options={facets.genres}
            selected={filters.genres}
            onToggle={(g) => onFiltersChange({ ...filters, genres: toggleFilter(filters.genres, g) })}
          />
          {facets.formats.length > 0 && (
            <FilterGroup
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

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
  labelOf,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  labelOf?: (value: string) => string;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              onClick={() => onToggle(o)}
              aria-pressed={on}
              className={
                "rounded-full border px-2.5 py-1 text-xs transition " +
                (on
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-panel text-muted hover:border-brand/50 hover:text-ink")
              }
            >
              {labelOf ? labelOf(o) : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
