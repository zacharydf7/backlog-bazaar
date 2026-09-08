import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { ShopDraftManager } from "./ShopDraftManager";
import type { ShopDraft } from "../lib/shopDrafts";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  start: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  from: vi.fn(),
}));
vi.mock("../lib/shopDraftApi", () => ({ shopDraftApi: mocks }));
vi.mock("../lib/supabase", async (original) => ({
  ...(await original<typeof import("../lib/supabase")>()),
  supabase: { from: mocks.from },
}));
const item = {
  id: "item",
  slug: "bronze",
  name: "Bronze",
  kind: "frame",
  style: "bronze-ring",
  price: 100,
  active: true,
  tier: "standard",
  secret: false,
  sort: 0,
};
const draft: ShopDraft = {
  draft_id: "draft",
  revision: 2,
  source_item_id: "item",
  base_item: item,
  base_badge: null,
  payload: {
    item: { ...item, price: 200 },
    badge: { icon: "award", prestige: 3, effect: null },
  },
  state: "draft",
  published_item_id: null,
  created_at: "2026-09-08T12:00:00Z",
  actor_id: "admin",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([draft]);
  mocks.save.mockImplementation(async (_draft, payload) => ({
    ...draft,
    revision: 3,
    payload,
  }));
  mocks.publish.mockResolvedValue({
    ...draft,
    revision: 3,
    state: "published",
  });
  mocks.from.mockImplementation((table) => {
    const query = {
      select: () => query,
      order: () => query,
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve({
          data: table === "shop_items" ? [item] : [],
          error: null,
        }).then(resolve),
    };
    return query;
  });
  useStore.setState({
    userId: "admin",
    can: (key) => ["shop.manage", "shop.drafts", "shop.publish"].includes(key),
    displayName: "Reviewer",
    avatarUrl: null,
    defaultCoin: "mint",
  });
});
async function open() {
  render(<ShopDraftManager onClose={vi.fn()} />);
  await screen.findByText(/Revision 2/);
}
describe("persistent draft workflow", () => {
  it("saves an edited revision without publishing", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Edit draft" }));
    fireEvent.change(screen.getByLabelText("Price (coins)"), {
      target: { value: "300" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save draft revision" }),
    );
    await screen.findByText("Revision 3 saved. Nothing has been published.");
    expect(mocks.save.mock.calls[0][1].item.price).toBe(300);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("requires owner acknowledgement and a final publish confirmation", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(
      screen
        .getByRole("button", { name: "Publish saved revision" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Publish saved revision" }),
    );
    expect(mocks.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
    await screen.findByText(
      "Saved revision published. The shop setting is unchanged.",
    );
    expect(mocks.publish).toHaveBeenCalledWith(draft, true);
  });
  it("keeps unsaved form edits after a rejected save", async () => {
    mocks.save.mockRejectedValueOnce(new Error("A newer revision exists."));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Edit draft" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "My unsaved name" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save draft revision" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Name")).toHaveProperty(
      "value",
      "My unsaved name",
    );
  });
  it("hides publish controls without the new publish permission", async () => {
    useStore.setState({
      can: (key) => key === "shop.manage" || key === "shop.drafts",
    });
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(
      screen.queryByRole("button", { name: "Publish saved revision" }),
    ).toBeNull();
  });
  it("blocks reads without permission and unmounts on revocation", async () => {
    useStore.setState({ can: () => false });
    const view = render(<ShopDraftManager onClose={vi.fn()} />);
    expect(mocks.list).not.toHaveBeenCalled();
    view.unmount();
    useStore.setState({ can: () => true });
    await open();
    act(() => useStore.setState({ can: () => false }));
    expect(
      screen.queryByRole("region", { name: "Persistent cosmetic drafts" }),
    ).toBeNull();
  });
});
