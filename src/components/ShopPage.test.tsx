import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
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
      shopSets: [],
      shopOpen: true,
      shopOwnedIds: [],
      fetchShop: vi.fn(async () => {}),
      fetchBadges: vi.fn(async () => []),
      can: () => false,
    }),
  );
});

describe("ShopPage storefront", () => {
  it("labels collection items and leaves standalone items unlabelled", () => {
    useStore.setState({
      shopItems: [item({ id: "member", setKey: "debut" }), item({ id: "single", name: "Standalone" })],
      shopSets: [{ key: "debut", name: "Grand Debut", description: null, badgeId: null }],
    });
    render(<ShopPage />);
    expect(screen.getAllByText("Part of Grand Debut")).toHaveLength(1);
    expect(screen.queryByText("Part of null")).toBeNull();
    act(() => useStore.setState({ shopSets: [{ key: "debut", name: "Opening Night Collection", description: null, badgeId: null }] }));
    expect(screen.getByText("Part of Opening Night Collection")).toBeTruthy();
    expect(screen.queryByText("Part of Grand Debut")).toBeNull();
  });
  it.each([true, false])("shows the same active shelf and collections for admins and customers (admin: %s)", (admin) => {
    const stock = [
      item({ id: "launch", name: "Launch Piece", setKey: "launch" }),
      item({ id: "retired", name: "Retired Piece", active: false, setKey: "retired" }),
      item({ id: "owned", name: "Owned Retired Piece", active: false, setKey: "launch" }),
    ];
    useStore.setState({
      can: () => admin,
      shopItems: stock,
      shopOwnedIds: ["owned"],
      shopSets: [
        { key: "launch", name: "Launch", description: null, badgeId: null, requiredItemIds: ["launch", "owned"] },
        { key: "retired", name: "Retired", description: null, badgeId: null, requiredItemIds: ["retired"] },
      ],
    });
    render(<ShopPage />);
    expect(screen.getByText("Launch Piece")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buy" })).toBeTruthy();
    expect(screen.queryByText("Retired Piece")).toBeNull();
    expect(screen.queryByText("Owned Retired Piece")).toBeNull();
    expect(screen.queryByText(/Retired collection/)).toBeNull();
    expect(screen.getByText("1 / 2 collected")).toBeTruthy();
    expect(useStore.getState().shopItems).toEqual(stock);
    expect(useStore.getState().shopOwnedIds).toEqual(["owned"]);
  });
  it("confirms the remaining balance and links the wardrobe only after a successful purchase", async () => {
    let finish!: (value: boolean) => void;
    const buy = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    useStore.setState({shopItems: [item()], buyShopItem: buy});
    render(<ShopPage />);
    fireEvent.click(screen.getByRole("button", {name: "Buy"}));
    expect(screen.getByText("Balance after purchase: 400 coins.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name: "Buy it"}));
    expect(buy).toHaveBeenCalledWith("i1",100);
    fireEvent.click(screen.getByRole("button", {name: "Buy"}));
    expect(buy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => finish(true));
    expect(screen.getByRole("link", {name: "Open My Cosmetics"}).getAttribute("href")).toBe("#cosmetics");
  });
  it("does not claim ownership after a failed purchase", async () => {
    useStore.setState({shopItems: [item()], buyShopItem: vi.fn(async () => false)});
    render(<ShopPage />);
    fireEvent.click(screen.getByRole("button", {name: "Buy"}));
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Buy it"})));
    expect(screen.queryByRole("status")).toBeNull();
  });
  it.each([true, false])("keeps the shop closed with a wardrobe link for all users (admin: %s)", (admin) => {
    act(() => useStore.setState({ shopOpen: false, can: () => admin, shopItems: [item()] }));
    render(<ShopPage />);
    expect(screen.getByText("The Curio Shop is closed")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open My Cosmetics" }).getAttribute("href")).toBe("#cosmetics");
    expect(screen.queryByText("Test Frame")).toBeNull();
  });
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

  it("marks premium items with a Signature chip; standard items get none", () => {
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
    expect(screen.getAllByText("Signature")).toHaveLength(1);
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

  it("hangs the closed-sign when the shopkeeper closes up", () => {
    act(() =>
      useStore.setState({
        shopOpen: false,
        shopItems: [item({ id: "x", name: "Hidden While Closed" })],
      }),
    );
    render(<ShopPage />);
    expect(screen.getByText("The Curio Shop is closed")).toBeTruthy();
    expect(screen.queryByText("Hidden While Closed")).toBeNull();
  });

  it("shows collection progress for sets with visible members", () => {
    act(() =>
      useStore.setState({
        shopItems: [
          item({ id: "a", name: "Piece One", setKey: "haunt-2026" }),
          item({ id: "b", slug: "frame-two", name: "Piece Two", setKey: "haunt-2026" }),
        ],
        shopSets: [
          { key: "haunt-2026", name: "The Haunt", description: null, badgeId: null },
          { key: "empty-set", name: "Nothing Here", description: null, badgeId: null },
        ],
        shopOwnedIds: ["a"],
      }),
    );
    render(<ShopPage />);
    expect(screen.getByText(/The Haunt collection/)).toBeTruthy();
    expect(screen.getByText("1 / 2 collected")).toBeTruthy();
    // A set with no visible members never shows a banner.
    expect(screen.queryByText(/Nothing Here/)).toBeNull();
  });
});
