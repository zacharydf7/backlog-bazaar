import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { collectionDraftApi } from "./collectionDraftApi";
import type { CollectionDraft } from "./collectionDrafts";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./supabase", async (original) => ({
  ...(await original<typeof import("./supabase")>()),
  supabase: { rpc: mocks.rpc },
}));
const draft = { draft_id: "draft", revision: 2 } as CollectionDraft;
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ can: () => true, cloud: true, userId: "admin" });
  mocks.rpc.mockResolvedValue({ data: draft, error: null });
});
describe("collection draft API", () => {
  it("sends the exact revision and acknowledgment without publishing on save", async () => {
    const payload = {
      set: { key: "a", name: "Alpha", description: null, badge_id: null },
      member_ids: [],
    };
    await collectionDraftApi.save(draft, payload);
    expect(mocks.rpc).toHaveBeenCalledWith("save_collection_draft", {
      p_draft: "draft",
      p_revision: 2,
      p_payload: payload,
    });
    await collectionDraftApi.publish(draft, true);
    expect(mocks.rpc).toHaveBeenLastCalledWith("publish_collection_draft", {
      p_draft: "draft",
      p_revision: 2,
      p_acknowledge: true,
    });
  });
  it("checks publication permission before making a request", async () => {
    useStore.setState({
      can: (key) => key === "shop.manage" || key === "shop.collections.drafts",
    });
    await expect(collectionDraftApi.publish(draft, true)).rejects.toThrow(
      "access",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("explains catalog conflicts while retaining saved revisions", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "CATALOG_CONFLICT" },
    });
    await expect(collectionDraftApi.publish(draft, true)).rejects.toThrow(
      "revision remains saved",
    );
  });
  it("rejects a response for a different account", async () => {
    mocks.rpc.mockImplementationOnce(async () => {
      useStore.setState({ userId: "other" });
      return { data: draft, error: null };
    });
    await expect(collectionDraftApi.start(null)).rejects.toThrow(
      "account changed",
    );
  });
});
