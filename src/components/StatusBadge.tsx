import { Gamepad2, Store, Heart, Trophy, type LucideIcon } from "lucide-react";
import type { GameStatus } from "../types";
import { STATUS_LABEL } from "../lib/status";

/** Icon + colour-token classes per status. Colours follow the theme tokens so
 *  every badge works in every theme (Finished = success/green, Now Playing =
 *  accent, Bazaar = brand, Wishlist = muted). */
export const STATUS_META: Record<GameStatus, { icon: LucideIcon; cls: string }> = {
  playing: { icon: Gamepad2, cls: "bg-accent/10 text-accent" },
  backlog: { icon: Store, cls: "bg-brand/10 text-accent" },
  wishlist: { icon: Heart, cls: "bg-panel text-muted" },
  finished: { icon: Trophy, cls: "bg-success/15 text-success" },
};

/** A small colour-coded status pill (the game's location in the economy). */
export function StatusBadge({
  status,
  className = "",
}: {
  status: GameStatus;
  className?: string;
}) {
  const { icon: Icon, cls } = STATUS_META[status];
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
        cls +
        (className ? " " + className : "")
      }
    >
      <Icon size={10} /> {STATUS_LABEL[status]}
    </span>
  );
}
