import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

function setup(over: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <ConfirmDialog
      title="Move to Wishlist?"
      body="This will cost a charter to undo."
      confirmLabel="Move it"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { onConfirm, onCancel, ...utils };
}

describe("ConfirmDialog", () => {
  it("renders the title and body", () => {
    setup();
    expect(screen.getByText("Move to Wishlist?")).toBeTruthy();
    expect(screen.getByText(/cost a charter/i)).toBeTruthy();
  });

  it("fires onConfirm from the confirm button", () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Move it" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("fires onCancel from the cancel button and the backdrop", () => {
    const { onCancel, container } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Backdrop is the outermost element; clicking it also cancels.
    fireEvent.click(container.firstChild as Element);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("does not cancel when the inner panel is clicked", () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByText("Move to Wishlist?"));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
