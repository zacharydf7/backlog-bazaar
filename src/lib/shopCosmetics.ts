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
   *  a colour/gradient background; the avatar sits inside). */
  className: string;
}

export interface StallStyle {
  label: string;
  /** Classes merged onto the stall card / profile header container. */
  cardClassName: string;
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
};

/** The style keys the schema.sql launch seed references — the well-formedness
 *  test asserts these exist in the registries above so SQL and client can't
 *  drift silently. Update BOTH when seeding new stock. */
export const SEEDED_FRAME_KEYS = ["bronze-ring", "aurora", "gilded", "holly-wreath"];
export const SEEDED_STALL_KEYS = ["festive-bunting", "lantern-glow", "velvet-drapes", "snowfall"];

export function resolveFrameStyle(key: string | null | undefined): FrameStyle | null {
  return key ? (FRAME_STYLES[key] ?? null) : null;
}

export function resolveStallStyle(key: string | null | undefined): StallStyle | null {
  return key ? (STALL_STYLES[key] ?? null) : null;
}
