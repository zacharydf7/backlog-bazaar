import { describe, it, expect } from "vitest";
import { autoFinishTag, coerceFinishTag, finishHint, finishTagLabel, FINISH_TAGS } from "./finishTags";

describe("finishTags", () => {
  it("catalog is well-formed (unique values, labels, icons)", () => {
    expect(FINISH_TAGS.map((t) => t.value)).toEqual(["beaten", "completed", "endless", "retired"]);
    for (const t of FINISH_TAGS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
    }
  });

  it("coerceFinishTag accepts valid tags and rejects anything else", () => {
    expect(coerceFinishTag("beaten")).toBe("beaten");
    expect(coerceFinishTag("completed")).toBe("completed");
    expect(coerceFinishTag("endless")).toBe("endless");
    expect(coerceFinishTag("retired")).toBe("retired");
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

  it("autoFinishTag: a stale 'retired' never survives a real finish — it's a fresh clear", () => {
    expect(autoFinishTag({ completion: false, existing: "retired" })).toBe("beaten");
    expect(autoFinishTag({ completion: true, existing: "retired" })).toBe("completed");
  });
});

describe("finishHint", () => {
  it("a plain first finish states the reward only", () => {
    expect(finishHint({ reward: 153, isCompletionist: false, willReplay: false, isResumed: false })).toBe(
      "153 coins when you mark this finished.",
    );
  });

  it("a replay clear (resumed) explains the smaller bonus", () => {
    const hint = finishHint({ reward: 88, isCompletionist: false, willReplay: true, isResumed: true });
    expect(hint).toContain("88 coins when you mark this finished.");
    expect(hint).toContain("pulled back for free");
    expect(hint).toContain("Replay Bonus");
  });

  it("a replay clear (linked family) cites the other edition", () => {
    const hint = finishHint({ reward: 122, isCompletionist: false, willReplay: true, isResumed: false });
    expect(hint).toContain("another edition in this family is already finished");
  });

  it("a first completion run pays the full bounty plus the bonus", () => {
    const hint = finishHint({ reward: 200, isCompletionist: true, willReplay: false, isResumed: false });
    expect(hint).toContain("200 coins when you mark this complete.");
    expect(hint).toContain("full bounty plus the Completion Bonus");
  });

  it("a completion of an already-finished game pays just the bonus", () => {
    const hint = finishHint({ reward: 60, isCompletionist: true, willReplay: true, isResumed: true });
    expect(hint).toContain("completing pays just the Completion Bonus");
  });
});
