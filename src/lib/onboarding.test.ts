import { describe, it, expect } from "vitest";
import { computeOnboardingStep, onboardingCopy, type OnboardingInput } from "./onboarding";

function input(over: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    completed: false,
    loaded: true,
    isNewAccount: true,
    engaged: true, // past the welcome card unless a test overrides it
    vouchers: 2,
    hasGames: false,
    hasPlaying: false,
    ...over,
  };
}

describe("computeOnboardingStep", () => {
  it("opens a fresh signup with the welcome card, then the first step once engaged", () => {
    expect(computeOnboardingStep(input({ engaged: false }))).toBe("welcome");
    expect(computeOnboardingStep(input({ engaged: true }))).toBe("add-game");
  });

  it("skips the welcome for an existing account with an empty board", () => {
    expect(
      computeOnboardingStep(input({ isNewAccount: false, engaged: false, hasGames: false })),
    ).toBe("add-game");
  });

  it("starts a fresh (engaged) empty account at add-game", () => {
    expect(computeOnboardingStep(input())).toBe("add-game");
  });

  it("moves a fresh signup to use-voucher once a Bazaar game exists", () => {
    expect(computeOnboardingStep(input({ hasGames: true }))).toBe("use-voucher");
  });

  it("shows the 'granted' intro for an EXISTING account that has games", () => {
    // Established account (created long ago) granted a voucher → contextual intro,
    // not the bare 'Step 2 of 2' use-voucher card.
    expect(computeOnboardingStep(input({ isNewAccount: false, hasGames: true }))).toBe("granted");
  });

  it("an existing account with an empty board still starts at add-game", () => {
    expect(computeOnboardingStep(input({ isNewAccount: false, hasGames: false }))).toBe("add-game");
  });

  it("celebrates once a game is in Now Playing (either entry point)", () => {
    expect(computeOnboardingStep(input({ hasGames: true, hasPlaying: true }))).toBe("done");
    expect(
      computeOnboardingStep(input({ isNewAccount: false, hasGames: true, hasPlaying: true })),
    ).toBe("done");
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

  it("personalises the welcome with the voucher count", () => {
    expect(onboardingCopy("welcome", 2).body).toMatch(/2 free vouchers/i);
    expect(onboardingCopy("welcome", 1).body).toMatch(/1 free voucher\b/i);
  });

  it("frames the existing-account intro around the granted voucher", () => {
    const c = onboardingCopy("granted");
    expect(c.title).toMatch(/granted a voucher/i);
    expect(c.index).toBe(0); // unnumbered intro, not a "Step X of 2"
  });
});
