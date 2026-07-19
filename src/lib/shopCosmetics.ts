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
  "pixel-heart": {
    label: "Pixel Heart",
    className: "bg-gradient-to-b from-[#7f1d1d] via-[#450a0a] to-[#1c0505]",
    ornament: "pixel-hearts",
  },
  "invincibility-star": {
    label: "Invincibility Star",
    className: "fx-invincible",
  },
  "crt-glow": {
    label: "CRT Glow",
    className:
      "bg-gradient-to-b from-[#14532d] via-[#052e16] to-[#021308] fx-scanline shadow-[0_0_10px_2px_rgba(74,222,128,0.35)]",
  },
  "boss-bar": {
    label: "Boss Bar",
    className: "bg-gradient-to-b from-[#27272a] via-[#18181b] to-[#09090b]",
    ornament: "boss-bar",
  },
  "cartridge-gray": {
    label: "Cartridge Gray",
    className: "bg-gradient-to-b from-[#b3b9c4] via-[#878d98] to-[#565b66]",
  },
  "button-mash": {
    label: "Button Mash",
    className: "bg-gradient-to-br from-[#334155] to-[#0f172a]",
    ornament: "face-buttons",
  },
  "oil-slick": {
    label: "Oil Slick",
    className: "fx-oilslick fx-shimmer",
  },
  "soap-bubble": {
    label: "Soap Bubble",
    className:
      "bg-gradient-to-br from-[#e0f2fe]/70 via-[#f5d0fe]/60 to-[#a5f3fc]/70 fx-shimmer",
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
  "penguin-cove": {
    label: "Penguin Cove",
    cardClassName:
      "isolate relative overflow-hidden border-[#67e8f9]/60 bg-gradient-to-b from-[#083344]/60 via-[#155e75]/30 to-[#cffafe]/15",
    ornament: "igloo-penguins",
  },
  "arcade-cabinet": {
    label: "Arcade Cabinet",
    cardClassName:
      "isolate relative overflow-hidden border-[#f472b6]/60 bg-gradient-to-b from-[#312e81]/60 via-[#1e1b4b]/40 to-[#0f0a2e]/40",
    ornament: "arcade",
  },
  "pixel-sunset": {
    label: "Pixel Sunset",
    cardClassName:
      "isolate relative overflow-hidden border-[#fb923c]/60 bg-gradient-to-b from-[#7c2d12]/50 via-[#c2410c]/35 to-[#7e22ce]/30",
    ornament: "pixel-sunset",
  },
  "dungeon-gate": {
    label: "Dungeon Gate",
    cardClassName:
      "isolate relative overflow-hidden border-[#78716c]/70 bg-gradient-to-b from-[#292524]/70 via-[#1c1917]/50 to-[#0c0a09]/50",
    ornament: "dungeon",
  },
  "loot-chest": {
    label: "Loot Chest",
    cardClassName:
      "isolate relative overflow-hidden border-[#f59e0b]/60 bg-gradient-to-b from-[#451a03]/60 via-[#78350f]/35 to-[#1c0a02]/40",
    ornament: "loot-chest",
  },
  "starfield-warp": {
    label: "Starfield Warp",
    cardClassName:
      "isolate relative overflow-hidden border-[#38bdf8]/50 bg-gradient-to-b from-[#020617]/80 via-[#0f172a]/60 to-[#1e293b]/40",
    ornament: "starfield",
  },
  "save-point": {
    label: "Save Point",
    cardClassName:
      "isolate relative overflow-hidden border-[#4ade80]/60 bg-gradient-to-b from-[#052e16]/60 via-[#14532d]/35 to-[#022c22]/30",
    ornament: "save-point",
  },
  "coral-reef": {
    label: "Coral Reef",
    cardClassName:
      "isolate relative overflow-hidden border-[#2dd4bf]/60 bg-gradient-to-b from-[#082f49]/70 via-[#0e7490]/35 to-[#155e75]/25",
    ornament: "aquarium",
  },
  "deep-space": {
    label: "Deep Space",
    cardClassName:
      "isolate relative overflow-hidden border-[#818cf8]/50 bg-gradient-to-b from-[#000000]/85 via-[#020617]/70 to-[#0f172a]/50",
    ornament: "space",
  },
  "puppy-park": {
    label: "Puppy Park",
    cardClassName:
      "isolate relative overflow-hidden border-[#fbbf24]/60 bg-gradient-to-b from-[#7dd3fc]/30 via-[#bae6fd]/15 to-[#4ade80]/25",
    ornament: "puppy-park",
  },
  "cat-nap": {
    label: "Cat Nap",
    cardClassName:
      "isolate relative overflow-hidden border-[#f9a8d4]/60 bg-gradient-to-b from-[#fbcfe8]/25 via-[#fde68a]/10 to-[#fda4af]/20",
    ornament: "cat-nap",
  },
  "high-seas": {
    label: "High Seas",
    cardClassName:
      "isolate relative overflow-hidden border-[#b45309]/60 bg-gradient-to-b from-[#7dd3fc]/25 via-[#38bdf8]/15 to-[#0e7490]/40",
    ornament: "high-seas",
  },
  "trophy-cabinet": {
    label: "Trophy Cabinet",
    cardClassName:
      "isolate relative overflow-hidden border-[#e0a82e]/60 bg-gradient-to-b from-[#2c1206]/70 via-[#5b2d0d]/35 to-[#3f2210]/30",
    ornament: "trophy-cabinet",
  },
  "dragons-keep": {
    label: "Dragon's Keep",
    cardClassName:
      "isolate relative overflow-hidden border-[#78716c]/70 bg-gradient-to-b from-[#93c5fd]/30 via-[#bfdbfe]/15 to-[#65a30d]/25",
    ornament: "castle-dragon",
  },
  "iridescent-veil": {
    label: "Iridescent Veil",
    cardClassName:
      "isolate relative overflow-hidden border-[#a78bfa]/60 bg-gradient-to-b from-[#0f172a]/80 via-[#1e1b4b]/50 to-[#312e81]/30",
    ornament: "iridescent-veil",
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
  "pixel-heart",
  "invincibility-star",
  "crt-glow",
  "boss-bar",
  "cartridge-gray",
  "button-mash",
  "oil-slick",
  "soap-bubble",
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
  "penguin-cove",
  "arcade-cabinet",
  "pixel-sunset",
  "dungeon-gate",
  "loot-chest",
  "starfield-warp",
  "save-point",
  "coral-reef",
  "deep-space",
  "puppy-park",
  "cat-nap",
  "high-seas",
  "trophy-cabinet",
  "dragons-keep",
  "iridescent-veil",
];

export function resolveFrameStyle(key: string | null | undefined): FrameStyle | null {
  return key ? (FRAME_STYLES[key] ?? null) : null;
}

export function resolveStallStyle(key: string | null | undefined): StallStyle | null {
  return key ? (STALL_STYLES[key] ?? null) : null;
}
