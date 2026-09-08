import { describe, expect, it } from "vitest";
import {
  shopDraftChanges,
  shopDraftEditorData,
  shopDraftPayload,
  type ShopDraft,
} from "./shopDrafts";

const original = {
  id: "item",
  slug: "title",
  name: "Title",
  description: null,
  kind: "title",
  price: 100,
  style: null,
  tier: "standard",
  active: true,
  secret: false,
  set_key: null,
  sort: 0,
  available_from: "2026-09-08T12:00:00Z",
  available_until: null,
  badge_id: "badge",
};
const art = { icon: "award", prestige: 3, effect: "iridescent" };
const draft: ShopDraft = {
  draft_id: "draft",
  revision: 2,
  source_item_id: "item",
  base_item: original,
  base_badge: art,
  payload: {
    item: { ...original, price: 200 },
    badge: { ...art, effect: null },
  },
  state: "draft",
  actor_id: "admin",
  created_at: "2026-09-08T00:00:00Z",
  published_item_id: null,
};
describe("cosmetic draft transformations", () => {
  it("ignores equivalent timestamp formats and empty descriptions after editing", () => {
    const data = shopDraftEditorData(draft);
    expect(
      shopDraftChanges({
        ...draft,
        payload: shopDraftPayload(data.item, data.badge),
      }),
    ).toEqual(shopDraftChanges(draft));
  });
  it("reviews actual field changes including removing a title effect", () => {
    expect(shopDraftChanges(draft)).toEqual([
      { label: "Price", before: "100", after: "200" },
      { label: "Title effect", before: "iridescent", after: "None" },
    ]);
  });
  it("roundtrips draft fields without persisting simulated state or identifiers", () => {
    const { item, badge } = shopDraftEditorData(draft);
    expect(item.id).toBe("item");
    expect(badge.id).toBe("badge");
    const payload = shopDraftPayload(item, badge);
    expect(payload.item.price).toBe(200);
    expect(payload.item.available_from).toBe("2026-09-08T12:00:00.000Z");
    expect(payload.badge.effect).toBeNull();
    expect(payload.item).not.toHaveProperty("id");
    expect(payload.item).not.toHaveProperty("badge_id");
    expect(payload).not.toHaveProperty("balance");
    expect(payload).not.toHaveProperty("ownedIds");
  });
  it("opens an unfinished new draft without inventing a saved name", () => {
    const data = shopDraftEditorData({
      ...draft,
      source_item_id: null,
      payload: { item: { ...original, name: "", slug: "" }, badge: art },
    });
    expect(data.item.name).toBe("");
    expect(data.item.id).toBe("draft");
  });
});
