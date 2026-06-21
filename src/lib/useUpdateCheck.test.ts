import { describe, it, expect } from "vitest";
import { isOutdated } from "./useUpdateCheck";

describe("isOutdated", () => {
  it("is true when a different latest version is known", () => {
    expect(isOutdated("abc123", "def456")).toBe(true);
  });

  it("is false when versions match", () => {
    expect(isOutdated("abc123", "abc123")).toBe(false);
  });

  it("is false when either version is missing", () => {
    expect(isOutdated("", "def456")).toBe(false);
    expect(isOutdated("abc123", null)).toBe(false);
    expect(isOutdated("", null)).toBe(false);
  });
});
