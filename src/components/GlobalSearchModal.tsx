import { useEffect, useRef } from "react";
import { Search, X, Plus, Lock } from "lucide-react";
import type { Game } from "../types";
import { StatusBadge } from "./StatusBadge";
import { isInRotation } from "../lib/status";
import { gameOwnedPlatforms } from "../lib/bazaarView";
import { useScrollLock } from "../lib/useScrollLock";

/** The global results overlay: every game matching the query across all boards
 *  (Wishlist, Bazaar, Now Playing, Finished). Because a match might not be on the
 *  board you're looking at, this surfaces it regardless of status — each row
 *  carries a status badge so you instantly know where it lives. Picking a result
 *  jumps to its board and opens it.
 *
 *  When visiting another player the list is their (privacy-filtered) library and
 *  the empty state is informational; on your own profile an empty result offers a
 *  one-tap "Add game" so searching flows straight into adding. */
export function GlobalSearchModal({
  query,
  onQueryChange,
  results,
  onPick,
  onClose,
  onAddGame,
  visitingName = null,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  results: Game[];
  onPick: (game: Game) => void;
  onClose: () => void;
  /** Provided only on your own profile — opens Add game seeded with the query. */
  onAddGame?: (query: string) => void;
  /** The visited player's name when scoped to their library, else null. */
  visitingName?: string | null;
}) {
  useScrollLock(true);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = query.trim();
  const placeholder = visitingName ? `Search ${visitingName}'s games…` : "Search your games…";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative mt-2 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl sm:mt-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input row */}
        <div className="flex items-center gap-2 border-b border-line p-3">
          <Search size={18} className="shrink-0 text-subtle" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (query) onQueryChange("");
                else onClose();
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-subtle focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="shrink-0 rounded-lg p-1 text-subtle transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* Results / empty states */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {trimmed === "" ? (
            <p className="px-3 py-10 text-center text-sm text-muted">
              Start typing to search {visitingName ? `${visitingName}'s library` : "your library"} by
              title, platform, or franchise.
            </p>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <p className="text-sm text-muted">
                {visitingName ? (
                  <>
                    {visitingName} has no games matching{" "}
                    <span className="font-medium text-ink">“{trimmed}”</span>.
                  </>
                ) : (
                  <>
                    No games in your library match{" "}
                    <span className="font-medium text-ink">“{trimmed}”</span>.
                  </>
                )}
              </p>
              {onAddGame && (
                <button
                  type="button"
                  onClick={() => onAddGame(trimmed)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
                >
                  <Plus size={16} /> Add “{trimmed}”
                </button>
              )}
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {results.map((g) => (
                <li key={g.id}>
                  <ResultRow game={g} onPick={() => onPick(g)} showLock={!visitingName} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** A single result: cover, title + platforms, and a status badge. */
function ResultRow({
  game,
  onPick,
  showLock,
}: {
  game: Game;
  onPick: () => void;
  showLock: boolean;
}) {
  const platforms = gameOwnedPlatforms(game);
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-panel"
    >
      <div className="h-12 w-9 shrink-0 overflow-hidden rounded-md border border-line bg-panel">
        {game.image ? (
          <img src={game.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-lg opacity-50">🎮</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-ink">{game.title}</span>
          {showLock && game.private && (
            <Lock size={12} className="shrink-0 text-subtle" aria-label="Private" />
          )}
        </div>
        {platforms.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted">{platforms.join(" · ")}</p>
        )}
      </div>
      <StatusBadge status={game.status} rotation={isInRotation(game)} className="shrink-0" />
    </button>
  );
}
