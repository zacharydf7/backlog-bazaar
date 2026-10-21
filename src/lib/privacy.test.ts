import { describe, it, expect } from "vitest";
import {
  isSpendHidden,
  isProfilePrivate,
  isFinancialFeedHidden,
  isCustomCoversHidden,
  isPlayActivityHidden,
  PRIVACY_KEYS,
} from "./privacy";

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

describe("isProfilePrivate", () => {
  it("defaults to false (findable) when unset", () => {
    expect(isProfilePrivate(null)).toBe(false);
    expect(isProfilePrivate({})).toBe(false);
  });

  it("reads the private_profile flag", () => {
    expect(isProfilePrivate({ [PRIVACY_KEYS.privateProfile]: true })).toBe(true);
    expect(isProfilePrivate({ [PRIVACY_KEYS.privateProfile]: false })).toBe(false);
  });
});

describe("isFinancialFeedHidden", () => {
  it("defaults to HIDDEN when unset (financials hidden by default)", () => {
    expect(isFinancialFeedHidden(null)).toBe(true);
    expect(isFinancialFeedHidden(undefined)).toBe(true);
    expect(isFinancialFeedHidden({})).toBe(true);
  });

  it("reveals only on an explicit false", () => {
    expect(isFinancialFeedHidden({ [PRIVACY_KEYS.hideFinancialFeed]: false })).toBe(false);
    expect(isFinancialFeedHidden({ [PRIVACY_KEYS.hideFinancialFeed]: true })).toBe(true);
  });
});

describe("isPlayActivityHidden", () => {
  it("defaults to false (shared) when unset", () => {
    expect(isPlayActivityHidden(null)).toBe(false);
    expect(isPlayActivityHidden({})).toBe(false);
  });

  it("reads the hide_play_activity flag", () => {
    expect(isPlayActivityHidden({ [PRIVACY_KEYS.hidePlayActivity]: true })).toBe(true);
    expect(isPlayActivityHidden({ [PRIVACY_KEYS.hidePlayActivity]: false })).toBe(false);
  });
});

describe("isCustomCoversHidden", () => {
  it("defaults to false (not hidden) when unset", () => {
    expect(isCustomCoversHidden(null)).toBe(false);
    expect(isCustomCoversHidden(undefined)).toBe(false);
    expect(isCustomCoversHidden({})).toBe(false);
  });

  it("reads the hide_custom_covers flag", () => {
    expect(isCustomCoversHidden({ [PRIVACY_KEYS.hideCustomCovers]: true })).toBe(true);
    expect(isCustomCoversHidden({ [PRIVACY_KEYS.hideCustomCovers]: false })).toBe(false);
  });
});
