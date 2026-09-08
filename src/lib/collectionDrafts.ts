import {
  coerceShopItems,
  coerceShopSets,
  type ShopItem,
  type ShopSet,
} from "./shop";
import { jsonToBadges } from "./supabase";
export interface CollectionDraft {
  draft_id: string;
  revision: number;
  source_key: string | null;
  base_catalog: { items: unknown[]; sets: unknown[]; badges: unknown[] };
  payload: {
    set: {
      key: string;
      name: string;
      description: string | null;
      badge_id: string | null;
    };
    member_ids: string[];
  };
  state: "draft" | "published";
  created_at: string;
}
export function collectionDraftData(draft: CollectionDraft) {
  const sets = coerceShopSets(draft.base_catalog.sets);
  const items = coerceShopItems(draft.base_catalog.items);
  const badges = jsonToBadges(draft.base_catalog.badges);
  const raw = draft.payload.set;
  const initial: ShopSet = {
    key: raw.key,
    name: raw.name,
    description: raw.description,
    badgeId: raw.badge_id,
  };
  return { sets, items, badges, initial };
}
export function collectionPayload(
  set: ShopSet,
  memberIds: string[],
): CollectionDraft["payload"] {
  return {
    set: {
      key: set.key,
      name: set.name,
      description: set.description,
      badge_id: set.badgeId,
    },
    member_ids: [...new Set(memberIds)].sort(),
  };
}
export function collectionReview(draft: CollectionDraft) {
  const { sets, items, badges, initial } = collectionDraftData(draft);
  const before = sets.find((set) => set.key === draft.source_key);
  const selected = new Set(draft.payload.member_ids);
  const destination = (item: ShopItem) =>
    selected.has(item.id)
      ? initial.key
      : item.setKey === draft.source_key
        ? null
        : item.setKey;
  const label = (key: string | null, updated = false) =>
    key === null
      ? "No collection"
      : updated && key === initial.key
        ? initial.name
        : (sets.find((set) => set.key === key)?.name ??
          (key === initial.key ? initial.name : key));
  const memberships = items.flatMap((item) => {
    const to = destination(item);
    return to === item.setKey
      ? []
      : [
          {
            id: item.id,
            name: item.name,
            from: item.setKey,
            to,
            fromName: label(item.setKey),
            toName: label(to, true),
            active: item.active,
          },
        ];
  });
  const affected = new Set([
    initial.key,
    ...memberships
      .flatMap((item) => [item.from, item.to])
      .filter((key): key is string => key !== null),
  ]);
  const impacts = [...affected].map((key) => ({
    key,
    name: label(key, true),
    before: items.filter((item) => item.setKey === key).length,
    after: items.filter((item) => destination(item) === key)
      .length,
  }));
  const reward = (id: string | null | undefined) => {
    if (!id) return "No reward";
    const badge = badges.find((badge) => badge.id === id);
    if (!badge) return "Unavailable reward";
    return badges.filter((candidate) => candidate.name === badge.name).length >
      1
      ? `${badge.name} (${badge.slug})`
      : badge.name;
  };
  const changes = [
    {
      label: "Name",
      before: before?.name || "New collection",
      after: initial.name,
    },
    {
      label: "Story",
      before: before?.description || "None",
      after: initial.description || "None",
    },
    {
      label: "Reward title",
      before: reward(before?.badgeId),
      after: reward(initial.badgeId),
    },
  ].filter((change) => change.before !== change.after);
  return { changes, memberships, impacts };
}
