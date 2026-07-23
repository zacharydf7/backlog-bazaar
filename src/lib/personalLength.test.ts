import { describe, it, expect } from "vitest";
import {
  effectiveLength,
  hasPersonalLength,
  settleLengthChange,
  lengthChangeSettlement,
  finishBountyOffset,
} from "./personalLength";

describe("effectiveLength", () => {
  it("prefers the personal override over the catalog length", () => {
    expect(effectiveLength({ personalHours: 90, hours: 12 })).toBe(90);
  });
  it("falls back to the catalog length when there is no override", () => {
    expect(effectiveLength({ personalHours: undefined, hours: 12 })).toBe(12);
  });
  it("is undefined when neither is known", () => {
    expect(effectiveLength({ personalHours: undefined, hours: undefined })).toBeUndefined();
  });
  it("treats a 0 override as a real, chosen value (not absent)", () => {
    expect(effectiveLength({ personalHours: 0, hours: 12 })).toBe(0);
  });
});

describe("hasPersonalLength", () => {
  it("is true whenever an override is set, even equal to the catalog", () => {
    expect(hasPersonalLength({ personalHours: 12 })).toBe(true);
    expect(hasPersonalLength({ personalHours: 0 })).toBe(true);
  });
  it("is false with no override", () => {
    expect(hasPersonalLength({ personalHours: undefined })).toBe(false);
  });
});

describe("settleLengthChange — raising the length", () => {
  it("charges the whole extra fee when the player can afford it", () => {
    // +234 fee, 500 coins on hand, no prior debt.
    expect(settleLengthChange(234, 500, 0)).toEqual({
      chargeNow: 234,
      deferred: 0,
      refund: 0,
      newOwed: 0,
      settled: -234,
    });
  });

  it("defers the unaffordable slice as bounty debt without blocking", () => {
    // +234 fee but only 100 coins: pay 100 now, defer 134.
    expect(settleLengthChange(234, 100, 0)).toEqual({
      chargeNow: 100,
      deferred: 134,
      refund: 0,
      newOwed: 134,
      settled: -100,
    });
  });

  it("defers the whole fee when the player is broke", () => {
    expect(settleLengthChange(234, 0, 0)).toEqual({
      chargeNow: 0,
      deferred: 234,
      refund: 0,
      newOwed: 234,
      settled: 0,
    });
  });

  it("accumulates onto an existing debt", () => {
    // Already owe 50; a further +80 raise the player can't afford at all.
    expect(settleLengthChange(80, 0, 50)).toEqual({
      chargeNow: 0,
      deferred: 80,
      refund: 0,
      newOwed: 130,
      settled: 0,
    });
  });
});

describe("settleLengthChange — shortening the length", () => {
  it("refunds the fee when there is no debt to cancel", () => {
    expect(settleLengthChange(-150, 20, 0)).toEqual({
      chargeNow: 0,
      deferred: 0,
      refund: 150,
      newOwed: 0,
      settled: 150,
    });
  });

  it("cancels outstanding debt before refunding anything", () => {
    // Owe 134, shorten by 150-worth: wipe the 134 debt, refund 16.
    expect(settleLengthChange(-150, 20, 134)).toEqual({
      chargeNow: 0,
      deferred: 0,
      refund: 16,
      newOwed: 0,
      settled: 16,
    });
  });

  it("only reduces debt (no refund) when the shorten is smaller than the debt", () => {
    expect(settleLengthChange(-50, 20, 134)).toEqual({
      chargeNow: 0,
      deferred: 0,
      refund: 0,
      newOwed: 84,
      settled: 0,
    });
  });
});

describe("settleLengthChange — no net change", () => {
  it("moves no coins and leaves the debt untouched", () => {
    expect(settleLengthChange(0, 100, 40)).toEqual({
      chargeNow: 0,
      deferred: 0,
      refund: 0,
      newOwed: 40,
      settled: 0,
    });
  });
});

describe("lengthChangeSettlement", () => {
  // A toy pricer: 3 coins per hour of length, DEFAULT_HOURS-free (only the delta
  // matters here). Undefined length reads as 12h.
  const priceAt = (h: number | undefined) => 3 * (h ?? 12);

  it("settles the length-driven fee difference for a playing game", () => {
    // 12h → 90h at 3/hr = +234 fee; affordable in full.
    const s = lengthChangeSettlement({
      priceAt,
      currentEffective: 12,
      newEffective: 90,
      coins: 500,
      owed: 0,
      settles: true,
    });
    expect(s.priceDelta).toBe(234);
    expect(s.chargeNow).toBe(234);
    expect(s.newOwed).toBe(0);
  });

  it("moves no coins when the game doesn't settle (still in the Bazaar)", () => {
    const s = lengthChangeSettlement({
      priceAt,
      currentEffective: 12,
      newEffective: 90,
      coins: 500,
      owed: 0,
      settles: false,
    });
    expect(s.priceDelta).toBe(0);
    expect(s.chargeNow).toBe(0);
    expect(s.refund).toBe(0);
    expect(s.newOwed).toBe(0);
  });

  it("defers the shortfall when the raise isn't affordable", () => {
    const s = lengthChangeSettlement({
      priceAt,
      currentEffective: 12,
      newEffective: 90,
      coins: 100,
      owed: 0,
      settles: true,
    });
    expect(s.priceDelta).toBe(234);
    expect(s.chargeNow).toBe(100);
    expect(s.deferred).toBe(134);
    expect(s.newOwed).toBe(134);
  });
});

describe("finishBountyOffset — the exploit guard", () => {
  it("docks the full deferred fee from a bounty that covers it", () => {
    expect(finishBountyOffset(134, 400)).toBe(134);
  });

  it("never docks more than the gross bounty (payout floors at 0)", () => {
    expect(finishBountyOffset(500, 300)).toBe(300);
  });

  it("is zero with no debt", () => {
    expect(finishBountyOffset(0, 400)).toBe(0);
    expect(finishBountyOffset(undefined, 400)).toBe(0);
  });

  it("round-trips the raise/finish guard: lengthening you can't pay yields no net gain", () => {
    // Buy at 12h; raise to 90h costs +234 in price but the player is broke, so
    // it's all deferred. If the bounty rewards length at the SAME rate, the
    // finish pays +234 gross but the guard reclaims the 234 deferred — net 0 on
    // the length spread, exactly as if they never raised it for free.
    const { newOwed } = settleLengthChange(234, 0, 0);
    const grossBountyGain = 234;
    expect(finishBountyOffset(newOwed, grossBountyGain)).toBe(234);
  });
});
