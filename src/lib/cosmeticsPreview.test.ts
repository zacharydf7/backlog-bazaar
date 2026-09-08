import { describe, expect, it } from "vitest";
import {
  customerShelf,
  fromLocalDateTime,
  lookIsOwned,
  previewPurchase,
  toLocalDateTime,
  validateCosmetic,
  wardrobeItems,
  type CosmeticsSession,
} from "./cosmeticsPreview";
import type { ShopItem } from "./shop";
import type { Badge } from "../types";

const NOW = new Date("2026-09-08T12:00:00Z").getTime();
function item(overrides: Partial<ShopItem> = {}): ShopItem {
  return {
    id: "frame",
    slug: "frame",
    kind: "frame",
    name: "Bronze",
    description: null,
    price: 100,
    style: "bronze-ring",
    badgeId: null,
    tier: "standard",
    secret: false,
    setKey: null,
    availableFrom: null,
    availableUntil: null,
    active: true,
    sort: 0,
    ...overrides,
  };
}
const earned: Badge = {
  id: "earned",
  slug: "earned",
  name: "Early Bird",
  description: null,
  icon: "award",
  prestige: 3,
  kind: "granted",
  effect: null,
};
function session(overrides: Partial<CosmeticsSession> = {}): CosmeticsSession {
  return {
    items: [item()],
    sets: [],
    badges: [earned],
    ownedIds: [],
    heldBadgeIds: [earned.id],
    balance: 500,
    look: { title: null, frame: null, stall: null, coin: null },
    ...overrides,
  };
}

describe("cosmetics review session", () => {
  it("keeps retired and hidden owned pieces in the wardrobe alongside earned titles", () => {
    const state = session({
      items: [item({ active: false, secret: true, availableFrom: NOW + 1000 })],
      ownedIds: ["frame"],
    });
    expect(wardrobeItems(state).map((piece) => piece.name)).toEqual([
      "Bronze",
      "Early Bird",
    ]);
    expect(customerShelf(state.items, NOW)).toEqual([]);
  });
  it("does not count a revoked purchased title as wearable or duplicate a held title", () => {
    const title = item({ id: "title", kind: "title", badgeId: "earned" });
    expect(wardrobeItems(session({ items: [title] }))).toHaveLength(1);
    const revoked = session({
      items: [title],
      heldBadgeIds: [],
      ownedIds: ["title"],
    });
    expect(wardrobeItems(revoked)).toEqual([]);
    expect(lookIsOwned(revoked, { ...revoked.look, title: "earned" })).toBe(
      false,
    );
  });
  it("permits owned pieces and defaults but refuses a wrong-slot or unowned look", () => {
    const state = session({ ownedIds: ["frame"] });
    expect(
      lookIsOwned(state, { ...state.look, frame: "frame", title: "earned" }),
    ).toBe(true);
    expect(lookIsOwned(state, { ...state.look, coin: "frame" })).toBe(false);
    expect(lookIsOwned(state, { ...state.look, frame: "missing" })).toBe(false);
  });
  it("simulates a purchase without mutating the original balance or holdings", () => {
    const original = session();
    const next = previewPurchase(original, "frame", NOW);
    expect(next.balance).toBe(400);
    expect(next.ownedIds).toEqual(["frame"]);
    expect(original.balance).toBe(500);
    expect(original.ownedIds).toEqual([]);
    expect(previewPurchase(next, "frame", NOW)).toBe(next);
  });
  it.each([
    { active: false },
    { availableFrom: NOW + 1 },
    { availableUntil: NOW },
    { price: 501 },
    { kind: "title" as const, badgeId: null },
  ])("refuses an unavailable preview purchase: %j", (overrides) => {
    const original = session({ items: [item(overrides)] });
    expect(previewPurchase(original, "frame", NOW)).toBe(original);
  });
  it("counts hidden active set members before granting a simulated reward", () => {
    const state = session({
      items: [
        item({ setKey: "set" }),
        item({
          id: "secret",
          setKey: "set",
          secret: true,
          availableFrom: NOW + 1000,
        }),
      ],
      sets: [{ key: "set", name: "Set", description: null, badgeId: "reward" }],
    });
    const partial = previewPurchase(state, "frame", NOW);
    expect(partial.heldBadgeIds).not.toContain("reward");
    const complete = previewPurchase(partial, "secret", NOW + 1000);
    expect(complete.heldBadgeIds).toContain("reward");
    expect(customerShelf(state.items, NOW)).toHaveLength(1);
  });
  it("validates unique slugs, supported styles, whole prices, and scheduling", () => {
    expect(validateCosmetic(item(), [])).toBeNull();
    expect(validateCosmetic(item({ price: 1.5 }), [])).toMatch(/whole/);
    expect(validateCosmetic(item({ style: "unknown" }), [])).toMatch(
      /supported/,
    );
    expect(validateCosmetic(item({ id: "new" }), [item()])).toMatch(/slug/);
    expect(
      validateCosmetic(item({ availableFrom: NOW, availableUntil: NOW }), []),
    ).toMatch(/end/);
  });
  it("roundtrips a local datetime without changing its instant", () => {
    expect(fromLocalDateTime(toLocalDateTime(NOW))).toBe(NOW);
    expect(toLocalDateTime(null)).toBe("");
    expect(fromLocalDateTime("")).toBeNull();
  });
});
