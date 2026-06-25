// Pure helpers for Onboarding Free Game Vouchers ("Jumpstart Activation") — the
// starter tokens a new account spends to bypass the coin activation fee on a
// single, specific transition: moving a game from the Bazaar (backlog) directly
// into Now Playing. Unlike Import Charters, vouchers can't be bought, sold, or
// converted to coins; the only mutations are the signup/admin grant and a
// redemption, all server-authoritative (see apply_voucher_redemption /
// admin_update_user / handle_new_user in supabase/schema.sql). These helpers only
// do the can/can't checks so they're unit-testable offline.

import type { GameStatus } from "../types";

/** Vouchers credited to each new account at signup, unless an admin tunes
 *  app_config.onboarding_vouchers. Mirrors the schema default. */
export const DEFAULT_ONBOARDING_VOUCHERS = 2;

/** Vouchers are valid ONLY for the Bazaar → Now Playing transition, so a game
 *  must be in the backlog. The Wishlist (and Wishlist → import paths) are
 *  strictly excluded — you can never spend a voucher from there. */
export function isVoucherEligibleStatus(status: GameStatus): boolean {
  return status === "backlog";
}

/** You can redeem a voucher when you hold at least one and the game is on a
 *  voucher-eligible board (the Bazaar). The open-slot check is enforced
 *  separately (see canStartGame) — same gate as a coin purchase. */
export function canRedeemVoucher(vouchers: number, status: GameStatus): boolean {
  return vouchers >= 1 && isVoucherEligibleStatus(status);
}

/** Whether to surface the voucher count anywhere in the UI (wallet pill, game
 *  details): only when the balance is positive. */
export function hasVouchers(vouchers: number): boolean {
  return vouchers > 0;
}
