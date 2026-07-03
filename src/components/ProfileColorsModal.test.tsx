import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ProfileColorsModal } from "./ProfileColorsModal";
import { useStore } from "../store";

const setProfileColors = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  setProfileColors.mockClear();
  act(() =>
    useStore.setState({
      cloud: true,
      displayName: "Me",
      avatarUrl: null,
      bg: null,
      accent: null,
      setProfileColors,
    }),
  );
});

function previewVar(name: string): string {
  return screen.getByTestId("colors-preview").style.getPropertyValue(name);
}

describe("ProfileColorsModal", () => {
  it("starts on Classic with no overrides and Save disabled", () => {
    render(<ProfileColorsModal onClose={() => {}} />);
    expect((screen.getByLabelText("Preset colors") as HTMLSelectElement).value).toBe("classic");
    expect(previewVar("--canvas")).toBe("");
    expect(previewVar("--accent")).toBe("");
    expect((screen.getByRole("button", { name: /Save colors/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("selecting a preset fills both colors and repaints the preview", () => {
    render(<ProfileColorsModal onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Preset colors"), { target: { value: "mana" } });
    expect((screen.getByLabelText("Background color hex") as HTMLInputElement).value).toBe("#0c1026");
    expect((screen.getByLabelText("Accent color hex") as HTMLInputElement).value).toBe("#95ccdd");
    expect(previewVar("--canvas")).toBe("#0c1026");
    expect(previewVar("--accent")).toBe("#95ccdd");
    // The accent also drives the preview's buttons.
    expect(previewVar("--brand")).toBe("#95ccdd");
    // A derived ink is present so the mock header stays readable.
    expect(previewVar("--ink")).not.toBe("");
  });

  it("typing a valid hex updates the preview live; garbage does not", () => {
    render(<ProfileColorsModal onClose={() => {}} />);
    const bgHex = screen.getByLabelText("Background color hex");
    fireEvent.change(bgHex, { target: { value: "#123456" } });
    expect(previewVar("--canvas")).toBe("#123456");
    fireEvent.change(bgHex, { target: { value: "#12zz56" } });
    expect(previewVar("--canvas")).toBe("#123456");
  });

  it("the native pickers feed the drafts too", () => {
    render(<ProfileColorsModal onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Accent color picker"), { target: { value: "#f0abfc" } });
    expect(previewVar("--accent")).toBe("#f0abfc");
    expect((screen.getByLabelText("Accent color hex") as HTMLInputElement).value).toBe("#f0abfc");
  });

  it("saves the chosen pair and closes", () => {
    const onClose = vi.fn();
    render(<ProfileColorsModal onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Preset colors"), { target: { value: "treasure" } });
    fireEvent.click(screen.getByRole("button", { name: /Save colors/i }));
    expect(setProfileColors).toHaveBeenCalledWith("#0c0a09", "#fcd34d");
    expect(onClose).toHaveBeenCalled();
  });

  it("Classic clears an existing pick back to the theme default", () => {
    act(() => useStore.setState({ bg: "#0c1026", accent: "#95ccdd" }));
    render(<ProfileColorsModal onClose={() => {}} />);
    // The saved pair is recognized as its preset.
    expect((screen.getByLabelText("Preset colors") as HTMLSelectElement).value).toBe("mana");
    fireEvent.change(screen.getByLabelText("Preset colors"), { target: { value: "classic" } });
    expect(previewVar("--canvas")).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Save colors/i }));
    expect(setProfileColors).toHaveBeenCalledWith(null, null);
  });

  it("resolves a legacy curated accent id into the editor", () => {
    act(() => useStore.setState({ bg: null, accent: "violet" }));
    render(<ProfileColorsModal onClose={() => {}} />);
    expect((screen.getByLabelText("Accent color hex") as HTMLInputElement).value).toBe("#a855f7");
  });
});
