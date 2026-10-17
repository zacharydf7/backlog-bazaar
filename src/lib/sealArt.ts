// Geometry and palette for the wax-seal achievement medals (SealMedal). Pure
// so the shapes are deterministic and testable: every family pours its own
// seal outline from a seed, so the same medal always looks the same, and the
// tier picks the material (bronze wax, silver foil, gold leaf) and the trim.

import type { AchievementTier } from "../types";

/** The poured body's light/mid/dark, the recessed field, and the raised relief
 *  tone (crest, ring, laurels). Fixed hex like TIER_META: real metals read the
 *  same in every theme. */
export const SEAL_TIERS: Record<
  AchievementTier,
  { a: string; b: string; c: string; field: string; fieldDeep: string; relief: string }
> = {
  1: { a: "#c0532f", b: "#8a2c18", c: "#4e140a", field: "#7c2615", fieldDeep: "#4f1309", relief: "#d77048" },
  2: { a: "#f2f4f7", b: "#aab2bd", c: "#5d6672", field: "#8c95a1", fieldDeep: "#5a626d", relief: "#e5e9ee" },
  3: { a: "#ffe08a", b: "#d3a12f", c: "#8a5d0c", field: "#bb8722", fieldDeep: "#82580d", relief: "#ffd56a" },
};

/** The gold seal's ribbon tails. */
export const SEAL_RIBBON = "#b8322a";

// Crests on a 48-unit grid centred at 24,24, drawn in the relief tone. Solid
// shapes where the subject has mass, heavy strokes elsewhere — the relief
// filter lights both as raised metal. `currentColor` marks detail cut back
// into the field (the seal sets it to the field's deep tone).
const CRESTS: Record<string, string> = {
  finisher:
    '<path d="M15 41V8" stroke-width="3.4" fill="none"/><path d="M16 8h19l-4.5 6.5L35 21H16z"/>',
  perfectionist: '<path d="M24 6l5.2 11 12 1.3-9 8.2 2.6 11.8L24 32.4 13.2 38.3l2.6-11.8-9-8.2 12-1.3z"/>',
  marathoner:
    '<path d="M13 6h22v3H13zM13 39h22v3H13z"/><path d="M16 9c0 8 7 10 7 15s-7 7-7 15h16c0-8-7-10-7-15s7-7 7-15z"/><path d="M19 37c1.5-4 3.3-6 5-6s3.5 2 5 6z" fill="currentColor"/>',
  tycoon:
    '<ellipse cx="24" cy="12" rx="11.5" ry="4.4"/><path d="M12.5 12v24c0 2.4 5.2 4.4 11.5 4.4s11.5-2 11.5-4.4V12c0 2.4-5.2 4.4-11.5 4.4S12.5 14.4 12.5 12z"/><path d="M12.5 20c0 2.4 5.2 4.4 11.5 4.4s11.5-2 11.5-4.4M12.5 28c0 2.4 5.2 4.4 11.5 4.4s11.5-2 11.5-4.4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  collector:
    '<rect x="9" y="12" width="6.5" height="27" rx="1"/><rect x="17" y="8" width="6.5" height="31" rx="1"/><rect x="25" y="14" width="6.5" height="25" rx="1"/><path d="M32 39l4.3-24.5 5.5 1-4.3 24.5z"/><rect x="7" y="39.5" width="34" height="3" rx="1"/>',
  critic: '<path d="M38 6C25 8 15 19 12 36c5-4 10-6 16-7 6-6 9-14 10-23z"/><path d="M12 36l-3.5 6" fill="none" stroke-width="2.6"/>',
  "honest-quitter":
    '<path d="M11 42L26 7" fill="none" stroke-width="3.4"/><path d="M25 9c5 2.5 9-2.5 15 0l-5.5 12.5c-5.5-2.5-9.5 2.5-15 0z"/>',
  chronicler:
    '<path d="M24 13c-4.5-3.5-11-4.5-16-3.5v27c5-1 11.5 0 16 3.5 4.5-3.5 11-4.5 16-3.5v-27c-5-1-11.5 0-16 3.5z"/><path d="M24 13v26.5M12 17h8M12 22h8M28 17h8M28 22h8M28 27h6" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  curator:
    '<path d="M14 8h19a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H15a5 5 0 0 0 5-5V13a5 5 0 0 0-5-5z"/><path d="M14 8a5 5 0 0 0-5 5v3h6"/><path d="M23 18h10M23 24h10M23 30h7" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  tastemaker:
    '<path d="M8 22h7v18H8z"/><path d="M17 22l7-14c3 0 5 2 4.5 5L27 20h10c2.5 0 4.2 2.4 3.5 4.8l-3.6 12.5A4 4 0 0 1 33 40H17z"/>',
  verified:
    '<path d="M24 6l15 5v11c0 9.5-6.4 16.8-15 20-8.6-3.2-15-10.5-15-20V11z"/><path d="M17 24l5 5 9-10" fill="none" stroke="currentColor" stroke-width="3.2"/>',
  "streak-keeper":
    '<path d="M24 5c2 7 11 11 11 22a11 11 0 0 1-22 0c0-5.5 3-9 5.5-11 0 4.5 2 6.5 4.5 6.5-1.2-6.5 0-12.5 1-17.5z"/><path d="M24 41a5 5 0 0 1-5-5c0-3 2-5 3.5-6.5.3 2.5 1.5 3.5 3 3.5 1.5 0 3.5 1 3.5 3a5 5 0 0 1-5 5z" fill="currentColor"/>',
  regular:
    '<rect x="8" y="11" width="32" height="29" rx="3"/><path d="M15 7v8M33 7v8" fill="none" stroke-width="3.2"/><path d="M8 19h32" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 24h4v4h-4zM22 24h4v4h-4zM30 24h4v4h-4zM14 31h4v4h-4zM22 31h4v4h-4z" fill="currentColor"/>',
  timekeeper:
    '<circle cx="24" cy="27" r="14"/><rect x="20" y="5" width="8" height="4" rx="1"/><path d="M24 9v4M35 15l3-3" fill="none" stroke-width="3"/><path d="M24 27V18M24 27l6 4" fill="none" stroke="currentColor" stroke-width="2.4"/>',
  archaeologist:
    '<path d="M33 6l9 9-3.2 3.2-9-9z"/><path d="M36.5 11.5L21 27" fill="none" stroke-width="3.4"/><path d="M17 23l8 8-8.5 9.5c-2.4 2.6-6.4 2.7-8.9.2s-2.4-6.5.2-8.9z"/>',
  "long-haul": '<path d="M4 40l14-24 6 9 5-7 15 22z"/><circle cx="36" cy="11" r="4"/><path d="M18 16l-4.2 7.2 2.6-1 1.6 2 1.6-2 2.4.8z" fill="currentColor"/>',
  "well-rounded":
    '<circle cx="24" cy="24" r="17" fill="none" stroke-width="2.6"/><path d="M24 7l4 13 13 4-13 4-4 13-4-13-13-4 13-4z"/>',
  "co-op-partner":
    '<circle cx="18" cy="24" r="10" fill="none" stroke-width="4"/><circle cx="30" cy="24" r="10" fill="none" stroke-width="4"/>',
  lorekeeper:
    '<circle cx="16" cy="16" r="8.5"/><circle cx="16" cy="16" r="3" fill="currentColor"/><path d="M21.5 21.5L39 39M32 32l4-4M36.5 36.5l4-4" fill="none" stroke-width="3.6"/>',
  "rotation-regular":
    '<path d="M37 21A14 14 0 0 0 12.5 15" fill="none" stroke-width="3.6"/><path d="M11 27a14 14 0 0 0 24.5 6" fill="none" stroke-width="3.6"/><path d="M8 9l2 10 9.5-3z"/><path d="M40 39l-2-10-9.5 3z"/>',
  contributor:
    '<path d="M7 12l11-4 12 4 11-4v28l-11 4-12-4-11 4z"/><path d="M18 8v28M30 12v28" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  "night-owl":
    '<path d="M30 7a17 17 0 1 0 11 27A14 14 0 0 1 30 7z"/><path d="M13 9l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z"/>',
  "full-set":
    '<path d="M24 6l16 8v20l-16 8-16-8V14z"/><path d="M8 14l16 8 16-8M24 22v20" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  "clean-slate":
    '<path d="M9 31l17-17 11 11-13 13h-8z"/><path d="M18 22l11 11" fill="none" stroke="currentColor" stroke-width="2"/><path d="M26 41h15" fill="none" stroke-width="2.8"/>',
  "speed-clear": '<path d="M27 5L11 27h11l-3 16 18-23H26z"/>',
};

/** A secret medal not yet earned (the server masks its family). */
const HIDDEN_CREST =
  '<path d="M17 17a7 7 0 1 1 10 6.3c-2 1-3 2.4-3 4.7v2" fill="none" stroke-width="4"/><circle cx="24" cy="37" r="2.6"/>';

/** The crest markup for a family; unknown families get the star. */
export function crestFor(family: string): string {
  if (family.startsWith("hidden:")) return HIDDEN_CREST;
  return CRESTS[family] ?? CRESTS.perfectionist;
}

/** Every family with its own crest (for tests and the catalog check). */
export const CREST_FAMILIES = Object.keys(CRESTS);

/** A small seeded PRNG (LCG) so a family's seal pours the same every render. */
function rand(seed: string): () => number {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const fmt = (v: number) => v.toFixed(1);

/** A poured outline on the 140 viewBox: nine soft lobes plus a few seeded
 *  bulges, so each family's seal pours a little differently. */
export function waxPath(seed: string, r = 52, cx = 70, cy = 70): string {
  const rnd = rand(seed);
  const phase = rnd() * Math.PI * 2;
  const bumps = Array.from({ length: 3 }, () => [rnd() * Math.PI * 2, 2.5 + rnd() * 3.5]);
  const pts: string[] = [];
  for (let i = 0; i < 120; i++) {
    const t = (i / 120) * Math.PI * 2;
    let rr = r + Math.sin(t * 9 + phase) * 2.6 + Math.sin(t * 4 + phase * 2) * 1.1;
    for (const [at, h] of bumps) {
      rr += h * Math.exp(-((Math.atan2(Math.sin(t - at), Math.cos(t - at)) / 0.3) ** 2));
    }
    pts.push(`${fmt(cx + Math.cos(t) * rr)} ${fmt(cy + Math.sin(t) * rr)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** Wax droplets spattered just outside the seal. */
export function droplets(seed: string): { cx: number; cy: number; r: number }[] {
  const rnd = rand(seed + "drops");
  return Array.from({ length: 3 }, (_, i) => {
    const a = rnd() * Math.PI * 2;
    const d = 60 + rnd() * 4;
    const r = i === 0 ? 3.2 : 1.6 + rnd() * 1.2;
    return { cx: 70 + Math.cos(a) * d, cy: 70 + Math.sin(a) * d, r };
  });
}

/** One laurel sprig up one side of the field (bottom to about ten o'clock):
 *  the stem path plus leaves pointing along it, tipped outward. `side` 1 =
 *  left, -1 = right (mirrored). */
export function laurel(
  side: 1 | -1,
  leaves: number,
): { stem: string; leaves: { x: number; y: number; rot: number }[] } {
  const R = 30;
  const start = 112;
  const end = 212;
  const mirror = (x: number) => (side === 1 ? x : 140 - x);
  const stem = Array.from({ length: 13 }, (_, i) => {
    const a = ((start + ((end - start) * i) / 12) * Math.PI) / 180;
    return `${fmt(mirror(70 + Math.cos(a) * R))} ${fmt(70 + Math.sin(a) * R)}`;
  });
  return {
    stem: `M${stem.join("L")}`,
    leaves: Array.from({ length: leaves }, (_, i) => {
      const deg = start + 8 + ((end - start - 12) * i) / Math.max(1, leaves - 1);
      const a = (deg * Math.PI) / 180;
      // Tangent along the arc, tipped 30° outward from the field.
      const rot = deg + 120;
      return {
        x: mirror(70 + Math.cos(a) * R),
        y: 70 + Math.sin(a) * R,
        rot: side === 1 ? rot : 180 - rot,
      };
    }),
  };
}
