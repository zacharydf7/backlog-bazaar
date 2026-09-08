import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  toast: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("./supabase", async (original) => ({
  ...(await original<typeof import("./supabase")>()),
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));
vi.mock("./toast", () => ({ toast: mocks.toast }));
import { useStore } from "../store";
import { useCosmeticEventVisit } from "./useCosmeticEventVisit";
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.fetch.mockResolvedValue(undefined);
  mocks.from.mockImplementation(() => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: async () => ({ data: [], error: null }),
    };
    return chain;
  });
  useStore.setState({ cloud: true, userId: "user", fetchShop: mocks.fetch });
});
afterEach(() => vi.restoreAllMocks());
describe("foreground reward visits", () => {
  it("waits for foreground visibility and supplies no claimed timestamps or identity", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    renderHook(() => useCosmeticEventVisit());
    expect(mocks.rpc).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("record_cosmetic_event_visit"),
    );
  });
  it("refreshes ownership and announces a newly earned reward", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ item_id: "pumpkin", name: "Pumpkin Patch" }],
      error: null,
    });
    renderHook(() => useCosmeticEventVisit());
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.toast.mock.calls[0][0]).toContain("Pumpkin Patch");
  });
  it("ignores a late award response after switching accounts", async () => {
    let finish!: (result: unknown) => void;
    mocks.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderHook(() => useCosmeticEventVisit());
    act(() => useStore.setState({ userId: "other" }));
    await act(async () =>
      finish({ data: [{ name: "Pumpkin Patch" }], error: null }),
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("does not call the event service while signed out", () => {
    useStore.setState({ userId: null });
    renderHook(() => useCosmeticEventVisit());
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
