import { Gamepad2, Store, Heart, Trophy, Infinity as InfinityIcon, type LucideIcon } from "lucide-react";
import type { GameStatus } from "../types";
import { STATUS_LABEL } from "../lib/status";

/** Icon + colour-token classes per status. Colours follow the theme tokens so
 *  every badge works in every theme (Finished = success/green, Now Playing =
 *  accent, Bazaar = ink, Wishlist = muted). */
export const STATUS_META: Record<GameStatus, { icon: LucideIcon; cls: string }> = {
  playing: { icon: Gamepad2, cls: "border-accent/50 bg-accent/10 text-accent" },
  backlog: { icon: Store, cls: "border-edge/60 bg-panel text-ink" },
  wishlist: { icon: Heart, cls: "border-line bg-panel text-muted" },
  finished: { icon: Trophy, cls: "border-success/50 bg-success/10 text-success" },
};

/** A small colour-coded status stamp (the game's location in the economy),
 *  set like an inked rubber stamp: mono caps in a bordered slug. Pass
 *  `rotation` for a live-service game in the Rotation lane — its play is a
 *  different rhythm, so the stamp reads "In Rotation" (with the lane's ∞
 *  glyph) instead of "Now Playing". */
export function StatusBadge({
  status,
  rotation = false,
  className = "",
}: {
  status: GameStatus;
  /** The game is in the Rotation lane (status "playing" + inRotation) —
   *  callers with a concrete game pass `isInRotation(game)`. */
  rotation?: boolean;
  className?: string;
}) {
  const inRotation = rotation && status === "playing";
  const { icon, cls } = STATUS_META[status];
  const Icon = inRotation ? InfinityIcon : icon;
  return (
    <span
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] " +
        cls +
        (className ? " " + className : "")
      }
    >
      <Icon size={10} /> {inRotation ? "In Rotation" : STATUS_LABEL[status]}
    </span>
  );
}
