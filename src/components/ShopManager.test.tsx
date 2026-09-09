import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ShopManager } from "./ShopManager";
import { useStore } from "../store";

const scroll = vi.fn();
const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
  useStore.setState({
    cloud: false,
    can: (permission) => permission === "shop.manage",
    fetchShop: vi.fn(async () => {}),
    shopSets: [],
    shopOpen: true,
    shopItems: [{ id: "frame", slug: "frame-test", name: "Test Frame", kind: "frame",
      description: null, price: 3500, style: "bronze-ring", badgeId: null,
      tier: "standard", secret: false, setKey: null, availableFrom: null,
      availableUntil: null, active: true, sort: 0 }],
  });
});
afterEach(() => {
  if (originalScroll) Object.defineProperty(Element.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

describe("stock editor navigation", () => {
  it("groups collection pieces and reports their actual availability without changing stock", () => {
    const base = useStore.getState().shopItems[0];
    const members = [
      { ...base, id: "one", name: "Press Start", setKey: "arcade" },
      { ...base, id: "two", name: "Arcade Frame", setKey: "arcade", active: false },
      { ...base, id: "three", name: "Arcade Stall", setKey: "arcade", availableFrom: Date.parse("2099-01-01") },
      { ...base, id: "four", name: "Arcade Coin", setKey: "arcade", availableUntil: Date.parse("2000-01-01") },
    ];
    useStore.setState({ shopItems: [...members, base], shopSets: [{ key: "arcade", name: "Retro Arcade", description: null, badgeId: null }] });
    render(<ShopManager />);
    fireEvent.click(screen.getAllByRole("button", { name: "Retro Arcade collection" })[0]);
    expect(screen.getByRole("status").textContent).toContain("1 of 4 pieces available now");
    expect(screen.getByRole("status").textContent).toContain("1 inactive · 1 scheduled · 1 ended");
    expect(screen.queryByText("Test Frame")).toBeNull();
    expect(screen.getAllByTitle("Edit")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Show all stock" }));
    expect(screen.getAllByTitle("Edit")).toHaveLength(5);
    expect(useStore.getState().shopItems).toEqual([...members, base]);
  });

  it("brings the editor into view and moves keyboard focus when a row is edited", () => {
    render(<ShopManager />);
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Edit"));
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Stock item editor" }));
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
    expect(screen.getByLabelText("Price (coins)")).toHaveProperty("value", "3500");
    fireEvent.change(screen.getByLabelText("Price (coins)"), { target: { value: "3000" } });
    expect(scroll).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle("Edit"));
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it("also reveals new-item forms after closing an editor", () => {
    render(<ShopManager />);
    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "New item" }));
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Stock item editor" }));
    expect(scroll).toHaveBeenCalledTimes(2);
  });
});
