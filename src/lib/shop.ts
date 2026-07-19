// Pure helpers for the Curio Shop. The item *catalog* lives in the DB
// `shop_items` table (adding stock is data, not code); this module only handles
// the client side: coercing rows, deciding whether a seasonal item is on the
// shelf right now, and ordering/grouping the storefront. Kept free of
// React/Supabase so it's directly unit-testable offline.

import type { Cosmetics } from "../types";

export type ShopItemKind = "title" | "frame" | "stall";
export type ShopItemTier = "standard" | "premium";

const KINDS: ShopItemKind[] = ["title", "frame", "stall"];

/** Section order + headings for the storefront and the admin stock editor. */
export const SHOP_KIND_META: Record<ShopItemKind, { label: string; blurb: string }> = {
  title: {
    label: "Titles",
    blurb: "A flourish shown beside your name — on your profile and around the Market Square.",
  },
  frame: {
    label: "Avatar Frames",
    blurb: "A decorative ring around your avatar, visible wherever your stall appears.",
  },
  stall: {
    label: "Stall Decorations",
    blurb: "Dress up your Market Square stall card and profile header.",
  },
};

/** Presentation for the cosmetic classes. Premium is the costlier animated/
 *  ornamented flair; its chip is fixed-gilded (like the cosmetics themselves)
 *  so it reads "premium" in every theme. Standard gets no chip. */
export const SHOP_TIER_META: Record<ShopItemTier, { label: string; chipClassName: string | null }> =
  {
    standard: { label: "Standard", chipClassName: null },
    premium: {
      label: "Premium",
      chipClassName: "border border-[#e0a82e]/60 bg-[#e0a82e]/15 text-[#c9971f]",
    },
  };

/** One purchasable cosmetic, as coerced from a shop_items row. Timestamps are
 *  ms epochs (null = no bound). */
export interface ShopItem {
  id: string;
  slug: string;
  kind: ShopItemKind;
  name: string;
  description: string | null;
  price: number;
  /** Visual preset key into shopCosmetics.ts (frames/stalls; null for titles). */
  style: string | null;
  /** The kind-'shop' badge a title item grants (null for frames/stalls). */
  badgeId: string | null;
  tier: ShopItemTier;
  /** Surprise drop: hidden from the storefront until availableFrom arrives
   *  (RLS hides the row from non-managers too; see isShopItemVisible). */
  secret: boolean;
  availableFrom: number | null;
  availableUntil: number | null;
  active: boolean;
  sort: number;
}

function parseTs(v: unknown): number | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Coerce raw shop_items rows defensively — a malformed row is dropped rather
 *  than crashing the storefront (the coerceAchievements posture). */
export function coerceShopItems(rows: unknown): ShopItem[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((raw): ShopItem | null => {
      const r = (raw ?? {}) as Record<string, unknown>;
      if (typeof r.id !== "string" || typeof r.slug !== "string") return null;
      if (!KINDS.includes(r.kind as ShopItemKind)) return null;
      if (typeof r.name !== "string" || !r.name) return null;
      return {
        id: r.id,
        slug: r.slug,
        kind: r.kind as ShopItemKind,
        name: r.name,
        description: typeof r.description === "string" && r.description ? r.description : null,
        price: Math.max(0, Number(r.price) || 0),
        style: typeof r.style === "string" && r.style ? r.style : null,
        badgeId: typeof r.badge_id === "string" ? r.badge_id : null,
        tier: r.tier === "premium" ? "premium" : "standard",
        secret: r.secret === true,
        availableFrom: parseTs(r.available_from),
        availableUntil: parseTs(r.available_until),
        active: r.active !== false,
        sort: Number(r.sort) || 0,
      };
    })
    .filter((i): i is ShopItem => i !== null);
}

/** Whether an item can be bought right now. Mirrors buy_shop_item's server
 *  gate (the server re-checks — this only drives the UI). */
export type ShopAvailability = "available" | "upcoming" | "ended" | "inactive";

export function shopAvailability(
  item: Pick<ShopItem, "active" | "availableFrom" | "availableUntil">,
  now: number,
): ShopAvailability {
  if (!item.active) return "inactive";
  if (item.availableFrom !== null && item.availableFrom > now) return "upcoming";
  if (item.availableUntil !== null && item.availableUntil <= now) return "ended";
  return "available";
}

export function isAvailableNow(
  item: Pick<ShopItem, "active" | "availableFrom" | "availableUntil">,
  now: number,
): boolean {
  return shopAvailability(item, now) === "available";
}

/** Whether an item belongs in the storefront at all. A secret item shows no
 *  "Arrives …" teaser — it simply doesn't exist until its window opens (RLS
 *  already hides such rows from non-managers; this keeps the storefront honest
 *  for shop managers too, who preview hidden stock in the admin tab). */
export function isShopItemVisible(
  item: Pick<ShopItem, "active" | "secret" | "availableFrom" | "availableUntil">,
  now: number,
): boolean {
  return !(item.secret && shopAvailability(item, now) === "upcoming");
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Seasonal-window copy for the storefront card, or null for always-on stock:
 *  "Arrives Dec 1" / "On the shelf until Jan 7" / "No longer available". */
export function availabilityLabel(
  item: Pick<ShopItem, "active" | "availableFrom" | "availableUntil">,
  now: number,
): string | null {
  const a = shopAvailability(item, now);
  if (a === "upcoming" && item.availableFrom !== null) return `Arrives ${shortDate(item.availableFrom)}`;
  if (a === "ended" || a === "inactive") return "No longer available";
  if (item.availableUntil !== null) {
    // The window is stored end-exclusive; show the last day it's actually on sale.
    return `On the shelf until ${shortDate(item.availableUntil - 1)}`;
  }
  return null;
}

/** Storefront order: kind sections (title → frame → stall), then the admin sort
 *  column, then price, then name — a stable, deterministic shelf. */
export function sortShopItems(items: ShopItem[]): ShopItem[] {
  return [...items].sort(
    (a, b) =>
      KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
      a.sort - b.sort ||
      a.price - b.price ||
      a.name.localeCompare(b.name),
  );
}

/** The storefront's sections, in display order, empty kinds omitted. */
export function groupShopItems(items: ShopItem[]): { kind: ShopItemKind; items: ShopItem[] }[] {
  const sorted = sortShopItems(items);
  return KINDS.map((kind) => ({ kind, items: sorted.filter((i) => i.kind === kind) })).filter(
    (g) => g.items.length > 0,
  );
}

/** The admin stock editor's save payload (admin_save_shop_item). `id` null
 *  creates; slug/kind are immutable identity after creation. Badge fields apply
 *  to title items only. Timestamps are ms epochs (null = unbounded). */
export interface ShopItemInput {
  id: string | null;
  slug: string;
  kind: ShopItemKind;
  name: string;
  description: string;
  price: number;
  style: string | null;
  badgeIcon: string | null;
  badgePrestige: number | null;
  tier: ShopItemTier;
  secret: boolean;
  availableFrom: number | null;
  availableUntil: number | null;
  active: boolean;
  sort: number;
}

/** Parse the `cosmetics` jsonb the visitor RPCs return ({frame, stall} style
 *  keys). Defensive: anything malformed reads as "nothing equipped". */
export function coerceCosmetics(v: unknown): Cosmetics {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    frame: typeof o.frame === "string" && o.frame ? o.frame : null,
    stall: typeof o.stall === "string" && o.stall ? o.stall : null,
  };
}

export const NO_COSMETICS: Cosmetics = { frame: null, stall: null };
