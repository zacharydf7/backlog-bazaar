// The client-side visual registry for Curio Shop cosmetics. A shop_items row
// stores only a `style` KEY; the actual look (Tailwind classes) lives here, so
// shipping a brand-new look is a code change while restocking/pricing existing
// looks is pure data. Unknown keys resolve to null and render undecorated —
// a DB row can never crash the UI (the resolveBadgeIcon posture).
//
// Cosmetics are deliberately fixed-colour (like the achievement metals) rather
// than theme-token driven: a "Gilded" frame should look gilded in every theme.

export interface FrameStyle {
  label: string;
  /** Classes for the wrapper ring around the avatar (rounded-full + padding +
   *  a colour/gradient background; the avatar sits inside). Premium looks may
   *  compose the fx-* animation utilities from index.css. */
  className: string;
  /** Key into CosmeticOrnaments.tsx for looks that add a decorative element
   *  (a perched bat, a light string) on top of the classes. */
  ornament?: string;
}

export interface StallStyle {
  label: string;
  /** Classes merged onto the stall card / profile header container. Ornamented
   *  looks include `relative overflow-hidden` themselves so every host can
   *  position the overlay without changes. */
  cardClassName: string;
  /** Key into CosmeticOrnaments.tsx (see FrameStyle.ornament). */
  ornament?: string;
}

export const FRAME_STYLES: Record<string, FrameStyle> = {
  "bronze-ring": {
    label: "Bronze Ring",
    className: "bg-[#b0783c]",
  },
  aurora: {
    label: "Aurora",
    className: "bg-gradient-to-tr from-[#34d399] via-[#60a5fa] to-[#a78bfa]",
  },
  gilded: {
    label: "Gilded",
    className: "bg-gradient-to-br from-[#f5d06f] via-[#e0a82e] to-[#8a6508]",
  },
  "holly-wreath": {
    label: "Holly Wreath",
    className: "bg-gradient-to-br from-[#166534] via-[#15803d] to-[#b91c1c]",
  },
  "starlight-shimmer": {
    label: "Starlight Shimmer",
    className: "bg-gradient-to-br from-[#f8e08e] via-[#e0a82e] to-[#9a7208] fx-shimmer",
  },
  prismatic: {
    label: "Prismatic",
    className: "fx-prismatic",
  },
  "jack-o-lantern": {
    label: "Jack-o'-Lantern",
    className: "bg-gradient-to-b from-[#fb923c] via-[#ea580c] to-[#7c2d12] fx-flicker",
  },
  "bat-familiar": {
    label: "Bat Familiar",
    className: "bg-gradient-to-b from-[#312e81] via-[#1e1b4b] to-[#0b0a1f]",
    ornament: "bat-perched",
  },
  "candy-cane": {
    label: "Candy Cane",
    className:
      "bg-[repeating-linear-gradient(135deg,#dc2626_0px,#dc2626_6px,#f8fafc_6px,#f8fafc_12px)]",
  },
  "cat-familiar": {
    label: "Cat Familiar",
    className: "bg-gradient-to-b from-[#334155] via-[#1e293b] to-[#0f172a]",
    ornament: "cat-perched",
  },
  ember: {
    label: "Ember",
    className:
      "bg-gradient-to-b from-[#f97316] via-[#c2410c] to-[#431407] shadow-[0_0_10px_2px_rgba(249,115,22,0.45)]",
    ornament: "sparks",
  },
  stormcaller: {
    label: "Stormcaller",
    className: "bg-gradient-to-b from-[#475569] via-[#1e293b] to-[#0b1020]",
    ornament: "storm",
  },
};

export const STALL_STYLES: Record<string, StallStyle> = {
  "festive-bunting": {
    label: "Festive Bunting",
    cardClassName: "border-[#eab308]/60 bg-gradient-to-b from-[#eab308]/15 to-transparent",
  },
  "lantern-glow": {
    label: "Lantern Glow",
    cardClassName: "border-[#f59e0b]/60 shadow-[0_0_20px_-4px_#f59e0b99]",
  },
  "velvet-drapes": {
    label: "Velvet Drapes",
    cardClassName: "border-[#7c3aed]/60 bg-gradient-to-b from-[#7c3aed]/20 to-transparent",
  },
  snowfall: {
    label: "Snowfall",
    cardClassName: "border-[#7dd3fc]/70 bg-gradient-to-b from-[#bae6fd]/25 to-transparent",
  },
  "marquee-lights": {
    label: "Marquee Lights",
    cardClassName:
      "isolate relative overflow-hidden border-[#fbbf24]/60 bg-gradient-to-b from-[#fbbf24]/10 to-transparent",
    ornament: "string-lights",
  },
  "pumpkin-patch": {
    label: "Pumpkin Patch",
    cardClassName:
      "isolate relative overflow-hidden border-[#ea580c]/60 bg-gradient-to-b from-[#ea580c]/15 to-transparent",
    ornament: "pumpkins",
  },
  "haunted-bazaar": {
    label: "Haunted Bazaar",
    cardClassName:
      "isolate relative overflow-hidden border-[#7c3aed]/70 bg-gradient-to-b from-[#1e1b4b]/50 via-[#312e81]/25 to-[#7c3aed]/10",
    ornament: "bats-drifting",
  },
  "trimmed-tree": {
    label: "Trimmed Tree",
    cardClassName:
      "isolate relative overflow-hidden border-[#166534]/70 bg-gradient-to-b from-[#166534]/20 to-transparent",
    ornament: "tree-lights",
  },
  "candy-cane-trim": {
    label: "Candy Cane Trim",
    cardClassName:
      "border-[#dc2626]/60 bg-[repeating-linear-gradient(135deg,#dc262614_0px,#dc262614_10px,#f8fafc10_10px,#f8fafc10_20px)]",
  },
  "shooting-star": {
    label: "Shooting Star",
    cardClassName:
      "isolate relative overflow-hidden border-[#818cf8]/50 bg-gradient-to-b from-[#1e1b4b]/50 via-[#312e81]/20 to-transparent",
    ornament: "comet",
  },
  "creeping-fog": {
    label: "Creeping Fog",
    cardClassName:
      "isolate relative overflow-hidden border-[#64748b]/60 bg-gradient-to-b from-[#334155]/40 to-[#94a3b8]/10",
    ornament: "fog",
  },
  "let-it-snow": {
    label: "Let It Snow",
    cardClassName:
      "isolate relative overflow-hidden border-[#7dd3fc]/70 bg-gradient-to-b from-[#bae6fd]/25 to-transparent",
    ornament: "snow-falling",
  },
  "silent-night": {
    label: "Silent Night",
    cardClassName:
      "isolate relative overflow-hidden border-[#1e3a5f]/70 bg-gradient-to-b from-[#0b1730]/70 via-[#12234a]/40 to-[#1e3a5f]/20",
    ornament: "sleigh-night",
  },
  "haunted-manor": {
    label: "Haunted Manor",
    cardClassName:
      "isolate relative overflow-hidden border-[#475569]/70 bg-gradient-to-b from-[#1e293b]/70 via-[#334155]/35 to-[#0f172a]/30",
    ornament: "haunted-manor",
  },
};

/** The style keys the schema.sql launch seed references — the well-formedness
 *  test asserts these exist in the registries above so SQL and client can't
 *  drift silently. Update BOTH when seeding new stock. */
export const SEEDED_FRAME_KEYS = [
  "bronze-ring",
  "aurora",
  "gilded",
  "holly-wreath",
  "starlight-shimmer",
  "prismatic",
  "jack-o-lantern",
  "bat-familiar",
  "candy-cane",
  "cat-familiar",
  "ember",
  "stormcaller",
];
export const SEEDED_STALL_KEYS = [
  "festive-bunting",
  "lantern-glow",
  "velvet-drapes",
  "snowfall",
  "marquee-lights",
  "pumpkin-patch",
  "haunted-bazaar",
  "trimmed-tree",
  "candy-cane-trim",
  "shooting-star",
  "creeping-fog",
  "let-it-snow",
  "silent-night",
  "haunted-manor",
];

export function resolveFrameStyle(key: string | null | undefined): FrameStyle | null {
  return key ? (FRAME_STYLES[key] ?? null) : null;
}

export function resolveStallStyle(key: string | null | undefined): StallStyle | null {
  return key ? (STALL_STYLES[key] ?? null) : null;
}
