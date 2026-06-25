import { describe, it, expect } from "vitest";
import { computeOnboardingStep, onboardingCopy, type OnboardingInput } from "./onboarding";

function input(over: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    completed: false,
    started: false,
    vouchers: 2,
    hasGames: false,
    hasPlaying: false,
    ...over,
  };
}

describe("computeOnboardingStep", () => {
  it("starts a fresh (empty) account at add-game", () => {
    expect(computeOnboardingStep(input())).toBe("add-game");
  });

  it("only BEGINS on an empty board — never auto-starts mid-way for an account that already has games", () => {
    // The reported bug: an established account holding leftover vouchers must not
    // get dropped into the voucher step.
    expect(computeOnboardingStep(input({ hasGames: true }))).toBeNull();
    expect(computeOnboardingStep(input({ hasGames: true, vouchers: 5 }))).toBeNull();
  });

  it("moves to use-voucher once started and a Bazaar game exists", () => {
    expect(computeOnboardingStep(input({ started: true, hasGames: true }))).toBe("use-voucher");
  });

  it("celebrates once started and a game is in Now Playing", () => {
    expect(
      computeOnboardingStep(input({ started: true, hasGames: true, hasPlaying: true })),
    ).toBe("done");
  });

  it("never runs once completed", () => {
    expect(computeOnboardingStep(input({ completed: true }))).toBeNull();
    expect(computeOnboardingStep(input({ completed: true, hasPlaying: true }))).toBeNull();
  });

  it("does not begin for an established account with no vouchers", () => {
    expect(computeOnboardingStep(input({ vouchers: 0, hasGames: true }))).toBeNull();
  });

  it("keeps running after the voucher is spent if already started", () => {
    // Spent the voucher (0 left) but the game isn't playing yet — still guide.
    expect(computeOnboardingStep(input({ started: true, vouchers: 0, hasGames: true }))).toBeNull();
    // ...and once it's playing, finish the tour.
    expect(
      computeOnboardingStep(input({ started: true, vouchers: 0, hasGames: true, hasPlaying: true })),
    ).toBe("done");
  });
});

describe("onboardingCopy", () => {
  it("numbers the two action steps and leaves the finale unnumbered", () => {
    expect(onboardingCopy("add-game")).toMatchObject({ index: 1, total: 2, cta: "Add a game" });
    expect(onboardingCopy("use-voucher")).toMatchObject({ index: 2, total: 2, cta: null });
    expect(onboardingCopy("done")).toMatchObject({ index: 0, cta: "Finish" });
  });
});
