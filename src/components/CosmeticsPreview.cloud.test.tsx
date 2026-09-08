import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { CosmeticsPreview } from "./CosmeticsPreview";

const db = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  fail: false,
}));
vi.mock("../lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/supabase")>()),
  supabase: { from: db.from },
}));

beforeEach(() => {
  db.fail = false;
  vi.clearAllMocks();
  db.from.mockImplementation((table: string) => {
    const data =
      table === "shop_items"
        ? [
            {
              id: "owned",
              slug: "owned",
              name: "Retired Cloud Frame",
              kind: "frame",
              style: "bronze-ring",
              price: 100,
              active: false,
            },
          ]
        : table === "shop_purchases"
          ? [{ item_id: "owned" }]
          : [];
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => query),
      eq: (key: string, value: string) => {
        db.eq(table, key, value);
        return query;
      },
      is: (key: string, value: null) => {
        db.is(table, key, value);
        return query;
      },
      then: (resolve: (result: unknown) => unknown) =>
        Promise.resolve({
          data,
          error: db.fail ? { message: "Catalog unavailable" } : null,
        }).then(resolve),
    };
    return query;
  });
  useStore.setState({
    cloud: true,
    userId: "reviewer",
    can: (key) => key === "shop.manage",
    displayName: "Reviewer",
    avatarUrl: null,
    myBadges: [],
    shopItems: [],
    shopSets: [],
    shopPurchasedIds: [],
    coins: 100,
    selectedTitleId: null,
    equippedFrameId: null,
    equippedStallId: null,
    equippedCoinId: null,
  });
});

describe("cosmetics preview cloud boundary", () => {
  it("reads the catalog and scopes holdings to the reviewer, excluding revoked titles", async () => {
    render(<CosmeticsPreview onClose={vi.fn()} />);
    await screen.findByRole("article", { name: "Retired Cloud Frame" });
    expect(db.eq).toHaveBeenCalledWith("shop_purchases", "user_id", "reviewer");
    expect(db.eq).toHaveBeenCalledWith("user_badges", "user_id", "reviewer");
    expect(db.is).toHaveBeenCalledWith("user_badges", "revoked_at", null);
    expect(useStore.getState().shopItems).toEqual([]);
    expect(useStore.getState().shopPurchasedIds).toEqual([]);
  });
  it("does not issue any reads when the permission gate denies access", () => {
    useStore.setState({ can: () => false });
    render(<CosmeticsPreview onClose={vi.fn()} />);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("shows a retryable error instead of a partial inventory when a read fails", async () => {
    db.fail = true;
    render(<CosmeticsPreview onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Catalog unavailable",
    );
    expect(
      screen.queryByRole("region", { name: "Cosmetics admin preview" }),
    ).toBeNull();
    db.fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    await screen.findByRole("article", { name: "Retired Cloud Frame" });
  });
});
