import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { PreorderStrip } from "./PreorderStrip";
import { useStore } from "../store";
import { todayISO } from "../lib/milestones";
import type { Game } from "../types";

let seq = 0;
function game(over: Partial<Game> = {}): Game {
  seq += 1;
  return {
    id: `g${seq}`,
    title: `Game ${seq}`,
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: seq,
    ...over,
  } as Game;
}

beforeEach(() => {
  act(() => useStore.setState({ viewing: null }));
  window.history.replaceState(null, "", "/");
});

describe("PreorderStrip (Coming up)", () => {
  it("renders nothing when the wishlist has no pre-orders", () => {
    const { container } = render(<PreorderStrip games={[game(), game()]} />);
    expect(container.firstChild).toBeNull();
  });

  it("lists pre-orders in arrival order with their countdowns", () => {
    const far = game({ title: "Far Off", preorderedAt: 1, preorderExpectedOn: "2099-12-01" });
    const out = game({ title: "Already Out", preorderedAt: 1, preorderExpectedOn: "2020-01-01" });
    const plain = game({ title: "Just Wanted" });
    render(<PreorderStrip games={[far, plain, out]} />);

    expect(screen.getByText("Coming up")).toBeTruthy();
    expect(screen.queryByText("Just Wanted")).toBeNull();
    const chips = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    // The arrived one leads (its date is long past), the far one trails.
    expect(chips[0]).toContain("Already Out");
    expect(chips[0]).toContain("Out now!");
    expect(chips[1]).toContain("Far Off");
    expect(chips[1]).toMatch(/Arrives in \d+ days/);
  });

  it("celebrates release day itself as Out today!", () => {
    const today = game({ title: "Day One", preorderedAt: 1, preorderExpectedOn: todayISO() });
    render(<PreorderStrip games={[today]} />);
    expect(screen.getByRole("button", { name: /Day One/ }).textContent).toContain("Out today!");
  });

  it("a chip opens that game's page", () => {
    const g = game({ id: "pre1", title: "Silksong", preorderedAt: 1, preorderExpectedOn: "2099-12-01" });
    render(<PreorderStrip games={[g]} />);
    fireEvent.click(screen.getByRole("button", { name: /Silksong/ }));
    expect(window.location.hash).toBe("#g/pre1");
  });
});
