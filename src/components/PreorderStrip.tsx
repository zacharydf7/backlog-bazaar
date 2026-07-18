import { CalendarClock } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { gameHash } from "../lib/route";
import { upcomingPreorders, preorderCountdownLabel, isPreorderOut } from "../lib/preorders";

/** The Bazaar board's "Coming up" digest: every live pre-order as a chip in
 *  arrival order, each opening its game's page. Sits above the grid (where the
 *  pre-ordered cards also pin as a group); renders nothing when there are no
 *  pre-orders, so plain Bazaars look exactly as before. Read-only while
 *  visiting — the chips just route into the visited library's pages. */
export function PreorderStrip({ games }: { games: Game[] }) {
  const viewing = useStore((s) => s.viewing);
  const upcoming = upcomingPreorders(games);
  if (upcoming.length === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-3">
      <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent">
        <CalendarClock size={14} /> Coming up
      </div>
      <div className="flex flex-wrap gap-1.5">
        {upcoming.map((g) => {
          const out = isPreorderOut(g);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                window.location.hash = gameHash(g.id, viewing?.userId ?? null);
              }}
              title={`Open ${g.title}`}
              className={
                "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition " +
                (out
                  ? "border-brand/50 bg-brand/10 font-semibold text-accent hover:bg-brand/20"
                  : "border-line bg-panel text-ink hover:border-brand/40")
              }
            >
              <span className="truncate">{g.title}</span>
              <span className={"shrink-0 " + (out ? "" : "text-subtle")}>
                {preorderCountdownLabel(g.preorderExpectedOn)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
