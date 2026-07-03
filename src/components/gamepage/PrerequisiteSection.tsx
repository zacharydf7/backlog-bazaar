import { useMemo, useState } from "react";
import { Lock, LockOpen, Search, X } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { prerequisiteOf, wouldCreateCycle } from "../../lib/prerequisites";
import { gameMatchesQuery } from "../../lib/librarySearch";

const PREREQ_STATUS_LABEL: Record<Game["status"], string> = {
  backlog: "In Bazaar",
  playing: "Now Playing",
  finished: "Finished",
  wishlist: "Wishlist",
};

/** "Requires prior completion of": link ONE game from your library that must be
 *  Finished before this one can be started. Acts immediately against the store
 *  (like family linking); the lock itself is derived — clearing the link or
 *  finishing the prerequisite unlocks instantly. */
export function PrerequisiteSection({ game }: { game: Game }) {
  const { games, setPrerequisite } = useStore();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  const live = games.find((g) => g.id === game.id) ?? game;
  const prereq = prerequisiteOf(games, live);
  const locked = prereq != null && prereq.status !== "finished";

  // Candidates: your own finishable games — not this one, not wishlist rows
  // (you can't finish what you don't own), and nothing that would close a loop.
  const candidates = useMemo(() => {
    if (!picking) return [];
    return games
      .filter(
        (g) =>
          g.id !== live.id &&
          g.status !== "wishlist" &&
          g.id !== live.prerequisiteGameId &&
          !wouldCreateCycle(games, live.id, g.id) &&
          gameMatchesQuery(g, query),
      )
      .slice(0, 6);
  }, [picking, games, live.id, live.prerequisiteGameId, query]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-sm text-muted">
        {locked ? (
          <Lock size={14} className="shrink-0 text-accent" />
        ) : (
          <LockOpen size={14} className="shrink-0 text-subtle" />
        )}
        Requires prior completion of
      </span>
      {prereq ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-panel/50 px-2.5 py-2">
          <div className="min-w-0">
            <span className="block truncate text-sm text-ink" title={prereq.title}>
              {prereq.title}
            </span>
            <span className="text-[11px] text-subtle">
              {PREREQ_STATUS_LABEL[prereq.status]}
              {prereq.status === "finished"
                ? " — unlocked"
                : " — locked until it's marked Finished"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void setPrerequisite(live.id, null)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <X size={12} /> Remove
          </button>
        </div>
      ) : picking ? (
        <div className="rounded-xl border border-line bg-panel p-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your collection…"
              className="w-full rounded-lg border border-line bg-surface py-1.5 pl-8 pr-8 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
            <button
              type="button"
              onClick={() => {
                setPicking(false);
                setQuery("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle transition hover:text-ink"
              aria-label="Close search"
            >
              <X size={14} />
            </button>
          </div>
          <ul className="mt-2 flex max-h-52 flex-col gap-1 overflow-y-auto">
            {candidates.length === 0 ? (
              <li className="px-1 py-2 text-xs text-subtle">No matching games.</li>
            ) : (
              candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void setPrerequisite(live.id, c.id);
                      setQuery("");
                      setPicking(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink" title={c.title}>
                      {c.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-subtle">
                      {PREREQ_STATUS_LABEL[c.status]}
                    </span>
                    <Lock size={13} className="shrink-0 text-accent" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink transition hover:border-brand/40 hover:text-accent"
        >
          <Lock size={13} className="text-accent" /> Set a prerequisite game
        </button>
      )}
      <span className="text-[10px] text-subtle">
        A story lock: this game can&apos;t move into Now Playing until the linked game is
        Finished. It unlocks the moment that happens.
      </span>
    </div>
  );
}
