// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PasswordRecoveryModal } from "./PasswordRecoveryModal";
import { useStore } from "../store";

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("PasswordRecoveryModal", () => {
  afterEach(() => {
    cleanup();
    act(() => useStore.setState({ passwordRecovery: false }));
  });

  it("rejects mismatched passwords inline", async () => {
    render(<PasswordRecoveryModal />);
    fill(/new password/i, "hunter22");
    fill(/confirm password/i, "hunter23");
    fireEvent.click(screen.getByRole("button", { name: /save password/i }));
    expect(await screen.findByText(/passwords do not match/i)).toBeTruthy();
  });

  it("surfaces the store error when the update cannot run (offline)", async () => {
    render(<PasswordRecoveryModal />);
    fill(/new password/i, "hunter22");
    fill(/confirm password/i, "hunter22");
    fireEvent.click(screen.getByRole("button", { name: /save password/i }));
    expect(await screen.findByText(/cloud sync is not configured/i)).toBeTruthy();
  });

  it("'Not now' dismisses by clearing the recovery flag", () => {
    act(() => useStore.setState({ passwordRecovery: true }));
    render(<PasswordRecoveryModal />);
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(useStore.getState().passwordRecovery).toBe(false);
  });
});
