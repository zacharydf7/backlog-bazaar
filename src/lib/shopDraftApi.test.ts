import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { shopDraftApi } from "./shopDraftApi";
import type { ShopDraft } from "./shopDrafts";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./supabase", async (original) => ({
  ...(await original<typeof import("./supabase")>()),
  supabase: mocks,
}));
const draft = { draft_id: "draft", revision: 2 } as ShopDraft;
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ can: () => true });
  mocks.rpc.mockResolvedValue({ data: [draft], error: null });
});
describe("saved draft API", () => {
  it("unwraps composite RPC arrays while keeping draft lists as arrays", async () => {
    expect(await shopDraftApi.start(null)).toEqual(draft);
    expect(await shopDraftApi.list()).toEqual([draft]);
    mocks.rpc.mockResolvedValueOnce({ data: draft, error: null });
    expect(await shopDraftApi.start("item")).toEqual(draft);
  });
  it("forwards the exact saved revision and ownership acknowledgement", async () => {
    await shopDraftApi.publish(draft, true);
    expect(mocks.rpc).toHaveBeenCalledWith("publish_shop_draft", {
      p_draft: "draft",
      p_revision: 2,
      p_acknowledge_owners: true,
    });
  });
  it("rejects unexpected mutation results instead of pretending they succeeded", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(shopDraftApi.start(null)).rejects.toThrow(
      "unexpected draft response",
    );
  });
  it("explains catalog conflicts without swallowing them", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "CATALOG_CONFLICT" },
    });
    await expect(shopDraftApi.publish(draft, true)).rejects.toThrow(
      "draft remains saved",
    );
  });
  it("checks the separate permission before sending a mutation", async () => {
    useStore.setState({
      can: (key) => key === "shop.manage" || key === "shop.drafts",
    });
    await expect(shopDraftApi.publish(draft, true)).rejects.toThrow(
      "Not authorized",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
