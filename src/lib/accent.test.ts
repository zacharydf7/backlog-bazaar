import { describe, it, expect } from "vitest";
import { ACCENTS, BIO_MAX, resolveAccent } from "./accent";

describe("resolveAccent", () => {
  it("maps a curated id to its hex", () => {
    expect(resolveAccent("violet")).toBe("#a855f7");
  });

  it("passes a valid hex through, lowercased", () => {
    expect(resolveAccent("#AABBCC")).toBe("#aabbcc");
    expect(resolveAccent("#abc")).toBe("#abc");
  });

  it("returns null for blank, null, or garbage", () => {
    expect(resolveAccent(null)).toBeNull();
    expect(resolveAccent(undefined)).toBeNull();
    expect(resolveAccent("")).toBeNull();
    expect(resolveAccent("not-a-color")).toBeNull();
    expect(resolveAccent("#12")).toBeNull();
    expect(resolveAccent("rgb(1,2,3)")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(resolveAccent("  gold ")).toBe("#f59e0b");
    expect(resolveAccent(" #aabbcc ")).toBe("#aabbcc");
  });
});

describe("ACCENTS catalog", () => {
  it("every swatch has a unique id and a valid hex", () => {
    const ids = ACCENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACCENTS) expect(resolveAccent(a.id)).toBe(a.hex.toLowerCase());
  });

  it("exposes a positive bio limit", () => {
    expect(BIO_MAX).toBeGreaterThan(0);
  });
});
