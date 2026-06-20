import { useEffect, useState } from "react";
import { useStore } from "../store";
import type { LeaderboardRow } from "../lib/supabase";

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ onClose }: { onClose: () => void }) {
  const { fetchLeaderboard, userId } = useStore();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchLeaderboard()
      .then((r) => active && setRows(r))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [fetchLeaderboard]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-stone-700 bg-stone-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-700 p-4">
          <h2 className="font-display text-xl text-amber-100">🏆 Leaderboard</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="p-4">
          {error && <p className="text-sm text-red-400">Couldn&apos;t load the leaderboard.</p>}
          {!rows && !error && <p className="text-sm text-stone-400">Loading…</p>}
          {rows && rows.length === 0 && (
            <p className="text-sm text-stone-400">No players yet.</p>
          )}

          <div className="flex flex-col gap-2">
            {rows?.map((r, i) => {
              const me = r.id === userId;
              return (
                <div
                  key={r.id}
                  className={
                    "flex items-center gap-3 rounded-lg border px-3 py-2 " +
                    (me
                      ? "border-amber-600/60 bg-amber-950/30"
                      : "border-stone-700 bg-stone-900/40")
                  }
                >
                  <span className="w-7 text-center text-lg">
                    {MEDALS[i] ?? <span className="text-stone-500">{i + 1}</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-stone-100">
                      {r.displayName} {me && <span className="text-xs text-amber-400">(you)</span>}
                    </div>
                    <div className="text-xs text-stone-500">
                      {r.gamesFinished} finished · {r.hoursFinished}h played
                    </div>
                  </div>
                  <div className="font-display text-lg text-amber-300">🪙 {r.coins}</div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-center text-[11px] text-stone-500">
            Ranked by coin balance. Only totals are shared — your actual backlog stays private.
          </p>
        </div>
      </div>
    </div>
  );
}
