import { afterEach, describe, expect, it } from "vitest";
import { applyThemeId } from "./theme";

describe("applyThemeId", () => {
  afterEach(() => {
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    document.documentElement.style.removeProperty("--canvas");
  });

  // Chrome on Android paints the phone's own bar from theme-color (issue fae311ea).
  it("points the browser's theme color at the theme's canvas", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#ffffff";
    document.head.appendChild(meta);
    document.documentElement.style.setProperty("--canvas", "#0c0a09");
    applyThemeId("treasure");
    expect(document.documentElement.dataset.theme).toBe("treasure");
    expect(meta.content).toBe("#0c0a09");
  });
});
