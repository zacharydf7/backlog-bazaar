import type { Badge } from "../types";
import { coerceShopItems, type ShopItem } from "./shop";

export interface ShopDraftPayload {
  item: Record<string, unknown>;
  badge: Record<string, unknown>;
}
export interface ShopDraft {
  draft_id: string;
  revision: number;
  source_item_id: string | null;
  base_item: Record<string, unknown> | null;
  base_badge: Record<string, unknown> | null;
  payload: ShopDraftPayload;
  state: "draft" | "published";
  published_item_id: string | null;
  actor_id: string | null;
  created_at: string;
}

/** Serialize only editable catalog fields, never simulated holdings or coins. */
export function shopDraftPayload(
  item: ShopItem,
  badge: Badge | null,
): ShopDraftPayload {
  return {
    item: {
      slug: item.slug,
      kind: item.kind,
      name: item.name,
      description: item.description,
      price: item.price,
      style: item.style,
      tier: item.tier,
      active: item.active,
      secret: item.secret,
      set_key: item.setKey,
      sort: item.sort,
      available_from:
        item.availableFrom === null
          ? null
          : new Date(item.availableFrom).toISOString(),
      available_until:
        item.availableUntil === null
          ? null
          : new Date(item.availableUntil).toISOString(),
    },
    badge: {
      icon: badge?.icon ?? "award",
      prestige: badge?.prestige ?? 3,
      effect: badge?.effect ?? null,
    },
  };
}

export function shopDraftEditorData(draft: ShopDraft): {
  item: ShopItem;
  badge: Badge;
} {
  const raw = draft.payload.item;
  const id = draft.source_item_id ?? draft.draft_id;
  // Empty names are valid for a newly started draft, unlike a catalog row.
  const item = coerceShopItems([
    { ...raw, id, slug: raw.slug ?? "", name: raw.name || "Untitled" },
  ])[0];
  if (!item) throw new Error("This saved draft has an invalid category.");
  item.name = typeof raw.name === "string" ? raw.name : "";
  const badge: Badge = {
    id: String(draft.base_item?.badge_id ?? `draft-title:${id}`),
    slug: `shop-${item.slug}`,
    name: item.name,
    description: item.description,
    kind: "shop",
    icon: String(draft.payload.badge.icon ?? "award"),
    prestige: Number(draft.payload.badge.prestige ?? 3),
    effect:
      typeof draft.payload.badge.effect === "string"
        ? draft.payload.badge.effect
        : null,
  };
  item.badgeId = item.kind === "title" ? badge.id : null;
  return { item, badge };
}

const ITEM_FIELDS: Record<string, string> = {
  name: "Name",
  slug: "Permanent slug",
  kind: "Category",
  description: "Description",
  price: "Price",
  style: "Visual style",
  tier: "Class",
  active: "On the shelf",
  secret: "Hidden until launch",
  set_key: "Collection",
  available_from: "Available from",
  available_until: "Unavailable starting",
  sort: "Shelf order",
};
const BADGE_FIELDS: Record<string, string> = {
  icon: "Title icon",
  prestige: "Title prestige",
  effect: "Title effect",
};
export interface ShopDraftChange {
  label: string;
  before: string;
  after: string;
}
export function shopDraftChanges(draft: ShopDraft): ShopDraftChange[] {
  const comparable = (key: string, value: unknown) => {
    if (
      (key === "available_from" || key === "available_until") &&
      typeof value === "string"
    ) {
      const timestamp = Date.parse(value);
      if (Number.isFinite(timestamp)) return timestamp;
    }
    return value === "" || value == null ? null : value;
  };
  const display = (value: unknown) =>
    value == null || value === ""
      ? "None"
      : typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : String(value);
  const diff = (
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
    fields: Record<string, string>,
  ) =>
    Object.entries(fields)
      .filter(
        ([key]) =>
          JSON.stringify(comparable(key, before?.[key])) !==
          JSON.stringify(comparable(key, after[key])),
      )
      .map(([key, label]) => ({
        label,
        before: display(before?.[key]),
        after: display(after[key]),
      }));
  return [
    ...diff(draft.base_item, draft.payload.item, ITEM_FIELDS),
    ...(draft.payload.item.kind === "title"
      ? diff(draft.base_badge, draft.payload.badge, BADGE_FIELDS)
      : []),
  ];
}
