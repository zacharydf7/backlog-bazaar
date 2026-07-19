import { describe, expect, it } from "vitest";
import {
  canAffordActivation,
  effectiveActivationPrice,
  effectiveFinishRewards,
  finishToastText,
  isEconomyOffError,
  showCurrencyUi,
} from "./economyMode";

describe("effectiveActivationPrice", () => {
  it("charges the computed price while the economy is on", () => {
    expect(effectiveActivationPrice(true, 120)).toBe(120);
  });

  it("is always free while the economy is off", () => {
    expect(effectiveActivationPrice(false, 120)).toBe(0);
    expect(effectiveActivationPrice(false, 0)).toBe(0);
  });

  it("never returns a negative price", () => {
    expect(effectiveActivationPrice(true, -5)).toBe(0);
  });
});

describe("canAffordActivation", () => {
  it("checks the balance while on", () => {
    expect(canAffordActivation(true, 50, 120)).toBe(false);
    expect(canAffordActivation(true, 120, 120)).toBe(true);
  });

  it("always affords while off (activation is free)", () => {
    expect(canAffordActivation(false, 0, 999)).toBe(true);
  });
});

describe("effectiveFinishRewards", () => {
  const rewards = { full: 40, replay: 10, completion: 20 };

  it("passes rewards through for a normal on-economy run", () => {
    expect(effectiveFinishRewards(true, false, rewards)).toEqual(rewards);
  });

  it("zeroes everything while the economy is off", () => {
    expect(effectiveFinishRewards(false, false, rewards)).toEqual({
      full: 0,
      replay: 0,
      completion: 0,
    });
  });

  it("zeroes a free-started run even after toggling back on (no toggle farming)", () => {
    expect(effectiveFinishRewards(true, true, rewards)).toEqual({
      full: 0,
      replay: 0,
      completion: 0,
    });
  });
});

describe("showCurrencyUi", () => {
  it("mirrors the flag", () => {
    expect(showCurrencyUi(true)).toBe(true);
    expect(showCurrencyUi(false)).toBe(false);
  });
});

describe("finishToastText", () => {
  it("appends the coin amount only when something was paid", () => {
    expect(finishToastText("finished", "Celeste", 40)).toBe("Finished Celeste · +40");
    expect(finishToastText("completed", "Celeste", 60)).toBe("Completed Celeste · +60");
    expect(finishToastText("replay", "Celeste", 10)).toBe("Replay clear · Celeste · +10");
  });

  it("drops the +0 suffix for a no-pay finish", () => {
    expect(finishToastText("finished", "Celeste", 0)).toBe("Finished Celeste");
    expect(finishToastText("completed", "Celeste", 0)).toBe("Completed Celeste");
  });
});

describe("isEconomyOffError", () => {
  it("detects the server refusal marker", () => {
    expect(isEconomyOffError("ECONOMY_OFF")).toBe(true);
    expect(isEconomyOffError("x ECONOMY_OFF y")).toBe(true);
    expect(isEconomyOffError("Not enough coins")).toBe(false);
    expect(isEconomyOffError(null)).toBe(false);
    expect(isEconomyOffError(undefined)).toBe(false);
  });
});
