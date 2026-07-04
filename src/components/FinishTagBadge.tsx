import { Flag, FlagOff, Trophy, Infinity as InfinityIcon, type LucideIcon } from "lucide-react";
import { finishTagLabel, type FinishTag } from "../lib/finishTags";

/** Icon per finish tag, mirroring FINISH_TAGS in lib/finishTags.ts (kept there
 *  as strings so the lib stays framework-free). */
const TAG_ICON: Record<FinishTag, LucideIcon> = {
  beaten: Flag,
  completed: Trophy,
  endless: InfinityIcon,
  retired: FlagOff,
};

/** How a finished game concluded — the accent-inked stamp shown beside a
 *  finished game's status on the boards and the Master Ledger. A Retired game
 *  wears a muted stamp instead of the accent ink: it's an admitted drop, kept
 *  visually apart from the real clears. */
export function FinishTagBadge({ tag, className = "" }: { tag: FinishTag; className?: string }) {
  const Icon = TAG_ICON[tag];
  return (
    <span
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] " +
        (tag === "retired"
          ? "border-line bg-panel text-subtle"
          : "border-accent/50 bg-accent/10 text-accent") +
        (className ? " " + className : "")
      }
    >
      <Icon size={11} className="shrink-0" />
      {finishTagLabel(tag)}
    </span>
  );
}
