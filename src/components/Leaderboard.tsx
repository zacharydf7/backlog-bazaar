import { useEffect, useState } from "react";
import { useStore } from "../store";
import type { LeaderboardRow } from "../lib/supabase";
import type { Game } from "../types";

const MEDALS = ["🥇", "🥈", "🥉"];

const STATUS_META: Record<Game["status"], { label: string; icon: string }> = {
  playing: { label: "Now Playing", icon: "🎮" },
  backlog: { label: "In the Bazaar", icon: "🏪" },
  finished: { label: "Finished", icon: "🏆" },
  wishlist: { label: "Wishlist", icon: "♡" },
};
const STATUS_ORDER: Game["status"][] = ["playing", "backlog", "finished", "wishlist"];

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}

export function Leaderboard({ onClose }: { onClose: () => void }) {
  const { fetchLeaderboard, fetchPlayerLibrary, userId } = useStore();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);

  // Drill-down into one player's library.
  const [selected, setSelected] = useState<LeaderboardRow | null>(null);
  const [library, setLibrary] = useState<Game[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchLeaderboard()
      .then((r) => active && setRows(r))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [fetchLeaderboard]);

  function openPlayer(p: LeaderboardRow) {
    setSelected(p);
    setLibrary(null);
    fetchPlayerLibrary(p.id)
      .then(setLibrary)
      .catch(() => setLibrary([]));
  }

  function back() {
    setSelected(null);
    setLibrary(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <div className="flex items-center gap-2">
            {selected && (
              <button
                onClick={back}
                className="rounded-md px-2 py-1 text-muted transition hover:bg-panel hover:text-ink"
                title="Back to leaderboard"
              >
                ‹
              </button>
            )}
            <h2 className="font-display text-xl text-ink">
              {selected ? `${selected.displayName}'s library` : "🏆 Leaderboard"}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted transition hover:text-ink">
            ✕
          </button>
        </div>

        <div className="p-4">
          {!selected ? (
            <>
              {error && (
                <p className="text-sm text-danger">Couldn&apos;t load the leaderboard.</p>
              )}
              {!rows && !error && <p className="text-sm text-muted">Loading…</p>}
              {rows && rows.length === 0 && <p className="text-sm text-muted">No players yet.</p>}

              <div className="flex flex-col gap-2">
                {rows?.map((r, i) => {
                  const me = r.id === userId;
                  return (
                    <button
                      key={r.id}
                      onClick={() => openPlayer(r)}
                      className={
                        "flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition hover:border-brand/50 " +
                        (me ? "border-brand/50 bg-brand/10" : "border-line bg-panel")
                      }
                    >
                      <span className="w-7 text-center text-lg">
                        {MEDALS[i] ?? <span className="text-subtle">{i + 1}</span>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-ink">
                          {r.displayName}{" "}
                          {me && <span className="text-xs text-accent">(you)</span>}
                        </div>
                        <div className="text-xs text-subtle">
                          {r.gamesFinished} finished · {r.hoursFinished}h played
                        </div>
                      </div>
                      <div className="font-display text-lg text-accent">🪙 {r.coins}</div>
                      <span className="text-subtle">›</span>
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 text-center text-[11px] text-subtle">
                Ranked by coin balance. Tap a player to peek at their backlog.
              </p>
            </>
          ) : (
            <PlayerLibrary library={library} />
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerLibrary({ library }: { library: Game[] | null }) {
  if (!library) return <p className="text-sm text-muted">Loading library…</p>;
  if (library.length === 0)
    return <p className="text-sm text-muted">This player hasn&apos;t added any games yet.</p>;

  return (
    <div className="flex flex-col gap-4">
      {STATUS_ORDER.map((status) => {
        const games = library.filter((g) => g.status === status);
        if (games.length === 0) return null;
        const meta = STATUS_META[status];
        return (
          <div key={status}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {meta.icon} {meta.label} ({games.length})
            </h3>
            <div className="flex flex-col gap-1.5">
              {games.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-3 rounded-xl border border-line bg-panel p-2"
                >
                  <div className="h-9 w-12 flex-shrink-0 overflow-hidden rounded bg-surface">
                    {g.image && (
                      <img src={g.image} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{g.title}</div>
                    <div className="text-xs text-subtle">
                      {year(g.released)} · {g.hours ? `${g.hours}h` : "length ?"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
