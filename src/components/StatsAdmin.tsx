import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Coins,
  Clock,
  Trophy,
  TrendingUp,
  TrendingDown,
  Gamepad2,
  Tag,
  Monitor,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { formatPlaytime } from "../lib/playtime";
import {
  STATS_TIMEFRAMES,
  timeframeRange,
  netCoins,
  completionPct,
  backlogDeficit,
  type StatsTimeframe,
} from "../lib/stats";
import type { AdminUser, UserStats } from "../types";

const inputClass =
  "w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand";

/** One labelled stat tile. `value` is the headline; `children` is optional
 *  supporting detail underneath. */
function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-1 font-display text-xl text-ink">{value}</div>
      {children && <div className="mt-1 text-xs text-muted">{children}</div>}
    </div>
  );
}

/** A "top X" value (game / genre / system): an icon plus the label, which wraps
 *  to show the full name on any device. A hover tooltip surfaces it too. */
function TopValue({ icon: Icon, text }: { icon: LucideIcon; text: string | null }) {
  return (
    <span className="flex items-start gap-1 text-base" title={text ?? undefined}>
      <Icon size={15} className="mt-0.5 shrink-0 text-accent" />
      <span className="break-words">{text ?? "—"}</span>
    </span>
  );
}

/** Admin-only analytics dashboard: pick a player and a timeframe, see their
 *  rolled-up stats. The aggregation is server-side (admin_user_stats); this just
 *  selects the window and renders the row. */
export function StatsAdmin() {
  const { isAdmin, userId, fetchUsers, fetchUserStats } = useStore();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [selected, setSelected] = useState<string>(userId ?? "");
  const [timeframe, setTimeframe] = useState<StatsTimeframe>("month");
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchUsers().then((list) => {
      if (!alive) return;
      const sorted = [...list].sort((a, b) => a.displayName.localeCompare(b.displayName));
      setUsers(sorted);
      // Default to viewing yourself if you're in the list, else the first player.
      setSelected((cur) => cur || userId || sorted[0]?.id || "");
    });
    return () => {
      alive = false;
    };
  }, [fetchUsers, userId]);

  useEffect(() => {
    if (!selected) {
      setStats(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const { from, to } = timeframeRange(timeframe);
    void fetchUserStats(selected, from, to).then((s) => {
      if (!alive) return;
      setStats(s);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [selected, timeframe, fetchUserStats]);

  const net = useMemo(() => (stats ? netCoins(stats) : 0), [stats]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">
        The Stats dashboard is admin-only.
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div>
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <BarChart3 size={18} className="text-accent" /> Stats
        </h2>
        <p className="mt-1 text-sm text-muted">
          A player&apos;s activity for the chosen window. Admin-only for now.
        </p>
      </div>

      {/* Controls: player + timeframe. Wrap on narrow screens. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm text-ink">
          <span className="text-xs text-subtle">Player</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={inputClass + " mt-1"}
          >
            {users == null && <option value="">Loading…</option>}
            {users?.length === 0 && <option value="">No players</option>}
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
                {u.id === userId ? " (you)" : ""}
                {u.hidden ? " · hidden" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {STATS_TIMEFRAMES.map((t) => {
            const active = timeframe === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTimeframe(t.value)}
                aria-pressed={active}
                className={
                  "rounded-lg border px-3 py-2 text-sm font-medium transition " +
                  (active
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-line bg-panel text-muted hover:text-ink")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading && !stats ? (
        <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">
          Loading…
        </div>
      ) : !stats ? (
        <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">
          Pick a player to see their stats.
        </div>
      ) : (
        <div className={"flex flex-col gap-5 transition-opacity " + (loading ? "opacity-50" : "")}>
          {/* Economy */}
          <section>
            <h3 className="mb-2 inline-flex items-center gap-2 font-display text-lg text-ink">
              <Coins size={16} className="text-accent" /> Economy
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Earned"
                value={
                  <span className="inline-flex items-center gap-1 text-success">
                    <TrendingUp size={16} /> {stats.coinsEarned.toLocaleString()}
                  </span>
                }
              />
              <Stat
                label="Spent"
                value={
                  <span className="inline-flex items-center gap-1 text-danger">
                    <TrendingDown size={16} /> {stats.coinsSpent.toLocaleString()}
                  </span>
                }
              />
              <Stat
                label="Net"
                value={
                  <span className="inline-flex items-center gap-1">
                    <CoinIcon size={15} /> {net >= 0 ? "+" : "−"}
                    {Math.abs(net).toLocaleString()}
                  </span>
                }
              />
              <Stat
                label="Sunk Costs"
                value={
                  <span className="inline-flex items-center gap-1 text-muted">
                    <CoinIcon size={15} /> {stats.sunkCost.toLocaleString()}
                  </span>
                }
              >
                forfeited to Shelve It
              </Stat>
            </div>
          </section>

          {/* Backlog health */}
          <section>
            <h3 className="mb-2 inline-flex items-center gap-2 font-display text-lg text-ink">
              <Trophy size={16} className="text-accent" /> Backlog health
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Added" value={stats.gamesAdded} />
              <Stat label="Finished" value={stats.gamesFinished} />
              <Stat label="Shelved" value={stats.gamesShelved} />
              <Stat label="Completion" value={`${completionPct(stats)}%`}>
                finished vs. dropped
              </Stat>
            </div>
            <p className="mt-2 text-xs text-muted">
              Backlog deficit:{" "}
              <span className={backlogDeficit(stats) > 0 ? "text-danger" : "text-success"}>
                {backlogDeficit(stats) > 0 ? "+" : ""}
                {backlogDeficit(stats)}
              </span>{" "}
              (added − finished; positive means the backlog grew).
            </p>
          </section>

          {/* Playstyle */}
          <section>
            <h3 className="mb-2 inline-flex items-center gap-2 font-display text-lg text-ink">
              <Clock size={16} className="text-accent" /> Playstyle
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Hours played" value={formatPlaytime(stats.hoursPlayed)} />
              <Stat label="Top game" value={<TopValue icon={Gamepad2} text={stats.topGame} />} />
              <Stat label="Top genre" value={<TopValue icon={Tag} text={stats.topGenre} />} />
              <Stat label="Top system" value={<TopValue icon={Monitor} text={stats.topPlatform} />} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
