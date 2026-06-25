import { describe, it, expect } from "vitest";
import {
  DEFAULT_ONBOARDING_VOUCHERS,
  isVoucherEligibleStatus,
  canRedeemVoucher,
  hasVouchers,
} from "./vouchers";

describe("vouchers", () => {
  it("defaults to a 2-voucher starter pack", () => {
    expect(DEFAULT_ONBOARDING_VOUCHERS).toBe(2);
  });

  it("is eligible only on the Bazaar (backlog), never the Wishlist", () => {
    expect(isVoucherEligibleStatus("backlog")).toBe(true);
    expect(isVoucherEligibleStatus("wishlist")).toBe(false);
    expect(isVoucherEligibleStatus("playing")).toBe(false);
    expect(isVoucherEligibleStatus("finished")).toBe(false);
  });

  it("can redeem only with a balance AND a Bazaar game", () => {
    expect(canRedeemVoucher(2, "backlog")).toBe(true);
    expect(canRedeemVoucher(1, "backlog")).toBe(true);
    // No balance.
    expect(canRedeemVoucher(0, "backlog")).toBe(false);
    // Right balance, wrong board — the Wishlist prohibition.
    expect(canRedeemVoucher(2, "wishlist")).toBe(false);
    expect(canRedeemVoucher(2, "playing")).toBe(false);
  });

  it("shows the count only when positive", () => {
    expect(hasVouchers(1)).toBe(true);
    expect(hasVouchers(0)).toBe(false);
    expect(hasVouchers(-1)).toBe(false);
  });
});
