import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DangerConfirmModal } from "./DangerConfirmModal";

function setup(over: Partial<Parameters<typeof DangerConfirmModal>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <DangerConfirmModal
      title="Fresh Start"
      phrase="fresh start"
      confirmLabel="Wipe my data"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    >
      <p>This wipes your library and coins.</p>
    </DangerConfirmModal>,
  );
  return { onConfirm, onCancel, ...utils };
}

const confirmButton = () => screen.getByRole("button", { name: /wipe my data/i }) as HTMLButtonElement;
const phraseInput = () => screen.getByRole("textbox") as HTMLInputElement;
const ackCheckbox = () => screen.getByRole("checkbox") as HTMLInputElement;

describe("DangerConfirmModal", () => {
  it("renders the title, consequences and required phrase", () => {
    setup();
    expect(screen.getByText("Fresh Start")).toBeTruthy();
    expect(screen.getByText(/wipes your library/i)).toBeTruthy();
    expect(screen.getByText("fresh start")).toBeTruthy();
  });

  it("keeps confirm disabled until the checkbox AND the exact phrase agree", () => {
    const { onConfirm } = setup();
    expect(confirmButton().disabled).toBe(true);

    // Phrase alone is not enough.
    fireEvent.change(phraseInput(), { target: { value: "fresh start" } });
    expect(confirmButton().disabled).toBe(true);

    // Checkbox + wrong phrase is not enough.
    fireEvent.click(ackCheckbox());
    fireEvent.change(phraseInput(), { target: { value: "fresh" } });
    expect(confirmButton().disabled).toBe(true);

    // Checkbox + exact phrase (case-insensitive) arms it.
    fireEvent.change(phraseInput(), { target: { value: "  Fresh Start " } });
    expect(confirmButton().disabled).toBe(false);
    fireEvent.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disarms while busy and shows the busy label", () => {
    setup({ busy: true, busyLabel: "Wiping…" });
    fireEvent.click(ackCheckbox());
    fireEvent.change(phraseInput(), { target: { value: "fresh start" } });
    expect(screen.getByRole("button", { name: "Wiping…" }).hasAttribute("disabled")).toBe(true);
  });

  it("cancels from the cancel button and the backdrop, but not the panel", () => {
    const { onCancel, container } = setup();
    fireEvent.click(screen.getByText(/wipes your library/i));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(container.firstChild as Element);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
