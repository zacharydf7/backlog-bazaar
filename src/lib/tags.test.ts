import { describe, it, expect } from "vitest";
import {
  normalizeTag,
  addTagToList,
  collectUsedTags,
  tagSuggestions,
  PREDEFINED_TAGS,
  MAX_TAGS,
  MAX_TAG_LEN,
} from "./tags";

describe("normalizeTag", () => {
  it("trims, collapses whitespace, and lowercases", () => {
    expect(normalizeTag("  Quality   OF  Life ")).toBe("quality of life");
  });
});

describe("addTagToList", () => {
  it("adds a normalized tag", () => {
    expect(addTagToList([], "Mobile")).toEqual(["mobile"]);
  });

  it("dedupes case-insensitively", () => {
    expect(addTagToList(["mobile"], "MOBILE")).toEqual(["mobile"]);
  });

  it("ignores empty and over-long tags", () => {
    expect(addTagToList([], "   ")).toEqual([]);
    expect(addTagToList([], "x".repeat(MAX_TAG_LEN + 1))).toEqual([]);
  });

  it("caps the number of tags", () => {
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `tag${i}`);
    expect(addTagToList(full, "another")).toEqual(full);
  });
});

describe("collectUsedTags", () => {
  it("gathers distinct normalized tags across requests", () => {
    const used = collectUsedTags([
      { tags: ["Mobile", "enhancement"] },
      { tags: ["mobile", "performance"] },
      {},
    ]);
    expect(used.sort()).toEqual(["enhancement", "mobile", "performance"]);
  });
});

describe("tagSuggestions", () => {
  it("includes predefined tags plus used custom tags, minus the selected ones", () => {
    const out = tagSuggestions(["retro", "mobile"], ["mobile"]);
    expect(out).toContain("retro"); // custom, surfaced for everyone
    expect(out).toContain("enhancement"); // predefined
    expect(out).not.toContain("mobile"); // already selected
  });

  it("returns an alphabetised list", () => {
    const out = tagSuggestions([], []);
    expect(out).toEqual([...out].sort((a, b) => a.localeCompare(b)));
    expect(out).toEqual([...PREDEFINED_TAGS].sort((a, b) => a.localeCompare(b)));
  });
});
