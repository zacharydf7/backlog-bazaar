import { describe, it, expect } from "vitest";
import { autoFinishTag, coerceFinishTag, finishTagLabel, FINISH_TAGS } from "./finishTags";

describe("finishTags", () => {
  it("catalog is well-formed (unique values, labels, icons)", () => {
    expect(FINISH_TAGS.map((t) => t.value)).toEqual(["beaten", "completed", "endless"]);
    for (const t of FINISH_TAGS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
    }
  });

  it("coerceFinishTag accepts valid tags and rejects anything else", () => {
    expect(coerceFinishTag("beaten")).toBe("beaten");
    expect(coerceFinishTag("completed")).toBe("completed");
    expect(coerceFinishTag("endless")).toBe("endless");
    expect(coerceFinishTag("nope")).toBeNull();
    expect(coerceFinishTag(null)).toBeNull();
    expect(coerceFinishTag(3)).toBeNull();
  });

  it("finishTagLabel maps to the display label", () => {
    expect(finishTagLabel("completed")).toBe("Completed");
    expect(finishTagLabel(null)).toBe("");
  });

  it("autoFinishTag: a completion run earns 'completed'", () => {
    expect(autoFinishTag({ completion: true })).toBe("completed");
    expect(autoFinishTag({ completion: true, existing: "beaten" })).toBe("completed");
  });

  it("autoFinishTag: a plain finish defaults to 'beaten'", () => {
    expect(autoFinishTag({ completion: false })).toBe("beaten");
    expect(autoFinishTag({ completion: false, existing: null })).toBe("beaten");
  });

  it("autoFinishTag: a non-completion finish preserves an existing tag (hybrid rule)", () => {
    expect(autoFinishTag({ completion: false, existing: "completed" })).toBe("completed");
    expect(autoFinishTag({ completion: false, existing: "endless" })).toBe("endless");
  });
});
