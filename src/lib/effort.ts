// Effort for feature/bug reports — a story-point-style size estimate (how much
// work an item is), separate from priority (how important it is). Default Medium;
// can be raised or lowered when creating or editing. Pure (labels + ordering) so
// it's unit-tested; the badge colours live in the component.

import type { IssueEffort } from "../types";

/** Low → High, ascending size. */
export const EFFORTS: IssueEffort[] = ["low", "medium", "high"];

export const DEFAULT_EFFORT: IssueEffort = "medium";

export const EFFORT_LABEL: Record<IssueEffort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Sort weight (higher = more work), for sizing-based ordering. */
export function effortRank(e: IssueEffort): number {
  return EFFORTS.indexOf(e); // low=0, medium=1, high=2; -1 for unknown sorts lowest
}

/** Coerce any stored/legacy value to a valid effort (defaults to Medium). */
export function coerceEffort(raw: string | null | undefined): IssueEffort {
  return raw === "low" || raw === "high" || raw === "medium" ? raw : DEFAULT_EFFORT;
}
