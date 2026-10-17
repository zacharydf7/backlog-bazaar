import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EconomyAdmin } from "./EconomyAdmin";
import { useStore } from "../store";
import { DEFAULT_ECONOMY } from "../lib/economy";
import { DEFAULT_SHADOW_CONFIG, type ShadowConfig, type ShadowPlayer } from "../lib/shadowEconomy";

const realCan = useStore.getState().can;

afterEach(() => {
  act(() => useStore.setState({ isAdmin: false, economy: DEFAULT_ECONOMY, can: realCan }));
});

describe("EconomyAdmin", () => {
  it("gates the page to admins", () => {
    act(() => useStore.setState({ isAdmin: false }));
    render(<EconomyAdmin />);
    expect(screen.getByText(/don't have access/i)).toBeTruthy();
    expect(screen.queryByText(/Buy price/i)).toBeNull();
  });

  it("shows both formula editors with a live preview total for admins", () => {
    act(() => useStore.setState({ isAdmin: true, economy: DEFAULT_ECONOMY }));
    render(<EconomyAdmin />);
    expect(screen.getByRole("heading", { name: /Buy price/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Finish bounty/i })).toBeTruthy();
    // Each formula card renders a preview with a Total row.
    expect(screen.getAllByText(/^Total$/).length).toBe(2);
    // Nothing edited yet → every Save (formulas + the standalone cards) is disabled.
    const saves = screen.getAllByRole("button", { name: /^Save$/i }) as HTMLButtonElement[];
    expect(saves.length).toBeGreaterThanOrEqual(1);
    expect(saves.every((b) => b.disabled)).toBe(true);
  });
});

describe("EconomyAdmin hidden adjustments (economy.shadow)", () => {
  const frybeard: ShadowPlayer = {
    userId: "u1",
    displayName: "CptFrybeard",
    overrideMode: null,
    overridePct: null,
    overrideNote: null,
    pct: 0,
    source: null,
    recentClears: 10,
    verifiedClears: 2,
    adjustedCoins: 0,
    adjustments: 0,
  };

  function shadowOnly() {
    const setShadowOverride = vi.fn(async () => true);
    const saveShadowConfig = vi.fn(async (cfg: ShadowConfig) => cfg);
    act(() =>
      useStore.setState({
        can: (p: string) => p === "economy.shadow",
        fetchShadowConfig: vi.fn(async () => DEFAULT_SHADOW_CONFIG),
        fetchShadowOverview: vi.fn(async () => [frybeard]),
        fetchShadowAdjustments: vi.fn(async () => []),
        setShadowOverride,
        saveShadowConfig,
      } as never),
    );
    return { setShadowOverride, saveShadowConfig };
  }

  it("shows a shadow-only admin just the hidden adjustments card", async () => {
    shadowOnly();
    render(<EconomyAdmin />);
    expect(await screen.findByRole("heading", { name: /Hidden adjustments/ })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Buy price/i })).toBeNull();
    expect(screen.getByText(/Off right now/)).toBeTruthy();
    expect(screen.getByText("No adjustment · 2/10 verified")).toBeTruthy();
  });

  it("turns it on and saves a per-player nerf with a private note", async () => {
    const { setShadowOverride, saveShadowConfig } = shadowOnly();
    render(<EconomyAdmin />);
    await screen.findByRole("heading", { name: /Hidden adjustments/ });

    fireEvent.click(screen.getByRole("checkbox", { name: /apply adjustments to finishes/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /^Save$/ })[0]);
    await waitFor(() => expect(saveShadowConfig).toHaveBeenCalled());
    expect(saveShadowConfig.mock.calls[0][0]).toMatchObject({ enabled: true, buffPct: 10 });

    fireEvent.change(screen.getByRole("combobox", { name: "Override for CptFrybeard" }), {
      target: { value: "nerf" },
    });
    fireEvent.change(screen.getByLabelText("Custom % for CptFrybeard"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Note for CptFrybeard"), { target: { value: "zero-time batch" } });
    const rowSave = screen.getAllByRole("button", { name: /^Save$/ }).at(-1)!;
    fireEvent.click(rowSave);
    await waitFor(() =>
      expect(setShadowOverride).toHaveBeenCalledWith("u1", "nerf", 15, "zero-time batch"),
    );
  });
});
