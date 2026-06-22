import { useEffect, useState } from "react";
import { Trophy, ChevronRight } from "lucide-react";
import { CoinIcon } from "./CoinIcon";
import { AvatarWithPresence } from "./PresenceDot";
import { useStore } from "../store";
import { isOnline, lastSeenLabel } from "../lib/presence";
import { TitleBadge } from "./TitleBadge";
import type { LeaderboardRow } from "../lib/supabase";

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard() {
  const { fetchLeaderboard, openUserBazaar, userId } = useStore();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);

  // Load once, then poll so presence (online dots + activity) stays fresh and the
  // online-window math re-evaluates on each refetch. Only the first load shows the
  // "Loading…" state; later polls quietly replace the rows.
  useEffect(() => {
    let active = true;
    const load = () =>
      fetchLeaderboard()
        .then((r) => {
          if (!active) return;
          setRows(r);
          setError(false);
        })
        .catch(() => active && setError(true));
    load();
    const id = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [fetchLeaderboard]);

  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <Trophy size={18} className="text-accent" /> Leaderboard
        </h2>
      </div>

      <div className="p-4">
        {error && <p className="text-sm text-danger">Couldn&apos;t load the leaderboard.</p>}
        {!rows && !error && <p className="text-sm text-muted">Loading…</p>}
        {rows && rows.length === 0 && <p className="text-sm text-muted">No players yet.</p>}

        <div className="flex flex-col gap-2">
          {rows?.map((r, i) => {
            const me = r.id === userId;
            const online = isOnline(r.lastSeenAt);
            return (
              <button
                key={r.id}
                onClick={() => !me && void openUserBazaar(r.id)}
                disabled={me}
                title={me ? "This is you" : `Visit ${r.displayName}'s Bazaar`}
                className={
                  "flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition " +
                  (me
                    ? "cursor-default border-brand/50 bg-brand/10"
                    : "border-line bg-panel hover:border-brand/50")
                }
              >
                <span className="w-6 text-center text-lg">
                  {MEDALS[i] ?? <span className="text-subtle">{i + 1}</span>}
                </span>
                <AvatarWithPresence
                  url={r.avatarUrl}
                  name={r.displayName}
                  size={36}
                  online={online}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-ink">
                      {r.displayName} {me && <span className="text-xs text-accent">(you)</span>}
                    </span>
                    {r.title && <TitleBadge badge={r.title} size="xs" />}
                  </div>
                  <div className="truncate text-xs text-subtle">
                    {online && r.activity ? (
                      <span className="text-success">{r.activity}</span>
                    ) : lastSeenLabel(r.lastSeenAt) ? (
                      lastSeenLabel(r.lastSeenAt)
                    ) : (
                      `${r.gamesFinished} finished · ${r.hoursFinished}h played`
                    )}
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 font-display text-lg text-accent">
                  <CoinIcon size={15} /> {r.coins}
                </div>
                {!me && <ChevronRight size={16} className="text-subtle" />}
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-center text-[11px] text-subtle">
          Ranked by coin balance. Tap a player to visit their Bazaar.
        </p>
      </div>
    </div>
  );
}
