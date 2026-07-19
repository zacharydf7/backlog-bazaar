import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ShopPage } from "./ShopPage";
import { useStore } from "../store";
import type { ShopItem } from "../lib/shop";

function item(over: Partial<ShopItem> = {}): ShopItem {
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
    setKey: null,
    availableFrom: null,
    availableUntil: null,
    active: true,
    sort: 0,
    ...over,
  };
}

const TOMORROW = Date.now() + 86_400_000;

beforeEach(() => {
  act(() =>
    useStore.setState({
      cloud: true,
      coins: 500,
      economyEnabled: true,
      shopItems: [],
      shopPurchasedIds: [],
      fetchShop: vi.fn(async () => {}),
      fetchBadges: vi.fn(async () => []),
    }),
  );
});

describe("ShopPage storefront", () => {
  it("shows an upcoming teaser for normal seasonal stock but hides surprise drops entirely", () => {
    act(() =>
      useStore.setState({
        shopItems: [
          item({ id: "teased", name: "Teased Frame", availableFrom: TOMORROW }),
          item({
            id: "hidden",
            slug: "frame-secret",
            name: "Secret Frame",
            secret: true,
            availableFrom: TOMORROW,
          }),
        ],
      }),
    );
    render(<ShopPage />);
    expect(screen.getByText("Teased Frame")).toBeTruthy();
    expect(screen.getByText(/^Arrives /)).toBeTruthy();
    expect(screen.queryByText("Secret Frame")).toBeNull();
  });

  it("marks premium items with a Premium chip; standard items get none", () => {
    act(() =>
      useStore.setState({
        shopItems: [
          item({ id: "p", slug: "frame-prem", name: "Prismatic", tier: "premium", price: 1200 }),
          item({ id: "s", name: "Bronze Ring" }),
        ],
      }),
    );
    render(<ShopPage />);
    expect(screen.getByText("Prismatic")).toBeTruthy();
    expect(screen.getAllByText("Premium")).toHaveLength(1);
  });

  it("reveals a secret item once its window has opened", () => {
    act(() =>
      useStore.setState({
        shopItems: [
          item({ id: "live", name: "Live Drop", secret: true, availableFrom: Date.now() - 1000 }),
        ],
      }),
    );
    render(<ShopPage />);
    expect(screen.getByText("Live Drop")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buy" })).toBeTruthy();
  });
});
