import { describe, it, expect } from "vitest";
import { extractPalette, rgbToHex } from "./palette";

/** Build RGBA data from [r,g,b,count] specs. */
function pixels(...specs: [number, number, number, number][]): number[] {
  const out: number[] = [];
  for (const [r, g, b, n] of specs) {
    for (let i = 0; i < n; i++) out.push(r, g, b, 255);
  }
  return out;
}

describe("rgbToHex", () => {
  it("formats and clamps channels", () => {
    expect(rgbToHex(255, 170, 0)).toBe("#ffaa00");
    expect(rgbToHex(-5, 300, 12.4)).toBe("#00ff0c");
  });
});

describe("extractPalette", () => {
  it("returns distinct colors ranked by dominance", () => {
    const data = pixels([200, 30, 30, 50], [30, 30, 200, 30], [30, 200, 30, 10]);
    expect(extractPalette(data)).toEqual(["#c81e1e", "#1e1ec8", "#1ec81e"]);
  });

  it("merges near-identical shades into one bucket average", () => {
    // Two reds inside the same 16-level bucket → one swatch, averaged.
    const data = pixels([200, 30, 30, 10], [204, 31, 31, 10]);
    expect(extractPalette(data)).toEqual(["#ca1f1f"]);
  });

  it("suppresses a second swatch too close to an already-picked one", () => {
    // Different buckets but visually the same red family; only the dominant
    // one and the distant blue survive.
    const data = pixels([200, 30, 30, 50], [190, 60, 40, 20], [30, 30, 200, 10]);
    expect(extractPalette(data)).toEqual(["#c81e1e", "#1e1ec8"]);
  });

  it("skips near-transparent pixels", () => {
    const data = [...pixels([200, 30, 30, 5]), 30, 200, 30, 40 /* alpha 40 → ignored */];
    expect(extractPalette(data)).toEqual(["#c81e1e"]);
  });

  it("caps the swatch count", () => {
    const data = pixels(
      [255, 0, 0, 9],
      [0, 255, 0, 8],
      [0, 0, 255, 7],
      [255, 255, 0, 6],
      [0, 255, 255, 5],
    );
    expect(extractPalette(data, 3)).toHaveLength(3);
  });

  it("returns [] for empty data", () => {
    expect(extractPalette([])).toEqual([]);
  });
});
