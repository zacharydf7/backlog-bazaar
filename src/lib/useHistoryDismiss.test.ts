import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHistoryDismiss } from "./useHistoryDismiss";

function popstate() {
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Let any queued microtasks (the deferred cleanup) run.
const flush = () => Promise.resolve();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHistoryDismiss", () => {
  it("pushes a sentinel history entry when active", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    renderHook(() => useHistoryDismiss(true, () => {}));
    expect((window.history.state as { bbOverlay?: boolean } | null)?.bbOverlay).toBe(true);
  });

  it("calls onClose when Back is pressed", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const onClose = vi.fn();
    renderHook(() => useHistoryDismiss(true, onClose));
    popstate();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does nothing while inactive", () => {
    const onClose = vi.fn();
    renderHook(() => useHistoryDismiss(false, onClose));
    popstate();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes the sentinel when closed another way (not via Back)", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { rerender } = renderHook(({ active }) => useHistoryDismiss(active, () => {}), {
      initialProps: { active: true },
    });
    rerender({ active: false });
    expect(back).not.toHaveBeenCalled(); // deferred to a microtask
    await flush();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("does not undo a navigation that happened during the same close", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { rerender } = renderHook(({ active }) => useHistoryDismiss(active, () => {}), {
      initialProps: { active: true },
    });
    rerender({ active: false });
    // A navigation pushes a real page entry on top before the microtask runs —
    // exactly what a menu item that closes the sheet and changes page does.
    window.history.pushState(null, "", "#requests");
    await flush();
    expect(back).not.toHaveBeenCalled();
  });

  it("stops responding to Back after it is deactivated", async () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const onClose = vi.fn();
    const { rerender } = renderHook(({ active }) => useHistoryDismiss(active, onClose), {
      initialProps: { active: true },
    });
    rerender({ active: false });
    await flush();
    popstate();
    expect(onClose).not.toHaveBeenCalled();
  });
});
