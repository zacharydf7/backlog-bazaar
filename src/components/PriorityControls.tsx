import { Flag } from "lucide-react";
import type { FeaturePriority } from "../types";
import { PRIORITIES, PRIORITY_LABEL } from "../lib/priority";

// Colour tokens per level: Low = muted, Medium = brand/accent, High = danger.
const DOT: Record<FeaturePriority, string> = {
  low: "bg-subtle",
  medium: "bg-accent",
  high: "bg-danger",
};

const BADGE: Record<FeaturePriority, string> = {
  low: "bg-line text-subtle",
  medium: "bg-brand/15 text-accent",
  high: "bg-danger/15 text-danger",
};

/** A small colour-coded priority pill (display only). */
export function PriorityBadge({ priority }: { priority: FeaturePriority }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        BADGE[priority]
      }
      title={`Priority: ${PRIORITY_LABEL[priority]}`}
    >
      <Flag size={10} /> {PRIORITY_LABEL[priority]}
    </span>
  );
}

/** A segmented Low / Medium / High selector for create + edit. */
export function PriorityField({
  value,
  onChange,
}: {
  value: FeaturePriority;
  onChange: (p: FeaturePriority) => void;
}) {
  return (
    <div>
      <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted">
        <Flag size={13} className="text-accent" /> Priority
      </div>
      <div className="inline-flex overflow-hidden rounded-lg border border-line">
        {PRIORITIES.map((p) => {
          const on = value === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-pressed={on}
              className={
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition " +
                (on ? "bg-brand text-brand-fg" : "bg-panel text-muted hover:text-ink")
              }
            >
              <span className={"h-1.5 w-1.5 rounded-full " + (on ? "bg-brand-fg" : DOT[p])} />
              {PRIORITY_LABEL[p]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
