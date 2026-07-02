import { describe, it, expect } from "vitest";
import {
  COIN_VARIANTS,
  DEFAULT_COIN,
  coerceCoinVariant,
  coinSrc,
  isCoinVariant,
} from "./coins";

describe("coin variants", () => {
  it("the default is one of the known variants", () => {
    expect(COIN_VARIANTS.some((c) => c.id === DEFAULT_COIN)).toBe(true);
  });

  it("recognises known variants and rejects others", () => {
    expect(isCoinVariant("mint")).toBe(true);
    expect(isCoinVariant("bb")).toBe(true);
    expect(isCoinVariant("chest")).toBe(true);
    expect(isCoinVariant("doubloon")).toBe(false);
    expect(isCoinVariant(null)).toBe(false);
    expect(isCoinVariant(42)).toBe(false);
  });

  it("coerces unknown values to the default", () => {
    expect(coerceCoinVariant("stall")).toBe("stall");
    expect(coerceCoinVariant("nope")).toBe(DEFAULT_COIN);
    expect(coerceCoinVariant(undefined)).toBe(DEFAULT_COIN);
  });

  it("builds the public asset path", () => {
    expect(coinSrc("b")).toBe("/coins/b.svg");
  });
});
