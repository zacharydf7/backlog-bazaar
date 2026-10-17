import { describe, it, expect } from "vitest";
import { bountyGateHours, bountyRelease, heldAtFinish, isVerifiedClear } from "./bountyHold";

describe("bountyGateHours", () => {
  it("is the gate share of the length", () => {
    expect(bountyGateHours(40, 25)).toBe(10);
    expect(bountyGateHours(130, 25)).toBe(32.5);
  });
  it("is null with the gate off or no length", () => {
    expect(bountyGateHours(40, 0)).toBeNull();
    expect(bountyGateHours(undefined, 25)).toBeNull();
    expect(bountyGateHours(0, 25)).toBeNull();
  });
});

describe("heldAtFinish", () => {
  it("pays the activation refund now and holds the rest with nothing logged", () => {
    expect(heldAtFinish({ net: 300, pricePaid: 100, played: 0, gateHours: 10 })).toBe(200);
  });
  it("pays the logged share when that beats the refund", () => {
    // 6h of a 10h gate earns 180 of 300 — more than the 100 refund.
    expect(heldAtFinish({ net: 300, pricePaid: 100, played: 6, gateHours: 10 })).toBe(120);
  });
  it("holds nothing at the gate, without a gate, or on a zero bounty", () => {
    expect(heldAtFinish({ net: 300, pricePaid: 100, played: 10, gateHours: 10 })).toBe(0);
    expect(heldAtFinish({ net: 300, pricePaid: 100, played: 0, gateHours: null })).toBe(0);
    expect(heldAtFinish({ net: 0, pricePaid: 100, played: 0, gateHours: 10 })).toBe(0);
  });
  it("never pays less than the bounty itself when the refund exceeds it", () => {
    expect(heldAtFinish({ net: 80, pricePaid: 100, played: 0, gateHours: 10 })).toBe(0);
  });
});

describe("bountyRelease", () => {
  it("releases in proportion to logged time, all of it at the gate", () => {
    // 300 total, 100 paid at finish, 200 held; gate 10h.
    expect(bountyRelease({ total: 300, held: 200, gateHours: 10, played: 5 })).toBe(50);
    expect(bountyRelease({ total: 300, held: 150, gateHours: 10, played: 12 })).toBe(150);
  });
  it("releases nothing until the logged share passes what's already paid", () => {
    expect(bountyRelease({ total: 300, held: 200, gateHours: 10, played: 2 })).toBe(0);
  });
  it("never releases more than is held", () => {
    expect(bountyRelease({ total: 300, held: 20, gateHours: 10, played: 40 })).toBe(20);
  });
});

describe("isVerifiedClear", () => {
  it("is verified once logged time reaches the gate share of the length", () => {
    expect(isVerifiedClear({ playedHours: 10, hours: 40 }, 25)).toBe(true);
    expect(isVerifiedClear({ playedHours: 1, hours: 130 }, 25)).toBe(false);
    // A personal length is the length that counts.
    expect(isVerifiedClear({ playedHours: 5, hours: 130, personalHours: 20 }, 25)).toBe(true);
  });
  it("is unknown without a length or a gate", () => {
    expect(isVerifiedClear({ playedHours: 5 }, 25)).toBeNull();
    expect(isVerifiedClear({ playedHours: 5, hours: 40 }, 0)).toBeNull();
  });
});
