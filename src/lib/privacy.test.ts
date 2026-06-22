import { describe, it, expect } from "vitest";
import { isSpendHidden, PRIVACY_KEYS } from "./privacy";

describe("isSpendHidden", () => {
  it("defaults to false for null/undefined/empty", () => {
    expect(isSpendHidden(null)).toBe(false);
    expect(isSpendHidden(undefined)).toBe(false);
    expect(isSpendHidden({})).toBe(false);
  });

  it("reads the hide_spend flag", () => {
    expect(isSpendHidden({ [PRIVACY_KEYS.hideSpend]: true })).toBe(true);
    expect(isSpendHidden({ [PRIVACY_KEYS.hideSpend]: false })).toBe(false);
  });

  it("ignores unrelated keys", () => {
    expect(isSpendHidden({ something_else: true })).toBe(false);
  });
});
