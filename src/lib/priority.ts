// Priority for feature/bug reports. Default Medium; can be raised or lowered when
// creating or editing. Pure (labels + ordering) so it's unit-tested; the badge
// colours live in the component.

import type { IssuePriority } from "../types";

/** Low → High, ascending importance. */
export const PRIORITIES: IssuePriority[] = ["low", "medium", "high"];

export const DEFAULT_PRIORITY: IssuePriority = "medium";

export const PRIORITY_LABEL: Record<IssuePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Sort weight (higher = more important), for triage ordering. */
export function priorityRank(p: IssuePriority): number {
  return PRIORITIES.indexOf(p); // low=0, medium=1, high=2; -1 for unknown sorts lowest
}

/** Coerce any stored/legacy value to a valid priority (defaults to Medium). */
export function coercePriority(raw: string | null | undefined): IssuePriority {
  return raw === "low" || raw === "high" || raw === "medium" ? raw : DEFAULT_PRIORITY;
}
