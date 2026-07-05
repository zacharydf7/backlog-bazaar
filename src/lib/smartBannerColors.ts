// The "Match my banner" auto-pick: turn a banner's dominant swatches (from
// lib/palette.ts) into ready-to-save profile color pairs. The background keeps
// the banner's leading hue but is pushed to canvas depth (dark banners get a
// deep canvas, light banners a pale one); accents are the banner's most vivid
// colors, nudged until they hold WCAG-ish contrast against that background so
// buttons and highlights never vanish into the page. Pure (no canvas/DOM) so
// the picks are directly unit-tested; the modal just applies them.

import { isLightColor, mixHex, normalizeHex, relativeLuminance } from "./profileColors";

/** One auto-picked pair, ready for profileColorVars. */
export interface BannerTheme {
  bg: string;
  accent: string;
}

/** A dark canvas sits at or below this luminance (app themes run ~0.01–0.03). */
const DARK_CANVAS_MAX_LUM = 0.045;
/** A light canvas sits at or above this luminance. */
const LIGHT_CANVAS_MIN_LUM = 0.55;
/** Minimum accent-on-background contrast (WCAG's bar for UI components). */
const MIN_ACCENT_CONTRAST = 3;

function channels(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? "#000000";
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** Colorfulness as channel spread, 0 (gray) to 1 (fully saturated & bright).
 *  Unlike HSV saturation this stays low for near-black hues, so a vibrant
 *  orange outranks a dark navy when picking accents. */
export function chroma(hex: string): number {
  const c = channels(hex);
  return (Math.max(...c) - Math.min(...c)) / 255;
}

/** WCAG contrast ratio between two colors, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Push a color to canvas depth on its own side of the light/dark crossover,
 *  keeping its hue: dark colors deepen toward black, light ones lift toward
 *  white, stopping as soon as the luminance is canvas-appropriate. */
function toCanvas(hex: string): string {
  const light = isLightColor(hex);
  const pole = light ? "#ffffff" : "#000000";
  const settled = (c: string) =>
    light
      ? relativeLuminance(c) >= LIGHT_CANVAS_MIN_LUM
      : relativeLuminance(c) <= DARK_CANVAS_MAX_LUM;
  let c = normalizeHex(hex) ?? "#000000";
  for (let i = 0; i < 24 && !settled(c); i++) c = mixHex(c, pole, 0.18);
  return c;
}

/** Nudge an accent toward the background's opposing pole until it clears the
 *  contrast bar — a banner color close to the derived canvas stays on-hue but
 *  becomes visible. */
function ensureAccentContrast(hex: string, bg: string): string {
  const pole = isLightColor(bg) ? "#000000" : "#ffffff";
  let c = normalizeHex(hex) ?? pole;
  for (let i = 0; i < 24 && contrastRatio(c, bg) < MIN_ACCENT_CONTRAST; i++) {
    c = mixHex(c, pole, 0.14);
  }
  return c;
}

/** Auto-picked background+accent pairs for a banner's swatches (dominant
 *  first, as extractPalette returns them), best match first. All pairs share
 *  the background derived from the dominant color; accents are the swatches
 *  ranked by vividness, each guaranteed readable against that background —
 *  so "try another match" cycles accents without the page flickering between
 *  canvases. Empty when there are no usable swatches. */
export function smartBannerThemes(swatches: string[], max = 4): BannerTheme[] {
  const hexes = swatches
    .map((s) => normalizeHex(s))
    .filter((h): h is string => h !== null);
  if (hexes.length === 0) return [];

  const bg = toCanvas(hexes[0]);
  const ranked = hexes
    .map((hex, i) => ({ hex, i, vividness: chroma(hex) }))
    .sort((a, b) => b.vividness - a.vividness || a.i - b.i);

  const themes: BannerTheme[] = [];
  const seen = new Set<string>();
  for (const { hex } of ranked) {
    const accent = ensureAccentContrast(hex, bg);
    if (accent === bg || seen.has(accent)) continue;
    seen.add(accent);
    themes.push({ bg, accent });
    if (themes.length >= max) break;
  }
  return themes;
}
