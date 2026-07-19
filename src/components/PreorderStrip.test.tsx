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

/** A local date `days` from today, in the strip's YYYY-MM-DD convention. */
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

beforeEach(() => {
  act(() => useStore.setState({ viewing: null, preorderStripDays: 30 }));
  window.history.replaceState(null, "", "/");
});

describe("PreorderStrip (Coming up)", () => {
  it("renders nothing when the board has no pre-orders", () => {
    const { container } = render(<PreorderStrip games={[game(), game()]} />);
    expect(container.firstChild).toBeNull();
  });

  it("lists in-horizon pre-orders in arrival order with their countdowns", () => {
    const near = game({ title: "Near Miss", preorderedAt: 1, preorderExpectedOn: inDays(12) });
    const out = game({ title: "Already Out", preorderedAt: 1, preorderExpectedOn: "2020-01-01" });
    const plain = game({ title: "Just Wanted" });
    render(<PreorderStrip games={[near, plain, out]} />);

    expect(screen.getByText("Coming up")).toBeTruthy();
    expect(screen.queryByText("Just Wanted")).toBeNull();
    const chips = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    // The arrived one leads (its date is long past), the near one trails.
    expect(chips[0]).toContain("Already Out");
    expect(chips[0]).toContain("Out now!");
    expect(chips[1]).toContain("Near Miss");
    expect(chips[1]).toMatch(/Arrives in \d+ days/);
  });

  it("keeps far-off and dateless pre-orders off the strip — it only announces imminent arrivals", () => {
    const far = game({ title: "Far Off", preorderedAt: 1, preorderExpectedOn: inDays(234) });
    const dateless = game({ title: "Someday", preorderedAt: 1 });
    const { container } = render(<PreorderStrip games={[far, dateless]} />);
    expect(container.firstChild).toBeNull();
  });

  it("honours the admin horizon — 0 disables the strip entirely", () => {
    act(() => useStore.setState({ preorderStripDays: 0 }));
    const due = game({ title: "Day One", preorderedAt: 1, preorderExpectedOn: todayISO() });
    const { container } = render(<PreorderStrip games={[due]} />);
    expect(container.firstChild).toBeNull();
  });

  it("celebrates release day itself as Out today!", () => {
    const today = game({ title: "Day One", preorderedAt: 1, preorderExpectedOn: todayISO() });
    render(<PreorderStrip games={[today]} />);
    expect(screen.getByRole("button", { name: /Day One/ }).textContent).toContain("Out today!");
  });

  it("a chip opens that game's page", () => {
    const g = game({ id: "pre1", title: "Silksong", preorderedAt: 1, preorderExpectedOn: inDays(5) });
    render(<PreorderStrip games={[g]} />);
    fireEvent.click(screen.getByRole("button", { name: /Silksong/ }));
    expect(window.location.hash).toBe("#g/pre1");
  });
});
