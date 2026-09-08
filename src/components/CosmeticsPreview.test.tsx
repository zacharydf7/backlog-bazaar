import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { CosmeticsPreview } from "./CosmeticsPreview";
import { ShopManager } from "./ShopManager";
import type { ShopItem } from "../lib/shop";
import type { Badge } from "../types";

const frame: ShopItem = {
  id: "frame",
  slug: "frame",
  name: "Bronze Ring",
  description: "A warm bronze ring.",
  kind: "frame",
  price: 100,
  style: "bronze-ring",
  badgeId: null,
  tier: "standard",
  secret: false,
  active: true,
  availableFrom: null,
  availableUntil: null,
  setKey: null,
  sort: 0,
};
const badge: Badge = {
  id: "earned",
  slug: "earned",
  name: "Early Bird",
  description: "An earned title",
  kind: "granted",
  icon: "award",
  prestige: 3,
  effect: null,
};

beforeEach(() => {
  useStore.setState({
    cloud: false,
    userId: "admin",
    can: (permission) => permission === "shop.manage",
    shopOpen: false,
    displayName: "Reviewer",
    avatarUrl: null,
    defaultCoin: "mint",
    coinSkin: null,
    shopItems: [frame],
    shopSets: [],
    shopPurchasedIds: [],
    myBadges: [badge],
    coins: 500,
    selectedTitleId: null,
    equippedFrameId: null,
    equippedStallId: null,
    equippedCoinId: null,
    equipCosmetic: vi.fn(async () => {}),
    setSelectedTitle: vi.fn(async () => {}),
    buyShopItem: vi.fn(async () => true),
    adminSaveShopItem: vi.fn(async () => "frame"),
    setShopOpen: vi.fn(async () => {}),
    fetchShop: vi.fn(async () => {}),
  });
});

async function openPreview() {
  render(<CosmeticsPreview onClose={vi.fn()} />);
  await screen.findByRole("region", { name: "Cosmetics admin preview" });
}

describe("admin-only cosmetics preview", () => {
  it("blocks direct mounting and the manager entry for users without shop permission", () => {
    useStore.setState({ can: () => false });
    render(
      <>
        <CosmeticsPreview onClose={vi.fn()} />
        <ShopManager />
      </>,
    );
    expect(
      screen.queryByRole("region", { name: "Cosmetics admin preview" }),
    ).toBeNull();
    expect(screen.queryByText("Open cosmetics preview")).toBeNull();
    expect(useStore.getState().fetchShop).not.toHaveBeenCalled();
  });

  it("opens from Manage while the real shop remains closed", async () => {
    render(<ShopManager />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open cosmetics preview" }),
    );
    await screen.findByRole("region", { name: "Cosmetics admin preview" });
    expect(screen.getByRole("article", { name: "Early Bird" })).toBeTruthy();
    expect(useStore.getState().shopOpen).toBe(false);
    expect(useStore.getState().setShopOpen).not.toHaveBeenCalled();
  });

  it("simulates buying and applying a frame without invoking live mutations", async () => {
    await openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Shop preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview purchase" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy in preview" }));
    expect(screen.getByText("400 preview coins")).toBeTruthy();
    const card = screen.getByRole("article", { name: "Bronze Ring" });
    fireEvent.click(within(card).getByRole("button", { name: "Try on" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply preview look" }));
    expect(screen.getByText("Wearing in preview")).toBeTruthy();
    expect(
      screen
        .getByTestId("look-preview")
        .querySelector('[data-frame="bronze-ring"]'),
    ).toBeTruthy();
    expect(useStore.getState().coins).toBe(500);
    expect(useStore.getState().shopPurchasedIds).toEqual([]);
    expect(useStore.getState().equippedFrameId).toBeNull();
    for (const mutation of [
      useStore.getState().buyShopItem,
      useStore.getState().equipCosmetic,
      useStore.getState().setSelectedTitle,
    ])
      expect(mutation).not.toHaveBeenCalled();
  });

  it("keeps wardrobe changes available for retired stock and supports undo/default", async () => {
    useStore.setState({
      shopItems: [{ ...frame, active: false }],
      shopPurchasedIds: ["frame"],
    });
    await openPreview();
    fireEvent.click(
      within(screen.getByRole("article", { name: "Bronze Ring" })).getByRole(
        "button",
        { name: "Try on" },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo try-on" }));
    expect(
      screen.getByTestId("look-preview").querySelector("[data-frame]"),
    ).toBeNull();
    fireEvent.click(
      within(screen.getByRole("article", { name: "Bronze Ring" })).getByRole(
        "button",
        { name: "Try on" },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Use default frame" }));
    expect(
      screen.getByTestId("look-preview").querySelector("[data-frame]"),
    ).toBeNull();
  });

  it("edits a catalog draft and resets it without changing the live catalog", async () => {
    await openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Catalog drafts" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Bronze Ring" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Warm Bronze" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to preview" }));
    expect(screen.getByRole("article", { name: "Warm Bronze" })).toBeTruthy();
    expect(useStore.getState().shopItems[0].name).toBe("Bronze Ring");
    expect(useStore.getState().adminSaveShopItem).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reset preview session" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset preview" }));
    expect(screen.getByRole("article", { name: "Bronze Ring" })).toBeTruthy();
  });

  it("creates a collection and assigns members only within the preview", async () => {
    await openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Collections" }));
    fireEvent.click(screen.getByRole("button", { name: "New collection" }));
    fireEvent.change(screen.getByLabelText("Collection name"), {
      target: { value: "Warm Metals" },
    });
    fireEvent.change(screen.getByLabelText("Collection key"), {
      target: { value: "warm-metals" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Bronze Ring" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save collection to preview" }),
    );
    expect(screen.getByText("Warm Metals")).toBeTruthy();
    expect(screen.getByText(/1 pieces/)).toBeTruthy();
    expect(useStore.getState().shopSets).toEqual([]);
    expect(useStore.getState().shopItems[0].setKey).toBeNull();
  });

  it("unmounts the preview immediately when permission is revoked", async () => {
    await openPreview();
    act(() => useStore.setState({ can: () => false }));
    expect(
      screen.queryByRole("region", { name: "Cosmetics admin preview" }),
    ).toBeNull();
  });

  it("clears the review session when the account changes", async () => {
    await openPreview();
    fireEvent.click(
      screen.getByRole("button", { name: "Load full test inventory" }),
    );
    expect(screen.getByRole("article", { name: "Bronze Ring" })).toBeTruthy();
    act(() => useStore.setState({ userId: "another-admin" }));
    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "Bronze Ring" })).toBeNull(),
    );
  });
});
