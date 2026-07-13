import { describe, expect, it, afterEach } from "vitest";
import { installNumberInputWheelGuard, isGuardedWheelTarget } from "./wheelGuard";

function numberInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  document.body.appendChild(input);
  return input;
}

function wheelOn(el: Element): WheelEvent {
  const e = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 });
  el.dispatchEvent(e);
  return e;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isGuardedWheelTarget", () => {
  it("guards a focused number input", () => {
    const input = numberInput();
    expect(isGuardedWheelTarget(input, input)).toBe(true);
  });

  it("leaves an unfocused number input alone (page scroll)", () => {
    const input = numberInput();
    expect(isGuardedWheelTarget(input, document.body)).toBe(false);
  });

  it("ignores non-number inputs and non-inputs", () => {
    const text = document.createElement("input");
    text.type = "text";
    expect(isGuardedWheelTarget(text, text)).toBe(false);
    const div = document.createElement("div");
    expect(isGuardedWheelTarget(div, div)).toBe(false);
    expect(isGuardedWheelTarget(null, null)).toBe(false);
  });
});

describe("installNumberInputWheelGuard", () => {
  it("prevents the wheel default on a focused number input", () => {
    const uninstall = installNumberInputWheelGuard();
    try {
      const input = numberInput();
      input.focus();
      expect(wheelOn(input).defaultPrevented).toBe(true);
    } finally {
      uninstall();
    }
  });

  it("does not block scrolling over an unfocused number input", () => {
    const uninstall = installNumberInputWheelGuard();
    try {
      const input = numberInput();
      expect(wheelOn(input).defaultPrevented).toBe(false);
    } finally {
      uninstall();
    }
  });

  it("does not block scrolling elsewhere on the page", () => {
    const uninstall = installNumberInputWheelGuard();
    try {
      const input = numberInput();
      input.focus();
      expect(wheelOn(document.body).defaultPrevented).toBe(false);
    } finally {
      uninstall();
    }
  });

  it("stops guarding after uninstall", () => {
    const uninstall = installNumberInputWheelGuard();
    uninstall();
    const input = numberInput();
    input.focus();
    expect(wheelOn(input).defaultPrevented).toBe(false);
  });
});
