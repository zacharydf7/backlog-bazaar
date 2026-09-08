import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import {
  outfitPresetApi,
  missingPresetSlots,
  presetNameProblem,
} from "./outfitPresets";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), eq: vi.fn() }));
vi.mock("./supabase", async (original) => ({
  ...(await original<typeof import("./supabase")>()),
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));
const look = { title: null, frame: null, stall: null, coin: null };
const preset = {
  id: "preset",
  name: "Weekend",
  look,
  version: 1,
  archived_at: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    can: () => true,
    userId: "admin",
    cloud: true,
    equippedFrameId: "original",
  });
  mocks.rpc.mockResolvedValue({ data: preset, error: null });
  mocks.from.mockImplementation(() => {
    const chain = {
      select: () => chain,
      eq: (...args: unknown[]) => {
        mocks.eq(...args);
        return chain;
      },
      order: () => Promise.resolve({ data: [preset], error: null }),
    };
    return chain;
  });
});
describe("outfit preset API and presentation helpers", () => {
  it("reads only the current account presets", async () => {
    expect(await outfitPresetApi.list()).toEqual([preset]);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "admin");
  });
  it("saves exact versions with a stable identifier and never changes equipment", async () => {
    await outfitPresetApi.save("stable-id", 0, "  Weekend  ", look);
    expect(mocks.rpc).toHaveBeenCalledWith("save_outfit_preset", {
      p_id: "stable-id",
      p_version: 0,
      p_name: "Weekend",
      p_look: look,
    });
    expect(useStore.getState().equippedFrameId).toBe("original");
  });
  it("forwards archive expectations and reports conflicts", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "PRESET_CONFLICT" },
    });
    await expect(outfitPresetApi.archive(preset, true)).rejects.toThrow(
      "changed elsewhere",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("archive_outfit_preset", {
      p_id: "preset",
      p_version: 1,
      p_archived: true,
    });
  });
  it("checks the separate gate before reading or writing", async () => {
    useStore.setState({ can: (key) => key !== "shop.presets" });
    await expect(outfitPresetApi.list()).rejects.toThrow("access");
    await expect(outfitPresetApi.save("id", 0, "Name", look)).rejects.toThrow(
      "access",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects responses finishing after an account switch", async () => {
    mocks.rpc.mockImplementationOnce(async () => {
      useStore.setState({ userId: "other" });
      return { data: preset, error: null };
    });
    await expect(outfitPresetApi.save("id", 0, "Name", look)).rejects.toThrow(
      "account changed",
    );
  });
  it("flags missing pieces without modifying saved selections", () => {
    const missing = { ...look, title: "revoked" };
    expect(
      missingPresetSlots(
        {
          items: [],
          sets: [],
          badges: [],
          heldBadgeIds: [],
          ownedIds: [],
          balance: 0,
          look,
        },
        missing,
      ),
    ).toEqual(["title"]);
    expect(missing.title).toBe("revoked");
    expect(presetNameProblem("  ")).toBeTruthy();
    expect(presetNameProblem("Weekend")).toBeNull();
  });
});
