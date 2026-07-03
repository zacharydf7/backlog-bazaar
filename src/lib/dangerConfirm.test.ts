import { describe, expect, it } from "vitest";
import { phraseMatches } from "./dangerConfirm";

describe("phraseMatches", () => {
  it("accepts an exact match", () => {
    expect(phraseMatches("fresh start", "fresh start")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(phraseMatches("  Fresh Start  ", "fresh start")).toBe(true);
    expect(phraseMatches("DELETE MY ACCOUNT", "delete my account")).toBe(true);
  });

  it("rejects partial, empty and near-miss input", () => {
    expect(phraseMatches("", "fresh start")).toBe(false);
    expect(phraseMatches("fresh", "fresh start")).toBe(false);
    expect(phraseMatches("fresh  start", "fresh start")).toBe(false);
    expect(phraseMatches("fresh start!", "fresh start")).toBe(false);
  });
});
