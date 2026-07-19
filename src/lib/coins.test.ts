import { describe, it, expect } from "vitest";
import {
  COIN_VARIANTS,
  DEFAULT_COIN,
  SHOP_COIN_KEYS,
  SHOP_COIN_VARIANTS,
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

describe("shop coin skins", () => {
  it("shop skins are valid variants but stay out of the free default list", () => {
    for (const { id } of SHOP_COIN_VARIANTS) {
      expect(isCoinVariant(id), id).toBe(true);
      expect(COIN_VARIANTS.some((c) => c.id === id), id).toBe(false);
    }
    expect(SHOP_COIN_KEYS).toEqual(SHOP_COIN_VARIANTS.map((c) => c.id));
  });

  it("every shop skin is well-formed", () => {
    for (const { id, label } of SHOP_COIN_VARIANTS) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});
