import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHistoryDismiss } from "./useHistoryDismiss";

function popstate() {
  window.dispatchEvent(new PopStateEvent("popstate"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHistoryDismiss", () => {
  it("pushes a sentinel history entry when active", () => {
    renderHook(() => useHistoryDismiss(true, () => {}));
    expect((window.history.state as { bbOverlay?: boolean } | null)?.bbOverlay).toBe(true);
  });

  it("calls onClose when Back is pressed", () => {
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

  it("removes the sentinel when closed another way (not via Back)", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const onClose = vi.fn();
    const { rerender } = renderHook(({ active }) => useHistoryDismiss(active, onClose), {
      initialProps: { active: true },
    });
    // Closed via prop change (an X button / submit), not a popstate.
    rerender({ active: false });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("stops responding to Back after it is deactivated", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const onClose = vi.fn();
    const { rerender } = renderHook(({ active }) => useHistoryDismiss(active, onClose), {
      initialProps: { active: true },
    });
    rerender({ active: false });
    popstate();
    expect(onClose).not.toHaveBeenCalled();
  });
});
