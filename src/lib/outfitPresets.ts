import { useStore } from "../store";
import { supabase } from "./supabase";
import { validLook, wardrobeAllowed } from "./wardrobe";
import {
  COSMETIC_SLOTS,
  lookIsOwned,
  type CosmeticLook,
  type CosmeticsSession,
} from "./cosmeticsPreview";

export interface OutfitPreset {
  id: string;
  name: string;
  look: CosmeticLook;
  version: number;
  archived_at: string | null;
}
export function missingPresetSlots(
  session: CosmeticsSession,
  look: CosmeticLook,
) {
  return COSMETIC_SLOTS.filter(
    (slot) =>
      !lookIsOwned(session, {
        title: null,
        frame: null,
        stall: null,
        coin: null,
        [slot]: look[slot],
      }),
  );
}
export function presetNameProblem(name: string): string | null {
  return !name.trim() || name.trim().length > 60
    ? "Use a name between 1 and 60 characters."
    : null;
}
function parsePreset(data: unknown): OutfitPreset {
  if (!data || typeof data !== "object")
    throw new Error("Could not read saved look. Reload before trying again.");
  const row = data as OutfitPreset;
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    !validLook(row.look) ||
    !Number.isInteger(row.version) ||
    row.version < 1 ||
    !(row.archived_at === null || typeof row.archived_at === "string")
  ) {
    throw new Error("Could not read saved look. Reload before trying again.");
  }
  return row;
}
function account() {
  const s = useStore.getState();
  if (!wardrobeAllowed())
    throw new Error("Sign in to manage saved looks.");
  if (!s.cloud || !s.userId || !supabase)
    throw new Error("Sign in to manage saved looks.");
  return s.userId;
}
async function mutate(name: string, args: Record<string, unknown>) {
  const userId = account();
  const { data, error } = await supabase!.rpc(name, args);
  if (error)
    throw new Error(
      error.message.includes("PRESET_CONFLICT")
        ? "This saved look changed elsewhere. Reload saved looks before trying again; your edits are still here."
        : error.message,
    );
  if (account() !== userId)
    throw new Error("Your account changed. Reopen your wardrobe.");
  return parsePreset(data);
}
export const outfitPresetApi = {
  async list(): Promise<OutfitPreset[]> {
    const userId = account();
    const { data, error } = await supabase!
      .from("outfit_presets")
      .select("id,name,look,version,archived_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (account() !== userId)
      throw new Error("Your account changed. Reopen your wardrobe.");
    return (data ?? []).map(parsePreset);
  },
  save(id: string, version: number, name: string, look: CosmeticLook) {
    const problem = presetNameProblem(name);
    if (problem) return Promise.reject(new Error(problem));
    return mutate("save_outfit_preset", {
      p_id: id,
      p_version: version,
      p_name: name.trim(),
      p_look: look,
    });
  },
  archive(preset: OutfitPreset, archived: boolean) {
    return mutate("archive_outfit_preset", {
      p_id: preset.id,
      p_version: preset.version,
      p_archived: archived,
    });
  },
};
