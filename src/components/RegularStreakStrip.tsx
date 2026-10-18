import { RefreshCw } from "lucide-react";
import { useStore } from "../store";
import { formatPlaytime } from "../lib/playtime";
import { boostWithoutGame, boostedReward, spanUntil } from "../lib/bonusEvents";
import { CoinIcon } from "./CoinIcon";

/** The Regular streak on the Now Playing board: weeks in a row with at least
 *  an hour (admin-set) of play on Rotation games, the Rotation player's Clear
 *  Streak. Shows this week's progress and what the next Regular week pays.
 *  Own board only, and only for players with a Rotation game. */
export function RegularStreakStrip() {
  const streak = useStore((s) => s.regularStreak);
  const viewing = useStore((s) => s.viewing);
  const economyOn = useStore((s) => s.economyEnabled);
  const events = useStore((s) => s.bonusEvents);
  const hasRotation = useStore((s) => s.games.some((g) => g.status === "playing" && g.inRotation === true));
  if (viewing || !streak || !hasRotation) return null;

  const left = Math.max(0, streak.minHours - streak.weekHours);
  const fraction = streak.minHours > 0 ? Math.min(1, streak.weekHours / streak.minHours) : 1;
  const coins = economyOn && streak.nextBonus > 0;
  // A live event's play boost aimed at every game covers a Regular week too.
  const boost = boostWithoutGame(events, Date.now(), "session");
  const next = boostedReward(streak.nextBonus, boost);
  return (
    <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          <RefreshCw size={15} className="text-accent" />
          {streak.streak > 0
            ? `Regular streak: ${streak.streak} ${streak.streak === 1 ? "week" : "weeks"}`
            : "Start a Regular streak"}
        </p>
        {streak.best > streak.streak && <span className="text-xs text-subtle">Best: {streak.best} weeks</span>}
      </div>
      {streak.done ? (
        <p className="mt-1 text-xs text-muted">
          This week counts.{" "}
          {coins ? (
            <>
              Play again next week for <CoinIcon size={11} /> {streak.nextBonus}.
            </>
          ) : (
            "Play again next week to keep it going."
          )}
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Play {formatPlaytime(left)} more on Rotation games this week
            {coins ? (
              <>
                {" "}
                for <CoinIcon size={11} /> {next}
                {boost && ` (${boost.event})`}
              </>
            ) : null}
            {streak.weekEnds > 0 && ` · ${spanUntil(streak.weekEnds, Date.now())} left`}.
          </p>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="This week's Rotation play toward a Regular week"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${fraction * 100}%` }} />
          </div>
        </>
      )}
    </div>
  );
}
