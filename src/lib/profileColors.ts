// Per-profile page colors: a background + an accent, chosen in the profile's
// Colors modal and stored on the profile (bg as a #rrggbb hex, accent as a
// curated swatch id or hex — see lib/accent.ts). The page can't just swap
// `--canvas`: every panel, border and line of text is a theme token, so a
// custom background needs a whole derived palette or the theme's ink becomes
// unreadable (imagine Midnight's cream text on a white background). This
// module derives that palette — pure (no React/DOM) so it's directly
// unit-tested; the CSSProperties type is type-only.

import type { CSSProperties } from "react";
import { THEMES } from "./theme";
import { resolveAccent } from "./accent";

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Normalize a hex color: `#rgb` expands to `#rrggbb`, output lowercased;
 *  anything that isn't a valid hex (null, blank, garbage) → null. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!HEX.test(v)) return null;
  const h = v.slice(1).toLowerCase();
  if (h.length === 3) return "#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return "#" + h;
}

function channels(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? "#000000";
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** Mix `a` toward `b` by t ∈ [0,1] (0 = a, 1 = b), per RGB channel. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = channels(a);
  const cb = channels(b);
  const mixed = ca.map((v, i) => Math.round(v + (cb[i] - v) * Math.min(1, Math.max(0, t))));
  return "#" + mixed.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Whether dark text beats light text on this color (the WCAG crossover:
 *  black and white text contrast equally at luminance ≈ 0.179). */
export function isLightColor(hex: string): boolean {
  return relativeLuminance(hex) > 0.179;
}

/** A curated background+accent pair for the preset dropdown. "Classic" (both
 *  null = the viewer's theme untouched) plus every app theme's canvas+accent —
 *  proven-readable palettes under names players already know. */
export interface ProfilePreset {
  id: string;
  name: string;
  bg: string | null;
  accent: string | null;
}

export const PROFILE_PRESETS: ProfilePreset[] = [
  { id: "classic", name: "Classic", bg: null, accent: null },
  ...THEMES.map((t) => ({ id: t.id, name: t.name, bg: t.swatches[0], accent: t.swatches[3] })),
];

/** The preset matching a bg+accent pair exactly, or null when it's a custom mix. */
export function matchPreset(
  bg: string | null | undefined,
  accent: string | null | undefined
): ProfilePreset | null {
  const b = normalizeHex(bg ?? null);
  const a = resolveAccent(accent ?? null);
  return (
    PROFILE_PRESETS.find(
      (p) => normalizeHex(p.bg) === b && (p.accent ? p.accent.toLowerCase() : null) === a
    ) ?? null
  );
}

/** The scoped CSS-variable overrides for a profile's stored colors. Empty when
 *  both are unset (→ the viewer's theme applies untouched).
 *
 *  A background override rebuilds the page's whole neutral palette from the one
 *  chosen color: surfaces/panels/lines are the background nudged toward the ink
 *  pole, and ink/muted/subtle flip light-or-dark on the background's luminance,
 *  so any pick stays readable. An accent override colors the highlight chrome
 *  AND the buttons (`--brand`), with the button text picked black/white for
 *  contrast. Success/danger stay the theme's — they're semantic, not identity. */
export function profileColorVars(
  bg: string | null | undefined,
  accent: string | null | undefined
): CSSProperties {
  const vars: Record<string, string> = {};
  const bgHex = normalizeHex(bg ?? null);
  if (bgHex) {
    const light = isLightColor(bgHex);
    const pole = light ? "#000000" : "#ffffff";
    vars.colorScheme = light ? "light" : "dark";
    vars["--canvas"] = bgHex;
    vars["--surface"] = light ? mixHex(bgHex, "#ffffff", 0.5) : mixHex(bgHex, pole, 0.05);
    vars["--panel"] = light ? mixHex(bgHex, pole, 0.06) : mixHex(bgHex, pole, 0.11);
    vars["--line"] = light ? mixHex(bgHex, pole, 0.14) : mixHex(bgHex, pole, 0.18);
    vars["--edge"] = light ? mixHex(bgHex, pole, 0.55) : mixHex(bgHex, pole, 0.35);
    vars["--shadow-ink"] = light ? "rgba(0, 0, 0, 0.16)" : "rgba(0, 0, 0, 0.45)";
    vars["--ink"] = light ? mixHex(bgHex, pole, 0.84) : mixHex(bgHex, pole, 0.93);
    vars["--muted"] = light ? mixHex(bgHex, pole, 0.62) : mixHex(bgHex, pole, 0.65);
    vars["--subtle"] = mixHex(bgHex, pole, 0.45);
  }
  const accentHex = resolveAccent(accent ?? null);
  if (accentHex) {
    vars["--accent"] = accentHex;
    vars["--brand"] = accentHex;
    vars["--brand-fg"] = isLightColor(accentHex) ? "#15181f" : "#ffffff";
  }
  return vars as CSSProperties;
}
