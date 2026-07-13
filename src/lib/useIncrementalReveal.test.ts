import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIncrementalReveal } from "./useIncrementalReveal";

describe("useIncrementalReveal (86dce059)", () => {
  it("starts at one page and grows a page at a time, capped at the total", () => {
    const { result } = renderHook(() => useIncrementalReveal("bazaar", 100, 48));
    expect(result.current.count).toBe(48);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.showMore());
    expect(result.current.count).toBe(96);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.showMore());
    // 144 requested, but only 100 exist — clamped, and nothing left to reveal.
    expect(result.current.count).toBe(100);
    expect(result.current.hasMore).toBe(false);
  });

  it("shows everything (no More) when the total fits in a page", () => {
    const { result } = renderHook(() => useIncrementalReveal("k", 10, 48));
    expect(result.current.count).toBe(10);
    expect(result.current.hasMore).toBe(false);
  });

  it("resets to one page when the reset key changes (board switch)", () => {
    const { result, rerender } = renderHook(
      ({ k }) => useIncrementalReveal(k, 200, 48),
      { initialProps: { k: "bazaar" } },
    );
    act(() => result.current.showMore());
    act(() => result.current.showMore());
    expect(result.current.count).toBe(144);

    rerender({ k: "finished" });
    expect(result.current.count).toBe(48);
  });

  it("seeds a larger initial reveal (returning to a deep card) and keeps it on mount", () => {
    // Coming back from a game's page: the board must already show through card 51.
    const { result } = renderHook(() => useIncrementalReveal("bazaar", 200, 48, 51));
    expect(result.current.count).toBe(51);
    expect(result.current.hasMore).toBe(true);
  });

  it("still drops to one page when the reset key changes after a seeded mount", () => {
    const { result, rerender } = renderHook(
      ({ k }) => useIncrementalReveal(k, 200, 48, 60),
      { initialProps: { k: "bazaar" } },
    );
    expect(result.current.count).toBe(60); // seeded deep on mount…
    rerender({ k: "finished" }); // …but a real board switch is a fresh page.
    expect(result.current.count).toBe(48);
  });

  it("ignores a seed smaller than a page (floors at the page size)", () => {
    const { result } = renderHook(() => useIncrementalReveal("bazaar", 200, 48, 10));
    expect(result.current.count).toBe(48);
  });

  it("revealTo grows straight to a deep target and never shrinks (d2444c65)", () => {
    const { result } = renderHook(() => useIncrementalReveal("bazaar", 500, 48));
    act(() => result.current.revealTo(300)); // rail jump deep into the list
    expect(result.current.count).toBe(300);
    act(() => result.current.revealTo(100)); // jumping back up unmounts nothing
    expect(result.current.count).toBe(300);
    act(() => result.current.revealTo(9999)); // clamped by the total
    expect(result.current.count).toBe(500);
    expect(result.current.hasMore).toBe(false);
  });

  it("clamps (doesn't reset) when the total shrinks under the same key", () => {
    const { result, rerender } = renderHook(
      ({ total }) => useIncrementalReveal("bazaar", total, 48),
      { initialProps: { total: 200 } },
    );
    act(() => result.current.showMore()); // count 96
    rerender({ total: 30 }); // filtered down
    expect(result.current.count).toBe(30);
    expect(result.current.hasMore).toBe(false);
  });
});
