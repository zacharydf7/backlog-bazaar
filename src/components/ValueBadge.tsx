import { Gem } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { totalCost } from "../lib/copies";
import {
  gameValueStatus,
  valueStatusOf,
  valueTooltip,
  type ValueStatus,
} from "../lib/valueMetrics";

/** The "Money Well Spent" chip (issue 6c60c213): appears once a game's logged
 *  playtime has paid off its real-money purchase price at the player's target
 *  cost-per-hour rate. The hover tooltip carries the math breakdown. Purely
 *  presentational — judgement happens in lib/valueMetrics. */
export function ValueBadge({ status, target }: { status: ValueStatus; target: number }) {
  if (!status.met) return null;
  return (
    <span
      title={valueTooltip(status, target)}
      className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success"
    >
      <Gem size={10} /> Well spent
    </span>
  );
}

/** The connected badge for one of YOUR game cards: judges `game` (or, when
 *  `members` rolls up a family, the summed spend/hours across every edition)
 *  against your target rate. Renders nothing while visiting another player —
 *  your personal target never judges someone else's library — or when the
 *  target is unset, the game cost nothing, or the goal isn't met yet. */
export function GameValueBadge({ game, members }: { game: Game; members?: Game[] }) {
  const target = useStore((s) => s.targetCostPerHour);
  const viewing = useStore((s) => s.viewing);
  if (viewing || target == null) return null;
  // Wishlist entries are unowned — their recorded costs are hunting notes, not
  // purchases — so they never contribute to a rollup (gameValueStatus applies
  // the same rule to a single card).
  const owned = (members ?? [game]).filter((m) => m.status !== "wishlist");
  if (owned.length === 0) return null;
  const status =
    owned.length === 1
      ? gameValueStatus(owned[0], target)
      : valueStatusOf(
          owned.reduce((sum, g) => sum + totalCost(g.copies), 0),
          owned.reduce((sum, g) => sum + (g.playedHours ?? 0), 0),
          target,
        );
  if (!status) return null;
  return <ValueBadge status={status} target={target} />;
}
