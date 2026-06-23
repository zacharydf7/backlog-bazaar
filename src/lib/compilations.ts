// Distributing a compilation's total purchase cost across its child games. A
// "compilation" is one retail purchase (e.g. a remaster collection) bundling
// several distinct games; the total cost is split into a per-child share. All
// math is done in integer cents so the shares always sum back to the exact total
// (no floating-point drift); the UI converts to/from dollars at the edges.

/** Dollars (possibly fractional) → whole cents. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Whole cents → dollars. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Split `totalCents` into `n` shares as evenly as possible. The remainder (when
 *  it doesn't divide cleanly) is spread one cent at a time across the first
 *  shares, so the result always sums to exactly `totalCents`. */
export function splitEvenly(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Split `totalCents` proportionally across the given weights, using
 *  largest-remainder rounding so the shares still sum to exactly `totalCents`.
 *  A non-positive total weight falls back to an even split. */
function splitByWeight(totalCents: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const totalW = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (totalW <= 0) return splitEvenly(totalCents, n);

  const raw = weights.map((w) => (totalCents * Math.max(0, w)) / totalW);
  const shares = raw.map((r) => Math.floor(r));
  let remainder = totalCents - shares.reduce((sum, s) => sum + s, 0);
  // Hand out the leftover cents to the shares with the largest fractional part.
  const byFrac = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder && k < byFrac.length; k++) shares[byFrac[k].i] += 1;
  return shares;
}

/** Split `totalCents` across child games weighted by each game's estimated
 *  length (hours). Games with no length (or zero) are treated as the average
 *  length of those that do have one, so they still get a fair middle share rather
 *  than nothing. When no game has a length at all, falls back to an even split.
 *  Always sums to exactly `totalCents`. */
export function splitByLength(totalCents: number, lengths: (number | undefined)[]): number[] {
  const n = lengths.length;
  if (n === 0) return [];
  const positives = lengths.filter((l): l is number => typeof l === "number" && l > 0);
  if (positives.length === 0) return splitEvenly(totalCents, n);
  const avg = positives.reduce((sum, l) => sum + l, 0) / positives.length;
  const weights = lengths.map((l) => (typeof l === "number" && l > 0 ? l : avg));
  return splitByWeight(totalCents, weights);
}

/** Whether a set of manually-entered shares sums to exactly the total — the
 *  gate for saving a custom cost breakdown. */
export function sharesMatchTotal(shares: number[], totalCents: number): boolean {
  return shares.reduce((sum, s) => sum + s, 0) === totalCents;
}

/** One row in the compilation creation form: a bundled game's name, optional
 *  estimated length (hours), and its assigned cost share (dollars). */
export interface CompilationChildDraft {
  name: string;
  hours?: number;
  cost?: number;
}
