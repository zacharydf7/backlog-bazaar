// Backlog priority triage (issue 901eb363): a user-assigned urgency tier on a
// game, so a huge collection can separate the must-play-next titles from casual
// backlog filler. Purely personal metadata — it never touches the economy, and
// unassigned is the deliberate default so nobody is forced to categorize.
//
// Distinct from src/lib/priority.ts, which is the ISSUE board's priority scale.

/** The tiers, from most to least urgent. `null`/absent = unassigned. */
export type GamePriority = "essential" | "high" | "medium" | "low";

/** Display order for pickers and facet chips: most urgent first. */
export const GAME_PRIORITIES: GamePriority[] = ["essential", "high", "medium", "low"];

export const GAME_PRIORITY_LABEL: Record<GamePriority, string> = {
  essential: "Essential",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Numeric rank for sorting: essential 4 … low 1, unassigned 0. */
export function gamePriorityRank(p: GamePriority | null | undefined): number {
  switch (p) {
    case "essential":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

/** Coerce a raw DB value to a GamePriority; anything unknown is unassigned. */
export function coerceGamePriority(raw: unknown): GamePriority | null {
  return GAME_PRIORITIES.includes(raw as GamePriority) ? (raw as GamePriority) : null;
}
