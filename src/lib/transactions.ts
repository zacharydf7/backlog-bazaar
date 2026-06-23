// Pure helpers for the Universal Transaction Ledger. The
// ledger rows themselves are written server-side (see supabase/schema.sql —
// log_coin_event); this module only turns a row into display-ready pieces and
// powers the income/expense/currency filters. Kept free of React/Supabase so it
// is directly unit-testable offline.

import type { LedgerEntry } from "../types";

/** Human-facing action label per event kind. New kinds fall back to a humanised
 *  version of the raw kind so an unknown event never renders blank. */
export const LEDGER_LABELS: Record<string, string> = {
  opening: "Opening Balance",
  purchase: "Activation Fee Paid",
  bounty: "Bounty Claimed",
  replay_bonus: "Replay Bonus",
  shelve_refund: "Shelve Refund",
  submission_reward: "Contribution Reward",
  admin_adjust: "Balance Adjustment",
  charter_buy: "Bought Import Charter",
  charter_sell: "Sold Import Charter",
  charter_consume: "Imported to Bazaar",
};

/** The action label for a ledger row, e.g. "Bounty Claimed". */
export function ledgerLabel(entry: Pick<LedgerEntry, "kind">): string {
  return (
    LEDGER_LABELS[entry.kind] ??
    entry.kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Colour intent for a single signed amount: gains read positive, deductions
 *  negative, and zero is neutral. Used per-currency so a mixed event (e.g. a
 *  charter buy: −coins, +1 charter) colours each side independently. */
export type Tone = "income" | "expense" | "neutral";

export function deltaTone(amount: number): Tone {
  if (amount > 0) return "income";
  if (amount < 0) return "expense";
  return "neutral";
}

/** A signed amount as a display string, e.g. 150 → "+150", −25 → "−25", 0 →
 *  "0". Uses a true minus sign to match the rest of the app's typography. */
export function formatDelta(amount: number): string {
  if (amount > 0) return `+${amount}`;
  if (amount < 0) return `−${Math.abs(amount)}`;
  return "0";
}

/** The interactive history filters. "income"/"expense" judge the row on its coin
 *  movement first (coins are the primary currency), falling back to charters for
 *  coin-neutral events; "coins"/"charters" isolate a single currency. */
export type LedgerFilter = "all" | "income" | "expense" | "coins" | "charters";

export const LEDGER_FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expenses" },
  { value: "coins", label: "Coins" },
  { value: "charters", label: "Charters" },
];

export function matchesFilter(entry: LedgerEntry, filter: LedgerFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "coins":
      return entry.coinDelta !== 0;
    case "charters":
      return entry.charterDelta !== 0;
    case "income":
      return entry.coinDelta > 0 || (entry.coinDelta === 0 && entry.charterDelta > 0);
    case "expense":
      return entry.coinDelta < 0 || (entry.coinDelta === 0 && entry.charterDelta < 0);
  }
}

/** Newest-first ordering with the id as a stable tiebreak for same-instant rows
 *  (mirrors the server index). Returns a new array; never mutates the input. */
export function sortLedger(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort(
    (a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
}
