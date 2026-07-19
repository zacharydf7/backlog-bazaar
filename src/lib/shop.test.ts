import { describe, expect, it } from "vitest";
import {
  availabilityLabel,
  coerceCosmetics,
  coerceShopItems,
  groupShopItems,
  isAvailableNow,
  isShopItemVisible,
  shopAvailability,
  sortShopItems,
  type ShopItem,
} from "./shop";

function item(overrides: Partial<ShopItem> = {}): ShopItem {
  return {
    id: "i1",
    slug: "frame-test",
    kind: "frame",
    name: "Test Frame",
    description: null,
    price: 100,
    style: "bronze-ring",
    badgeId: null,
    tier: "standard",
    secret: false,
    availableFrom: null,
    availableUntil: null,
    active: true,
    sort: 0,
    ...overrides,
  };
}

const NOW = Date.parse("2026-07-19T12:00:00Z");

describe("coerceShopItems", () => {
  it("coerces a well-formed row", () => {
    const rows = [
      {
        id: "a",
        slug: "title-x",
        kind: "title",
        name: "X",
        description: "Desc",
        price: 150,
        style: null,
        badge_id: "b1",
        available_from: "2026-12-01T00:00:00Z",
        available_until: "2027-01-08T00:00:00Z",
        active: true,
        sort: 10,
      },
    ];
    const [it0] = coerceShopItems(rows);
    expect(it0).toMatchObject({
      id: "a",
      kind: "title",
      price: 150,
      badgeId: "b1",
      active: true,
      sort: 10,
    });
    expect(it0.availableFrom).toBe(Date.parse("2026-12-01T00:00:00Z"));
    expect(it0.availableUntil).toBe(Date.parse("2027-01-08T00:00:00Z"));
  });

  it("drops malformed rows instead of crashing", () => {
    expect(coerceShopItems(null)).toEqual([]);
    expect(coerceShopItems("garbage")).toEqual([]);
    expect(
      coerceShopItems([
        null,
        {},
        { id: "a", slug: "s", kind: "hat", name: "Bad kind" },
        { id: "a", slug: "s", kind: "frame", name: "" },
        { id: "ok", slug: "s", kind: "frame", name: "Good" },
      ]),
    ).toHaveLength(1);
  });

  it("defaults numeric garbage safely", () => {
    const [x] = coerceShopItems([
      { id: "a", slug: "s", kind: "stall", name: "N", price: "oops", sort: null, active: undefined },
    ]);
    expect(x.price).toBe(0);
    expect(x.sort).toBe(0);
    expect(x.active).toBe(true);
    expect(x.availableFrom).toBeNull();
  });

  it("coerces tier and secret, defaulting anything odd to standard/visible", () => {
    const rows = coerceShopItems([
      { id: "a", slug: "s1", kind: "frame", name: "P", tier: "premium", secret: true },
      { id: "b", slug: "s2", kind: "frame", name: "S" },
      { id: "c", slug: "s3", kind: "frame", name: "G", tier: "mythic", secret: "yes" },
    ]);
    expect(rows[0]).toMatchObject({ tier: "premium", secret: true });
    expect(rows[1]).toMatchObject({ tier: "standard", secret: false });
    expect(rows[2]).toMatchObject({ tier: "standard", secret: false });
  });
});

describe("shopAvailability", () => {
  it("is available with no window", () => {
    expect(shopAvailability(item(), NOW)).toBe("available");
    expect(isAvailableNow(item(), NOW)).toBe(true);
  });

  it("respects inactive above everything", () => {
    expect(shopAvailability(item({ active: false }), NOW)).toBe("inactive");
  });

  it("is upcoming before the window opens", () => {
    const i = item({ availableFrom: NOW + 1 });
    expect(shopAvailability(i, NOW)).toBe("upcoming");
    expect(shopAvailability(item({ availableFrom: NOW }), NOW)).toBe("available");
  });

  it("ends at the exclusive until bound", () => {
    expect(shopAvailability(item({ availableUntil: NOW }), NOW)).toBe("ended");
    expect(shopAvailability(item({ availableUntil: NOW + 1 }), NOW)).toBe("available");
  });

  it("handles from-only and until-only windows", () => {
    expect(shopAvailability(item({ availableFrom: NOW - 1 }), NOW)).toBe("available");
    expect(shopAvailability(item({ availableUntil: NOW - 1 }), NOW)).toBe("ended");
  });
});

describe("isShopItemVisible", () => {
  it("hides only secret upcoming stock (the surprise drop)", () => {
    expect(isShopItemVisible(item({ secret: true, availableFrom: NOW + 1 }), NOW)).toBe(false);
    // The moment the window opens, it appears.
    expect(isShopItemVisible(item({ secret: true, availableFrom: NOW }), NOW)).toBe(true);
  });

  it("shows everything else", () => {
    // Non-secret upcoming stock keeps its "Arrives …" teaser.
    expect(isShopItemVisible(item({ availableFrom: NOW + 1 }), NOW)).toBe(true);
    // Secret without an on-sale date is inert.
    expect(isShopItemVisible(item({ secret: true }), NOW)).toBe(true);
    // Secret after its window: normal ended handling, not hidden.
    expect(isShopItemVisible(item({ secret: true, availableUntil: NOW - 1 }), NOW)).toBe(true);
    expect(isShopItemVisible(item(), NOW)).toBe(true);
  });
});

describe("availabilityLabel", () => {
  it("is null for permanent stock", () => {
    expect(availabilityLabel(item(), NOW)).toBeNull();
  });

  it("announces upcoming and ending stock", () => {
    expect(availabilityLabel(item({ availableFrom: NOW + 86_400_000 }), NOW)).toMatch(/^Arrives /);
    expect(availabilityLabel(item({ availableUntil: NOW + 86_400_000 }), NOW)).toMatch(
      /^On the shelf until /,
    );
    expect(availabilityLabel(item({ availableUntil: NOW - 1 }), NOW)).toBe("No longer available");
    expect(availabilityLabel(item({ active: false }), NOW)).toBe("No longer available");
  });
});

describe("sortShopItems / groupShopItems", () => {
  const items = [
    item({ id: "s1", kind: "stall", sort: 210, name: "Bunting" }),
    item({ id: "f2", kind: "frame", sort: 120, name: "Aurora" }),
    item({ id: "t1", kind: "title", sort: 10, name: "Regular" }),
    item({ id: "f1", kind: "frame", sort: 110, name: "Bronze" }),
    item({ id: "f3", kind: "frame", sort: 110, price: 50, name: "Cheaper same sort" }),
  ];

  it("orders by kind section, then sort, then price", () => {
    expect(sortShopItems(items).map((i) => i.id)).toEqual(["t1", "f3", "f1", "f2", "s1"]);
  });

  it("groups into non-empty kind sections in display order", () => {
    const groups = groupShopItems(items);
    expect(groups.map((g) => g.kind)).toEqual(["title", "frame", "stall"]);
    expect(groups[1].items).toHaveLength(3);
    expect(groupShopItems([])).toEqual([]);
  });

  it("does not mutate its input", () => {
    const before = items.map((i) => i.id);
    sortShopItems(items);
    expect(items.map((i) => i.id)).toEqual(before);
  });
});

describe("coerceCosmetics", () => {
  it("parses the jsonb shape", () => {
    expect(coerceCosmetics({ frame: "gilded", stall: "snowfall" })).toEqual({
      frame: "gilded",
      stall: "snowfall",
    });
  });

  it("tolerates nulls and garbage", () => {
    expect(coerceCosmetics(null)).toEqual({ frame: null, stall: null });
    expect(coerceCosmetics(undefined)).toEqual({ frame: null, stall: null });
    expect(coerceCosmetics({ frame: 3, stall: "" })).toEqual({ frame: null, stall: null });
    expect(coerceCosmetics("x")).toEqual({ frame: null, stall: null });
  });
});
