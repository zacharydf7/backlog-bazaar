import { describe, it, expect } from "vitest";
import { initials } from "./avatar";

describe("initials", () => {
  it("uses the first two letters of a single name", () => {
    expect(initials("DigitalSora")).toBe("DI");
  });

  it("uses first + last initials for multi-word names", () => {
    expect(initials("The Big Bad Hippo")).toBe("TH");
    expect(initials("Ada Lovelace")).toBe("AL");
  });

  it("handles extra whitespace and casing", () => {
    expect(initials("  jane   doe  ")).toBe("JD");
  });

  it("falls back to ? for an empty name", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
