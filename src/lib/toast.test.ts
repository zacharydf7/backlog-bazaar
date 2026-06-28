import { describe, it, expect, beforeEach, vi } from "vitest";
import { useToasts, toast, toastAction, DEFAULT_TOAST_MS } from "./toast";

describe("toast store", () => {
  beforeEach(() => {
    useToasts.setState({ toasts: [] });
  });

  it("toast() pushes a plain toast with the default duration and no action", () => {
    toast("Saved");
    const [t] = useToasts.getState().toasts;
    expect(t.message).toBe("Saved");
    expect(t.action).toBeUndefined();
    expect(t.durationMs).toBe(DEFAULT_TOAST_MS);
  });

  it("toastAction() stores the action and a longer default window", () => {
    const onAction = vi.fn();
    toastAction("Finished Hollow Knight", { label: "Undo", onAction });
    const [t] = useToasts.getState().toasts;
    expect(t.action?.label).toBe("Undo");
    expect(t.durationMs).toBe(15000);
    // The action fires the supplied callback.
    t.action?.onAction();
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("toastAction() honours a custom duration", () => {
    toastAction("x", { label: "Undo", onAction: () => {} }, undefined, 5000);
    expect(useToasts.getState().toasts[0].durationMs).toBe(5000);
  });
});
