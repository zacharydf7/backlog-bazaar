import { supabase } from "./supabase";
import type { ShopDraft, ShopDraftPayload } from "./shopDrafts";
import { useStore } from "../store";

async function rpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { can } = useStore.getState();
  const allowed =
    name === "list_shop_drafts"
      ? can("shop.drafts") || can("shop.publish")
      : name === "publish_shop_draft"
        ? can("shop.publish")
        : can("shop.drafts");
  if (!can("shop.manage") || !allowed)
    throw new Error("Not authorized to perform this draft action.");
  if (!supabase)
    throw new Error("Persistent drafts require a signed-in cloud account.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (error.message.includes("DRAFT_CONFLICT"))
      throw new Error(
        "A newer revision exists. Reload saved drafts before continuing; your open editor has not been discarded.",
      );
    if (error.message.includes("CATALOG_CONFLICT"))
      throw new Error(
        "The live item changed since this draft began. Start a new draft from the current catalog; this draft remains saved.",
      );
    throw new Error(error.message);
  }
  return data as T;
}
async function draftRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<ShopDraft> {
  const data = await rpc<ShopDraft | ShopDraft[]>(name, args);
  // PostgREST can represent a composite result as a singleton array.
  const draft = Array.isArray(data)
    ? data.length === 1
      ? data[0]
      : null
    : data;
  if (
    !draft ||
    typeof draft.draft_id !== "string" ||
    !Number.isInteger(draft.revision)
  ) {
    throw new Error(
      "The server returned an unexpected draft response. Reload saved drafts before retrying.",
    );
  }
  return draft;
}

export const shopDraftApi = {
  list: () => rpc<ShopDraft[]>("list_shop_drafts"),
  start: (itemId: string | null) =>
    draftRpc("start_shop_draft", { p_item: itemId }),
  save: (draft: ShopDraft, payload: ShopDraftPayload) =>
    draftRpc("save_shop_draft", {
      p_draft: draft.draft_id,
      p_revision: draft.revision,
      p_payload: payload,
    }),
  publish: (draft: ShopDraft, acknowledgeOwners: boolean) =>
    draftRpc("publish_shop_draft", {
      p_draft: draft.draft_id,
      p_revision: draft.revision,
      p_acknowledge_owners: acknowledgeOwners,
    }),
};
