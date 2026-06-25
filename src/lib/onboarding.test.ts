import { describe, it, expect } from "vitest";
import {
  onboardingMode,
  grantedStep,
  onboardingCopy,
  FRESH_TOUR_STEPS,
  type OnboardingModeInput,
} from "./onboarding";

function modeInput(over: Partial<OnboardingModeInput> = {}): OnboardingModeInput {
  return { loaded: true, completed: false, pending: false, vouchers: 0, ...over };
}

describe("onboardingMode", () => {
  it("runs the full fresh tour for a signup with pending vouchers", () => {
    expect(onboardingMode(modeInput({ pending: true }))).toBe("fresh");
  });

  it("shows the short granted intro for an existing account holding vouchers", () => {
    expect(onboardingMode(modeInput({ vouchers: 2 }))).toBe("granted");
  });

  it("shows nothing for an account with no pending grant and no vouchers", () => {
    expect(onboardingMode(modeInput())).toBeNull();
  });

  it("never runs once completed, even with vouchers or a pending grant", () => {
    expect(onboardingMode(modeInput({ completed: true, pending: true }))).toBeNull();
    expect(onboardingMode(modeInput({ completed: true, vouchers: 5 }))).toBeNull();
  });

  it("stays silent until the account's data has loaded (no mid-switch flash)", () => {
    expect(onboardingMode(modeInput({ loaded: false, pending: true }))).toBeNull();
    expect(onboardingMode(modeInput({ loaded: false, vouchers: 2 }))).toBeNull();
  });

  it("prefers the fresh tour over the granted intro when both could apply", () => {
    expect(onboardingMode(modeInput({ pending: true, vouchers: 2 }))).toBe("fresh");
  });
});

describe("grantedStep", () => {
  it("is the intro until a game is playing, then the celebration", () => {
    expect(grantedStep(false)).toBe("granted");
    expect(grantedStep(true)).toBe("done");
  });
});

describe("FRESH_TOUR_STEPS", () => {
  it("opens with the welcome, covers the core sections + demo, and ends on done", () => {
    expect(FRESH_TOUR_STEPS[0]).toBe("welcome");
    expect(FRESH_TOUR_STEPS[FRESH_TOUR_STEPS.length - 1]).toBe("done");
    for (const s of ["now-playing", "finished", "wishlist", "caravan", "ledger", "demo"]) {
      expect(FRESH_TOUR_STEPS).toContain(s);
    }
  });
});

describe("onboardingCopy", () => {
  it("explains the loop in the welcome and personalises the finale's voucher count", () => {
    expect(onboardingCopy("welcome").body).toMatch(/earn coins/i);
    expect(onboardingCopy("done", 2).body).toMatch(/2 free vouchers/i);
    expect(onboardingCopy("done", 1).body).toMatch(/1 free voucher\b/i);
  });

  it("describes the wishlist as games you don't own yet", () => {
    expect(onboardingCopy("wishlist").title).toMatch(/don't own/i);
  });

  it("points the granted intro at Buy & Start", () => {
    expect(onboardingCopy("granted").body).toMatch(/Buy & Start/i);
    expect(onboardingCopy("granted").title).toMatch(/granted a voucher/i);
  });
});
