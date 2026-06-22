import { useMemo, useState } from "react";
import { Link2, Unlink, Search, X, Library, Clock, Banknote } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { familySiblings, familyMembers, familyStats } from "../lib/families";
import { formatPlaytime } from "../lib/playtime";
import { formatUsd } from "../lib/copies";

const statusLabel: Record<Game["status"], string> = {
  backlog: "In Bazaar",
  playing: "Now Playing",
  finished: "Finished",
  wishlist: "Wishlist",
};

/** Manage a game's "Game Family": the editions/remasters/cross-platform releases
 *  of the same core title. Lists currently-linked editions (with their combined
 *  stats) and lets you search your collection to link another. Acts immediately
 *  (independent of the Edit form's Save). */
export function LinkedEditions({ game }: { game: Game }) {
  const { games, linkGames, unlinkGame } = useStore();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const siblings = familySiblings(games, game);
  const stats = familyStats(familyMembers(games, game));

  // Candidates: any other game not already in this family, matched by title.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games
      .filter(
        (g) =>
          g.id !== game.id &&
          !(game.familyId != null && g.familyId === game.familyId) &&
          (q === "" || g.title.toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [games, game.id, game.familyId, query]);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted">
        Linked editions{" "}
        <span className="text-xs text-subtle">
          — group other versions of this title to track combined time &amp; cost
        </span>
      </span>

      {siblings.length > 0 && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-2.5">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-accent">
            <span className="inline-flex items-center gap-1 font-medium">
              <Library size={12} /> Family of {stats.count}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={12} /> {formatPlaytime(stats.totalPlayed)} total
            </span>
            {stats.totalCost > 0 && (
              <span className="inline-flex items-center gap-1">
                <Banknote size={12} /> {formatUsd(stats.totalCost)} spent
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-1">
            {siblings.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {s.title}
                  <span className="ml-1.5 text-[11px] text-subtle">{statusLabel[s.status]}</span>
                </span>
                <button
                  type="button"
                  onClick={() => unlinkGame(s.id)}
                  title={`Unlink ${s.title}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted transition hover:bg-danger/10 hover:text-danger"
                >
                  <Unlink size={12} /> Unlink
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {adding ? (
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
                setAdding(false);
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
              <li className="px-1 py-2 text-xs text-subtle">
                {games.length <= 1 ? "Add more games to link them." : "No matching games."}
              </li>
            ) : (
              candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void linkGames(game.id, c.id);
                      setQuery("");
                      setAdding(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {c.title}
                      <span className="ml-1.5 text-[11px] text-subtle">{statusLabel[c.status]}</span>
                    </span>
                    <Link2 size={13} className="shrink-0 text-accent" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink transition hover:border-brand/40 hover:text-accent"
        >
          <Link2 size={14} className="text-accent" /> Link to another edition
        </button>
      )}
    </div>
  );
}
