import { useStore } from "../store";
import { supabase, jsonToBadges } from "./supabase";
import { coerceShopItems, coerceShopSets } from "./shop";
import { isCoinVariant } from "./coins";
import {
  COSMETIC_SLOTS,
  type CosmeticLook,
  type CosmeticsSession,
} from "./cosmeticsPreview";

export function wardrobeAllowed() {
  const state = useStore.getState();
  return state.can("shop.manage") && state.can("shop.wardrobe");
}
function account() {
  const { userId, cloud } = useStore.getState();
  if (!wardrobeAllowed()) throw new Error("Wardrobe access is required.");
  if (!cloud || !userId || !supabase)
    throw new Error("Sign in to use your real wardrobe.");
  return userId;
}
export function sameLook(a: CosmeticLook, b: CosmeticLook) {
  return COSMETIC_SLOTS.every((slot) => a[slot] === b[slot]);
}
function validLook(value: unknown): value is CosmeticLook {
  if (!value || typeof value !== "object") return false;
  const look = value as Record<string, unknown>;
  return COSMETIC_SLOTS.every(
    (slot) => look[slot] === null || typeof look[slot] === "string",
  );
}
export const wardrobeApi = {
  async load(): Promise<CosmeticsSession> {
    const userId = account();
    const results = await Promise.all([
      supabase!.from("shop_items").select("*").order("sort"),
      supabase!.from("shop_sets").select("*"),
      supabase!.from("badges").select("*"),
      supabase!.from("shop_purchases").select("item_id").eq("user_id", userId),
      supabase!
        .from("user_badges")
        .select("badge_id")
        .eq("user_id", userId)
        .is("revoked_at", null),
      supabase!
        .from("profiles")
        .select(
          "selected_badge_id,equipped_frame_id,equipped_stall_id,equipped_coin_id",
        )
        .eq("id", userId)
        .single(),
    ]);
    for (const result of results)
      if (result.error) throw new Error(result.error.message);
    if (account() !== userId)
      throw new Error("Your account changed. Reopen the wardrobe.");
    const profile = results[5].data;
    if (!profile) throw new Error("Your profile could not be loaded.");
    const session: CosmeticsSession = {
      items: coerceShopItems(results[0].data),
      sets: coerceShopSets(results[1].data),
      badges: jsonToBadges(results[2].data),
      ownedIds: (results[3].data ?? []).map((row) => row.item_id),
      heldBadgeIds: (results[4].data ?? []).map((row) => row.badge_id),
      balance: useStore.getState().coins,
      look: {
        title: profile.selected_badge_id,
        frame: profile.equipped_frame_id,
        stall: profile.equipped_stall_id,
        coin: profile.equipped_coin_id,
      },
    };
    // Refresh cosmetic metadata and holdings so existing profile renders can
    // resolve newly earned titles and retired pieces after this outfit is saved.
    useStore.setState({
      shopItems: session.items,
      shopSets: session.sets,
      shopPurchasedIds: session.ownedIds,
      myBadges: session.badges.filter((badge) =>
        session.heldBadgeIds.includes(badge.id),
      ),
    });
    return session;
  },
  async apply(
    look: CosmeticLook,
    expected: CosmeticLook,
  ): Promise<CosmeticLook> {
    const userId = account();
    const { data, error } = await supabase!.rpc("apply_wardrobe", {
      p_look: look,
      p_expected: expected,
    });
    if (error)
      throw new Error(
        error.message.includes("OUTFIT_CONFLICT")
          ? "Your outfit changed elsewhere. Your try-on is still here; reload your wardrobe before applying again."
          : error.message,
      );
    if (!data || !validLook(data.look))
      throw new Error(
        "Could not confirm the saved outfit. Reload your wardrobe before trying again.",
      );
    // A request completing after sign-out must never write into the next account.
    if (useStore.getState().userId === userId && wardrobeAllowed()) {
      useStore.setState({
        selectedTitleId: data.look.title,
        equippedFrameId: data.look.frame,
        equippedStallId: data.look.stall,
        equippedCoinId: data.look.coin,
        coinSkin: isCoinVariant(data.coin_style) ? data.coin_style : null,
      });
    }
    return data.look;
  },
};
