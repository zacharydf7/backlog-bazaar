import { describe, it, expect } from "vitest";
import {
  toCents,
  fromCents,
  splitEvenly,
  splitByLength,
  sharesMatchTotal,
  isEvenSplit,
} from "./compilations";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("toCents / fromCents", () => {
  it("round-trips dollars through cents", () => {
    expect(toCents(10)).toBe(1000);
    expect(toCents(13.37)).toBe(1337);
    expect(fromCents(1337)).toBe(13.37);
  });

  it("rounds fractional cents away", () => {
    expect(toCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 → 30
  });
});

describe("splitEvenly", () => {
  it("divides cleanly when it can", () => {
    expect(splitEvenly(4000, 4)).toEqual([1000, 1000, 1000, 1000]);
  });

  it("spreads the remainder one cent at a time and sums to the total", () => {
    const shares = splitEvenly(4000, 3); // $40 / 3
    expect(sum(shares)).toBe(4000);
    expect(shares).toEqual([1334, 1333, 1333]);
  });

  it("returns an empty array for zero children", () => {
    expect(splitEvenly(4000, 0)).toEqual([]);
  });

  it("handles a zero total", () => {
    expect(splitEvenly(0, 3)).toEqual([0, 0, 0]);
  });
});

describe("splitByLength", () => {
  it("distributes proportionally to length and sums to the total", () => {
    // lengths 10h, 30h → 25% / 75% of $40
    const shares = splitByLength(4000, [10, 30]);
    expect(sum(shares)).toBe(4000);
    expect(shares).toEqual([1000, 3000]);
  });

  it("gives a length-less game the average share rather than nothing", () => {
    // two 10h games + one with no length → the blank one is treated as 10h,
    // so all three split evenly.
    const shares = splitByLength(3000, [10, 10, undefined]);
    expect(sum(shares)).toBe(3000);
    expect(shares).toEqual([1000, 1000, 1000]);
  });

  it("falls back to an even split when no game has a length", () => {
    const shares = splitByLength(3000, [undefined, undefined, 0]);
    expect(shares).toEqual([1000, 1000, 1000]);
  });

  it("keeps the sum exact with awkward proportions", () => {
    const shares = splitByLength(1000, [1, 1, 1]); // $10 / 3 by equal length
    expect(sum(shares)).toBe(1000);
  });
});

describe("isEvenSplit", () => {
  it("recognizes an even split, including remainder rounding and any order", () => {
    expect(isEvenSplit([1334, 1333, 1333], 4000)).toBe(true); // $40 / 3
    expect(isEvenSplit([1333, 1334, 1333], 4000)).toBe(true); // order-insensitive
    expect(isEvenSplit([1000, 1000, 1000, 1000], 4000)).toBe(true);
    expect(isEvenSplit([], 0)).toBe(true);
  });

  it("rejects a custom split or one that doesn't total", () => {
    expect(isEvenSplit([3000, 500, 500], 4000)).toBe(false); // lopsided
    expect(isEvenSplit([1334, 1334, 1333], 4000)).toBe(false); // sums to 4001
    expect(isEvenSplit([1000, 1000], 4000)).toBe(false); // sums to 2000
  });
});

describe("sharesMatchTotal", () => {
  it("is true only when the shares sum to the total", () => {
    expect(sharesMatchTotal([1000, 1500, 1500], 4000)).toBe(true);
    expect(sharesMatchTotal([1000, 1500, 1499], 4000)).toBe(false);
    expect(sharesMatchTotal([], 0)).toBe(true);
  });
});
