import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { EconomyAdmin } from "./EconomyAdmin";
import { useStore } from "../store";
import { DEFAULT_ECONOMY } from "../lib/economy";

afterEach(() => {
  act(() => useStore.setState({ isAdmin: false, economy: DEFAULT_ECONOMY }));
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
    // Nothing edited yet → every Save (formulas + Import Charters) is disabled.
    const saves = screen.getAllByRole("button", { name: /^Save$/i }) as HTMLButtonElement[];
    expect(saves.length).toBeGreaterThanOrEqual(1);
    expect(saves.every((b) => b.disabled)).toBe(true);
  });
});
