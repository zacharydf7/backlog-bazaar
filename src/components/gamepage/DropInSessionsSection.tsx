import { useEffect, useState } from "react";
import { Gamepad2 } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { formatPlaytime } from "../../lib/playtime";
import type { PlaySession } from "../../lib/platformPlaytime";

/** The game's drop-in sessions (time logged after it was Finished, without
 *  moving it), newest first, each with its note. Nothing shows until there's
 *  one. Refetches when the played total changes, so a new drop-in appears. */
export function DropInSessionsSection({ game }: { game: Game }) {
  const fetchPlaySessions = useStore((s) => s.fetchPlaySessions);
  const [sessions, setSessions] = useState<PlaySession[]>([]);

  useEffect(() => {
    let active = true;
    void fetchPlaySessions(game.id).then((list) => {
      if (active) setSessions(list.filter((s) => s.dropIn));
    });
    return () => {
      active = false;
    };
  }, [game.id, game.playedHours, fetchPlaySessions]);

  if (sessions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <Gamepad2 size={14} className="shrink-0 text-accent" />
        Drop-in sessions <span className="text-subtle">({sessions.length})</span>
      </p>
      <ul className="flex flex-col gap-1 pl-[21px]">
        {sessions.map((s, i) => (
          <li
            key={`${s.createdAt}-${i}`}
            className="flex flex-wrap items-baseline gap-x-2 rounded-xl border border-line bg-panel/50 px-2.5 py-2 text-sm"
          >
            <span className="text-ink">{formatPlaytime(s.hours)}</span>
            <span className="text-xs text-subtle">
              {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
            {s.note && <span className="w-full break-words text-xs text-muted">{s.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
