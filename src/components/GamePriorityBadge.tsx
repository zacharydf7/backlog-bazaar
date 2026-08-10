import { ChevronDown, ChevronUp, ChevronsUp, Equal, type LucideIcon } from "lucide-react";
import {
  GAME_PRIORITIES,
  GAME_PRIORITY_LABEL,
  type GamePriority,
} from "../lib/gamePriority";

// Backlog priority triage (issue 901eb363) — the shared card badge and the
// tier picker used by the Add form and the game page. Named Game* to stay
// clear of the issue board's PriorityBadge/PriorityField (PriorityControls).

const PRIORITY_ICON: Record<GamePriority, LucideIcon> = {
  essential: ChevronsUp,
  high: ChevronUp,
  medium: Equal,
  low: ChevronDown,
};

/** Small chip for game cards: icon + tier label. Essential pops in accent;
 *  the lower tiers stay quiet. Unassigned games render nothing (callers gate). */
export function GamePriorityBadge({ priority }: { priority: GamePriority }) {
  const Icon = PRIORITY_ICON[priority];
  const accent = priority === "essential";
  return (
    <span
      title={`Priority: ${GAME_PRIORITY_LABEL[priority]}`}
      className={
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium " +
        (accent
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-line bg-panel " + (priority === "high" ? "text-ink" : "text-muted"))
      }
    >
      <Icon size={10} /> {GAME_PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Segmented tier picker: None + the four tiers, most urgent last so the eye
 *  travels low→high. Fully controlled; `null` = unassigned. */
export function GamePriorityPicker({
  value,
  onChange,
  size = "sm",
}: {
  value: GamePriority | null;
  onChange: (value: GamePriority | null) => void;
  size?: "sm" | "xs";
}) {
  const pad = size === "xs" ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-sm";
  const options: { value: GamePriority | null; label: string }[] = [
    { value: null, label: "None" },
    ...[...GAME_PRIORITIES]
      .reverse()
      .map((p) => ({ value: p as GamePriority | null, label: GAME_PRIORITY_LABEL[p] })),
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        const Icon = o.value ? PRIORITY_ICON[o.value] : null;
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={
              `inline-flex items-center gap-1 rounded-lg border font-medium transition ${pad} ` +
              (active
                ? "border-brand bg-brand/10 text-ink"
                : "border-line bg-panel text-muted hover:border-brand/50")
            }
          >
            {Icon && <Icon size={12} className={active ? "text-accent" : ""} />} {o.label}
          </button>
        );
      })}
    </div>
  );
}
