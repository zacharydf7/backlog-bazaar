import { act, render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("../lib/supabase", async (original) => ({
  ...(await original<typeof import("../lib/supabase")>()),
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));
import { useStore } from "../store";
import { CosmeticEvents } from "./CosmeticEvents";
const event = {
  key: "halloween",
  name: "Pumpkin Patch Halloween",
  item_id: "pumpkin",
  starts_at: "2026-10-01T04:00:00Z",
  ends_at: "2026-11-02T05:00:00Z",
  afterward_price: 2500,
  enabled: false,
  activated_at: null,
};
const item = {
  id: "pumpkin",
  name: "Pumpkin Patch",
  price: 350,
  active: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ cloud: true, userId: "admin", can: () => true });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table) => {
    const result = {
      data: table === "cosmetic_events" ? [event] : [item],
      error: null,
    };
    const chain = {
      select: () => chain,
      order: () => Promise.resolve(result),
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  });
});
describe("seasonal event review", () => {
  it("hides draft events on the customer surface even for an admin", async () => {
    await act(async () => {
      render(<CosmeticEvents />);
    });
    expect(screen.queryByText("Pumpkin Patch Halloween")).toBeNull();
    expect(screen.queryByRole("button", { name: "Activate event" })).toBeNull();
  });
  it("requires the assignable event permission", () => {
    useStore.setState({ can: (key) => key !== "cosmetics.events.manage" });
    render(<CosmeticEvents admin />);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("requires confirmation and sends the exact catalog snapshot when activating", async () => {
    render(<CosmeticEvents admin />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Activate event" }),
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.getByText(/does not open the shop/)).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Confirm" })),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("set_cosmetic_event_enabled", {
      p_key: "halloween",
      p_enabled: true,
      p_expected_item: item,
    });
  });
});
