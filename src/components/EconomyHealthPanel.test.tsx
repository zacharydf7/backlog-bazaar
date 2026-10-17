import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { useStore } from "../store";
import { EconomyHealthPanel } from "./EconomyHealthPanel";
import { StatsAdmin } from "./StatsAdmin";
import { toEconomyHealth } from "../lib/economyHealth";

const realCan = useStore.getState().can;

afterEach(() => {
  act(() => useStore.setState({ can: realCan }));
});

const health = toEconomyHealth({
  circulation: 20000,
  by_kind: [
    { kind: "bounty", coins_in: 2300, coins_out: 0, events: 8, players: 3 },
    { kind: "shop_purchase", coins_in: 0, coins_out: 5450, events: 7, players: 1 },
  ],
  daily: [
    { day: "2026-10-15", coins_in: 2300, coins_out: 0 },
    { day: "2026-10-16", coins_in: 0, coins_out: 5450 },
  ],
  players: [
    { user_id: "u1", display_name: "CptFrybeard", balance: 900, earned: 2300, spent: 5450, top_source: "bounty", clears: 3 },
  ],
});

describe("EconomyHealthPanel", () => {
  it("shows totals, sources and sinks, the chart and each player's flows", async () => {
    const fetchEconomyHealth = vi.fn(async () => health);
    act(() => useStore.setState({ fetchEconomyHealth }));
    render(<EconomyHealthPanel />);
    expect(await screen.findByText("Where coins come from")).toBeTruthy();
    expect(screen.getByText("20,000")).toBeTruthy(); // in circulation
    expect(screen.getByText("Bounty Claimed")).toBeTruthy();
    expect(screen.getByText("Curio Shop Purchase")).toBeTruthy();
    expect(screen.getByRole("img", { name: /Coins in and out over time/ })).toBeTruthy();
    const row = screen.getByText("CptFrybeard").parentElement!;
    expect(within(row).getByText(/net −3,150/)).toBeTruthy();
    expect(within(row).getByText(/mostly Bounty Claimed/)).toBeTruthy();
  });

  it("reloads for a new window", async () => {
    const fetchEconomyHealth = vi.fn(async () => health);
    act(() => useStore.setState({ fetchEconomyHealth }));
    render(<EconomyHealthPanel />);
    await screen.findByText("Where coins come from");
    fireEvent.change(screen.getByLabelText("Economy health window"), { target: { value: "all" } });
    await waitFor(() => expect(fetchEconomyHealth).toHaveBeenCalledTimes(2));
    expect((fetchEconomyHealth.mock.calls[1] as unknown[])[0]).toBeNull(); // all time
  });

  it("gives an economy.insights-only admin just this panel on the Stats tab", async () => {
    act(() =>
      useStore.setState({
        can: (p: string) => p === "economy.insights",
        fetchEconomyHealth: vi.fn(async () => health),
      } as never),
    );
    render(<StatsAdmin />);
    expect(await screen.findByText("Where coins come from")).toBeTruthy();
    expect(screen.queryByText(/A player.s activity/)).toBeNull();
  });
});
