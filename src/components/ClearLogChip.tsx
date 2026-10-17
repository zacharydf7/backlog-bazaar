import { BadgeCheck, Clock } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { formatPlaytime } from "../lib/playtime";
import { effectiveLength } from "../lib/personalLength";
import { isVerifiedClear } from "../lib/bountyHold";
import { CoinIcon } from "./CoinIcon";

/** A clear's logged time against its length (coin outliers, 2026-10-17), with
 *  a verified mark once the logged time reaches the bounty gate's share of the
 *  length. Shown on finished cards — yours and the ones you visit. A retired
 *  or endless game isn't a clear, and a game with no length has nothing to
 *  measure against, so neither shows one. */
export function ClearLogChip({ game }: { game: Game }) {
  const gatePct = useStore((s) => s.bountyGatePct);
  const length = effectiveLength(game);
  const verified = isVerifiedClear(game, gatePct);
  if (game.finishTag === "retired" || game.finishTag === "endless" || !length || verified == null) {
    return null;
  }
  const Icon = verified ? BadgeCheck : Clock;
  return (
    <span
      title={
        verified
          ? `Verified clear: at least ${gatePct}% of the game's length logged`
          : `${formatPlaytime(game.playedHours ?? 0)} logged of a ${formatPlaytime(length)} game`
      }
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] " +
        (verified ? "border-success/40 bg-success/10 text-success" : "border-line bg-panel text-subtle")
      }
    >
      <Icon size={11} className="shrink-0" />
      {verified && <span className="font-semibold">Verified ·</span>}
      {formatPlaytime(game.playedHours ?? 0)} / {formatPlaytime(length)}
    </span>
  );
}

/** The part of a finished game's bounty still waiting on logged time, and how
 *  much more logging releases all of it — on the owner's game page, beside
 *  where the time is logged. */
export function HeldBountyNote({ game }: { game: Game }) {
  const held = game.bountyHeld ?? 0;
  const gate = game.bountyGateHours;
  if (held <= 0 || gate == null) return null;
  const toGo = Math.max(0, gate - (game.playedHours ?? 0));
  return (
    <p className="flex items-start gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-muted">
      <CoinIcon size={13} className="mt-0.5 shrink-0" />
      <span>
        <span className="font-medium text-ink">{held} coins</span> of this game&apos;s bounty unlock
        as you log your time — all of them at {formatPlaytime(gate)} logged
        {toGo > 0 ? ` (${formatPlaytime(toGo)} to go)` : ""}.
      </span>
    </p>
  );
}
