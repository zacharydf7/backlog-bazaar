// The canvas layer feeding the banner color matcher: draws the (CORS-enabled)
// banner image into small offscreen canvases to extract a suggested palette
// and to sample the exact pixel under a click. Everything is guarded — a
// tainted canvas (missing CORS headers) or a canvas-less environment (jsdom)
// degrades to "no swatches" rather than throwing. Untestable under jsdom by
// nature; the color math it delegates to (lib/palette.ts) carries the tests.

import { extractPalette, rgbToHex } from "./palette";

/** The image's dominant colors (most dominant first), or [] when the canvas
 *  can't be read. Downsamples to ~96px wide first — palette work doesn't need
 *  more, and it keeps the read cheap. */
export function paletteFromImageEl(img: HTMLImageElement, count = 6): string[] {
  try {
    if (!img.naturalWidth || !img.naturalHeight) return [];
    const w = 96;
    const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, w, h);
    return extractPalette(ctx.getImageData(0, 0, w, h).data, count);
  } catch {
    return [];
  }
}

/** The color under a click, given the click position as 0–1 ratios of the
 *  displayed image (the banner displays undistorted, so ratios map straight
 *  onto natural coordinates). Null when the pixel can't be read. */
export function samplePixel(
  img: HTMLImageElement,
  xRatio: number,
  yRatio: number,
): string | null {
  try {
    if (!img.naturalWidth || !img.naturalHeight) return null;
    const x = Math.max(0, Math.min(img.naturalWidth - 1, Math.floor(xRatio * img.naturalWidth)));
    const y = Math.max(0, Math.min(img.naturalHeight - 1, Math.floor(yRatio * img.naturalHeight)));
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, x, y, 1, 1, 0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a < 128) return null;
    return rgbToHex(r, g, b);
  } catch {
    return null;
  }
}
