// Per-profile accent color for the Profile Hub. A user picks a curated swatch or a
// custom hex; it's applied as a CSS-variable override scoped to the hub root, so it
// restyles only that page's accent chrome (borders, highlight text) — never the app.
// Pure (no React/DOM) so it's directly unit-tested; the CSSProperties type is
// type-only.

import type { CSSProperties } from "react";

/** Max length of the "About Me" bio (kept in sync with the DB check constraint). */
export const BIO_MAX = 500;

export interface AccentDef {
  id: string;
  name: string;
  hex: string;
}

/** Curated accent swatches — readable on every theme. Users may also pick a custom
 *  hex; both round-trip through `resolveAccent`. */
export const ACCENTS: AccentDef[] = [
  { id: "gold", name: "Gold", hex: "#f59e0b" },
  { id: "ember", name: "Ember", hex: "#f97316" },
  { id: "crimson", name: "Crimson", hex: "#ef4444" },
  { id: "rose", name: "Rose", hex: "#ec4899" },
  { id: "violet", name: "Violet", hex: "#a855f7" },
  { id: "azure", name: "Azure", hex: "#3b82f6" },
  { id: "teal", name: "Teal", hex: "#14b8a6" },
  { id: "lime", name: "Lime", hex: "#84cc16" },
];

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Resolve a stored accent value to a hex color: a curated id maps to its hex, a
 *  valid `#rgb`/`#rrggbb` passes through (lowercased), anything else (null, blank,
 *  garbage) → null so callers fall back to the theme default. */
export function resolveAccent(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const curated = ACCENTS.find((a) => a.id === v);
  if (curated) return curated.hex;
  if (HEX.test(v)) return v.toLowerCase();
  return null;
}

/** The inline CSS-variable overrides to apply on the hub root for a resolved accent.
 *  Empty (no override → theme default) when the accent is null. Scoped: it only sets
 *  `--accent`, the token behind text-accent / border-accent highlights. */
export function accentVars(hex: string | null): CSSProperties {
  if (!hex) return {};
  return { "--accent": hex } as CSSProperties;
}
