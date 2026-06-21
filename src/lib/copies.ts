import type { GameCopy } from "../types";

/** A new random id for a copy. Falls back to a cheap unique string where
 *  crypto.randomUUID isn't available (older browsers / some test envs). */
export function newCopyId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** The distinct platforms you own a game on, in first-seen order. Multiple
 *  copies on the same platform collapse to one entry here. */
export function ownedPlatforms(copies: GameCopy[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of copies ?? []) {
    const p = c.platform.trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/** Sum of recorded acquisition costs across all copies (copies with no cost
 *  count as 0). */
export function totalCost(copies: GameCopy[] | undefined): number {
  return (copies ?? []).reduce((sum, c) => sum + (c.cost ?? 0), 0);
}

/** True if any copy has a recorded cost (used to decide whether to show the
 *  spend breakdown at all). */
export function hasAnyCost(copies: GameCopy[] | undefined): boolean {
  return (copies ?? []).some((c) => typeof c.cost === "number" && c.cost > 0);
}

/** Format a USD amount the way the UI shows acquisition cost. */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2).replace(/\.00$/, "")}`;
}
