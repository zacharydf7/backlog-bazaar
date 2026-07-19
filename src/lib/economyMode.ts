// Pure rules for the per-user "economy off" mode (plain backlog tracking).
// While off: activation is free, finishing pays nothing, refunds/rewards don't
// move, and the currency UI hides — but every state change still works and the
// balance freezes untouched. The server enforces all of this authoritatively
// (see the economy_enabled guards in supabase/schema.sql); these helpers keep
// the client's optimistic math and copy in step, unit-tested offline.

/** The activation fee actually charged: the computed price while the economy is
 *  on, always 0 while it's off (the server forces this too). */
export function effectiveActivationPrice(economyOn: boolean, price: number): number {
  return economyOn ? Math.max(0, price) : 0;
}

/** Whether the player can afford an activation — with the economy off nothing
 *  costs anything, so the answer is always yes. */
export function canAffordActivation(economyOn: boolean, coins: number, price: number): boolean {
  return !economyOn || coins >= price;
}

/** The finish-reward arguments to send: all zero when the caller's economy is
 *  off OR the run was started for free while it was off (`startedEconomyOff` —
 *  such a run never pays, even after toggling back on; the server re-derives
 *  this from games.started_economy_off). */
export function effectiveFinishRewards(
  economyOn: boolean,
  startedEconomyOff: boolean,
  rewards: { full: number; replay: number; completion: number },
): { full: number; replay: number; completion: number } {
  if (economyOn && !startedEconomyOff) return rewards;
  return { full: 0, replay: 0, completion: 0 };
}

/** Whether coin/charter/voucher UI (wallet chips, prices, bounties, the
 *  transaction ledger, charter modals…) should render at all. */
export function showCurrencyUi(economyOn: boolean): boolean {
  return economyOn;
}

/** The finish confirmation copy: the coin suffix only appears when something
 *  was actually paid ("Finished X · +40" vs plain "Finished X"). */
export function finishToastText(
  kind: "completed" | "replay" | "finished",
  title: string,
  amount: number,
): string {
  const base =
    kind === "completed"
      ? `Completed ${title}`
      : kind === "replay"
        ? `Replay clear · ${title}`
        : `Finished ${title}`;
  return amount > 0 ? `${base} · +${amount}` : base;
}

/** Detect the server's economy-off refusals (a modified or stale client hit a
 *  blocked currency op). */
export function isEconomyOffError(message: string | null | undefined): boolean {
  return typeof message === "string" && message.includes("ECONOMY_OFF");
}

/** The friendly message for an ECONOMY_OFF refusal. */
export const ECONOMY_OFF_MESSAGE =
  "The coin economy is turned off for this account — flip it back on in Account settings first.";

/** localStorage key for the guest/offline mode's flag (no server there). */
export const ECONOMY_MODE_STORAGE_KEY = "bb.economyEnabled";
