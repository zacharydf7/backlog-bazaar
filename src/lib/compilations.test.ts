import { describe, it, expect } from "vitest";
import type { Compilation } from "../types";
import {
  toCents,
  fromCents,
  splitEvenly,
  splitByLength,
  sharesMatchTotal,
  isEvenSplit,
  distributeAcrossCopies,
  compilationCopiesOf,
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

describe("distributeAcrossCopies", () => {
  it("makes every copy row sum exactly to that copy's cents", () => {
    const matrix = distributeAcrossCopies([5999, 2049], [3333, 3333, 3333]);
    expect(matrix).toHaveLength(2);
    expect(sum(matrix[0])).toBe(5999);
    expect(sum(matrix[1])).toBe(2049);
  });

  it("reproduces custom shares verbatim for a single copy matching the total (back-compat)", () => {
    // Today's behavior: one copy priced at the grand total → the hand-entered
    // shares come back untouched.
    const shares = [1000, 2500, 499];
    expect(distributeAcrossCopies([3999], shares)).toEqual([shares]);
  });

  it("keeps the whole matrix summing to the grand total (fuzz)", () => {
    let seed = 42;
    const rnd = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    for (let t = 0; t < 50; t++) {
      const copies = Array.from({ length: 1 + rnd(5) }, () => rnd(100000));
      const shares = Array.from({ length: 1 + rnd(7) }, () => rnd(50000));
      const matrix = distributeAcrossCopies(copies, shares);
      matrix.forEach((row, k) => {
        expect(sum(row)).toBe(copies[k]); // each copy exact
        expect(row).toHaveLength(shares.length);
      });
      expect(sum(matrix.map(sum))).toBe(sum(copies)); // grand total exact
    }
  });

  it("bounds each child's drift from its entered share by the copy count", () => {
    const copies = [1234, 5678, 9012];
    const shares = splitEvenly(sum(copies), 4);
    const matrix = distributeAcrossCopies(copies, shares);
    for (let j = 0; j < shares.length; j++) {
      const col = sum(matrix.map((row) => row[j]));
      expect(Math.abs(col - shares[j])).toBeLessThan(copies.length);
    }
  });

  it("falls back to an even split per copy when every share is zero", () => {
    expect(distributeAcrossCopies([300], [0, 0, 0])).toEqual([[100, 100, 100]]);
  });

  it("handles empties", () => {
    expect(distributeAcrossCopies([], [100])).toEqual([]);
    expect(distributeAcrossCopies([100], [])).toEqual([[]]);
  });
});

describe("compilationCopiesOf", () => {
  const base: Compilation = {
    id: "C",
    title: "Bundle",
    totalCost: 40,
    createdAt: 1,
    expanded: true,
    carryoverHours: 0,
  };

  it("returns real copies when present", () => {
    const copies = [{ id: "a", platform: "PC" }, { id: "b", platform: "PS5", cost: 20 }];
    expect(compilationCopiesOf({ ...base, copies })).toBe(copies);
  });

  it("synthesizes a single copy from legacy scalars", () => {
    const legacy = compilationCopiesOf({
      ...base,
      platform: "Nintendo Switch",
      format: "physical",
    });
    expect(legacy).toHaveLength(1);
    expect(legacy[0].platform).toBe("Nintendo Switch");
    expect(legacy[0].format).toBe("physical");
    expect(legacy[0].cost).toBe(40);
  });

  it("synthesizes from a lone cost or format too, but an empty row yields []", () => {
    expect(compilationCopiesOf({ ...base, totalCost: 15 })[0].cost).toBe(15);
    expect(compilationCopiesOf({ ...base, totalCost: 0, format: "digital" })[0].format).toBe(
      "digital",
    );
    expect(compilationCopiesOf({ ...base, totalCost: 0 })).toEqual([]);
  });
});
