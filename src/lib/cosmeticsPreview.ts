import type { Badge } from "../types";
import {
  isAvailableNow,
  isShopItemVisible,
  type ShopItem,
  type ShopItemKind,
  type ShopSet,
} from "./shop";
import { FRAME_STYLES, STALL_STYLES } from "./shopCosmetics";
import { SHOP_COIN_VARIANTS } from "./coins";

/** A disposable review session. None of these operations write to the store or DB. */
export interface CosmeticLook {
  title: string | null; // badge id; earned titles and collection rewards share this slot
  frame: string | null;
  stall: string | null;
  coin: string | null;
}

export interface CosmeticsSession {
  items: ShopItem[];
  sets: ShopSet[];
  badges: Badge[];
  ownedIds: string[];
  ownershipSources?: Record<string, "purchase" | "achievement" | "event">;
  heldBadgeIds: string[];
  balance: number;
  look: CosmeticLook;
}

export const COSMETIC_SLOTS: ShopItemKind[] = [
  "title",
  "frame",
  "stall",
  "coin",
];
export const SLOT_LABELS: Record<ShopItemKind, string> = {
  title: "Title",
  frame: "Frame",
  stall: "Stall",
  coin: "Coin",
};

export function visualOptions(
  kind: ShopItemKind,
): { key: string; label: string }[] {
  if (kind === "coin")
    return SHOP_COIN_VARIANTS.map((v) => ({ key: v.id, label: v.label }));
  if (kind === "title") return [];
  return Object.entries(kind === "frame" ? FRAME_STYLES : STALL_STYLES).map(
    ([key, value]) => ({ key, label: value.label }),
  );
}

export function ownsCosmetic(
  session: CosmeticsSession,
  item: ShopItem,
): boolean {
  return item.kind === "title"
    ? item.badgeId !== null && session.heldBadgeIds.includes(item.badgeId)
    : session.ownedIds.includes(item.id);
}

/** Titles without a shop listing still belong in the wardrobe. Revoked badges do not. */
export function wardrobeItems(session: CosmeticsSession): ShopItem[] {
  const owned = session.items.filter((item) => ownsCosmetic(session, item));
  const listed = new Set(
    owned.filter((item) => item.kind === "title").map((item) => item.badgeId),
  );
  return [
    ...owned,
    ...session.badges
      .filter(
        (badge) =>
          session.heldBadgeIds.includes(badge.id) && !listed.has(badge.id),
      )
      .map(
        (badge): ShopItem => ({
          id: `badge:${badge.id}`,
          slug: badge.slug,
          kind: "title",
          name: badge.name,
          description: badge.description,
          price: 0,
          style: null,
          badgeId: badge.id,
          tier: "standard",
          secret: false,
          setKey: null,
          availableFrom: null,
          availableUntil: null,
          active: false,
          sort: 0,
        }),
      ),
  ];
}

export function itemSelection(item: ShopItem): string | null {
  return item.kind === "title" ? item.badgeId : item.id;
}

export function lookIsOwned(
  session: CosmeticsSession,
  look: CosmeticLook,
): boolean {
  return COSMETIC_SLOTS.every((kind) => {
    const id = look[kind];
    if (id === null) return true;
    if (kind === "title") return session.heldBadgeIds.includes(id);
    return session.items.some(
      (item) =>
        item.kind === kind && item.id === id && ownsCosmetic(session, item),
    );
  });
}

export function customerShelf(items: ShopItem[], now: number): ShopItem[] {
  return items.filter(
    (item) =>
      item.active &&
      isShopItemVisible(item, now) &&
      (item.availableUntil === null || item.availableUntil > now),
  );
}

/** Match server requirements, including hidden and off-sale members. */
export function previewPurchase(
  session: CosmeticsSession,
  itemId: string,
  now: number,
): CosmeticsSession {
  const item = session.items.find((candidate) => candidate.id === itemId);
  if (
    !item ||
    !isAvailableNow(item, now) ||
    session.ownedIds.includes(itemId) ||
    item.price > session.balance ||
    (item.kind === "title" && !item.badgeId)
  )
    return session;
  const ownedIds = [...session.ownedIds, itemId];
  const heldBadgeIds = new Set(session.heldBadgeIds);
  if (item.badgeId) heldBadgeIds.add(item.badgeId);
  if (item.setKey) {
    const reward = session.sets.find((set) => set.key === item.setKey)?.badgeId;
    const complete = session.items
      .filter((member) => member.setKey === item.setKey)
      .every((member) => ownedIds.includes(member.id));
    if (reward && complete) heldBadgeIds.add(reward);
  }
  return {
    ...session,
    ownedIds,
    heldBadgeIds: [...heldBadgeIds],
    balance: session.balance - item.price,
  };
}

export function validateCosmetic(
  item: ShopItem,
  items: ShopItem[],
): string | null {
  if (!item.name.trim() || !item.slug.trim())
    return "Give the item a name and a permanent slug.";
  if (
    items.some(
      (other) => other.id !== item.id && other.slug === item.slug.trim(),
    )
  )
    return "That slug is already in use.";
  if (!Number.isSafeInteger(item.price) || item.price < 0)
    return "Enter a whole, non-negative coin price.";
  if (
    item.kind !== "title" &&
    !visualOptions(item.kind).some((option) => option.key === item.style)
  ) {
    return "Choose a supported visual style.";
  }
  if (
    item.availableFrom !== null &&
    item.availableUntil !== null &&
    item.availableUntil <= item.availableFrom
  ) {
    return "The end must be later than the start.";
  }
  return null;
}

/** Local datetime controls preserve the original instant unless the field is edited. */
export function toLocalDateTime(timestamp: number | null): string {
  if (timestamp === null) return "";
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalDateTime(value: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}
