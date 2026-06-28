import { describe, it, expect } from "vitest";
import {
  ledgerLabel,
  deltaTone,
  formatDelta,
  matchesFilter,
  sortLedger,
  computeTotals,
} from "./transactions";
import type { LedgerEntry } from "../types";

function entry(over: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: "1",
    kind: "bounty",
    coinDelta: 0,
    charterDelta: 0,
    voucherDelta: 0,
    coinBalanceAfter: 100,
    charterBalanceAfter: 0,
    voucherBalanceAfter: null,
    gameTitle: null,
    label: null,
    createdAt: 0,
    ...over,
  };
}

describe("ledgerLabel", () => {
  it("maps known kinds to their action label", () => {
    expect(ledgerLabel({ kind: "bounty" })).toBe("Bounty Claimed");
    expect(ledgerLabel({ kind: "charter_buy" })).toBe("Bought Import Charter");
    expect(ledgerLabel({ kind: "voucher_redeem" })).toBe("Onboarding Voucher Redemption");
    expect(ledgerLabel({ kind: "voucher_grant" })).toBe("Free Game Vouchers");
    expect(ledgerLabel({ kind: "undo_finish" })).toBe("Action Reverted");
  });

  it("humanises an unknown kind instead of rendering blank", () => {
    expect(ledgerLabel({ kind: "some_new_event" })).toBe("Some New Event");
  });
});

describe("deltaTone", () => {
  it("classifies sign", () => {
    expect(deltaTone(5)).toBe("income");
    expect(deltaTone(-5)).toBe("expense");
    expect(deltaTone(0)).toBe("neutral");
  });
});

describe("formatDelta", () => {
  it("prefixes a sign and uses a true minus", () => {
    expect(formatDelta(150)).toBe("+150");
    expect(formatDelta(-25)).toBe("−25");
    expect(formatDelta(0)).toBe("0");
  });
});

describe("matchesFilter", () => {
  const bounty = entry({ kind: "bounty", coinDelta: 150 });
  const fee = entry({ kind: "purchase", coinDelta: -25 });
  const charterBuy = entry({ kind: "charter_buy", coinDelta: -100, charterDelta: 1 });
  const charterConsume = entry({ kind: "charter_consume", coinDelta: 0, charterDelta: -1 });
  const voucherGrant = entry({ kind: "voucher_grant", coinDelta: 0, voucherDelta: 2 });
  const voucherRedeem = entry({ kind: "voucher_redeem", coinDelta: 0, voucherDelta: -1 });

  it("passes everything for 'all'", () => {
    expect(matchesFilter(fee, "all")).toBe(true);
  });

  it("treats a charter buy as an expense (coin side leads) but income for the charter", () => {
    expect(matchesFilter(charterBuy, "expense")).toBe(true);
    expect(matchesFilter(charterBuy, "income")).toBe(false);
  });

  it("falls back to the charter sign when coin-neutral", () => {
    expect(matchesFilter(charterConsume, "expense")).toBe(true);
    expect(matchesFilter(charterConsume, "income")).toBe(false);
  });

  it("falls back to the voucher sign when coin- and charter-neutral", () => {
    expect(matchesFilter(voucherGrant, "income")).toBe(true);
    expect(matchesFilter(voucherGrant, "expense")).toBe(false);
    expect(matchesFilter(voucherRedeem, "expense")).toBe(true);
    expect(matchesFilter(voucherRedeem, "income")).toBe(false);
  });

  it("isolates by currency", () => {
    expect(matchesFilter(bounty, "coins")).toBe(true);
    expect(matchesFilter(bounty, "charters")).toBe(false);
    expect(matchesFilter(charterBuy, "coins")).toBe(true);
    expect(matchesFilter(charterBuy, "charters")).toBe(true);
    expect(matchesFilter(charterConsume, "coins")).toBe(false);
    expect(matchesFilter(charterConsume, "charters")).toBe(true);
    expect(matchesFilter(voucherRedeem, "vouchers")).toBe(true);
    expect(matchesFilter(voucherRedeem, "coins")).toBe(false);
    expect(matchesFilter(voucherRedeem, "charters")).toBe(false);
    expect(matchesFilter(bounty, "vouchers")).toBe(false);
  });
});

describe("computeTotals", () => {
  it("sums gains and losses separately per currency", () => {
    const totals = computeTotals([
      entry({ coinDelta: 150 }),
      entry({ coinDelta: -25 }),
      entry({ coinDelta: -100, charterDelta: 1 }),
      entry({ coinDelta: 0, charterDelta: -1 }),
      entry({ kind: "voucher_grant", coinDelta: 0, voucherDelta: 2 }),
      entry({ kind: "voucher_redeem", coinDelta: 0, voucherDelta: -1 }),
      entry({ kind: "opening", coinDelta: 0 }),
    ]);
    expect(totals).toEqual({
      coinsIn: 150,
      coinsOut: 125,
      chartersIn: 1,
      chartersOut: 1,
      vouchersIn: 2,
      vouchersOut: 1,
    });
  });

  it("is all zeroes for an empty ledger", () => {
    expect(computeTotals([])).toEqual({
      coinsIn: 0,
      coinsOut: 0,
      chartersIn: 0,
      chartersOut: 0,
      vouchersIn: 0,
      vouchersOut: 0,
    });
  });
});

describe("sortLedger", () => {
  it("orders newest-first with id as a stable tiebreak, without mutating", () => {
    const input = [
      entry({ id: "a", createdAt: 100 }),
      entry({ id: "c", createdAt: 200 }),
      entry({ id: "b", createdAt: 200 }),
    ];
    const out = sortLedger(input);
    expect(out.map((e) => e.id)).toEqual(["c", "b", "a"]);
    // original array untouched
    expect(input.map((e) => e.id)).toEqual(["a", "c", "b"]);
  });
});
