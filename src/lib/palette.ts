// Dominant-color extraction for the banner color matcher: given raw RGBA pixel
// data, return the image's standout colors as hexes. Coarse quantization (16
// levels per channel) buckets similar pixels, buckets rank by population, and
// a distance gate keeps the picks visually distinct instead of returning five
// shades of the same sky. Pure (no canvas) so it's directly unit-tested — the
// thin canvas layer that feeds it lives in bannerSampling.ts.

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Minimum squared RGB distance between two returned swatches. */
const DISTINCT_SQ = 48 * 48;

/** Top `count` distinct colors in RGBA pixel data, most dominant first.
 *  Near-transparent pixels (alpha < 128) are ignored. */
export function extractPalette(data: ArrayLike<number>, count = 6): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key);
    if (e) {
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  }

  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((e) => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n }));

  const picked: { r: number; g: number; b: number }[] = [];
  for (const c of ranked) {
    if (picked.length >= count) break;
    const tooClose = picked.some(
      (p) => (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2 < DISTINCT_SQ,
    );
    if (!tooClose) picked.push(c);
  }
  return picked.map((c) => rgbToHex(c.r, c.g, c.b));
}
