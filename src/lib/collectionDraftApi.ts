import { useStore } from "../store";
import { supabase } from "./supabase";
import type { CollectionDraft } from "./collectionDrafts";
import { coerceShopSets } from "./shop";
function access(write: "draft" | "publish" | "read") {
  const { can, userId, cloud } = useStore.getState();
  const allowed =
    write === "read"
      ? can("shop.collections.drafts") || can("shop.collections.publish")
      : can(
          write === "draft"
            ? "shop.collections.drafts"
            : "shop.collections.publish",
        );
  if (!can("shop.manage") || !allowed)
    throw new Error("Collection draft access is required.");
  if (!supabase || !userId || !cloud)
    throw new Error("Sign in to manage collection drafts.");
  return userId;
}
async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
  permission: "draft" | "publish" | "read",
): Promise<T> {
  const userId = access(permission);
  const { data, error } = await supabase!.rpc(name, args);
  if (error)
    throw new Error(
      error.message.includes("DRAFT_CONFLICT")
        ? "A newer collection revision exists. Reload drafts; your open edits are still here."
        : error.message.includes("CATALOG_CONFLICT")
          ? "The affected catalog changed. Start a fresh draft; this revision remains saved."
          : error.message,
    );
  if (access(permission) !== userId)
    throw new Error("Your account changed. Reopen collection drafts.");
  if (!data)
    throw new Error(
      "Could not confirm the saved draft. Reload before retrying.",
    );
  return data as T;
}
export const collectionDraftApi = {
  async collections() {
    const userId = access("read");
    const { data, error } = await supabase!.from("shop_sets").select("*");
    if (error) throw new Error(error.message);
    if (access("read") !== userId)
      throw new Error("Your account changed. Reopen collection drafts.");
    return coerceShopSets(data);
  },
  list: () => rpc<CollectionDraft[]>("list_collection_drafts", {}, "read"),
  start: (key: string | null) =>
    rpc<CollectionDraft>("start_collection_draft", { p_key: key }, "draft"),
  save: (draft: CollectionDraft, payload: CollectionDraft["payload"]) =>
    rpc<CollectionDraft>(
      "save_collection_draft",
      {
        p_draft: draft.draft_id,
        p_revision: draft.revision,
        p_payload: payload,
      },
      "draft",
    ),
  publish: (draft: CollectionDraft, acknowledge: boolean) =>
    rpc<CollectionDraft>(
      "publish_collection_draft",
      {
        p_draft: draft.draft_id,
        p_revision: draft.revision,
        p_acknowledge: acknowledge,
      },
      "publish",
    ),
};
