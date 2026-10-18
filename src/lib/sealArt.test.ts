import { describe, it, expect } from "vitest";
import { CREST_FAMILIES, crestFor, droplets, laurel, waxPath } from "./sealArt";

describe("seal art", () => {
  it("pours the same outline for the same seed and a different one per family", () => {
    expect(waxPath("finisher1")).toBe(waxPath("finisher1"));
    expect(waxPath("finisher1")).not.toBe(waxPath("critic1"));
    expect(waxPath("finisher1")).toMatch(/^M[\d. L]+Z$/);
  });

  it("keeps the droplets just outside the seal", () => {
    for (const d of droplets("tycoon3")) {
      const dist = Math.hypot(d.cx - 70, d.cy - 70);
      expect(dist).toBeGreaterThanOrEqual(60);
      expect(dist).toBeLessThanOrEqual(64);
    }
  });

  it("mirrors the right laurel sprig across the seal's centre", () => {
    const left = laurel(1, 4);
    const right = laurel(-1, 4);
    right.leaves.forEach((l, i) => expect(140 - l.x).toBeCloseTo(left.leaves[i].x, 6));
    expect(right.leaves.map((l) => l.y)).toEqual(left.leaves.map((l) => l.y));
  });

  it("has a crest for every seeded family, a ? for masked secrets, and a fallback", () => {
    for (const family of [
      "finisher", "perfectionist", "marathoner", "tycoon", "collector", "critic",
      "honest-quitter", "chronicler", "curator", "tastemaker", "verified",
      "streak-keeper", "regular", "timekeeper", "archaeologist", "long-haul",
      "well-rounded", "co-op-partner", "lorekeeper", "rotation-regular",
      "contributor", "night-owl", "full-set", "clean-slate", "speed-clear", "routine",
      "preorder", "early-bird",
    ]) {
      expect(CREST_FAMILIES).toContain(family);
    }
    expect(crestFor("hidden:abc")).not.toBe(crestFor("finisher"));
    expect(crestFor("someday-new")).toBe(crestFor("perfectionist"));
  });
});
