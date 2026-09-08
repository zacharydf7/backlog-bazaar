import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { wardrobeApi } from "./wardrobe";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
}));
vi.mock("./supabase", async (original) => ({
  ...(await original<typeof import("./supabase")>()),
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));
const empty = { title: null, frame: null, stall: null, coin: null };
const look = { ...empty, coin: "coin" };
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    can: () => false,
    cloud: true,
    userId: "admin",
    selectedTitleId: null,
    equippedFrameId: null,
    equippedStallId: null,
    equippedCoinId: null,
    coinSkin: null,
  });
  mocks.rpc.mockResolvedValue({
    data: { look, coin_style: "mint" },
    error: null,
  });
  mocks.from.mockImplementation((table) => {
    const data =
      table === "profiles"
        ? {
            selected_badge_id: null,
            equipped_frame_id: null,
            equipped_stall_id: null,
            equipped_coin_id: null,
          }
        : [];
    const result = { data, error: null };
    const chain = {
      select: () => chain,
      order: () => chain,
      eq: (...args: unknown[]) => {
        mocks.eq(table, ...args);
        return chain;
      },
      is: (...args: unknown[]) => {
        mocks.is(table, ...args);
        return chain;
      },
      single: () => Promise.resolve(result),
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  });
});
describe("wardrobe API", () => {
  it("scopes holdings and current equipment to the signed-in account", async () => {
    const session = await wardrobeApi.load();
    expect(session.look).toEqual(empty);
    expect(mocks.eq).toHaveBeenCalledWith("shop_purchases", "user_id", "admin");
    expect(mocks.eq).toHaveBeenCalledWith("user_badges", "user_id", "admin");
    expect(mocks.is).toHaveBeenCalledWith("user_badges", "revoked_at", null);
    expect(mocks.eq).toHaveBeenCalledWith("profiles", "id", "admin");
  });
  it("sends one atomic RPC with expected state and updates equipment only after success", async () => {
    let resolve!: (value: unknown) => void;
    mocks.rpc.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = wardrobeApi.apply(look, empty);
    expect(useStore.getState().equippedCoinId).toBeNull();
    resolve({ data: { look, coin_style: "mint" }, error: null });
    await pending;
    expect(mocks.rpc).toHaveBeenCalledWith("apply_wardrobe", {
      p_look: look,
      p_expected: empty,
    });
    expect(useStore.getState().equippedCoinId).toBe("coin");
    expect(useStore.getState().coinSkin).toBe("mint");
  });
  it("preserves local equipment when the server rejects the outfit", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "OUTFIT_CONFLICT" },
    });
    await expect(wardrobeApi.apply(look, empty)).rejects.toThrow(
      "changed elsewhere",
    );
    expect(useStore.getState().equippedCoinId).toBeNull();
  });
  it("does not contaminate another account when an in-flight request finishes", async () => {
    mocks.rpc.mockImplementationOnce(async () => {
      useStore.setState({ userId: "other", equippedCoinId: "other-coin" });
      return { data: { look, coin_style: "mint" }, error: null };
    });
    await wardrobeApi.apply(look, empty);
    expect(useStore.getState().equippedCoinId).toBe("other-coin");
  });
  it("requires a real cloud account before making requests", async () => {
    useStore.setState({ userId: null });
    await expect(wardrobeApi.load()).rejects.toThrow("Sign in");
    await expect(wardrobeApi.apply(look, empty)).rejects.toThrow("Sign in");
    useStore.setState({ can: () => false, cloud: false });
    await expect(wardrobeApi.apply(look, empty)).rejects.toThrow("Sign in");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
