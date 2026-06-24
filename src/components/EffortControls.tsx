import { Gauge } from "lucide-react";
import type { IssueEffort } from "../types";
import { EFFORTS, EFFORT_LABEL } from "../lib/effort";

// Colour tokens per level, distinct from the priority ramp so the two pills read
// apart at a glance: Low effort = easy/cheap (success), Medium = accent, High =
// heavy (danger).
const DOT: Record<IssueEffort, string> = {
  low: "bg-success",
  medium: "bg-accent",
  high: "bg-danger",
};

const BADGE: Record<IssueEffort, string> = {
  low: "bg-success/15 text-success",
  medium: "bg-brand/15 text-accent",
  high: "bg-danger/15 text-danger",
};

/** A small colour-coded effort pill (display only). */
export function EffortBadge({ effort }: { effort: IssueEffort }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        BADGE[effort]
      }
      title={`Effort: ${EFFORT_LABEL[effort]}`}
    >
      <Gauge size={10} /> {EFFORT_LABEL[effort]} effort
    </span>
  );
}

/** A segmented Low / Medium / High selector for create + edit. */
export function EffortField({
  value,
  onChange,
}: {
  value: IssueEffort;
  onChange: (e: IssueEffort) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
        <Gauge size={13} className="text-accent" /> Effort
      </div>
      <div className="inline-flex overflow-hidden rounded-lg border border-line">
        {EFFORTS.map((e) => {
          const on = value === e;
          return (
            <button
              key={e}
              type="button"
              onClick={() => onChange(e)}
              aria-pressed={on}
              className={
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition " +
                (on ? "bg-brand text-brand-fg" : "bg-panel text-muted hover:text-ink")
              }
            >
              <span className={"h-1.5 w-1.5 rounded-full " + (on ? "bg-brand-fg" : DOT[e])} />
              {EFFORT_LABEL[e]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
