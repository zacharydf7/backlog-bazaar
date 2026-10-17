import { describe, it, expect } from "vitest";
import { isWorn, pieceName, slotCounts, slotItems, unheldSlots, wearMessage, wearOutfit } from "./dressingRoom";
import type { CosmeticsSession } from "./cosmeticsPreview";
import type { ShopItem } from "./shop";

function item(over: Partial<ShopItem>): ShopItem {
  return {
    id: "x", slug: "x", kind: "frame", name: "X", description: null, price: 100, style: "s",
    badgeId: null, tier: "standard", secret: false, active: true, availableFrom: null,
    availableUntil: null, setKey: null, sort: 0, ...over,
  };
}

const session: CosmeticsSession = {
  items: [
    item({ id: "bronze", kind: "frame", name: "Bronze Ring", setKey: "classics" }),
    item({ id: "gold", kind: "frame", name: "Gold Ring", description: "Shiny" }),
    item({ id: "patch", kind: "stall", name: "Pumpkin Patch" }),
    item({ id: "retired", kind: "coin", name: "Old Coin" }),
  ],
  sets: [],
  badges: [{ id: "star", slug: "star", name: "Star", description: null, icon: "star", prestige: 1, kind: "granted", effect: null }],
  ownedIds: ["bronze", "gold", "patch"],
  heldBadgeIds: ["star"],
  balance: 0,
  look: { title: "star", frame: "bronze", stall: null, coin: "retired" },
};

describe("dressing room", () => {
  it("finds equipped pieces you no longer hold", () => {
    expect(unheldSlots(session, session.look)).toEqual(["coin"]);
  });

  it("wears a piece and takes off anything you no longer own, saying so", () => {
    expect(wearOutfit(session, session.look, { frame: "gold" })).toEqual({
      next: { title: "star", frame: "gold", stall: null, coin: null },
      cleared: ["coin"],
    });
    expect(wearMessage("Wearing Gold Ring", ["coin"])).toBe(
      "Wearing Gold Ring. Your old coin is no longer yours, so it came off.",
    );
    expect(wearMessage("Wearing Gold Ring", [])).toBe("Wearing Gold Ring");
    expect(wearMessage("Wearing Evening", ["frame"], "look")).toBe(
      "Wearing Evening. Its frame is no longer yours, so that slot is empty.",
    );
  });

  it("lists a slot's pieces with search and collection filters, plus counts", () => {
    expect(slotItems(session, "frame").map((i) => i.id)).toEqual(["bronze", "gold"]);
    expect(slotItems(session, "frame", { query: "shiny" }).map((i) => i.id)).toEqual(["gold"]);
    expect(slotItems(session, "frame", { collection: "classics" }).map((i) => i.id)).toEqual(["bronze"]);
    expect(slotCounts(session)).toEqual({ title: 1, frame: 2, stall: 1, coin: 0 });
  });

  it("names pieces and knows what's worn", () => {
    expect(pieceName(session, "title", "star")).toBe("Star");
    expect(pieceName(session, "stall", null)).toBe("None");
    expect(pieceName(session, "frame", "gone")).toBe("Unavailable piece");
    expect(isWorn(session.look, session.items[0])).toBe(true);
    expect(isWorn(session.look, session.items[1])).toBe(false);
  });
});
