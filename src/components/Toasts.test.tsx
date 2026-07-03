// The undo popup's dismiss affordances. The swipe-away gesture itself is a
// pointer-capture interaction jsdom can't drive — the threshold logic lives in
// swipeProps and is exercised in the browser; these specs cover the explicit
// controls around it.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { Toasts } from "./Toasts";
import { useToasts, toastAction, toast } from "../lib/toast";

beforeEach(() => {
  act(() => useToasts.setState({ toasts: [] }));
});

describe("Toasts", () => {
  it("action toasts carry an explicit Dismiss button that waves the toast off without undoing", () => {
    const onAction = vi.fn();
    render(<Toasts />);
    act(() => toastAction("Vampire Survivors is now in your Rotation lane", { label: "Undo", onAction }));

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onAction).not.toHaveBeenCalled();
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("the action button still fires the action and dismisses", () => {
    const onAction = vi.fn();
    render(<Toasts />);
    act(() => toastAction("Moved", { label: "Undo", onAction }));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(onAction).toHaveBeenCalledOnce();
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("the stack clears the mobile bottom tab bar (bottom-20, back to bottom-4 on md+)", () => {
    const { container } = render(<Toasts />);
    act(() => toast("Saved"));
    const stack = container.firstElementChild as HTMLElement;
    expect(stack.className).toContain("bottom-20");
    expect(stack.className).toContain("md:bottom-4");
  });
});
