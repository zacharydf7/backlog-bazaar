import { describe, it, expect } from "vitest";
import {
  cleanDisplayName,
  validateDisplayName,
  DISPLAY_NAME_MAX,
} from "./displayName";

describe("cleanDisplayName", () => {
  it("trims surrounding whitespace", () => {
    expect(cleanDisplayName("  Zachary  ")).toBe("Zachary");
  });

  it("collapses internal whitespace runs to single spaces", () => {
    expect(cleanDisplayName("Zachary   D    Fry")).toBe("Zachary D Fry");
  });

  it("preserves capitalization (the whole point of editing)", () => {
    expect(cleanDisplayName("zacharydf7")).toBe("zacharydf7");
    expect(cleanDisplayName("ZacharyDF7")).toBe("ZacharyDF7");
  });
});

describe("validateDisplayName", () => {
  it("accepts a normal name", () => {
    expect(validateDisplayName("Zachary")).toBeNull();
  });

  it("rejects a name that's too short after cleaning", () => {
    expect(validateDisplayName("a")).not.toBeNull();
    expect(validateDisplayName("   ")).not.toBeNull();
  });

  it("rejects a name that's too long", () => {
    expect(validateDisplayName("x".repeat(DISPLAY_NAME_MAX + 1))).not.toBeNull();
  });

  it("accepts a name exactly at the max length", () => {
    expect(validateDisplayName("x".repeat(DISPLAY_NAME_MAX))).toBeNull();
  });
});
