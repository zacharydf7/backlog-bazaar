import { describe, it, expect } from "vitest";
import { chroma, contrastRatio, smartBannerThemes } from "./smartBannerColors";
import { isLightColor, relativeLuminance } from "./profileColors";

describe("chroma", () => {
  it("is 0 for grays and 1 for a fully saturated bright hue", () => {
    expect(chroma("#000000")).toBe(0);
    expect(chroma("#808080")).toBe(0);
    expect(chroma("#ffffff")).toBe(0);
    expect(chroma("#ff0000")).toBe(1);
  });

  it("stays low for near-black hues (a dark navy is not 'vivid')", () => {
    expect(chroma("#000020")).toBeLessThan(chroma("#e56a52"));
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a color on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#3366aa", "#3366aa")).toBe(1);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#112233", "#ddeeff")).toBeCloseTo(contrastRatio("#ddeeff", "#112233"));
  });
});

describe("smartBannerThemes", () => {
  it("returns nothing for no (or unusable) swatches", () => {
    expect(smartBannerThemes([])).toEqual([]);
    expect(smartBannerThemes(["nope", ""])).toEqual([]);
  });

  it("derives a dark canvas from a dark dominant color, keeping it if already deep", () => {
    const [t] = smartBannerThemes(["#112233"]);
    expect(t.bg).toBe("#112233"); // already canvas-deep — untouched
  });

  it("deepens a mid-tone dominant color into a dark canvas", () => {
    const [t] = smartBannerThemes(["#5566aa"]);
    expect(relativeLuminance(t.bg)).toBeLessThanOrEqual(0.045);
    // Hue survives: still blue-leaning (b > r).
    const b = parseInt(t.bg.slice(5, 7), 16);
    const r = parseInt(t.bg.slice(1, 3), 16);
    expect(b).toBeGreaterThan(r);
  });

  it("lifts a light dominant color into a pale canvas instead of forcing dark", () => {
    const [t] = smartBannerThemes(["#e8d5a0"]);
    expect(isLightColor(t.bg)).toBe(true);
    expect(relativeLuminance(t.bg)).toBeGreaterThanOrEqual(0.55);
  });

  it("every pair's accent clears the contrast bar against the shared background", () => {
    const themes = smartBannerThemes(["#112233", "#1a2b3c", "#e56a52", "#95ccdd"]);
    expect(themes.length).toBeGreaterThan(0);
    for (const t of themes) {
      expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(3);
      expect(t.bg).toBe(themes[0].bg); // one canvas, cycling accents
    }
  });

  it("prefers the most vivid swatch as the first accent, not the most dominant", () => {
    // Dominant is a drab navy; the vibrant coral should win the accent.
    const [t] = smartBannerThemes(["#1a2233", "#e56a52"]);
    expect(t.accent).toBe("#e56a52"); // already contrasty on the dark canvas — kept as-is
  });

  it("copes with an all-gray banner by manufacturing a readable accent", () => {
    const themes = smartBannerThemes(["#222222", "#333333"]);
    expect(themes.length).toBeGreaterThan(0);
    expect(contrastRatio(themes[0].accent, themes[0].bg)).toBeGreaterThanOrEqual(3);
  });

  it("dedupes accents that converge after the contrast nudge", () => {
    // Both swatches are near-identical darks — nudged toward white they meet.
    const themes = smartBannerThemes(["#101010", "#101011"]);
    const accents = themes.map((t) => t.accent);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it("caps the number of pairs at `max`", () => {
    const themes = smartBannerThemes(
      ["#112233", "#e56a52", "#95ccdd", "#fcd34d", "#a855f7", "#22c55e"],
      2,
    );
    expect(themes).toHaveLength(2);
  });

  it("normalizes shorthand hexes", () => {
    const [t] = smartBannerThemes(["#123"]);
    expect(t.bg).toBe("#112233");
  });
});
