import { useEffect, useState } from "react";
import {
  Trophy,
  Heart,
  Store,
  Gamepad2,
  ChevronLeft,
  ChevronRight,
  X,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { CoinIcon } from "./CoinIcon";
import { Avatar } from "./Avatar";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { formatPlaytime } from "../lib/playtime";
import type { LeaderboardRow } from "../lib/supabase";
import type { Game } from "../types";

const MEDALS = ["🥇", "🥈", "🥉"];

const STATUS_META: Record<Game["status"], { label: string; icon: LucideIcon }> = {
  playing: { label: "Now Playing", icon: Gamepad2 },
  backlog: { label: "In the Bazaar", icon: Store },
  finished: { label: "Finished", icon: Trophy },
  wishlist: { label: "Wishlist", icon: Heart },
};
const STATUS_ORDER: Game["status"][] = ["playing", "backlog", "finished", "wishlist"];

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}

export function Leaderboard() {
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
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line p-4">
          <div className="flex items-center gap-2">
            {selected && (
              <button
                onClick={back}
                className="grid place-items-center rounded-md p-1 text-muted transition hover:bg-panel hover:text-ink"
                title="Back to leaderboard"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
              {selected ? (
                <>
                  <Avatar url={selected.avatarUrl} name={selected.displayName} size={24} />
                  {selected.displayName}&apos;s library
                </>
              ) : (
                <>
                  <Trophy size={18} className="text-accent" /> Leaderboard
                </>
              )}
            </h2>
          </div>
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
                      <span className="w-6 text-center text-lg">
                        {MEDALS[i] ?? <span className="text-subtle">{i + 1}</span>}
                      </span>
                      <Avatar url={r.avatarUrl} name={r.displayName} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-ink">
                          {r.displayName}{" "}
                          {me && <span className="text-xs text-accent">(you)</span>}
                        </div>
                        <div className="text-xs text-subtle">
                          {r.gamesFinished} finished · {r.hoursFinished}h played
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-1 font-display text-lg text-accent">
                        <CoinIcon size={15} /> {r.coins}
                      </div>
                      <ChevronRight size={16} className="text-subtle" />
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
        const Icon = meta.icon;
        return (
          <div key={status}>
            <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Icon size={14} /> {meta.label} ({games.length})
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
                      {g.playedHours ? (
                        <span className="text-accent"> · {formatPlaytime(g.playedHours)} played</span>
                      ) : null}
                    </div>
                    {status === "playing" && g.progressNote && (
                      <div className="mt-1 flex items-start gap-1 text-[11px] text-muted">
                        <StickyNote size={11} className="mt-0.5 shrink-0 text-accent" />
                        <span className="whitespace-pre-wrap break-words">{g.progressNote}</span>
                      </div>
                    )}
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
