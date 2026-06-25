import { describe, it, expect } from "vitest";
import { computeOnboardingStep, onboardingCopy, type OnboardingInput } from "./onboarding";

function input(over: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    completed: false,
    loaded: true,
    vouchers: 2,
    hasGames: false,
    hasPlaying: false,
    ...over,
  };
}

describe("computeOnboardingStep", () => {
  it("starts a fresh (empty) account with vouchers at add-game", () => {
    expect(computeOnboardingStep(input())).toBe("add-game");
  });

  it("moves to use-voucher once a Bazaar game exists", () => {
    expect(computeOnboardingStep(input({ hasGames: true }))).toBe("use-voucher");
  });

  it("celebrates once a game is in Now Playing", () => {
    expect(computeOnboardingStep(input({ hasGames: true, hasPlaying: true }))).toBe("done");
  });

  it("never runs once completed", () => {
    expect(computeOnboardingStep(input({ completed: true }))).toBeNull();
    expect(computeOnboardingStep(input({ completed: true, hasPlaying: true }))).toBeNull();
  });

  it("only runs while the account holds vouchers (the eligibility gate)", () => {
    // No vouchers → nothing to teach, never shown (existing accounts aren't nagged).
    expect(computeOnboardingStep(input({ vouchers: 0 }))).toBeNull();
    expect(computeOnboardingStep(input({ vouchers: 0, hasGames: true }))).toBeNull();
    // An existing account GRANTED a voucher gets it once.
    expect(computeOnboardingStep(input({ vouchers: 1, hasGames: true }))).toBe("use-voucher");
  });

  it("stays silent until the account's data has loaded (no mid-switch flash)", () => {
    expect(computeOnboardingStep(input({ loaded: false }))).toBeNull();
    expect(computeOnboardingStep(input({ loaded: false, vouchers: 2 }))).toBeNull();
  });
});

describe("onboardingCopy", () => {
  it("numbers the two action steps and leaves the finale unnumbered", () => {
    expect(onboardingCopy("add-game")).toMatchObject({ index: 1, total: 2, cta: "Add a game" });
    expect(onboardingCopy("use-voucher")).toMatchObject({ index: 2, total: 2, cta: null });
    expect(onboardingCopy("done")).toMatchObject({ index: 0, cta: "Finish" });
  });
});
